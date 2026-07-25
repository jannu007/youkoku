# PRISM AI — 芸術系AI創作アプリ販売サイト

画像・映像・音楽の制作に特化したAI創作アプリを紹介・提供するための、完全無料で運用できるホームページです。
[spacex.com](https://www.spacex.com/) を参考に、大胆なタイポグラフィと全画面セクション構成のダークなデザインにしています。

フレームワークやビルドツールを一切使わない **素の HTML / CSS / JavaScript** で構成しているため、
サーバー費用もビルド費用もかからず、静的ホスティングサービスに置くだけで公開できます。

## 掲載しているアプリ

| アプリ | ジャンル | 概要 |
|---|---|---|
| **Lumen** | AI画像編集 | ヒストグラム解析による自動補正とAIスタイルプリセットで写真を仕上げる |
| **Flux** | AI映像編集 | トリム編集とAIカラーグレーディングで動画を仕上げる |
| **Echo** | AI音楽編集 | 波形編集とAIマスタリング（EQ・コンプレッション）で音源を仕上げる |

いずれも会員登録・サーバーへのアップロードが不要な、ブラウザだけで動く完全無料のツールです。

## 構成

```
.
├── index.html                  # PRISM AI ホームページ本体
├── assets/
│   ├── css/style.css           # スタイル（デザインの中心）
│   └── js/main.js              # スクロール演出・ヒーローのパーティクル背景など
├── apps/
│   ├── lumen/                  # AI画像編集アプリ「Lumen」
│   ├── flux/                   # AI映像編集アプリ「Flux」
│   ├── echo/                   # AI音楽編集アプリ「Echo」
│   └── shared/                 # 各アプリの紹介ページ・インストール導線の共通パーツ
└── README.md
```

各アプリディレクトリは以下の構成です。

```
apps/<app>/
├── index.html      # アプリの紹介・購入(無料)ページ
├── app/index.html  # 実際に使えるツール本体
├── manifest.json   # PWA設定（ホーム画面への追加に対応）
├── sw.js           # オフライン対応のservice worker
└── icons/          # アプリアイコン
```

## ローカルで確認する

ビルド不要です。`index.html` をブラウザで直接開くか、簡易サーバーを立てて確認してください。

```bash
# Python がある場合
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## 無料で公開する方法（おすすめ: GitHub Pages）

1. このリポジトリを GitHub にプッシュする
2. GitHub の `Settings` → `Pages` を開く
3. `Source` を `Deploy from a branch` にし、対象ブランチと `/ (root)` を選択して `Save`
4. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

他にも [Netlify](https://www.netlify.com/) や [Vercel](https://vercel.com/) の無料プランにこのフォルダをそのままドラッグ&ドロップ／連携するだけで公開できます。独自ドメインも無料プラン内で設定可能です。

## カスタマイズのポイント

- **サイト名・キャッチコピー**: `index.html` 内の `<h1 class="hero-title">` 付近
- **掲載アプリ**: `index.html` の `<section class="apps">` 内、`.app-item` を複製して追加・編集
- **配色**: `assets/css/style.css` 冒頭の `:root` 変数（`--violet` `--magenta` `--cyan` など）
- **料金**: `<section class="pricing">` 内の `.pricing-card`
- **問い合わせ先**: `index.html` 内の `mailto:hello@prism-ai.app` を実際のメールアドレスに変更
- **お知らせ**: `<section class="news">` 内の `<li class="news-item">` を編集

## ライセンス

このテンプレートは自由に改変・商用利用していただけます。
