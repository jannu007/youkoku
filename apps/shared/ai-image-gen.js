/* ============================================================
   AI Records — optional, opt-in client-side AI image generation.
   Runs Stability AI's SD-Turbo entirely in the browser via
   onnxruntime-web + WebGPU (no server, no API key, no cost) —
   adapted from Microsoft's official reference implementation:
   https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo
   Model weights (~2.4GB total) are fetched from Hugging Face on
   first use and cached via the Cache Storage API, so later
   generations reuse the cached copy instead of re-downloading.
   This is deliberately separate from text-to-art.js: that module
   is the always-on, zero-download default; this one is a heavy,
   explicit opt-in for browsers/devices that can run it.
   ============================================================ */
window.YoukokuAIImageGen = (() => {
  const MODEL_BASE = 'https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main';
  const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
  const ORT_ESM_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.webgpu.min.js';
  const TOKENIZER_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.js';
  const CACHE_NAME = 'youkoku-ai-models';

  const MODEL_FILES = [
    { name: 'text_encoder', url: 'text_encoder/model.onnx', sizeMB: 1700,
      opt: { freeDimensionOverrides: { batch_size: 1 } } },
    { name: 'unet', url: 'unet/model.onnx', sizeMB: 640,
      opt: { freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 } } },
    { name: 'vae_decoder', url: 'vae_decoder/model.onnx', sizeMB: 95,
      opt: { freeDimensionOverrides: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 } } },
  ];
  const TOTAL_MB = MODEL_FILES.reduce((s, m) => s + m.sizeMB, 0);

  const SIGMA = 14.6146;
  const GAMMA = 0;
  const VAE_SCALING_FACTOR = 0.18215;

  let ort = null;
  let tokenizer = null;
  const sessions = {}; // name -> ort.InferenceSession
  let ready = false;
  let loadingPromise = null;

  /* ---------- capability detection ---------- */
  async function isSupported() {
    if (!('gpu' in navigator)) return { ok: false, reason: 'no-webgpu' };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { ok: false, reason: 'no-adapter' };
      const fp16 = adapter.features.has('shader-f16');
      if (!fp16) return { ok: false, reason: 'no-fp16' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error' };
    }
  }

  function isReady() { return ready; }
  function totalDownloadMB() { return TOTAL_MB; }

  /* some browsers have already dropped GPUAdapter.requestAdapterInfo() in favor of the
     synchronous adapter.info property, but onnxruntime-web's webgpu backend still calls
     the old method internally when it creates its own adapter — patch it back in so
     session creation doesn't crash with "no available backend found". Documented
     community workaround for https://github.com/microsoft/onnxruntime/issues/26107 */
  let adapterShimApplied = false;
  function applyAdapterInfoShim() {
    if (adapterShimApplied || !('gpu' in navigator)) return;
    adapterShimApplied = true;
    const origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await origRequestAdapter(...args);
      if (adapter && typeof adapter.requestAdapterInfo !== 'function') {
        adapter.requestAdapterInfo = async () => (adapter.info || {});
      }
      return adapter;
    };
  }

  /* ---------- how much is already cached, so the UI can skip the confirm step ---------- */
  async function getCacheStatus() {
    try {
      const cache = await caches.open(CACHE_NAME);
      let cachedMB = 0;
      for (const m of MODEL_FILES) {
        const hit = await cache.match(`${MODEL_BASE}/${m.url}`);
        if (hit) cachedMB += m.sizeMB;
      }
      return { cachedMB, totalMB: TOTAL_MB, complete: cachedMB >= TOTAL_MB };
    } catch (e) {
      return { cachedMB: 0, totalMB: TOTAL_MB, complete: false };
    }
  }

  /* ---------- fetch a model file with byte-level progress, caching the raw response ---------- */
  async function fetchWithProgress(url, onBytes) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      const buf = await cached.arrayBuffer();
      onBytes(buf.byteLength, buf.byteLength);
      return buf;
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
    const total = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onBytes(received, total || received);
    }
    const blob = new Blob(chunks);
    try {
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
    } catch (e) { /* storage quota or private-browsing — generation still works this session */ }
    return await blob.arrayBuffer();
  }

  /* ---------- load ORT + tokenizer + all three model sessions ---------- */
  async function loadModels(onProgress) {
    if (ready) return;
    if (loadingPromise) return loadingPromise;
    const report = (stage, extra) => { if (onProgress) onProgress({ stage, ...extra }); };

    loadingPromise = (async () => {
      report('runtime');
      applyAdapterInfoShim();
      const ortMod = await import(/* webpackIgnore: true */ ORT_ESM_URL);
      ort = ortMod.default || ortMod;
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      const tokMod = await import(/* webpackIgnore: true */ TOKENIZER_URL);
      tokenizer = await tokMod.AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
      tokenizer.pad_token_id = 0;

      const perFileBytes = {};
      MODEL_FILES.forEach((m) => { perFileBytes[m.name] = { received: 0, total: m.sizeMB * 1024 * 1024 }; });
      const reportDownload = () => {
        let received = 0, total = 0;
        Object.values(perFileBytes).forEach((f) => { received += f.received; total += f.total; });
        report('downloading', {
          receivedMB: Math.round(received / (1024 * 1024)),
          totalMB: Math.round(total / (1024 * 1024)),
          percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
        });
      };

      const sessOptBase = {
        executionProviders: ['webgpu'],
        enableMemPattern: false,
        enableCpuMemArena: false,
        preferredOutputLocation: { last_hidden_state: 'gpu-buffer' },
        extra: {
          session: {
            disable_prepacking: '1',
            use_device_allocator_for_initializers: '1',
            use_ort_model_bytes_directly: '1',
            use_ort_model_bytes_for_initializers: '1',
          },
        },
      };

      for (const m of MODEL_FILES) {
        const url = `${MODEL_BASE}/${m.url}`;
        const bytes = await fetchWithProgress(url, (received, total) => {
          perFileBytes[m.name] = { received, total: total || m.sizeMB * 1024 * 1024 };
          reportDownload();
        });
        report('preparing', { file: m.name });
        const sessOpt = { ...sessOptBase, freeDimensionOverrides: m.opt.freeDimensionOverrides };
        sessions[m.name] = await ort.InferenceSession.create(bytes, sessOpt);
      }

      ready = true;
      report('ready');
    })();

    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  /* ---------- SD-Turbo pipeline (single-step Euler), adapted from the MS reference ---------- */
  function randnLatents(shape, noiseSigma) {
    const size = shape.reduce((a, b) => a * b, 1);
    const data = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const u = Math.random(), v = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      data[i] = z * noiseSigma;
    }
    return data;
  }

  function scaleModelInputs(t) {
    const dIn = t.data;
    const dOut = new Float32Array(dIn.length);
    const divisor = Math.sqrt(SIGMA ** 2 + 1);
    for (let i = 0; i < dIn.length; i++) dOut[i] = dIn[i] / divisor;
    return new ort.Tensor(dOut, t.dims);
  }

  function eulerStep(modelOutput, sample) {
    const dOut = new Float32Array(modelOutput.data.length);
    const sigmaHat = SIGMA * (GAMMA + 1);
    for (let i = 0; i < modelOutput.data.length; i++) {
      const predOriginal = sample.data[i] - sigmaHat * modelOutput.data[i];
      const derivative = (sample.data[i] - predOriginal) / sigmaHat;
      const dt = 0 - sigmaHat;
      dOut[i] = (sample.data[i] + derivative * dt) / VAE_SCALING_FACTOR;
    }
    return new ort.Tensor(dOut, modelOutput.dims);
  }

  function tensorToCanvas(t, canvas) {
    const pix = t.data;
    for (let i = 0; i < pix.length; i++) {
      let x = pix[i] / 2 + 0.5;
      if (x < 0) x = 0; else if (x > 1) x = 1;
      pix[i] = x;
    }
    const imageData = t.toImageData({ tensorLayout: 'NCWH', format: 'RGB' });
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
  }

  /* ---------- main entry point: generate(canvas, text) -> Promise<void> ---------- */
  async function generate(canvas, text) {
    if (!ready) throw new Error('models-not-loaded');
    const { input_ids } = await tokenizer(text, { padding: true, max_length: 77, truncation: true, return_tensor: false });
    const { last_hidden_state } = await sessions.text_encoder.run({
      input_ids: new ort.Tensor('int32', input_ids, [1, input_ids.length]),
    });

    const latentShape = [1, 4, 64, 64];
    const latent = new ort.Tensor(randnLatents(latentShape, SIGMA), latentShape);
    const latentModelInput = scaleModelInputs(latent);

    const { out_sample } = await sessions.unet.run({
      sample: latentModelInput,
      timestep: new ort.Tensor('int64', [999n], [1]),
      encoder_hidden_states: last_hidden_state,
    });

    const newLatents = eulerStep(out_sample, latent);
    const { sample } = await sessions.vae_decoder.run({ latent_sample: newLatents });

    tensorToCanvas(sample, canvas);
    if (last_hidden_state.dispose) last_hidden_state.dispose();
  }

  return { isSupported, isReady, totalDownloadMB, getCacheStatus, loadModels, generate };
})();
