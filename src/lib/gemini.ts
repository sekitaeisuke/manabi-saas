// Gemini API 呼び出しの共通ラッパー。
// 「This model is currently experiencing high demand」などの一時的な過負荷
// （HTTP 429 / 500 / 503）はユーザーに見せず、自動でリトライ＋モデルフォールバックする。

type GenerationConfig = Record<string, unknown>;

// 過負荷時に順に試すモデル（先頭が本命）。
// "-latest" エイリアスは常に現行モデルを指すため、特定バージョンの
// 廃止（"is no longer available"）でフォールバックが壊れない。
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];

// この HTTP ステータスは「一時的」とみなしてリトライする。
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// モデル廃止・未提供（"no longer available" / "not found"）は次のモデルへ切り替える。
function isModelUnavailable(status: number, message: string): boolean {
  return (
    status === 404 ||
    /no longer available|not found|not supported|is not available/i.test(message)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; status: number; message: string };

/**
 * プロンプトを Gemini に投げてテキストを取り出す。
 * 一時的な過負荷は内部で最大 maxAttempts 回リトライし、
 * モデルも順にフォールバックする。恒久エラー（4xx の一部）は即座に返す。
 */
export async function generateWithGemini(
  prompt: string,
  generationConfig: GenerationConfig = {},
  opts: { maxAttempts?: number } = {}
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, message: "GEMINI_API_KEY が未設定です" };
  }

  const maxAttempts = opts.maxAttempts ?? 5;
  let lastStatus = 500;
  let lastMessage = "Gemini API への接続に失敗しました";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 試行が進むほど（＝本命が混雑しているほど）後続モデルへ切り替える。
    const model = MODELS[Math.min(attempt, MODELS.length - 1)];

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
          }),
        }
      );
    } catch (e) {
      // ネットワーク断なども一時的扱いでリトライ。
      lastStatus = 503;
      lastMessage = `ネットワークエラー: ${String(e)}`;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { ok: true, text };
      // 空応答も一時的なことがあるためリトライ対象にする。
      lastStatus = 502;
      lastMessage = "応答が空です";
      await sleep(backoffMs(attempt));
      continue;
    }

    const err = await res.json().catch(() => ({}));
    lastStatus = res.status;
    lastMessage = err?.error?.message ?? `HTTP ${res.status}`;

    if (isModelUnavailable(res.status, lastMessage)) {
      // このモデルは廃止・未提供。待たずに次のモデルへ即フォールバック。
      continue;
    }
    if (!RETRYABLE.has(res.status)) {
      // 認証エラーやリクエスト不正など、リトライしても無駄なものは即返す。
      return { ok: false, status: res.status, message: lastMessage };
    }
    await sleep(backoffMs(attempt));
  }

  return { ok: false, status: lastStatus, message: lastMessage };
}

// 指数バックオフ＋ジッター（約 0.6s, 1.2s, 2.4s, 4.8s …、上限 8s）。
function backoffMs(attempt: number): number {
  const base = Math.min(600 * 2 ** attempt, 8000);
  return base + Math.floor(Math.random() * 400);
}
