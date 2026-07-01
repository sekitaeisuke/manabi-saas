import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

// 日次カルテ生成。3か月ビジョン(learning_plans)・教材進捗(textbook_progress)・
// 最新報告書(lesson_reports,17項目)・保護者ニーズ(parent_messages)を素材に、
// 1回の Claude 呼び出しで「現状＋今日/今週すべきこと」を作り student_karte に upsert する。
//
// 入力: { studentId?, studentName?, grade? }（1名） / { all: true }（対象生徒を一括）
// daily_tasks には書き込まない（ビジョン由来の13週計画は温存し「予定」として読むだけ）。

/* eslint-disable @typescript-eslint/no-explicit-any */

type KarteAction = { subject?: string; content: string; amount?: string };
type KarteJson = {
  visionSummary: string;
  currentStatus: string;
  parentNeeds: string | null;
  todaysActions: KarteAction[];
  weeklyActions: KarteAction[];
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const UNDERSTAND_LABEL: Record<string, string> = { good: "◎手応えあり", normal: "○ふつう", weak: "△不安" };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekEndKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// karte_json → 表示用HTML（追加AI呼び出しなし・sanitizeHtmlで表示）
function buildHtml(k: KarteJson): string {
  const actionList = (arr: KarteAction[]) =>
    arr.length === 0
      ? `<p class="empty">なし</p>`
      : `<ul>${arr
          .map((a) => {
            const meta = [a.subject, a.amount].filter(Boolean).join("・");
            return `<li>${esc(a.content)}${meta ? ` <span class="meta">（${esc(meta)}）</span>` : ""}</li>`;
          })
          .join("")}</ul>`;
  return `<div id="student-karte">
  <h2>🌟 3か月ビジョン（北極星）</h2>
  <p>${esc(k.visionSummary) || "（ビジョン未作成）"}</p>
  <h2>📍 今の状況</h2>
  <p>${esc(k.currentStatus)}</p>
  ${k.parentNeeds ? `<h2>👪 保護者からの要望</h2><p>${esc(k.parentNeeds)}</p>` : ""}
  <h2>✅ 今日すべきこと</h2>
  ${actionList(k.todaysActions ?? [])}
  <h2>🗓 今週すべきこと</h2>
  ${actionList(k.weeklyActions ?? [])}
</div>`;
}

async function generateKarteJson(material: any): Promise<KarteJson | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `あなたは個別指導塾のベテラン講師です。以下の素材から、生徒1人の「今日のカルテ」を簡潔に作ってください。

【生徒】${material.studentName}（${material.grade ?? "学年不明"}）

【3か月ビジョン（北極星）】
${material.visionSummary || "（未作成）"}

【現在地：教材進捗（新しい順）】
${material.progress || "（記録なし）"}

【現状：最新の授業報告書】
${material.report || "（報告書なし）"}

【保護者からの要望（新しい順）】
${material.parentNeeds || "（なし）"}

【いまの予定TODO（ビジョンから自動生成した今週分）】
${material.plannedTodos || "（なし）"}

【作成ルール】
- 「テキストを、いまの手応え・進み方で終えるために、今日/今週やること」を現実に合わせて具体化する。
- 予定TODOと現在地(進捗)がズレている場合は、現在地を優先して調整する。
- todaysActions は0〜3件、weeklyActions は3〜6件。各アクションは content(30字以内・具体的)、subject(任意)、amount(分量・任意)。
- currentStatus は200字以内で、できている点と課題を率直に。
- parentNeeds は要望があれば1〜2文で要約、なければ null。
- 出力はJSONのみ（前後の説明・コードフェンスなし）。

【出力JSON形式】
{"visionSummary":"...","currentStatus":"...","parentNeeds":"...またはnull","todaysActions":[{"subject":"数学","content":"...","amount":"2ページ"}],"weeklyActions":[{"subject":"英語","content":"...","amount":"..."}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
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
    const arr = (v: any): KarteAction[] =>
      Array.isArray(v)
        ? v
            .filter((t) => t && t.content)
            .map((t) => ({
              subject: t.subject ? String(t.subject).slice(0, 20) : undefined,
              content: String(t.content).slice(0, 120),
              amount: t.amount ? String(t.amount).slice(0, 40) : undefined,
            }))
        : [];
    return {
      visionSummary: String(parsed.visionSummary ?? "").slice(0, 400),
      currentStatus: String(parsed.currentStatus ?? "").slice(0, 400),
      parentNeeds: parsed.parentNeeds ? String(parsed.parentNeeds).slice(0, 300) : null,
      todaysActions: arr(parsed.todaysActions).slice(0, 3),
      weeklyActions: arr(parsed.weeklyActions).slice(0, 6),
    };
  } catch {
    return null;
  }
}

// 1名分の素材を集約して student_karte に upsert
async function generateOne(
  svc: any,
  student: { id: string; name: string; grade: string | null },
  generatedBy: string | null
): Promise<{ ok: boolean; reason?: string }> {
  // ① 3か月ビジョン（最新の shared、無ければ最新）
  const { data: planRows } = await svc
    .from("learning_plans")
    .select("id, subject, plan_json, plan_html, status, created_at")
    .eq("student_name", student.name)
    .order("created_at", { ascending: false })
    .limit(5);
  const plans: any[] = planRows ?? [];
  const plan = plans.find((p) => p.status === "shared") ?? plans[0] ?? null;
  let visionSummary = "";
  if (plan?.plan_json?.roadmap) {
    const rm = plan.plan_json.roadmap;
    visionSummary = Array.isArray(rm)
      ? rm.map((r: any, i: number) => `${i + 1}ヶ月目: ${r?.goal ?? r?.weeklyPlan ?? ""}`).filter(Boolean).join(" / ")
      : String(JSON.stringify(rm)).slice(0, 300);
  } else if (plan?.plan_html) {
    visionSummary = plan.plan_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  // ② 教材進捗（現在地）
  const { data: progRows } = await svc
    .from("textbook_progress")
    .select("lesson_date, subject, textbook, progress_where, amount, understanding, comment")
    .eq("student_id", student.id)
    .order("lesson_date", { ascending: false })
    .limit(8);
  const progress = ((progRows as any[]) ?? [])
    .map(
      (p) =>
        `・${p.lesson_date} ${p.textbook}${p.progress_where ? ` / ${p.progress_where}` : ""}` +
        `${p.amount ? `（${p.amount}）` : ""}${p.understanding ? ` [${UNDERSTAND_LABEL[p.understanding] ?? p.understanding}]` : ""}` +
        `${p.comment ? ` ※${p.comment}` : ""}`
    )
    .join("\n");

  // ③ 最新報告書（現状＋17項目）
  const { data: repRows } = await svc
    .from("lesson_reports")
    .select("test_subject, percentage, learning_content, learning_method, checked_items, status, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const reps: any[] = repRows ?? [];
  const rep = reps.find((r) => r.status === "sent") ?? reps[0] ?? null;
  let report = "";
  if (rep) {
    const checks = Array.isArray(rep.checked_items) ? rep.checked_items : [];
    report =
      `教科: ${rep.test_subject ?? "—"} / 正答率: ${rep.percentage ?? "—"}\n` +
      `学習内容: ${rep.learning_content ?? "—"}\n学習方法: ${rep.learning_method ?? "—"}\n` +
      `17項目でできている: ${checks.length > 0 ? checks.join("・") : "（記録なし）"}`;
  }

  // ④ 保護者ニーズ（要望メッセージ 最新2件）
  const { data: msgRows } = await svc
    .from("parent_messages")
    .select("message, created_at")
    .eq("student_id", student.id)
    .eq("direction", "parent_to_teacher")
    .order("created_at", { ascending: false })
    .limit(2);
  const parentNeeds = ((msgRows as any[]) ?? [])
    .map((m) => `・${String(m.message ?? "").slice(0, 300)}`)
    .join("\n");

  // ⑤ 予定TODO（今日〜今週）
  let todoQ = svc
    .from("daily_tasks")
    .select("task_date, subject, content, amount")
    .gte("task_date", todayKey())
    .lte("task_date", weekEndKey())
    .order("task_date", { ascending: true });
  todoQ = plan?.id ? todoQ.eq("learning_plan_id", plan.id) : todoQ.eq("student_id", student.id);
  const { data: todoRows } = await todoQ;
  const plannedTodos = ((todoRows as any[]) ?? [])
    .map((t) => `・${t.task_date} ${t.content}${t.subject ? `（${t.subject}）` : ""}`)
    .join("\n");

  const material = {
    studentName: student.name,
    grade: student.grade,
    visionSummary,
    progress,
    report,
    parentNeeds,
    plannedTodos,
  };

  const karteJson = await generateKarteJson(material);
  if (!karteJson) return { ok: false, reason: "ai_failed" };

  const row = {
    student_id: student.id,
    student_name: student.name,
    grade: student.grade,
    learning_plan_id: plan?.id ?? null,
    source_snapshot: {
      visionFrom: plan?.id ?? null,
      progressCount: (progRows as any[])?.length ?? 0,
      reportFrom: rep ? rep.created_at : null,
      parentMsgCount: (msgRows as any[])?.length ?? 0,
      plannedTodoCount: (todoRows as any[])?.length ?? 0,
    },
    karte_html: buildHtml(karteJson),
    karte_json: karteJson,
    status: "shared",
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  };

  const { error } = await svc.from("student_karte").upsert(row, { onConflict: "student_id" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }
  const svc = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const generatedBy = "email" in auth ? auth.email : null;

  const body = await req.json().catch(() => ({}));

  // ── 一括生成 ──────────────────────────────────────────────
  if (body?.all === true) {
    // 対象: 3か月ビジョン(shared)がある or 直近30日に教材進捗がある生徒
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: planStu }, { data: progStu }] = await Promise.all([
      svc.from("learning_plans").select("student_name").eq("status", "shared"),
      svc.from("textbook_progress").select("student_id, student_name").gte("lesson_date", since),
    ]);
    const names = new Set<string>();
    (planStu as any[] ?? []).forEach((p) => p.student_name && names.add(p.student_name));
    (progStu as any[] ?? []).forEach((p) => p.student_name && names.add(p.student_name));
    if (names.size === 0) return NextResponse.json({ created: 0, message: "対象生徒がいません" });

    const { data: students } = await svc
      .from("students")
      .select("id, name, grade")
      .in("name", Array.from(names))
      .limit(200);

    let ok = 0;
    let failed = 0;
    for (const s of (students as any[]) ?? []) {
      const r = await generateOne(svc, s, generatedBy);
      r.ok ? ok++ : failed++;
    }
    return NextResponse.json({ created: ok, failed, targeted: (students as any[])?.length ?? 0 });
  }

  // ── 1名生成 ──────────────────────────────────────────────
  const studentId: string | undefined = body?.studentId;
  const studentName: string | undefined = body?.studentName;
  if (!studentId && !studentName) {
    return NextResponse.json({ error: "studentId または studentName が必要です" }, { status: 400 });
  }

  let sq = svc.from("students").select("id, name, grade").limit(1);
  sq = studentId ? sq.eq("id", studentId) : sq.eq("name", studentName!);
  const { data: stuRows } = await sq;
  const student = ((stuRows as any[]) ?? [])[0];
  if (!student) {
    return NextResponse.json({ error: "生徒が見つかりません（生徒登録が必要です）" }, { status: 404 });
  }

  const r = await generateOne(svc, student, generatedBy);
  if (!r.ok) {
    return NextResponse.json({ error: r.reason === "ai_failed" ? "AI生成に失敗しました" : r.reason }, { status: 500 });
  }
  return NextResponse.json({ created: 1, studentName: student.name });
}
