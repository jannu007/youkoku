/* ============================================================
   Youkoku — image-to-3D relief (heightmap terrain, WebGL)
   Not a real photogrammetry / neural 2D->3D reconstruction (that needs
   a large trained model) — this is a genuine, real-time-rendered 3D
   mesh: each pixel's luminance becomes vertex height, and the pixel's
   own color is used as the vertex color. A real WebGL camera can then
   orbit around it, including for a recorded turntable clip.
   ============================================================ */
window.YoukokuRelief = (() => {
  function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mat4Multiply(a, b) {
    const out = new Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[i * 4 + j] = a[i * 4 + 0] * b[0 * 4 + j] + a[i * 4 + 1] * b[1 * 4 + j] + a[i * 4 + 2] * b[2 * 4 + j] + a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    return out;
  }
  function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function mat4LookAt(eye, center, up) {
    const z = normalize(sub(eye, center));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }

  function buildReliefGeometry(imageData, res) {
    const cols = res, rows = res;
    const positions = [], colors = [], indices = [];
    function sample(u, v) {
      const x = Math.min(imageData.width - 1, Math.floor(u * imageData.width));
      const y = Math.min(imageData.height - 1, Math.floor(v * imageData.height));
      const idx = (y * imageData.width + x) * 4;
      const r = imageData.data[idx] / 255, g = imageData.data[idx + 1] / 255, b = imageData.data[idx + 2] / 255;
      return { lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b };
    }
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows;
        const s = sample(u, v);
        positions.push((u - 0.5) * 2, s.lum * 0.6, (v - 0.5) * 2);
        colors.push(s.r, s.g, s.b);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      indices: new Uint16Array(indices),
    };
  }

  function setupScene(imageData, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) return null;

    const geo = buildReliefGeometry(imageData, 48);

    const VERT = `
      attribute vec3 aPosition; attribute vec3 aColor;
      uniform mat4 uModel, uView, uProjection;
      varying vec3 vColor;
      void main(){
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vColor = aColor;
      }`;
    const FRAG = `
      precision mediump float; varying vec3 vColor;
      void main(){ gl_FragColor = vec4(vColor, 1.0); }`;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf); gl.bufferData(gl.ARRAY_BUFFER, geo.colors, gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(prog, 'aPosition');
    const aColor = gl.getAttribLocation(prog, 'aColor');
    const uModel = gl.getUniformLocation(prog, 'uModel');
    const uView = gl.getUniformLocation(prog, 'uView');
    const uProjection = gl.getUniformLocation(prog, 'uProjection');

    gl.enable(gl.DEPTH_TEST);
    const projection = mat4Perspective(Math.PI / 4, width / height, 0.1, 100);

    function drawAtAngle(angle) {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.027, 0.047, 0.149, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const eye = [Math.sin(angle) * 2.6, 1.5, Math.cos(angle) * 2.6];
      const view = mat4LookAt(eye, [0, 0.1, 0], [0, 1, 0]);
      gl.uniformMatrix4fv(uModel, false, mat4Identity());
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniformMatrix4fv(uProjection, false, projection);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPosition); gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    return { canvas, gl, drawAtAngle };
  }

  function renderTurntable(imageData, opts) {
    const { width = 1280, height = 720, duration = 4, fps = 30 } = opts || {};
    return new Promise((resolve, reject) => {
      const scene = setupScene(imageData, width, height);
      if (!scene) { reject(new Error('WebGL is not supported')); return; }
      const { canvas, drawAtAngle } = scene;

      let recorder;
      try {
        const stream = canvas.captureStream(fps);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
        recorder = new MediaRecorder(stream, { mimeType });
      } catch (err) { reject(err); return; }
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.start();

      const start = performance.now();
      function frame() {
        const elapsed = (performance.now() - start) / 1000;
        drawAtAngle((elapsed / duration) * Math.PI * 2);
        if (elapsed < duration) requestAnimationFrame(frame);
        else recorder.stop();
      }
      frame();
    });
  }

  function renderSnapshot(imageData, opts) {
    const { width = 1200, height = 800, angle = Math.PI / 5 } = opts || {};
    return new Promise((resolve, reject) => {
      const scene = setupScene(imageData, width, height);
      if (!scene) { reject(new Error('WebGL is not supported')); return; }
      scene.drawAtAngle(angle);
      scene.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
    });
  }

  return { buildReliefGeometry, renderTurntable, renderSnapshot, mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt };
})();
