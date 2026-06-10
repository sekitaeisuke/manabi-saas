"use client";
import { showToast } from "@/lib/toast";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Test, Question, TestSession } from "@/lib/supabase";

// ─── アンケート定義 ────────────────────────────────────
const SCALE = [
  { value: 4, label: "いつもそう" },
  { value: 3, label: "だいたいそう" },
  { value: 2, label: "あまりそうでない" },
  { value: 1, label: "ほとんどない" },
];

const SECTION_A = [
  { key: "a1", text: "毎日、決まった時間に勉強していますか？" },
  { key: "a2", text: "宿題を、決められた日までに終わらせていますか？" },
  { key: "a3", text: "毎日2時間以上勉強していますか？" },
  { key: "a4", text: "授業の前に、前回の内容を見直していますか？" },
  { key: "a5", text: "授業が終わったその日に、内容を復習していますか？" },
  { key: "a6", text: "テスト前に計画を立てて勉強していますか？" },
  { key: "a7", text: "勉強中に、スマホやゲームが気になって集中できないことがありますか？" },
  { key: "a8", text: "「今日はいいや」と勉強をやめてしまうことがありますか？" },
];

const SECTION_B = [
  { key: "b1", text: "わからない問題があっても、自分でじっくり考え続けていますか？" },
  { key: "b2", text: "間違えた問題を、もう一度自分で解きなおしていますか？" },
  { key: "b3", text: "解説を読んで「なるほど」と理解できていますか？" },
  { key: "b4", text: "教科書や参考書の例題を、自分で読んで学ぼうとしていますか？" },
  { key: "b5", text: "ノートに大事なことをまとめていますか？" },
  { key: "b6", text: "新しい言葉や公式を、書いて覚えるようにしていますか？" },
  { key: "b7", text: "わからないとき、先生に積極的に質問していますか？" },
  { key: "b8", text: "自分の得意な科目と苦手な科目がわかっていますか？" },
];

const SECTION_C = [
  { key: "c1", text: "問題文に知らない言葉や用語が出てきて、困ることがありますか？" },
  { key: "c2", text: "文の意味や言葉のルールがよくわからなくなることがありますか？" },
  { key: "c3", text: "問題が「何を答えればいいのか」わからなくなることがありますか？" },
  { key: "c4", text: "答えはわかっているのに、どう書けばいいかわからないことがありますか？" },
  { key: "c5", text: "頭ではわかっているのに、うまく答えを書けないことがありますか？" },
  { key: "c6", text: "計算や暗記（単語・公式）はスムーズにできていますか？" },
  { key: "c7", text: "間違えた問題について、なぜ間違えたか自分で説明できますか？" },
];

type Phase = "name" | "test" | "qa" | "qb" | "qc" | "submitting" | "submitted";
type QAnswers = Record<string, number>;

export default function StudentTestPage({ params }: { params: Promise<{ token: string }> }) {
  const [session, setSession] = useState<TestSession | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qaAnswers, setQaAnswers] = useState<QAnswers>({});
  const [qbAnswers, setQbAnswers] = useState<QAnswers>({});
  const [qcAnswers, setQcAnswers] = useState<QAnswers>({});
  const [phase, setPhase] = useState<Phase>("name");
  const [loading, setLoading] = useState(true);

  const loadTest = async (tok: string) => {
    const { data: sessionData } = await supabase
      .from("test_sessions").select("*").eq("url_token", tok).single();
    if (!sessionData) { setLoading(false); return; }
    // 有効期限切れのURLは受験不可（session 未設定のまま終了 → 「見つかりません」表示）
    if (sessionData.expires_at && new Date(sessionData.expires_at).getTime() < Date.now()) {
      setLoading(false); return;
    }
    setSession(sessionData);
    const { data: testData } = await supabase
      .from("tests").select("*").eq("id", sessionData.test_id).single();
    setTest(testData);
    // correct_answer は生徒に送らない（採点はサーバ側がDBの正解で行う）
    const { data: questionsData } = await supabase
      .from("questions")
      .select("id, test_id, type, text, options, order_index, points")
      .eq("test_id", sessionData.test_id).order("order_index");
    setQuestions((questionsData ?? []) as Question[]);
    setLoading(false);
  };

  useEffect(() => {
    params.then(async (p) => {
      // URLパラメータに studentName があればログイン済み生徒として自動セット
      const urlParams = new URLSearchParams(window.location.search);
      const nameFromUrl = urlParams.get("studentName");
      if (nameFromUrl) {
        setStudentName(nameFromUrl);
        await loadTest(p.token);
        setPhase("test");
      } else {
        await loadTest(p.token);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAll = async () => {
    if (!session || !studentName) return;
    setPhase("submitting");
    const answerRows = Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer }));
    try {
      const res = await fetch("/api/test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          student_name: studentName,
          grade: test?.grade ?? "",
          subject: test?.subject ?? "",
          answers: answerRows,
          questions,
          questionnaire: { a: qaAnswers, b: qbAnswers, c: qcAnswers },
          test_type: test?.type ?? "",
          test_title: test?.title ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "不明なエラー" }));
        showToast(`提出に失敗しました: ${err.error ?? res.statusText}`, "error");
        setPhase("qc");
        return;
      }
      setPhase("submitted");
    } catch {
      showToast("ネットワークエラーが発生しました", "error");
      setPhase("qc");
    }
  };

  // 複数選択問題かどうかを判定（correct_answer は取得しないため type と本文で判定）
  // 「全て選びなさい」「すべて選べ」など
  const isMultiSelect = (q: Question): boolean =>
    q.type === "multi-select" ||
    /全て|すべて|全ての|すべての/.test(q.text);

  // 複数選択の切り替え（選択肢をトグルしてカンマ区切りで保存）
  const toggleMultiAnswer = (questionId: string, opt: string) => {
    const current = answers[questionId] ? answers[questionId].split(",").filter(Boolean) : [];
    const next = current.includes(opt)
      ? current.filter((v) => v !== opt)
      : [...current, opt].sort();
    if (next.length === 0) {
      const { [questionId]: _, ...rest } = answers;
      setAnswers(rest);
    } else {
      setAnswers({ ...answers, [questionId]: next.join(",") });
    }
  };

  // ── ローディング・エラー ──
  if (loading) return <Center><p className="text-slate-500">読み込み中...</p></Center>;
  if (!test) return (
    <Center>
      <p className="text-4xl mb-4">😕</p>
      <p className="text-red-600 font-semibold">テストが見つかりません</p>
      <p className="text-slate-500 text-sm mt-2">URLを確認してください</p>
    </Center>
  );

  // ── 提出完了 ──
  if (phase === "submitted") {
    const isLesson = test?.type === "lesson";
    return (
      <Center>
        <div className="text-6xl mb-4">{isLesson ? "📝" : "✅"}</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">提出完了！</h1>
        <p className="text-slate-600">{studentName}さんの回答を受け付けました。</p>

        {isLesson ? (
          /* 学力テスト用メッセージ */
          <div className="mt-6 rounded-2xl bg-green-50 border border-green-100 px-5 py-4 text-left text-sm text-green-800 space-y-1.5">
            <p className="font-semibold">これから行われること</p>
            <p>・AI がテスト結果を採点・分析します</p>
            <p>・担当講師が結果を確認して授業報告書を作成します</p>
            <p>・完成した報告書は保護者アプリに届きます</p>
          </div>
        ) : (
          /* 多層分析テスト用メッセージ */
          <div className="mt-6 rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4 text-left text-sm text-blue-800 space-y-1.5">
            <p className="font-semibold">これから行われること</p>
            <p>・AI がテスト結果とアンケートを分析します</p>
            <p>・担当講師が内容を確認・承認します</p>
            <p>・保護者アプリの「多層診断」に結果が届きます</p>
          </div>
        )}

        <a
          href="/student/dashboard"
          className="mt-6 block w-full rounded-2xl bg-indigo-600 py-3 text-center font-semibold text-white hover:bg-indigo-700 transition"
        >
          ダッシュボードに戻る
        </a>
        <p className="mt-3 text-slate-400 text-sm">このページは閉じても大丈夫です。</p>
      </Center>
    );
  }

  // ── 提出中 ──
  if (phase === "submitting") return (
    <Center><p className="text-slate-500 animate-pulse">提出中です。しばらくお待ちください...</p></Center>
  );

  // ── 名前入力 ──
  if (phase === "name") return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{test.title}</h1>
        <p className="text-slate-500 text-sm mb-8">{test.subject} ・ {test.grade} ・ {questions.length}問</p>
        {test.type !== "lesson" && (
          <p className="text-sm text-slate-500 mb-4">
            このテストはテスト後にアンケートがあります。正直に答えてください。
          </p>
        )}
        <label className="block text-sm font-medium text-slate-700 mb-2">名前を入力してください</label>
        <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && studentName && setPhase("test")}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 mb-6 text-lg"
          placeholder="例：山田 太郎" autoFocus />
        <button onClick={() => studentName && setPhase("test")} disabled={!studentName}
          className="w-full rounded-2xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-40 hover:bg-blue-700 transition">
          テストを開始する →
        </button>
      </div>
    </div>
  );

  // ── テスト ──
  if (phase === "test") {
    const total = questions.reduce((s, q) => s + q.points, 0);
    const answered = Object.keys(answers).length;
    const pct = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700">{test.title}</span>
              <span className="text-slate-500 tabular-nums">{answered} / {questions.length}問</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="py-8 px-4">
        <div className="mx-auto max-w-2xl">
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">{test.title}</h1>
            <p className="text-slate-500 text-sm mt-1">{test.subject} ・ {test.grade} ・ {studentName}さん</p>
            <p className="text-xs text-slate-400 mt-1">全{questions.length}問・{total}点満点</p>
          </header>
          <div className="space-y-6">
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-400">第{i + 1}問</p>
                  <span className="text-xs text-slate-400">{q.points}点</span>
                </div>
                <p className="text-slate-900 font-medium mb-4 leading-relaxed">{q.text}</p>
                {(q.type === "multiple-choice" || q.type === "multi-select") && q.options && (
                  isMultiSelect(q) ? (
                    /* ── 複数選択（チェックボックス） ── */
                    <div className="space-y-2">
                      <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                        <span>☑</span> 当てはまるものを全て選んでください（複数選択可）
                      </p>
                      {q.options.map((opt, j) => {
                        const selected = (answers[q.id]?.split(",") ?? []).includes(opt);
                        return (
                          <label key={j} className={`flex items-center gap-3 cursor-pointer p-3 rounded-2xl border-2 transition select-none ${
                            selected ? "border-blue-400 bg-blue-50" : "border-slate-100 hover:bg-slate-50"
                          }`}>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                              selected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white"
                            }`}>
                              {selected && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <input type="checkbox" checked={selected}
                              onChange={() => toggleMultiAnswer(q.id, opt)}
                              className="sr-only" />
                            <span className="text-slate-700">{opt}</span>
                          </label>
                        );
                      })}
                      {answers[q.id] && (
                        <p className="mt-1 text-xs text-slate-400">
                          選択中: {answers[q.id].split(",").join("、")}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── 単一選択（ラジオボタン） ── */
                    <div className="space-y-2">
                      {q.options.map((opt, j) => (
                        <label key={j} className={`flex items-center gap-3 cursor-pointer p-3 rounded-2xl border transition ${answers[q.id] === opt ? "border-blue-400 bg-blue-50" : "border-slate-100 hover:bg-slate-50"}`}>
                          <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt}
                            onChange={() => setAnswers({ ...answers, [q.id]: opt })} className="text-blue-600" />
                          <span className="text-slate-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )
                )}
                {q.type === "short-answer" && (
                  <div>
                    <p className="text-xs text-amber-600 mb-1">⚠ 数字は半角で入力してください（例：12、-3）</p>
                    <input type="text" value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="答えを入力" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            <button
              onClick={() => test.type === "lesson" ? submitAll() : setPhase("qa")}
              disabled={answered < questions.length}
              className="w-full rounded-2xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-40 hover:bg-blue-700 transition">
              {test.type === "lesson"
                ? `テスト完了 → 提出する（${answered}/${questions.length}問回答済み）`
                : `テスト完了 → アンケートへ（${answered}/${questions.length}問回答済み）`}
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (phase === "qa") return (
    <QuestionnaireSection
      title="アンケート Part A：学習習慣" subtitle="ふだんの勉強のようすについて答えてください"
      color="bg-indigo-50 text-indigo-800" section={SECTION_A}
      qAnswers={qaAnswers} setAnswers={setQaAnswers}
      onNext={() => setPhase("qb")} onBack={() => setPhase("test")}
      nextLabel="Part B へ" partNum={1} partTotal={3} />
  );

  if (phase === "qb") return (
    <QuestionnaireSection
      title="アンケート Part B：学習法" subtitle="どのように勉強しているかについて答えてください"
      color="bg-emerald-50 text-emerald-800" section={SECTION_B}
      qAnswers={qbAnswers} setAnswers={setQbAnswers}
      onNext={() => setPhase("qc")} onBack={() => setPhase("qa")}
      nextLabel="Part C へ" partNum={2} partTotal={3} />
  );

  if (phase === "qc") return (
    <QuestionnaireSection
      title="アンケート Part C：自分の勉強のとくちょう" subtitle="正直に答えてください。正解はありません"
      color="bg-amber-50 text-amber-800" section={SECTION_C}
      qAnswers={qcAnswers} setAnswers={setQcAnswers}
      onNext={submitAll} onBack={() => setPhase("qb")}
      nextLabel="提出する" partNum={3} partTotal={3} />
  );

  return null;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 shadow-lg text-center max-w-lg w-full">{children}</div>
    </div>
  );
}

// アンケート回答の更新ヘルパー（純粋関数）
const setQ = (setter: React.Dispatch<React.SetStateAction<QAnswers>>, key: string, val: number) =>
  setter((prev) => ({ ...prev, [key]: val }));

const allAnswered = (section: { key: string }[], answered: QAnswers) =>
  section.every((q) => answered[q.key] !== undefined);

// ── アンケート共通レイアウト（モジュールスコープで定義し、再レンダー時の再生成・入力フォーカス喪失を防ぐ）──
function QuestionnaireSection({
  title, subtitle, color, section, qAnswers, setAnswers: setAns, onNext, onBack, nextLabel, partNum, partTotal,
}: {
  title: string; subtitle: string; color: string;
  section: { key: string; text: string }[];
  qAnswers: QAnswers;
  setAnswers: React.Dispatch<React.SetStateAction<QAnswers>>;
  onNext: () => void; onBack: () => void; nextLabel: string;
  partNum: number; partTotal: number;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-slate-700">アンケート</span>
            <span className="text-slate-500">Part {partNum} / {partTotal}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: partTotal }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < partNum ? "bg-blue-500" : "bg-slate-200"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className={`mb-6 rounded-2xl p-4 ${color}`}>
          <h2 className="font-bold text-lg">{title}</h2>
          <p className="text-sm opacity-80 mt-1">{subtitle}</p>
        </div>
        <div className="mb-4 flex gap-1 justify-center text-xs text-slate-500">
          {SCALE.flatMap((s, i) => [
            i > 0 && <span key={`sep-${i}`} className="mx-1">・</span>,
            <span key={s.value} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-full ${s.value === 4 ? "bg-green-400" : s.value === 3 ? "bg-blue-400" : s.value === 2 ? "bg-yellow-400" : "bg-red-400"}`} />
              {s.label}
            </span>,
          ])}
        </div>
        <div className="space-y-4">
          {section.map((q, i) => (
            <div key={q.key} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-slate-800 mb-3 text-sm font-medium">
                <span className="text-slate-400 mr-2">Q{i + 1}.</span>{q.text}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SCALE.map((s) => (
                  <button key={s.value} onClick={() => setQ(setAns, q.key, s.value)}
                    className={`rounded-xl py-2 text-xs font-semibold border-2 transition ${qAnswers[q.key] === s.value
                      ? s.value === 4 ? "border-green-500 bg-green-100 text-green-700"
                        : s.value === 3 ? "border-blue-500 bg-blue-100 text-blue-700"
                        : s.value === 2 ? "border-yellow-500 bg-yellow-100 text-yellow-700"
                        : "border-red-500 bg-red-100 text-red-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <button onClick={onBack}
            className="flex-1 rounded-2xl border border-slate-300 bg-white py-4 text-slate-700 hover:bg-slate-50">
            戻る
          </button>
          <button onClick={onNext} disabled={!allAnswered(section, qAnswers)}
            className="flex-1 rounded-2xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-40 hover:bg-blue-700 transition">
            {nextLabel}（{Object.keys(qAnswers).length}/{section.length}問）
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
