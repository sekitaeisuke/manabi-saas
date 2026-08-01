// 生成AIの呼び出し口。アプリ内のAI呼び出しは必ずここを通す。
//
// ここに集約する理由:
//   ① 鍵の出どころ（＝誰の財布で払うか）を1か所で決められる
//   ② 塾ごとに鍵を持たせる（BYOK）ときに、この1ファイルの差し替えで済む
//   ③ 鍵が無い・残高切れのとき、講師に伝わる日本語のエラーを返せる
//
// 鍵の3段フォールバック:
//   1. その塾が登録した鍵（テナント鍵）… 料金はその塾持ち  ※現在は器のみ。resolveTenantKey が null を返す
//   2. 会社の鍵（環境変数）           … 料金は当社持ち（お試し枠）
//   3. どちらも無ければ、何をすればよいかを書いたエラー
//
// 「1社の鍵だけで全機能が動く」ことを保証する:
//   希望したプロバイダの鍵が無ければ、鍵のある別のプロバイダへ自動で寄せる（pickProvider）。
//   3社そろって初めて動く機能を作らない。揃っていれば品質が上がる、という位置づけにする。

export type Provider = "anthropic" | "openai" | "google";

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Claude（Anthropic）",
  openai: "ChatGPT（OpenAI）",
  google: "Gemini（Google）",
};

/** 用途の重さ。プロバイダごとの実モデルへ割り当てる */
export type ModelTier = "standard" | "fast";

const MODELS: Record<Provider, Record<ModelTier, string>> = {
  anthropic: { standard: "claude-sonnet-4-6", fast: "claude-haiku-4-5-20251001" },
  openai:    { standard: "gpt-4o",            fast: "gpt-4o-mini" },
  google:    { standard: "gemini-2.5-flash",  fast: "gemini-2.5-flash" },
};

const ENV_KEY: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

export type KeySource = "tenant" | "company";
export type ResolvedKey = { provider: Provider; key: string; source: KeySource };

/** AIが使えないときのエラー。呼び出し側はこれを掴んで日本語のまま画面に出してよい */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/**
 * 1段目: 塾ごとの鍵。
 * BYOK（塾が自分の鍵を登録する）を入れるときは、ここで ai_credentials から復号して返す。
 * テナントの区切りがまだ無いので、今は常に null（＝会社の鍵にフォールバック）。
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function resolveTenantKey(
  _provider: Provider,
  _tenantId?: string | null,
): Promise<string | null> {
  return null;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** 2段目: 会社の鍵（環境変数）。空文字・空白だけの値は「無い」とみなす */
export function companyKey(provider: Provider): string | null {
  const raw = process.env[ENV_KEY[provider]];
  const key = (raw ?? "").trim();
  return key.length > 0 ? key : null;
}

/** 鍵を1段目→2段目の順に解決する。無ければ null */
export async function resolveKey(
  provider: Provider,
  tenantId?: string | null,
): Promise<ResolvedKey | null> {
  const tenant = await resolveTenantKey(provider, tenantId);
  if (tenant) return { provider, key: tenant, source: "tenant" };
  const company = companyKey(provider);
  if (company) return { provider, key: company, source: "company" };
  return null;
}

/** 今この環境で使えるプロバイダ（会社の鍵があるもの）。BYOK後はテナント鍵も含める */
export function availableProviders(): Provider[] {
  return (["anthropic", "openai", "google"] as Provider[]).filter((p) => companyKey(p) !== null);
}

/**
 * 希望プロバイダに鍵が無ければ、鍵のある別のプロバイダへ寄せる。
 * これにより「1社の鍵しか無い塾」でも全機能が動く。
 */
export async function pickProvider(
  preferred: Provider,
  tenantId?: string | null,
): Promise<ResolvedKey> {
  const first = await resolveKey(preferred, tenantId);
  if (first) return first;
  const order: Provider[] = ["anthropic", "openai", "google"];
  for (const p of order) {
    if (p === preferred) continue;
    const r = await resolveKey(p, tenantId);
    if (r) return r;
  }
  throw new AiUnavailableError(
    "生成AIのキーが設定されていません。設定 → AI設定 でAPIキーを登録してください" +
    "（ChatGPT Plus や Claude Pro の月額プランではなく、APIキーが必要です）。",
  );
}

export type GenerateOptions = {
  /** 使いたいプロバイダ。鍵が無ければ自動で他社に寄せる */
  provider?: Provider;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  tier?: ModelTier;
  /** JSONで返させる（対応プロバイダのみ機械的に指定。他はプロンプト任せ） */
  json?: boolean;
  /** 呼び出し元の機能名。使用量記録・障害調査用 */
  feature: string;
  /** 塾（テナント）。BYOK導入後に使う */
  tenantId?: string | null;
};

export type GenerateResult = {
  text: string;
  provider: Provider;
  model: string;
  source: KeySource;
};

/** 統一の生成呼び出し。失敗時は AiUnavailableError（日本語）を投げる */
export async function generateText(opts: GenerateOptions): Promise<GenerateResult> {
  const resolved = await pickProvider(opts.provider ?? "anthropic", opts.tenantId);
  const tier = opts.tier ?? "standard";
  const model = MODELS[resolved.provider][tier];
  const maxTokens = opts.maxTokens ?? 4096;

  try {
    const text = await callProvider(resolved, model, opts, maxTokens);
    return { text, provider: resolved.provider, model, source: resolved.source };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AiUnavailableError(describeFailure(resolved.provider, resolved.source, msg));
  }
}

async function callProvider(
  resolved: ResolvedKey,
  model: string,
  opts: GenerateOptions,
  maxTokens: number,
): Promise<string> {
  if (resolved.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(opts.system ? { system: opts.system } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.content?.[0]?.text ?? "").trim();
  }

  if (resolved.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: opts.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }

  // google
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${resolved.key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.system ? `${opts.system}\n\n${opts.prompt}` : opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: maxTokens,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

/** 失敗の理由を、講師が読んで次の一手が分かる日本語にする */
function describeFailure(provider: Provider, source: KeySource, raw: string): string {
  const who = source === "tenant" ? "この塾に登録されたキー" : "当社のキー";
  const name = PROVIDER_LABEL[provider];
  if (/HTTP 401|invalid_api_key|API key not valid|Unauthorized/i.test(raw)) {
    return `${name} のAPIキーが無効です（${who}）。設定 → AI設定 でキーを入れ直してください。`;
  }
  if (/HTTP 402|credit balance|insufficient_quota|quota/i.test(raw)) {
    return `${name} の残高・利用枠が足りません（${who}）。プロバイダ側で残高を追加するか、別のAIに切り替えてください。`;
  }
  if (/HTTP 429|rate.?limit|overloaded|high demand/i.test(raw)) {
    return `${name} が混み合っています。少し待ってからもう一度お試しください。`;
  }
  return `${name} の呼び出しに失敗しました（${who}）。${raw.slice(0, 120)}`;
}

/** ```json フェンスを外して JSON を取り出す。失敗したら null */
export function extractJson<T = unknown>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  const as = t.indexOf("[");
  const ae = t.lastIndexOf("]");
  const body =
    s !== -1 && e !== -1 && (as === -1 || s < as) ? t.slice(s, e + 1)
    : as !== -1 && ae !== -1 ? t.slice(as, ae + 1)
    : "";
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
