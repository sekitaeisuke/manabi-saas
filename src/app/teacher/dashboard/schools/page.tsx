"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { School, Teacher, Student } from "@/lib/supabase";
import { GRADE_ORDER } from "@/lib/curriculum";

type Tab = "schools" | "teachers" | "students";

const ROLE_LABEL: Record<Teacher["role"], string> = {
  admin: "管理者",
  teacher: "講師",
  "part-time": "非常勤",
};
const ROLE_COLOR: Record<Teacher["role"], string> = {
  admin: "bg-purple-100 text-purple-800",
  teacher: "bg-blue-100 text-blue-800",
  "part-time": "bg-slate-100 text-slate-700",
};

export default function SchoolsPage() {
  const [tab, setTab] = useState<Tab>("schools");
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t }, { data: st }] = await Promise.all([
      supabase.from("schools").select("*").order("created_at"),
      supabase.from("teachers").select("*").order("created_at"),
      supabase.from("students").select("*").order("created_at"),
    ]);
    setSchools(s ?? []);
    setTeachers(t ?? []);
    setStudents(st ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const schoolName = (id: string | null) =>
    schools.find((s) => s.id === id)?.name ?? "未所属";

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        {/* ヘッダー */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">校舎・講師・生徒管理</h1>
            <p className="mt-1 text-slate-600">登録・編集・削除を行います</p>
          </div>
          <Link href="/teacher/dashboard"
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
            ダッシュボード
          </Link>
        </div>

        {/* タブ */}
        <div className="mb-6 flex gap-2">
          {(["schools", "teachers", "students"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === t ? "bg-slate-950 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              {t === "schools" ? `校舎（${schools.length}）` : t === "teachers" ? `講師（${teachers.length}）` : `生徒（${students.length}）`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : (
          <>
            {tab === "schools" && (
              <SchoolsTab schools={schools} onRefresh={fetchAll} />
            )}
            {tab === "teachers" && (
              <TeachersTab teachers={teachers} schools={schools} schoolName={schoolName} onRefresh={fetchAll} />
            )}
            {tab === "students" && (
              <StudentsTab students={students} schools={schools} schoolName={schoolName} onRefresh={fetchAll} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── 校舎タブ ────────────────────────────────────────
function SchoolsTab({ schools, onRefresh }: { schools: School[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "", admin_name: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("schools").insert(form);
    setForm({ name: "", address: "", phone: "", admin_name: "" });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この校舎を削除しますか？")) return;
    await supabase.from("schools").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 校舎を追加"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">新規校舎登録</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="校舎名 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例：○○塾 本校" />
            <Field label="管理者名" value={form.admin_name} onChange={(v) => setForm({ ...form, admin_name: v })} placeholder="例：山田太郎" />
            <Field label="住所" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="例：東京都渋谷区〇〇" />
            <Field label="電話番号" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="例：03-XXXX-XXXX" />
          </div>
          <button onClick={save} disabled={!form.name || saving}
            className="mt-4 rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      )}

      {schools.length === 0 ? (
        <Empty text="校舎が登録されていません" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {schools.map((s) => (
            <div key={s.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{s.name}</p>
                  {s.admin_name && <p className="mt-1 text-sm text-slate-500">管理者：{s.admin_name}</p>}
                  {s.address && <p className="text-sm text-slate-500">{s.address}</p>}
                  {s.phone && <p className="text-sm text-slate-500">{s.phone}</p>}
                  <p className="mt-2 text-xs text-slate-400">登録：{s.created_at.slice(0, 10)}</p>
                </div>
                <button onClick={() => del(s.id)}
                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 講師タブ ────────────────────────────────────────
function TeachersTab({ teachers, schools, schoolName, onRefresh }: {
  teachers: Teacher[]; schools: School[]; schoolName: (id: string | null) => string; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: Teacher["role"]; school_id: string }>({
    name: "", email: "", role: "teacher", school_id: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("teachers").insert({
      name: form.name,
      email: form.email || null,
      role: form.role,
      school_id: form.school_id || null,
    });
    setForm({ name: "", email: "", role: "teacher", school_id: "" });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この講師を削除しますか？")) return;
    await supabase.from("teachers").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 講師を追加"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">新規講師登録</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="氏名 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例：田中花子" />
            <Field label="メールアドレス" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="例：tanaka@school.jp" type="email" />
            <div className="grid gap-1 text-sm text-slate-700">
              役職
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Teacher["role"] })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                <option value="admin">管理者</option>
                <option value="teacher">講師</option>
                <option value="part-time">非常勤講師</option>
              </select>
            </div>
            <div className="grid gap-1 text-sm text-slate-700">
              所属校舎
              <select value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                <option value="">未所属</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={save} disabled={!form.name || saving}
            className="mt-4 rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      )}

      {teachers.length === 0 ? (
        <Empty text="講師が登録されていません" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teachers.map((t) => (
            <div key={t.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[t.role]}`}>
                      {ROLE_LABEL[t.role]}
                    </span>
                  </div>
                  {t.email && <p className="mt-1 text-sm text-slate-500">{t.email}</p>}
                  <p className="mt-1 text-sm text-slate-500">所属：{schoolName(t.school_id)}</p>
                  <p className="mt-2 text-xs text-slate-400">登録：{t.created_at.slice(0, 10)}</p>
                </div>
                <button onClick={() => del(t.id)}
                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 生徒タブ ────────────────────────────────────────
function StudentsTab({ students, schools, schoolName, onRefresh }: {
  students: Student[]; schools: School[]; schoolName: (id: string | null) => string; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "中1", school_id: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("students").insert({
      name: form.name,
      grade: form.grade,
      school_id: form.school_id || null,
    });
    setForm({ name: "", grade: "中1", school_id: "" });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この生徒を削除しますか？関連する診断データも削除されます。")) return;
    await supabase.from("students").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 生徒を追加"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">新規生徒登録</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="氏名 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例：山田太郎" />
            <div className="grid gap-1 text-sm text-slate-700">
              学年
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="grid gap-1 text-sm text-slate-700">
              所属校舎
              <select value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                <option value="">未所属</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={save} disabled={!form.name || saving}
            className="mt-4 rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <Empty text="生徒が登録されていません" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <div key={s.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{s.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{s.grade}</p>
                  {s.school_id && <p className="text-xs text-slate-400">{schoolName(s.school_id)}</p>}
                  <p className="mt-2 text-xs text-slate-400">登録：{s.created_at.slice(0, 10)}</p>
                </div>
                <button onClick={() => del(s.id)}
                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 共通コンポーネント ───────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-700">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400" />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
      {text}
    </div>
  );
}
