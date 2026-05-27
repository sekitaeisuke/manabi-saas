"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { notify, links } from "@/lib/notify";
import { Toast } from "@/components/Toast";

type Lesson = {
  id: string;
  subject: string | null;
  scheduled_at: string;
  status: string;
};

type Request = {
  id: string;
  lesson_id: string;
  proposed_at: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  teacher_response: string | null;
  responded_at: string | null;
  created_at: string;
  lessons?: { subject: string | null; scheduled_at: string } | null;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReschedulePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonParam = searchParams.get("lesson");
  const [selectedStudentId] = useSelectedStudentId();

  const [parentId, setParentId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ lesson_id: "", proposed_at: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState(false);

  const loadAll = useCallback(async () => {
    if (!selectedStudentId) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await supabase.from("parents").select("id").eq("email", session.user.email!).maybeSingle();
    if (!p) { setLoading(false); return; }
    setParentId(p.id);

    const nowIso = new Date().toISOString();
    const [{ data: ls }, { data: rs }] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, subject, scheduled_at, status")
        .eq("student_id", selectedStudentId)
        .gte("scheduled_at", nowIso)
        .in("status", ["scheduled"])
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("reschedule_requests")
        .select("*, lessons(subject, scheduled_at)")
        .eq("parent_id", p.id)
        .order("created_at", { ascending: false }),
    ]);
    setLessons((ls as Lesson[]) ?? []);
    setRequests((rs as Request[]) ?? []);
    setLoading(false);
  }, [selectedStudentId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (lessonParam && lessons.some((l) => l.id === lessonParam)) {
      setForm((f) => ({ ...f, lesson_id: lessonParam }));
    }
  }, [lessonParam, lessons]);

  const submit = async () => {
    if (!parentId || !selectedStudentId) return;
    if (!form.lesson_id || !form.proposed_at) { setError("授業と希望日時を選んでください"); return; }
    setSubmitting(true);
    setError("");
    const { error } = await supabase.from("reschedule_requests").insert({
      lesson_id: form.lesson_id,
      parent_id: parentId,
      student_id: selectedStudentId,
      proposed_at: new Date(form.proposed_at).toISOString(),
      reason: form.reason || null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) { setError(`送信に失敗: ${error.message}`); return; }

    const { data: lesson } = await supabase
      .from("lessons").select("teacher_id, subject, scheduled_at").eq("id", form.lesson_id).maybeSingle();
    if (lesson?.teacher_id) {
      await notify({
        actor_kind: "teacher",
        actor_id: lesson.teacher_id,
        event_type: "reschedule_request",
        subject: "振替リクエストが届いています",
        body_text: `${lesson.subject ?? ""}（元の日時：${new Date(lesson.scheduled_at).toLocaleString("ja-JP")}）\n希望：${new Date(form.proposed_at).toLocaleString("ja-JP")}\n理由：${form.reason || "(未記入)"}`,
        link: links.teacherReschedule(),
      });
    }

    setForm({ lesson_id: "", proposed_at: "", reason: "" });
    setSuccessToast(true);
    router.replace("/parent/dashboard/reschedule");
    loadAll();
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      {successToast && <Toast message="振替申請を送信しました" onClose={() => setSuccessToast(false)} />}
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">振替リクエスト</h1>
          <p className="mt-1 text-slate-600">授業の日時変更を講師に申請できます。承認後に新しい日時で確定します。</p>
        </div>

        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">新規申請</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-slate-500">振替可能な授業がありません。</p>
          ) : (
            <div className="grid gap-4">
              <label className="block text-sm text-slate-700">
                対象の授業
                <select
                  value={form.lesson_id}
                  onChange={(e) => setForm({ ...form, lesson_id: e.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <option value="">— 選択 —</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {new Date(l.scheduled_at).toLocaleString("ja-JP", {
                        month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                      })} ・ {l.subject ?? "—"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-700">
                希望日時
                <input
                  type="datetime-local"
                  value={form.proposed_at}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setForm({ ...form, proposed_at: e.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                />
              </label>
              <label className="block text-sm text-slate-700">
                理由（任意）
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="例：学校行事のため"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end">
                <button onClick={submit} disabled={submitting || !form.lesson_id || !form.proposed_at}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {submitting ? "送信中..." : "申請する"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-950">これまでの申請</h2>
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              申請履歴はありません
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString("ja-JP")} 申請</span>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {r.lessons?.subject ?? "—"} ・ 元の日時：
                    {r.lessons?.scheduled_at ? new Date(r.lessons.scheduled_at).toLocaleString("ja-JP") : "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    希望：{new Date(r.proposed_at).toLocaleString("ja-JP")}
                  </p>
                  {r.reason && <p className="mt-2 text-sm text-slate-600">理由：{r.reason}</p>}
                  {r.teacher_response && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="mb-1 text-xs font-semibold text-slate-500">講師からの返信</p>
                      {r.teacher_response}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Request["status"] }) {
  const map = {
    pending:  { label: "申請中", cls: "bg-amber-100 text-amber-700" },
    approved: { label: "承認",   cls: "bg-green-100 text-green-700" },
    rejected: { label: "不可",   cls: "bg-red-100 text-red-700" },
  };
  const v = map[status];
  return <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>;
}

export default function ParentReschedulePage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-slate-400">読み込み中...</div>}>
      <ReschedulePageInner />
    </Suspense>
  );
}
