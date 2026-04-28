# つながるまなび

塾向け学習管理SaaS。講師・保護者・生徒をつなぐプラットフォーム。

---

## 別PCで動かす手順

### 1. 必要なもの

- [Node.js](https://nodejs.org/) 20以上
- [Git](https://git-scm.com/)
- 以下のAPIキー（別途入手）
  - Supabase URL と anon key
  - Anthropic API Key
  - OpenAI API Key
  - Google Gemini API Key

---

### 2. コードを取得

```bash
git clone https://github.com/sekitaeisuke/manabi-saas.git
cd manabi-saas
```

---

### 3. パッケージをインストール

```bash
npm install
```

---

### 4. 環境変数ファイルを作成

プロジェクトのルートに `.env.local` というファイルを新規作成して、以下をコピーして貼り付ける。

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=ここにSupabaseのProject URLを入力
NEXT_PUBLIC_SUPABASE_ANON_KEY=ここにSupabaseのanon keyを入力

# OpenAI (ChatGPT)
OPENAI_API_KEY=ここにOpenAIのAPIキーを入力

# Google Gemini
GEMINI_API_KEY=ここにGeminiのAPIキーを入力

# Anthropic (Claude)
ANTHROPIC_API_KEY=ここにAnthropicのAPIキーを入力
```

> `.env.local` はセキュリティのためGitHubには上がりません。毎回手動で作成してください。

---

### 5. 起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く。

---

## 最新コードに更新する

```bash
git pull
```

---

## APIキーの取得先

| キー | 取得場所 |
|---|---|
| Supabase URL / anon key | [supabase.com](https://supabase.com) → プロジェクト → Settings → API |
| Anthropic API Key | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| OpenAI API Key | [platform.openai.com](https://platform.openai.com) → API Keys |
| Gemini API Key | [aistudio.google.com](https://aistudio.google.com) → Get API Key |

---

## 開発者

関田英介（教育工房）
