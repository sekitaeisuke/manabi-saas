"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, Teacher, School } from "@/lib/supabase";

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
    if (filterStudent) q = q.eq("student_id", filterStudent);
    const { data } = await q;
    setLessons((data as Lesson[]) ?? []);
    setLoading(false);
  }, [filterFrom, filterTo, filterStudent]);

  useEffect(() => { fetchRefs(); }, [fetchRefs]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  const filteredStudents = useMemo(() => {
    if (!filterSchool) return students;
    return students.filter((s) => s.school_id === filterSchool);
  }, [students, filterSchool]);

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
    if (!confirm(`「${studentName(l.student_id)} ・ ${new Date(l.scheduled_at).toLocaleString("ja-JP")}」を削除しますか？`)) return;
    await supabase.from("lessons").delete().eq("id", l.id);
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
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : lessons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            該当する授業はありません
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
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {new Date(l.scheduled_at).toLocaleString("ja-JP", {
                        month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                      })}
                      <div className="text-xs font-normal text-slate-400">{l.duration_minutes}分</div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{studentName(l.student_id)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {l.subject ?? "—"}
                      <div className="text-xs text-slate-400">{teacherName(l.teacher_id)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{l.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select value={l.status} onChange={(e) => updateStatus(l, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                        <option value="scheduled">予定</option>
                        <option value="completed">実施済</option>
                        <option value="canceled">中止</option>
                        <option value="rescheduled">振替済</option>
                      </select>
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
    </div>
  );
}
