"use client";

// カルテ（素材ファースト）。
//   ・上段: AIの見立て（到達点／つまずき／次の一手／家庭／講習ビジョン）
//   ・下段: 素材そのもの（報告書・テスト結果・保護者メッセージ・教材進捗）を素で並べる
//   ・素材が無い項目は空欄のまま。「何が足りないか」をバッジで見せる（AIに埋めさせない）
// 生成は /api/karte/build。報告書を保存した瞬間にも自動で更新される。

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StudentKarte, KarteMaterialStatus } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";
import { Card, Badge, Button, inputClass, cx } from "@/components/ui";

type StudentLite = { id: string; name: string; grade: string | null };

type ReportRow = {
  id: string; created_at: string; test_subject: string | null; percentage: number | null;
  score: number | null; total: number | null; learning_content: string | null;
  learning_method: string | null; checked_items: string[] | null; teacher_notes: string | null;
  status: string | null;
};
type ResultRow = { id: string; session_id: string; score: number | null; total: number | null; percentage: number | null; completed_at: string | null };
type MessageRow = { id: string; subject: string | null; message: string | null; created_at: string };
type ProgressRow = {
  id: string; lesson_date: string; subject: string | null; textbook: string | null;
  progress_where: string | null; amount: string | null; understanding: string | null; comment: string | null;
};

const UNDERSTAND: Record<string, string> = { good: "◎手応えあり", normal: "○ふつう", weak: "△不安" };

const MATERIAL_META: { key: keyof KarteMaterialStatus; label: string; icon: string }[] = [
  { key: "reports", label: "報告書", icon: "📝" },
  { key: "tests", label: "テスト", icon: "📊" },
  { key: "parentMessages", label: "保護者", icon: "👪" },
  { key: "progress", label: "進捗", icon: "📘" },
  { key: "diagnosis", label: "診断", icon: "🔬" },
];

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, "/") : "—");
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function materialCount(k: StudentKarte | undefined): number {
  const m = k?.material_status;
  if (!m) return 0;
  return (m.reports ?? 0) + (m.tests ?? 0) + (m.parentMessages ?? 0) + (m.progress ?? 0) + (m.diagnosis ?? 0);
}

/* ── 見立ての1ブロック（素材が無ければ「素材待ち」と出す）────────── */
function Insight({ icon, title, body, tone = "neutral", note }: {
  icon: string; title: string; body: string | null | undefined;
  tone?: "neutral" | "caution"; note?: string | null;
}) {
  return (
    <div className={cx(
      "rounded-xl border p-3",
      tone === "caution" && body ? "border-caution-200 bg-caution-50" : "border-line bg-canvas-sunken",
    )}>
      <p className="text-xs font-bold text-ink-muted">{icon} {title}</p>
      {body ? (
        <>
          <p className="mt-1 text-sm leading-relaxed text-ink">{body}</p>
          {note && <p className="mt-1 text-xs text-ink-faint">根拠：{note}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-faint">— まだ素材がありません</p>
      )}
    </div>
  );
}

/* ── 素材そのもの（折りたたみ）──────────────────────────── */
function MaterialBlock({ icon, title, count, children }: {
  icon: string; title: string; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold text-ink">{icon} {title}</span>
        <Badge tone={count > 0 ? "brand" : "neutral"}>{count}</Badge>
        <span className="ml-auto text-xs text-ink-faint">{open ? "閉じる" : "開く"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2 text-sm text-ink">
          {count > 0 ? children : <p className="py-1 text-ink-faint">まだありません</p>}
        </div>
      )}
    </div>
  );
}

export default function KarteMaterialsView() {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [kartes, setKartes] = useState<Record<string, StudentKarte>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentLite | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  // 詳細で開いている生徒の素材
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [matLoading, setMatLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: stu }, { data: ks, error: kErr }] = await Promise.all([
      supabase.from("students").select("id, name, grade").order("name"),
      supabase.from("student_karte").select("*"),
    ]);
    if (kErr && (kErr.code === "42P01" || /does not exist/.test(kErr.message))) setTableMissing(true);
    setStudents((stu as StudentLite[]) ?? []);
    const map: Record<string, StudentKarte> = {};
    ((ks as StudentKarte[]) ?? []).forEach((k) => { if (k.student_id) map[k.student_id] = k; });
    setKartes(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMaterials = useCallback(async (s: StudentLite) => {
    setMatLoading(true);
    const [{ data: rep }, { data: res }, { data: msg }, { data: prog }] = await Promise.all([
      supabase.from("lesson_reports")
        .select("id, created_at, test_subject, percentage, score, total, learning_content, learning_method, checked_items, teacher_notes, status")
        .eq("student_id", s.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("results")
        .select("id, session_id, score, total, percentage, completed_at")
        .eq("student_name", s.name).order("completed_at", { ascending: false }).limit(5),
      supabase.from("parent_messages")
        .select("id, subject, message, created_at")
        .eq("student_id", s.id).eq("direction", "parent_to_teacher")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("textbook_progress")
        .select("id, lesson_date, subject, textbook, progress_where, amount, understanding, comment")
        .eq("student_id", s.id).order("lesson_date", { ascending: false }).limit(8),
    ]);
    setReports((rep as ReportRow[]) ?? []);
    setResults((res as ResultRow[]) ?? []);
    setMessages((msg as MessageRow[]) ?? []);
    setProgress((prog as ProgressRow[]) ?? []);
    setMatLoading(false);
  }, []);

  const open = (s: StudentLite) => { setSelected(s); loadMaterials(s); };

  const rebuild = async (s: StudentLite) => {
    setBusy(s.id);
    try {
      const r = await authFetch("/api/karte/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: s.id, trigger: "manual" }),
      });
      const d = await r.json();
      if (d.error) showToast(d.error, "error");
      else if (d.empty) showToast(`${s.name} はまだ素材がありません（報告書を書くとカルテが埋まります）`, "info");
      else showToast(`${s.name} のカルテを更新しました`, "success");
      await load();
      if (selected?.id === s.id) await loadMaterials(s);
    } finally { setBusy(null); }
  };

  const rebuildAll = async () => {
    setBulkBusy(true);
    try {
      const r = await authFetch("/api/karte/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const d = await r.json();
      if (d.error) showToast(d.error, "error");
      else showToast(`${d.built}名を組み立てました（うち素材なし ${d.empty}名）`, "success");
      await load();
    } finally { setBulkBusy(false); }
  };

  const filtered = useMemo(() => students.filter(
    (s) => !search || s.name.includes(search) || (s.grade ?? "").includes(search)
  ), [students, search]);

  /* ── 詳細 ─────────────────────────────────────────── */
  if (selected) {
    const k = kartes[selected.id];
    const j = k?.karte_json ?? null;
    const ms = k?.material_status;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>← 一覧へ</Button>
          <div>
            <p className="text-lg font-bold text-ink">{selected.name}</p>
            <p className="text-xs text-ink-faint">
              {selected.grade ?? "学年未設定"}
              {k ? ` ／ 最終更新 ${fmtWhen(k.generated_at)}${k.built_from ? `（${k.built_from === "report_saved" ? "報告書の保存" : k.built_from === "bulk" ? "一括" : "手動"}）` : ""}` : " ／ カルテ未作成"}
            </p>
          </div>
          <Button className="ml-auto" size="sm" disabled={busy === selected.id}
            onClick={() => rebuild(selected)}>
            {busy === selected.id ? "組み立て中..." : "カルテを作り直す"}
          </Button>
        </div>

        {/* 素材の充足 */}
        <div className="flex flex-wrap gap-2">
          {MATERIAL_META.map((m) => {
            const n = ms?.[m.key] ?? 0;
            return (
              <Badge key={m.key} tone={n > 0 ? "positive" : "critical"}>
                {m.icon} {m.label} {n}
              </Badge>
            );
          })}
        </div>

        {/* AIの見立て */}
        <Card>
          <p className="mb-3 text-sm font-bold text-ink">AIの見立て</p>
          {!k ? (
            <p className="text-sm text-ink-faint">
              まだカルテがありません。「カルテを作り直す」を押すか、報告書を1件保存すると自動で作られます。
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Insight icon="📍" title="今の到達点" body={j?.reached ?? j?.currentStatus} />
              <Insight icon="🔍" title="つまずきの正体" body={j?.stumblePoint} note={j?.stumbleEvidence} />
              <Insight icon="👣" title="次の一手" body={j?.nextStep ?? j?.textbookPace} />
              <Insight icon="👪" title="家庭の願い・配慮" body={j?.family ?? j?.parentNeeds} />
              <Insight icon="⚠️" title="報告書と数字のズレ" body={j?.conflict} tone="caution" />
              <Insight icon="🎯" title="講習ビジョンに対して" body={j?.visionProgress ?? j?.visionSummary} />
            </div>
          )}
        </Card>

        {/* 素材そのもの */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink">素材（この順に重い）</p>
          {matLoading && <p className="text-sm text-ink-faint">素材を読み込み中...</p>}

          <MaterialBlock icon="📝" title="1. 授業報告書" count={reports.length}>
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <p className="text-xs text-ink-faint">
                    {fmtDate(r.created_at)}　{r.test_subject ?? "科目未設定"}
                    {r.percentage != null && `　正答率 ${r.percentage}%（${r.score ?? "—"}/${r.total ?? "—"}）`}
                    {r.status === "sent" && "　送信済み"}
                  </p>
                  {r.learning_content && <p className="mt-0.5">学習内容：{r.learning_content}</p>}
                  {r.learning_method && <p>学習方法：{r.learning_method}</p>}
                  {Array.isArray(r.checked_items) && r.checked_items.length > 0 && (
                    <p className="text-xs text-ink-muted">できている（{r.checked_items.length}/17）：{r.checked_items.join("・")}</p>
                  )}
                  {r.teacher_notes && <p className="text-xs text-ink-muted">講師所感：{r.teacher_notes}</p>}
                </li>
              ))}
            </ul>
          </MaterialBlock>

          <MaterialBlock icon="📊" title="2. テスト結果" count={results.length}>
            <ul className="space-y-1">
              {results.map((r) => (
                <li key={r.id}>
                  {fmtDate(r.completed_at)}　{r.percentage ?? "—"}%（{r.score ?? "—"}/{r.total ?? "—"}）
                </li>
              ))}
            </ul>
          </MaterialBlock>

          <MaterialBlock icon="👪" title="3. 保護者からのメッセージ" count={messages.length}>
            <ul className="space-y-2">
              {messages.map((m) => (
                <li key={m.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <p className="text-xs text-ink-faint">{fmtDate(m.created_at)}{m.subject ? `　［${m.subject}］` : ""}</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{m.message}</p>
                </li>
              ))}
            </ul>
          </MaterialBlock>

          <MaterialBlock icon="📘" title="4. 教材進捗" count={progress.length}>
            <ul className="space-y-1">
              {progress.map((p) => (
                <li key={p.id}>
                  {fmtDate(p.lesson_date)}　{p.textbook ?? "—"}
                  {p.progress_where && ` / ${p.progress_where}`}
                  {p.amount && `（${p.amount}）`}
                  {p.understanding && `　${UNDERSTAND[p.understanding] ?? p.understanding}`}
                  {p.comment && <span className="text-ink-muted">　※{p.comment}</span>}
                </li>
              ))}
            </ul>
          </MaterialBlock>
        </div>
      </div>
    );
  }

  /* ── 一覧 ─────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {tableMissing && (
        <Card className="border-caution-200 bg-caution-50">
          <p className="text-sm text-ink">
            student_karte テーブルがありません。Supabase の SQL エディタで
            <code className="mx-1">student-karte-setup.sql</code> と
            <code className="mx-1">karte-materials-setup.sql</code> を実行してください。
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="生徒名・学年で探す" className={cx(inputClass, "max-w-xs")} />
        <Button variant="secondary" size="sm" onClick={rebuildAll} disabled={bulkBusy}>
          {bulkBusy ? "組み立て中..." : "全員ぶんを作り直す"}
        </Button>
        <p className="ml-auto text-xs text-ink-faint">
          カルテは報告書を保存すると自動で更新されます
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <Card><p className="text-sm text-ink-faint">生徒がいません。</p></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const k = kartes[s.id];
            const n = materialCount(k);
            return (
              <Card key={s.id} interactive padding="sm" onClick={() => open(s)} className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{s.name}</span>
                  <span className="text-xs text-ink-faint">{s.grade ?? ""}</span>
                  <span className="ml-auto">
                    {!k ? <Badge tone="neutral">未作成</Badge>
                      : n === 0 ? <Badge tone="critical">素材なし</Badge>
                      : <Badge tone="positive">素材 {n}</Badge>}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                  {k?.karte_json?.reached ?? k?.karte_json?.currentStatus ?? "報告書を書くとカルテが埋まります"}
                </p>
                {k && <p className="mt-1 text-[11px] text-ink-faint">更新 {fmtWhen(k.generated_at)}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
