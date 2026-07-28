import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, isInternalCall, isServiceKeyCall } from "@/lib/apiAuth";

// 講師ホーム「今日この授業で詰めること」を選定する。
//
// daily_tasks（3か月ビジョン→生徒が家でやる宿題）とは【別物】。ここは講師の手元用で、
// daily_tasks を書き換えない。役割が違うので両立させる。
//
// 素材（どれか欠けても止めない・防御的）:
//   ① 教材進捗 textbook_progress   … いま何をどこまで・手応え
//   ② 授業報告書 lesson_reports    … 17項目・正答率・学習内容
//   ③ 保護者メッセージ parent_messages … 未対応の要望
//   ④ 多層診断 questionnaire_responses … 主ボトルネックと介入方針
//   ⑤ 講師連携 collaboration_tasks … 気がかりとして共有済みのもの
//
// 教材の列挙は UI 側が textbook_progress から機械的に出す。AIに事実を作文させず、
// 「今日どこを詰めるか」という判断だけを書かせる。
//
// 入力: { studentId } / { schoolId, date? } / { all: true, date? }

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL = "claude-sonnet-4-6"; // 既存 API ルート（11か所）と揃える

type FocusSource = "progress" | "report" | "parent" | "diagnosis" | "collab";

type FocusItem = {
  action: string;
  why: string;
  source: FocusSource;
  sourceDate: string | null;
  priority: "high" | "normal";
};

type FocusJson = {
  headline: string;
  items: FocusItem[];
};

const UNDERSTAND_LABEL: Record<string, string> = {
  good: "◎手応えあり",
  normal: "○ふつう",
  weak: "△不安",
};

const SOURCES: FocusSource[] = ["progress", "report", "parent", "diagnosis", "collab"];

function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 素材が1つも無い生徒に、AIで“それらしいこと”を書かせない */
function hasMaterial(m: Record<string, string>): boolean {
  return SOURCES.some((k) => (m[k] ?? "").trim().length > 0);
}

async function callClaude(material: Record<string, string> & { studentName: string; grade: string }): Promise<FocusJson | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `あなたは個別指導塾のベテラン教室長です。今日この生徒の授業で「講師が詰めるべきこと」を選んでください。
これは講師の手元用のメモです。生徒に見せる宿題リストではありません（それは別にあります）。

【生徒】${material.studentName}（${material.grade || "学年不明"}）

【① 教材進捗（新しい順）】
${material.progress || "（記録なし）"}

【② 直近の授業報告書】
${material.report || "（報告書なし）"}

【③ 保護者からのメッセージ（新しい順）】
${material.parent || "（なし）"}

【④ 多層型学力診断】
${material.diagnosis || "（診断なし）"}

【⑤ 講師連携で共有されている気がかり】
${material.collab || "（なし）"}

【選ぶルール】
- items は **最大3件**。多く挙げるほど現場では実行されません。今日の1コマで手が届くものだけ。
- action は「講師が今日やる動作」を動詞で。40字以内。
  良い例:「符号ミスの原因を本人に口で説明させる」「英検の進捗を保護者へ一報」
  悪い例:「数学を頑張らせる」「様子を見る」（動作になっていない）
- why は、なぜ今日それなのかを、上の素材の**具体的な記述を引用して**1文で。30字以内。
- source は必ず ${SOURCES.join(" / ")} のどれか。why の根拠にした素材と一致させること。
- sourceDate は素材に日付があればその YYYY-MM-DD、無ければ null。
- priority: 今日やらないと後に響くものだけ "high"。それ以外は "normal"。high は多くて1件。
- **素材に書かれていないことを推測で書かないこと。** 素材が薄いなら items は1件でも0件でもよい。
- headline は、この生徒の今日の要点を15字以内で。

【出力】JSONのみ（前後の説明・コードフェンスなし）
{"headline":"...","items":[{"action":"...","why":"...","source":"report","sourceDate":"2026-07-24","priority":"normal"}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text: string = data.content?.[0]?.text ?? "";
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(text.slice(s, e + 1));

    const items: FocusItem[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .slice(0, 3)
      .map((it: any) => ({
        action: String(it?.action ?? "").slice(0, 120),
        why: String(it?.why ?? "").slice(0, 120),
        // 知らない source が返ってきたら progress に倒す（UIのアイコン解決を壊さない）
        source: SOURCES.includes(it?.source) ? (it.source as FocusSource) : "progress",
        sourceDate: typeof it?.sourceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.sourceDate)
          ? it.sourceDate
          : null,
        priority: it?.priority === "high" ? "high" : "normal",
      }))
      .filter((it: FocusItem) => it.action.length > 0);

    return { headline: String(parsed.headline ?? "").slice(0, 60), items };
  } catch {
    return null;
  }
}

/** 1名分の素材を集めて teaching_focus に upsert */
async function generateOne(
  svc: SupabaseClient,
  student: { id: string; name: string; grade: string | null; school_id: string | null },
  focusDate: string,
  generatedBy: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  // 5素材を並行取得。1つ失敗しても他で続行する。
  const [progRes, repRes, msgRes, diagRes, collabRes] = await Promise.allSettled([
    svc.from("textbook_progress")
      .select("lesson_date, subject, textbook, progress_where, amount, understanding, comment")
      .eq("student_id", student.id).order("lesson_date", { ascending: false }).limit(6),
    svc.from("lesson_reports")
      .select("test_subject, percentage, learning_content, learning_method, checked_items, teacher_notes, created_at")
      .eq("student_id", student.id).order("created_at", { ascending: false }).limit(3),
    svc.from("parent_messages")
      .select("message, created_at, status")
      .eq("student_id", student.id).eq("direction", "parent_to_teacher")
      .order("created_at", { ascending: false }).limit(3),
    // 診断は student_name で紐付く運用（student_id は後付けで空の行がある）
    svc.from("questionnaire_responses")
      .select("subject, test_percentage, bottleneck_layer, bottleneck_label, intervention, teacher_notes, created_at")
      .eq("student_name", student.name).order("created_at", { ascending: false }).limit(1),
    svc.from("collaboration_tasks")
      .select("category, title, description, due_date, auto_reason, created_at")
      .eq("status", "open").eq("student_id", student.id)
      .order("created_at", { ascending: false }).limit(3),
  ]);

  const rows = (r: PromiseSettledResult<any>): any[] =>
    r.status === "fulfilled" && !r.value?.error ? (r.value.data ?? []) : [];

  const progRows = rows(progRes);
  const repRows = rows(repRes);
  const msgRows = rows(msgRes);
  const diagRows = rows(diagRes);
  const collabRows = rows(collabRes);

  const progress = progRows
    .map((p) =>
      `・${p.lesson_date} ${p.textbook}${p.progress_where ? ` / ${p.progress_where}` : ""}` +
      `${p.amount ? `（${p.amount}）` : ""}` +
      `${p.understanding ? ` [${UNDERSTAND_LABEL[p.understanding] ?? p.understanding}]` : ""}` +
      `${p.comment ? ` ※${p.comment}` : ""}`)
    .join("\n");

  const report = repRows
    .map((r) => {
      const checks = Array.isArray(r.checked_items) ? r.checked_items : [];
      return `・${String(r.created_at).slice(0, 10)} ${r.test_subject ?? "—"} 正答率${r.percentage ?? "—"}\n` +
        `　学習内容: ${r.learning_content ?? "—"}\n` +
        `　17項目でできている(${checks.length}): ${checks.length ? checks.join("・") : "（記録なし）"}` +
        `${r.teacher_notes ? `\n　講師メモ: ${r.teacher_notes}` : ""}`;
    })
    .join("\n");

  const parent = msgRows
    .map((m) => `・${String(m.created_at).slice(0, 10)}${m.status === "unread" ? "【未読】" : ""} ${String(m.message ?? "").slice(0, 300)}`)
    .join("\n");

  const d = diagRows[0];
  const diagnosis = d
    ? `・${String(d.created_at).slice(0, 10)} ${d.subject ?? "—"} 正答率${d.test_percentage ?? "—"}%\n` +
      `　主ボトルネック: ${d.bottleneck_label ?? d.bottleneck_layer ?? "—"}\n` +
      `　推奨介入: ${d.intervention ?? "—"}` +
      `${d.teacher_notes ? `\n　講師メモ: ${d.teacher_notes}` : ""}`
    : "";

  const collab = collabRows
    .map((c) => `・[${c.category}] ${c.title}${c.due_date ? `（期限 ${c.due_date}）` : ""}` +
      `${c.description ? ` — ${String(c.description).slice(0, 200)}` : ""}` +
      `${c.auto_reason ? ` ※自動検知: ${c.auto_reason}` : ""}`)
    .join("\n");

  const material = {
    studentName: student.name,
    grade: student.grade ?? "",
    progress, report, parent, diagnosis, collab,
  };

  // 素材ゼロの生徒はAIを呼ばない（推測を書かせない／APIコストの無駄を避ける）
  if (!hasMaterial(material)) {
    return { ok: false, reason: "no_material" };
  }

  const focus = await callClaude(material);
  if (!focus) return { ok: false, reason: "ai_failed" };

  const { error } = await svc.from("teaching_focus").upsert(
    {
      student_id: student.id,
      student_name: student.name,
      school_id: student.school_id,
      focus_date: focusDate,
      focus_json: focus,
      source_snapshot: {
        progress: progRows.length,
        report: repRows.length,
        parent: msgRows.length,
        diagnosis: diagRows.length,
        collab: collabRows.length,
        // 素材取得に失敗したものを残す（薄い根拠で断定していないかの検証用）
        failed: [progRes, repRes, msgRes, diagRes, collabRes]
          .map((r, i) => (r.status === "rejected" || (r as any).value?.error ? SOURCES[i] : null))
          .filter(Boolean),
      },
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
    },
    { onConflict: "student_id,focus_date" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** 対象生徒を決める。教室指定なら教室で、all ならその日来る全員。 */
async function resolveTargets(
  svc: SupabaseClient,
  opts: { studentId?: string; schoolId?: string; all?: boolean; date: string },
): Promise<{ id: string; name: string; grade: string | null; school_id: string | null }[]> {
  if (opts.studentId) {
    const { data } = await svc.from("students")
      .select("id, name, grade, school_id").eq("id", opts.studentId).limit(1);
    return (data as any[]) ?? [];
  }

  // その日来る生徒 = 授業予定がある人 ∪ 出席曜日が該当する人（ホーム画面と同じ論理）
  const dayStart = `${opts.date}T00:00:00.000Z`;
  const dayEnd = `${opts.date}T23:59:59.999Z`;
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${opts.date}T12:00:00`).getDay()];

  const ids = new Set<string>();
  const { data: lessonRows } = await svc.from("lessons")
    .select("student_id").gte("scheduled_at", dayStart).lte("scheduled_at", dayEnd).neq("status", "canceled");
  ((lessonRows as any[]) ?? []).forEach((l) => l.student_id && ids.add(l.student_id));

  let attQ = svc.from("students").select("id, name, grade, school_id").contains("attendance_days", [dow]);
  if (opts.schoolId) attQ = attQ.eq("school_id", opts.schoolId);
  const { data: attRows } = await attQ;
  const byId = new Map<string, any>();
  ((attRows as any[]) ?? []).forEach((s) => byId.set(s.id, s));

  if (ids.size > 0) {
    let q = svc.from("students").select("id, name, grade, school_id").in("id", Array.from(ids));
    if (opts.schoolId) q = q.eq("school_id", opts.schoolId);
    const { data } = await q;
    ((data as any[]) ?? []).forEach((s) => byId.set(s.id, s));
  }
  return Array.from(byId.values());
}

export async function POST(req: NextRequest) {
  // 講師本人、または cron（x-internal-secret / x-service-key）
  const internal = isInternalCall(req) || isServiceKeyCall(req);
  let generatedBy: string | null = "cron";
  if (!internal) {
    const auth = await requireTeacher(req);
    if (auth instanceof NextResponse) return auth;
    generatedBy = "email" in auth ? auth.email : null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY が未設定です" }, { status: 500 });
  }
  const svc = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const focusDate: string = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : dateKey();

  const targets = await resolveTargets(svc, {
    studentId: body?.studentId,
    schoolId: body?.schoolId,
    all: body?.all === true,
    date: focusDate,
  });

  if (targets.length === 0) {
    return NextResponse.json({ created: 0, message: "対象の生徒がいません" });
  }

  // 1名指定は常に作り直す（講師が「再生成」を押したケース）。
  // 一括は既に今日ぶんがある生徒を飛ばす（毎朝の再実行で二重課金しない）。
  let skip = new Set<string>();
  if (!body?.studentId) {
    const { data: existing } = await svc.from("teaching_focus")
      .select("student_id").eq("focus_date", focusDate)
      .in("student_id", targets.map((t) => t.id));
    skip = new Set(((existing as any[]) ?? []).map((r) => r.student_id));
  }

  let ok = 0, failed = 0, skipped = 0, noMaterial = 0;
  for (const t of targets) {
    if (skip.has(t.id)) { skipped++; continue; }
    const r = await generateOne(svc, t, focusDate, generatedBy);
    if (r.ok) ok++;
    else if (r.reason === "no_material") noMaterial++;
    else failed++;
  }

  return NextResponse.json({
    created: ok, failed, skipped, noMaterial, targeted: targets.length, date: focusDate,
  });
}
