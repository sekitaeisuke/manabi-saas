import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

// 日次カルテ生成。
// 「今日/今週やること」は 3か月ビジョン由来の daily_tasks（チェック可）を単一の真実として使うため、
// ここでは作り直さない。AI は文脈だけを書く:
//   currentStatus（現状）/ textbookPace（テキストの進め方）/ cautions（気を付けること）/ parentNeeds（保護者ニーズ）/ visionSummary。
// 素材: 3か月ビジョン(learning_plans) + 教材進捗(textbook_progress) + 最新報告書(lesson_reports,17項目) +
//       保護者要望(parent_messages) + 今週の daily_tasks（進め方の判断材料）。
// 入力: { studentId?, studentName?, grade? }（1名） / { all: true }（対象生徒を一括）

/* eslint-disable @typescript-eslint/no-explicit-any */

type KarteJson = {
  visionSummary: string;
  currentStatus: string;
  textbookPace: string;
  cautions: string;
  parentNeeds: string | null;
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

// karte_json（文脈）→ 表示用HTML。「今日/今週やること」は daily_tasks を各画面で別途チェック表示するため、ここには含めない。
function buildHtml(k: KarteJson): string {
  const block = (icon: string, title: string, body: string) =>
    body?.trim() ? `<h2>${icon} ${title}</h2><p>${esc(body)}</p>` : "";
  return `<div id="student-karte">
  ${block("🌟", "3か月ビジョン（北極星）", k.visionSummary || "（ビジョン未作成）")}
  ${block("📍", "今の状況", k.currentStatus)}
  ${block("📖", "テキストの進め方", k.textbookPace)}
  ${block("⚠️", "気を付けること", k.cautions)}
  ${k.parentNeeds ? block("👪", "保護者からの要望", k.parentNeeds) : ""}
</div>`;
}

async function generateKarteJson(material: any): Promise<KarteJson | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `あなたは個別指導塾のベテラン講師です。以下の素材から、生徒1人の「今日のカルテ」の文脈部分を簡潔に書いてください。
※「今日/今週やること」の具体タスクは、3か月ビジョンから自動生成された毎日のTODO（別に表示）を使うので、ここでは作りません。
　あなたは「現状・テキストの進め方・気を付けること・保護者ニーズ・ビジョン要約」だけを書きます。

【生徒】${material.studentName}（${material.grade ?? "学年不明"}）

【3か月ビジョン（北極星）】
${material.visionSummary || "（未作成）"}

【現在地：教材進捗（新しい順）】
${material.progress || "（記録なし）"}

【現状：最新の授業報告書】
${material.report || "（報告書なし）"}

【保護者からの要望（新しい順）】
${material.parentNeeds || "（なし）"}

【今週の毎日のTODO（3か月ビジョンから自動生成・チェック式で別表示）】
${material.plannedTodos || "（なし）"}

【書くルール】
- currentStatus: 200字以内。教材進捗と報告書17項目から、できている点と課題を率直に。
- textbookPace: 「いまの手応え・進み方だと、テキストを今週どれくらい進めればよいか（章・ページ・単元の目安）」を具体的に1〜2文。進捗が遅れ気味なら現実的な調整も。
- cautions: 「この生徒がつまずきやすい点・今日の指導や本人が気を付けること」を1〜2文。
- parentNeeds: 保護者要望があれば1〜2文で要約、なければ null。
- visionSummary: 3か月ビジョンの要点を1文で。
- 出力はJSONのみ（前後の説明・コードフェンスなし）。

【出力JSON形式】
{"visionSummary":"...","currentStatus":"...","textbookPace":"...","cautions":"...","parentNeeds":"...またはnull"}`;

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
        max_tokens: 2000,
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
    return {
      visionSummary: String(parsed.visionSummary ?? "").slice(0, 400),
      currentStatus: String(parsed.currentStatus ?? "").slice(0, 400),
      textbookPace: String(parsed.textbookPace ?? "").slice(0, 400),
      cautions: String(parsed.cautions ?? "").slice(0, 400),
      parentNeeds: parsed.parentNeeds ? String(parsed.parentNeeds).slice(0, 300) : null,
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

  // ⑤ 今週の毎日のTODO（daily_tasks・進め方の判断材料。カルテには作り込まず参照のみ）
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
