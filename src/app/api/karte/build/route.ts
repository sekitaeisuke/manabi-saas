import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson } from "@/lib/ai";
// カルテを「素材」から組み立てる。
//
// 素材の優先順位（この順に重い。矛盾したら上位を採るのではなく、下の解決ルールに従う）:
//   1. 報告書 lesson_reports         … 骨格。毎授業の一次情報（学習内容・学習方法・17項目・所感）
//   2. テスト結果 results / answers   … 客観の裏取り。設問単位で「どこを落としたか」の証拠
//   3. 保護者メッセージ parent_messages … 家庭の願い・不安。配慮と面談で触れることを決める
//   4. 教材進捗 textbook_progress     … 現在地（どこまで・手応え）
//   5. 多層診断 questionnaire_responses … 節目のボトルネック仮説
//
// 解決ルール:
//   ・「できている/いない」が報告書とテストで割れたら → テストの数字を優先し、ズレ自体を書く
//   ・「気持ち・家庭事情・要望」は → 保護者メッセージを最優先（講師所感より上）
//   ・素材が無い項目は null のまま返す。AIに推測で埋めさせない
//
// 入力: { studentId? , studentName? , trigger? } / { all: true }
// 出力: student_karte を upsert（生徒1人1枚）

/* eslint-disable @typescript-eslint/no-explicit-any */

export type KarteBuildJson = {
  reached: string | null;          // ① 今の到達点
  stumblePoint: string | null;     // ② つまずきの正体（1つに絞る）
  stumbleEvidence: string | null;  // ②の根拠（設問・報告書からの引用）
  nextStep: string | null;         // ③ 次の一手（今日〜今週）
  family: string | null;           // ④ 家庭の願い・配慮
  visionProgress: string | null;   // ⑤ 講習ビジョンに対する進み具合
  conflict: string | null;         // 報告書とテストの食い違い（あれば）
};

const EMPTY_KARTE: KarteBuildJson = {
  reached: null, stumblePoint: null, stumbleEvidence: null,
  nextStep: null, family: null, visionProgress: null, conflict: null,
};

const UNDERSTAND_LABEL: Record<string, string> = {
  good: "◎手応えあり", normal: "○ふつう", weak: "△不安",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// karte_json → 表示用HTML（素材そのものは画面側で素で出すので、ここはAIの見立てだけ）
function buildHtml(k: KarteBuildJson): string {
  const block = (icon: string, title: string, body: string | null) =>
    body?.trim() ? `<h2>${icon} ${title}</h2><p>${esc(body)}</p>` : "";
  const stumble = k.stumblePoint
    ? `<h2>🔍 つまずきの正体</h2><p>${esc(k.stumblePoint)}</p>` +
      (k.stumbleEvidence ? `<p class="evidence">根拠：${esc(k.stumbleEvidence)}</p>` : "")
    : "";
  return `<div id="student-karte">
  ${block("📍", "今の到達点", k.reached)}
  ${stumble}
  ${block("⚠️", "報告書と数字のズレ", k.conflict)}
  ${block("👣", "次の一手", k.nextStep)}
  ${block("👪", "家庭の願い・配慮", k.family)}
  ${block("🎯", "講習ビジョンに対して", k.visionProgress)}
</div>`;
}

// ── 素材あつめ ───────────────────────────────────────────────

type Material = {
  studentName: string;
  grade: string | null;
  reports: string;
  tests: string;
  wrongQuestions: string;
  parentMessages: string;
  progress: string;
  diagnosis: string;
  vision: string;
  counts: Record<string, number>;
};

async function collect(svc: any, student: { id: string; name: string; grade: string | null }): Promise<{ material: Material; planId: string | null }> {
  const [
    { data: repRows },
    { data: resRows },
    { data: msgRows },
    { data: progRows },
    { data: diagRows },
    { data: planRows },
  ] = await Promise.all([
    // ① 報告書（骨格）
    svc.from("lesson_reports")
      .select("test_subject, test_title, score, total, percentage, learning_content, learning_method, checked_items, teacher_notes, status, created_at")
      .eq("student_id", student.id).order("created_at", { ascending: false }).limit(5),
    // ② テスト結果
    svc.from("results")
      .select("session_id, score, total, percentage, completed_at")
      .eq("student_name", student.name).order("completed_at", { ascending: false }).limit(5),
    // ③ 保護者メッセージ
    svc.from("parent_messages")
      .select("subject, message, direction, created_at")
      .eq("student_id", student.id).eq("direction", "parent_to_teacher")
      .order("created_at", { ascending: false }).limit(3),
    // ④ 教材進捗
    svc.from("textbook_progress")
      .select("lesson_date, subject, textbook, progress_where, amount, understanding, comment")
      .eq("student_id", student.id).order("lesson_date", { ascending: false }).limit(8),
    // ⑤ 多層診断
    svc.from("questionnaire_responses")
      .select("subject, test_percentage, habit_score, method_score, ai_analysis, created_at")
      .eq("student_name", student.name).order("created_at", { ascending: false }).limit(1),
    // 講習ビジョン（現行期を優先）
    svc.from("learning_plans")
      .select("id, subject, term_type, term_label, term_start, term_end, plan_json, plan_html, status, created_at")
      .eq("student_name", student.name).order("created_at", { ascending: false }).limit(5),
  ]);

  const reps: any[] = repRows ?? [];
  const reports = reps.map((r) => {
    const checks = Array.isArray(r.checked_items) ? r.checked_items : [];
    return [
      `【${String(r.created_at).slice(0, 10)}】${r.test_subject ?? "科目未設定"}`,
      r.percentage != null ? `　正答率: ${r.percentage}%（${r.score ?? "—"}/${r.total ?? "—"}）` : "",
      r.learning_content ? `　学習内容: ${r.learning_content}` : "",
      r.learning_method ? `　学習方法: ${r.learning_method}` : "",
      checks.length ? `　17項目でできている: ${checks.join("・")}` : "",
      r.teacher_notes ? `　講師所感: ${r.teacher_notes}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n");

  // テスト結果 + 落とした設問（設問単位の証拠）
  const results: any[] = resRows ?? [];
  const sessionIds = results.map((r) => r.session_id).filter(Boolean);
  let tests = "";
  let wrongQuestions = "";
  if (sessionIds.length > 0) {
    const [{ data: sessRows }, { data: wrongRows }] = await Promise.all([
      svc.from("test_sessions").select("id, test_id").in("id", sessionIds),
      svc.from("answers").select("question_id, answer, is_correct, session_id")
        .eq("student_name", student.name).eq("is_correct", false)
        .in("session_id", sessionIds).limit(12),
    ]);
    const testIds = Array.from(new Set(((sessRows as any[]) ?? []).map((s) => s.test_id).filter(Boolean)));
    const { data: testRows } = testIds.length
      ? await svc.from("tests").select("id, title, subject").in("id", testIds)
      : { data: [] };
    const testById = new Map(((testRows as any[]) ?? []).map((t) => [t.id, t]));
    const testBySession = new Map(((sessRows as any[]) ?? []).map((s) => [s.id, testById.get(s.test_id)]));

    tests = results.map((r) => {
      const t = testBySession.get(r.session_id);
      return `・${String(r.completed_at ?? "").slice(0, 10)} ${t?.title ?? "テスト"}` +
        `${t?.subject ? `（${t.subject}）` : ""} ${r.percentage ?? "—"}%（${r.score ?? "—"}/${r.total ?? "—"}）`;
    }).join("\n");

    const qIds = Array.from(new Set(((wrongRows as any[]) ?? []).map((a) => a.question_id).filter(Boolean)));
    if (qIds.length > 0) {
      const { data: qRows } = await svc.from("questions").select("id, text, type, correct_answer").in("id", qIds);
      const qById = new Map(((qRows as any[]) ?? []).map((q) => [q.id, q]));
      wrongQuestions = ((wrongRows as any[]) ?? []).map((a) => {
        const q = qById.get(a.question_id);
        if (!q) return "";
        return `・「${String(q.text).slice(0, 90)}」→ 本人の解答: ${String(a.answer ?? "無回答").slice(0, 40)}` +
          `${q.correct_answer ? ` / 正解: ${String(q.correct_answer).slice(0, 40)}` : ""}`;
      }).filter(Boolean).join("\n");
    }
  }

  const parentMessages = ((msgRows as any[]) ?? [])
    .map((m) => `・${String(m.created_at).slice(0, 10)}${m.subject ? `［${m.subject}］` : ""} ${String(m.message ?? "").slice(0, 300)}`)
    .join("\n");

  const progress = ((progRows as any[]) ?? [])
    .map((p) => `・${p.lesson_date} ${p.textbook}${p.progress_where ? ` / ${p.progress_where}` : ""}` +
      `${p.amount ? `（${p.amount}）` : ""}${p.understanding ? ` [${UNDERSTAND_LABEL[p.understanding] ?? p.understanding}]` : ""}` +
      `${p.comment ? ` ※${p.comment}` : ""}`)
    .join("\n");

  const diag: any = ((diagRows as any[]) ?? [])[0] ?? null;
  const diagnosis = diag
    ? `${String(diag.created_at).slice(0, 10)} ${diag.subject ?? ""} 正答率${diag.test_percentage ?? "—"}% ` +
      `学習習慣${diag.habit_score ?? "—"} 学習法${diag.method_score ?? "—"}\n${String(diag.ai_analysis ?? "").slice(0, 500)}`
    : "";

  const plans: any[] = planRows ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const current = plans.find((p) => p.term_start && p.term_end && p.term_start <= today && today <= p.term_end)
    ?? plans.find((p) => p.status === "shared") ?? plans[0] ?? null;
  let vision = "";
  if (current) {
    const label = current.term_label ?? current.term_type ?? "計画";
    const gist = current.plan_json?.roadmap
      ? (Array.isArray(current.plan_json.roadmap)
          ? current.plan_json.roadmap.map((r: any, i: number) => `${i + 1}: ${r?.goal ?? ""}`).filter(Boolean).join(" / ")
          : JSON.stringify(current.plan_json.roadmap).slice(0, 300))
      : String(current.plan_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    vision = `${label}${current.term_start ? `（${current.term_start}〜${current.term_end ?? ""}）` : ""}\n${gist}`;
  }

  return {
    planId: current?.id ?? null,
    material: {
      studentName: student.name,
      grade: student.grade,
      reports, tests, wrongQuestions, parentMessages, progress, diagnosis, vision,
      counts: {
        reports: reps.length,
        tests: results.length,
        parentMessages: ((msgRows as any[]) ?? []).length,
        progress: ((progRows as any[]) ?? []).length,
        diagnosis: diag ? 1 : 0,
      },
    },
  };
}

// ── AIに見立てを書かせる ─────────────────────────────────────

async function askClaude(m: Material): Promise<KarteBuildJson | null> {

  const prompt = `あなたは個別指導塾のベテラン講師です。以下の素材から、生徒1人のカルテを書いてください。

【生徒】${m.studentName}（${m.grade ?? "学年不明"}）

════ 素材（上にあるものほど重い）════

■ 1. 授業報告書（骨格・新しい順）
${m.reports || "（まだありません）"}

■ 2. テスト結果
${m.tests || "（まだありません）"}

■ 2-b. 落とした設問（テストで不正解だったもの）
${m.wrongQuestions || "（記録なし）"}

■ 3. 保護者からのメッセージ（新しい順）
${m.parentMessages || "（まだありません）"}

■ 4. 教材進捗（現在地・新しい順）
${m.progress || "（まだありません）"}

■ 5. 多層診断（節目の見立て）
${m.diagnosis || "（まだありません）"}

■ 参考: 今の講習ビジョン
${m.vision || "（未作成）"}

════ 書き方のルール ════
1. 素材の優先順位は上のとおり。報告書を骨格に、テストの数字で裏を取る。
2. 「できている/いない」が報告書とテストで食い違ったら、**テストの数字を優先**し、
   そのズレ自体を conflict に書く（例：報告書では手応えありだが正答率42%＝実質は途中）。
   食い違いが無ければ conflict は null。
3. 「気持ち・家庭の事情・要望」は**保護者メッセージを最優先**（講師の所感より上に置く）。
4. つまずきは**1つに絞る**。stumbleEvidence には素材からの具体的な根拠（設問の文言・報告書の記述・
   正答率の数字）を引用する。根拠が素材に無いなら stumblePoint は null にする。
5. **素材に無いことは書かない。** 該当する素材が無い項目は必ず null にする。推測で埋めない。
   「未作成のため評価できません」「情報がありません」のような“無いことの説明”も書かず、null にすること。
6. 各項目は日本語で、reached/nextStep は150字以内、他は120字以内。

【出力JSON形式（JSONのみ・前後の説明やコードフェンスなし）】
{"reached":"...またはnull","stumblePoint":"...またはnull","stumbleEvidence":"...またはnull","nextStep":"...またはnull","family":"...またはnull","visionProgress":"...またはnull","conflict":"...またはnull"}`;

  try {
    const { text } = await generateText({ prompt, maxTokens: 2000, feature: "karte_build" });
    const p = extractJson<Record<string, unknown>>(text);
    if (!p) return null;
    // 「素材が無い」ことの説明文はカルテに載せない（画面側で「まだ素材がありません」と出すため）。
    const NO_MATERIAL = /(未作成|未実施|情報が?(ありません|ない)|記載(が)?(ありません|ない)|データが?(ありません|ない)|評価(は)?(でき|不可)|該当(する素材|なし)|素材が?(ありません|ない))/;
    const pick = (v: unknown, n: number) => {
      const t = v == null ? "" : String(v).trim();
      if (!t || t === "null" || t === "なし") return null;
      if (t.length <= 60 && NO_MATERIAL.test(t)) return null;
      return t.slice(0, n);
    };
    return {
      reached: pick(p.reached, 300),
      stumblePoint: pick(p.stumblePoint, 300),
      stumbleEvidence: pick(p.stumbleEvidence, 300),
      nextStep: pick(p.nextStep, 300),
      family: pick(p.family, 300),
      visionProgress: pick(p.visionProgress, 300),
      conflict: pick(p.conflict, 300),
    };
  } catch {
    return null;
  }
}

// ── 1名分を組み立てて upsert ─────────────────────────────────

async function buildOne(
  svc: any,
  student: { id: string; name: string; grade: string | null },
  generatedBy: string | null,
  trigger: string
): Promise<{ ok: boolean; reason?: string; empty?: boolean }> {
  const { material, planId } = await collect(svc, student);
  const total = Object.values(material.counts).reduce((a, b) => a + b, 0);

  // 素材ゼロでもカルテは作る（空欄のまま「何が足りないか」を出す）。AIは呼ばない。
  const karte = total === 0 ? EMPTY_KARTE : (await askClaude(material)) ?? EMPTY_KARTE;

  const row = {
    student_id: student.id,
    student_name: student.name,
    grade: student.grade,
    learning_plan_id: planId,
    source_snapshot: {
      reports: material.counts.reports,
      tests: material.counts.tests,
      parentMessages: material.counts.parentMessages,
      progress: material.counts.progress,
      diagnosis: material.counts.diagnosis,
      wrongQuestions: material.wrongQuestions ? material.wrongQuestions.split("\n").length : 0,
    },
    material_status: material.counts,
    built_from: trigger,
    karte_html: buildHtml(karte),
    karte_json: karte,
    status: "shared",
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  };

  // material_status / built_from 列が未追加の環境でも動くよう、失敗したら列なしで再試行
  let { error } = await svc.from("student_karte").upsert(row, { onConflict: "student_id" });
  if (error && /material_status|built_from/.test(error.message)) {
    const { material_status, built_from, ...fallback } = row;  // eslint-disable-line @typescript-eslint/no-unused-vars
    ({ error } = await svc.from("student_karte").upsert(fallback, { onConflict: "student_id" }));
  }
  if (error) return { ok: false, reason: error.message };
  return { ok: true, empty: total === 0 };
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }
  const svc = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const generatedBy = "email" in auth ? (auth as any).email : null;

  const body = await req.json().catch(() => ({}));
  const trigger: string = typeof body?.trigger === "string" ? body.trigger : "manual";

  // ── 一括（在籍生徒全員。素材が無い子は空のカルテができる）──────────
  if (body?.all === true) {
    const { data: students } = await svc.from("students").select("id, name, grade").limit(500);
    let ok = 0, failed = 0, empty = 0;
    for (const s of ((students as any[]) ?? [])) {
      const r = await buildOne(svc, s, generatedBy, "bulk");
      if (!r.ok) failed++;
      else { ok++; if (r.empty) empty++; }
    }
    return NextResponse.json({ built: ok, failed, empty, targeted: ((students as any[]) ?? []).length });
  }

  // ── 1名 ────────────────────────────────────────────────
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

  const r = await buildOne(svc, student, generatedBy, trigger);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 500 });
  return NextResponse.json({ built: 1, studentName: student.name, empty: r.empty ?? false });
}
