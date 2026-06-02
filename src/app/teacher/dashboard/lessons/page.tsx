"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, Teacher, School } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Skeleton } from "@/components/Skeleton";

type RescheduleReq = {
  id: string;
  lesson_id: string;
  parent_id: string | null;
  student_id: string;
  proposed_at: string;
  reason: string | null;
  parents?: { name: string; email: string } | null;
};

type Lesson = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  subject: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = {
  student_id: "",
  teacher_id: "",
  subject: "",
  scheduled_at: "",
  duration_minutes: 60,
  location: "",
  notes: "",
};

export default function TeacherLessonsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return toLocalInput(d).slice(0, 10);
  });
  const [filterTo, setFilterTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 2); d.setDate(0);
    return toLocalInput(d).slice(0, 10);
  });

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rescheduleReqs, setRescheduleReqs] = useState<RescheduleReq[]>([]);
  const [reqResponse, setReqResponse] = useState("");
  const [reqActing, setReqActing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);

  const fetchRefs = useCallback(async () => {
    const [{ data: s }, { data: sc }, { data: t }] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("schools").select("*").order("name"),
      supabase.from("teachers").select("*").order("name"),
    ]);
    setStudents(s ?? []);
    setSchools(sc ?? []);
    setTeachers(t ?? []);
  }, []);

  const fetchLessons = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("lessons").select("*").order("scheduled_at", { ascending: true });
    if (filterFrom) q = q.gte("scheduled_at", new Date(filterFrom).toISOString());
    if (filterTo) {
      const end = new Date(filterTo);
      end.setDate(end.getDate() + 1);
      q = q.lt("scheduled_at", end.toISOString());
    }
    if (filterStudent) {
      q = q.eq("student_id", filterStudent);
    } else if (filterSchool) {
      const { data: schoolStudents } = await supabase
        .from("students").select("id").eq("school_id", filterSchool);
      const ids = (schoolStudents ?? []).map((s: { id: string }) => s.id);
      if (ids.length > 0) {
        q = q.in("student_id", ids);
      } else {
        setLessons([]);
        setRescheduleReqs([]);
        setLoading(false);
        return;
      }
    }
    const [{ data }, { data: rr }] = await Promise.all([
      q,
      supabase
        .from("reschedule_requests")
        .select("id, lesson_id, parent_id, student_id, proposed_at, reason, parents(name, email)")
        .eq("status", "pending"),
    ]);
    setLessons((data as Lesson[]) ?? []);
    setRescheduleReqs((rr as unknown as RescheduleReq[]) ?? []);
    setLoading(false);
  }, [filterFrom, filterTo, filterStudent, filterSchool]);

  useEffect(() => { fetchRefs(); }, [fetchRefs]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  const filteredStudents = useMemo(() => {
    if (!filterSchool) return students;
    return students.filter((s) => s.school_id === filterSchool);
  }, [students, filterSchool]);

  const pendingByLessonId = useMemo(() => {
    const m = new Map<string, RescheduleReq>();
    for (const r of rescheduleReqs) m.set(r.lesson_id, r);
    return m;
  }, [rescheduleReqs]);

  const notifyDecision = async (r: RescheduleReq, decision: "approved" | "rejected") => {
    if (!r.parent_id) return;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: tc } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = tc?.id ?? null;
    }
    const stu = students.find((s) => s.id === r.student_id);
    const subject = decision === "approved" ? "振替申請を承認しました" : "振替申請への返答";
    const head = decision === "approved"
      ? `振替申請を承認しました。\n新しい授業日時：${new Date(r.proposed_at).toLocaleString("ja-JP")}`
      : "振替申請にお返事します。（元の日時のまま実施予定です）";
    const body = reqResponse.trim() ? `${head}\n\n【講師より】\n${reqResponse.trim()}` : head;
    await supabase.from("parent_messages").insert({
      thread_id: crypto.randomUUID(),
      parent_id: r.parent_id,
      teacher_id: teacherId,
      student_id: r.student_id,
      direction: "teacher_to_parent",
      parent_name: r.parents?.name ?? null,
      student_name: stu?.name ?? null,
      email: r.parents?.email ?? null,
      subject,
      message: body,
      status: "read",
      parent_read: false,
    });
  };

  const approveRequest = async (r: RescheduleReq) => {
    setReqActing(true);
    await supabase.from("reschedule_requests").update({
      status: "approved", teacher_response: reqResponse || null, responded_at: new Date().toISOString(),
    }).eq("id", r.id);
    await supabase.from("lessons").update({ scheduled_at: r.proposed_at, status: "rescheduled" }).eq("id", r.lesson_id);
    await notifyDecision(r, "approved");
    setReqActing(false);
    setReqResponse("");
    setCreating(false);
    setEditing(null);
    showToast("振替申請を承認しました", "success");
    fetchLessons();
  };

  const rejectRequest = async (r: RescheduleReq) => {
    setReqActing(true);
    await supabase.from("reschedule_requests").update({
      status: "rejected", teacher_response: reqResponse || null, responded_at: new Date().toISOString(),
    }).eq("id", r.id);
    await notifyDecision(r, "rejected");
    setReqActing(false);
    setReqResponse("");
    setCreating(false);
    setEditing(null);
    showToast("振替申請を却下しました", "info");
    fetchLessons();
  };

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => id ? teachers.find((t) => t.id === id)?.name ?? "—" : "—";

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, student_id: filterStudent });
    setError("");
    setCreating(true);
  };

  const openEdit = (l: Lesson) => {
    setEditing(l);
    setForm({
      student_id: l.student_id,
      teacher_id: l.teacher_id ?? "",
      subject: l.subject ?? "",
      scheduled_at: toLocalInput(new Date(l.scheduled_at)),
      duration_minutes: l.duration_minutes,
      location: l.location ?? "",
      notes: l.notes ?? "",
    });
    setError("");
    setReqResponse("");
    setCreating(true);
  };

  const save = async () => {
    if (!form.student_id || !form.scheduled_at) { setError("生徒と日時は必須です"); return; }
    setSaving(true);
    setError("");
    const payload = {
      student_id: form.student_id,
      teacher_id: form.teacher_id || null,
      subject: form.subject || null,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes) || 60,
      location: form.location || null,
      notes: form.notes || null,
    };
    const res = editing
      ? await supabase.from("lessons").update(payload).eq("id", editing.id)
      : await supabase.from("lessons").insert({ ...payload, status: "scheduled" });
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    setCreating(false);
    setEditing(null);
    fetchLessons();
  };

  const remove = async (l: Lesson) => {
    setDeleteTarget(l);
  };

  const doRemove = async () => {
    if (!deleteTarget) return;
    await supabase.from("lessons").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    showToast("削除しました", "success");
    fetchLessons();
  };

  const updateStatus = async (l: Lesson, status: string) => {
    await supabase.from("lessons").update({ status }).eq("id", l.id);
    fetchLessons();
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">授業予定</h1>
            <p className="mt-1 text-slate-600">生徒ごとの授業（来塾）予定を管理します。</p>
          </div>
          <button onClick={openCreate}
            className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
            ＋ 授業を追加
          </button>
        </div>

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-slate-600">教室
              <select value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setFilterStudent(""); }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="">すべて</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">生徒
              <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="">すべて</option>
                {filteredStudents.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">期間 開始
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-600">期間 終了
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </label>
          </div>
        </section>

        {loading ? (
          <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-50">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-semibold text-slate-700">該当する授業はありません</p>
            <p className="mt-1 text-sm text-slate-400">フィルターを変更するか、授業を追加してください。</p>
            <button onClick={openCreate}
              className="mt-5 rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
              ＋ 授業を追加
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">日時</th>
                  <th className="px-4 py-3">生徒</th>
                  <th className="px-4 py-3">科目 / 担当</th>
                  <th className="px-4 py-3">場所</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lessons.map((l) => (
                  <tr key={l.id} className={`${pendingByLessonId.has(l.id) ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-slate-50/60"}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {new Date(l.scheduled_at).toLocaleString("ja-JP", {
                        month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                      })}
                      <div className="text-xs font-normal text-slate-400">
                        {l.duration_minutes === 0 ? "無制限" : `${l.duration_minutes}分`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{studentName(l.student_id)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {l.subject ?? "—"}
                      <div className="text-xs text-slate-400">{teacherName(l.teacher_id)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{l.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      {pendingByLessonId.has(l.id) && (
                        <span className="mb-1.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          ⚑ 振替希望
                        </span>
                      )}
                      <div>
                        <select value={l.status} onChange={(e) => updateStatus(l, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                          <option value="scheduled">予定</option>
                          <option value="completed">実施済</option>
                          <option value="canceled">中止</option>
                          <option value="rescheduled">振替済</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(l)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        編集
                      </button>
                      <button onClick={() => remove(l)}
                        className="ml-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {creating && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setCreating(false)}>
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-4 text-lg font-bold text-slate-950">{editing ? "授業を編集" : "授業を追加"}</h3>
              <div className="grid gap-3">
                <label className="text-xs text-slate-600">生徒
                  <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="">— 選択 —</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-600">担当講師
                  <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="">未指定</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">日時
                    <input type="datetime-local" value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">所要（分）
                    <input type="number" min={15} step={15} value={form.duration_minutes}
                      onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                </div>
                <label className="text-xs text-slate-600">科目
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="例：数学"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">場所
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="例：本校舎 101教室"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">備考
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                {(() => {
                  if (!editing) return null;
                  const pr = pendingByLessonId.get(editing.id);
                  if (!pr) return null;
                  return (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                      <p className="mb-2 text-sm font-semibold text-amber-800">振替リクエストあり</p>
                      <p className="text-xs leading-relaxed text-amber-700">
                        保護者：{pr.parents?.name ?? "不明"}<br />
                        希望日時：{new Date(pr.proposed_at).toLocaleString("ja-JP")}<br />
                        {pr.reason && <>理由：{pr.reason}</>}
                      </p>
                      <label className="mt-3 block text-xs text-slate-600">返答メッセージ（任意）
                        <textarea value={reqResponse} onChange={(e) => setReqResponse(e.target.value)} rows={2}
                          placeholder="保護者への返答コメント"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => approveRequest(pr)} disabled={reqActing}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                          {reqActing ? "処理中..." : "✓ 承認（日時変更）"}
                        </button>
                        <button onClick={() => rejectRequest(pr)} disabled={reqActing}
                          className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
                          {reqActing ? "処理中..." : "✕ 却下"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => { setCreating(false); setEditing(null); }}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  キャンセル
                </button>
                <button onClick={save} disabled={saving}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {saving ? "保存中..." : editing ? "更新" : "作成"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="授業を削除"
          message={`「${studentName(deleteTarget.student_id)} ・ ${new Date(deleteTarget.scheduled_at).toLocaleString("ja-JP")}」を削除しますか？`}
          confirmLabel="削除する"
          danger
          onConfirm={doRemove}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
