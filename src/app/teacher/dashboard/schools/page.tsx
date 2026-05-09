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

const DAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export default function SchoolsPage() {
  const [tab, setTab] = useState<Tab>("schools");
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: s }, { data: t }, { data: st }] = await Promise.all([
      supabase.from("schools").select("*").order("group_name").order("created_at"),
      supabase.from("teachers").select("*").order("created_at"),
      supabase.from("students").select("*").order("created_at"),
    ]);
    const allSchools = s ?? [];
    const allTeachers = t ?? [];
    const allStudents = st ?? [];
    setSchools(allSchools);
    setTeachers(allTeachers);
    setStudents(allStudents);
    const me = user?.email ? allTeachers.find((t) => t.email === user.email) : null;
    setCurrentTeacher(me ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isAdmin = currentTeacher?.role === "admin";

  const visibleSchools = (() => {
    if (isAdmin) return schools;
    if (!currentTeacher?.school_id) return [];
    const mySchool = schools.find((s) => s.id === currentTeacher.school_id);
    if (!mySchool) return [];
    if (!mySchool.group_name) return [mySchool];
    return schools.filter((s) => s.group_name === mySchool.group_name);
  })();

  const visibleSchoolIds = new Set(visibleSchools.map((s) => s.id));
  const visibleTeachers = isAdmin ? teachers : teachers.filter((t) => t.school_id != null && visibleSchoolIds.has(t.school_id));
  const visibleStudents = isAdmin ? students : students.filter((s) => s.school_id != null && visibleSchoolIds.has(s.school_id));

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
          <div className="flex items-center gap-3">
            {isAdmin && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">管理者</span>
            )}
            <Link href="/teacher/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
              ダッシュボード
            </Link>
          </div>
        </div>

        {/* タブ */}
        <div className="mb-6 flex gap-2">
          {(["schools", "teachers", "students"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === t ? "bg-slate-950 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              {t === "schools" ? `校舎（${visibleSchools.length}）` : t === "teachers" ? `講師（${visibleTeachers.length}）` : `生徒（${visibleStudents.length}）`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : (
          <>
            {tab === "schools" && (
              <SchoolsTab schools={visibleSchools} isAdmin={isAdmin} onRefresh={fetchAll} />
            )}
            {tab === "teachers" && (
              <TeachersTab teachers={visibleTeachers} schools={visibleSchools} schoolName={schoolName} onRefresh={fetchAll} />
            )}
            {tab === "students" && (
              <StudentsTab students={visibleStudents} schools={visibleSchools} schoolName={schoolName} onRefresh={fetchAll} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── 校舎タブ ────────────────────────────────────────
function SchoolsTab({ schools, isAdmin, onRefresh }: {
  schools: School[]; isAdmin: boolean; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", group_name: "", address: "", phone: "", admin_name: "" });
  const [saving, setSaving] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("schools").insert({
      name: form.name,
      group_name: form.group_name || null,
      address: form.address || null,
      phone: form.phone || null,
      admin_name: form.admin_name || null,
    });
    setForm({ name: "", group_name: "", address: "", phone: "", admin_name: "" });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この校舎を削除しますか？")) return;
    await supabase.from("schools").delete().eq("id", id);
    onRefresh();
  };

  const saveGroupName = async (id: string) => {
    await supabase.from("schools").update({ group_name: editGroupName || null }).eq("id", id);
    setEditGroupId(null);
    onRefresh();
  };

  // Group schools by group_name
  const groups = schools.reduce<Record<string, School[]>>((acc, s) => {
    const key = s.group_name ?? "グループ未設定";
    (acc[key] = acc[key] ?? []).push(s);
    return acc;
  }, {});

  const groupOrder = [
    ...Object.keys(groups).filter((k) => k !== "グループ未設定"),
    ...(groups["グループ未設定"] ? ["グループ未設定"] : []),
  ];

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(!showForm)}
            className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            {showForm ? "キャンセル" : "+ 校舎を追加"}
          </button>
        </div>
      )}

      {isAdmin && showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">新規校舎登録</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="校舎名 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例：豊四季教育工房" />
            <Field label="グループ名" value={form.group_name} onChange={(v) => setForm({ ...form, group_name: v })} placeholder="例：教育工房グループ" />
            <Field label="管理者名" value={form.admin_name} onChange={(v) => setForm({ ...form, admin_name: v })} placeholder="例：山田太郎" />
            <Field label="電話番号" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="例：03-XXXX-XXXX" />
            <div className="sm:col-span-2">
              <Field label="住所" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="例：千葉県柏市〇〇" />
            </div>
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
        <div className="space-y-6">
          {groupOrder.map((groupName) => (
            <div key={groupName}>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{groupName}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(groups[groupName] ?? []).map((s) => (
                  <div key={s.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        {isAdmin && (
                          editGroupId === s.id ? (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                value={editGroupName}
                                onChange={(e) => setEditGroupName(e.target.value)}
                                placeholder="グループ名"
                                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                              <button onClick={() => saveGroupName(s.id)}
                                className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700">保存</button>
                              <button onClick={() => setEditGroupId(null)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">×</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditGroupId(s.id); setEditGroupName(s.group_name ?? ""); }}
                              className="mt-1 text-xs text-indigo-500 hover:underline">
                              グループ：{s.group_name ?? "未設定"} （編集）
                            </button>
                          )
                        )}
                        {s.admin_name && <p className="mt-1 text-sm text-slate-500">管理者：{s.admin_name}</p>}
                        {s.address && <p className="text-sm text-slate-500">{s.address}</p>}
                        {s.phone && <p className="text-sm text-slate-500">{s.phone}</p>}
                        <p className="mt-2 text-xs text-slate-400">登録：{s.created_at.slice(0, 10)}</p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => del(s.id)}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
  const [showCsvModal, setShowCsvModal] = useState(false);
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
      <div className="flex justify-end gap-2">
        <button onClick={() => setShowCsvModal(true)}
          className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          CSVインポート
        </button>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 講師を追加"}
        </button>
      </div>

      {showCsvModal && (
        <TeacherCsvModal schools={schools} onClose={() => setShowCsvModal(false)} onRefresh={onRefresh} />
      )}

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
type AccountModal = { studentId: string; studentName: string; loginId: string; password: string } | null;

function StudentsTab({ students, schools, schoolName, onRefresh }: {
  students: Student[]; schools: School[]; schoolName: (id: string | null) => string; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "中1", school_id: "", attendance_days: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [accountModal, setAccountModal] = useState<AccountModal>(null);
  const [issuing, setIssuing] = useState(false);
  const [issuedResult, setIssuedResult] = useState<{ loginId: string; password: string } | null>(null);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("students").insert({
      name: form.name,
      grade: form.grade,
      school_id: form.school_id || null,
      attendance_days: form.attendance_days.length > 0 ? form.attendance_days : null,
    });
    setForm({ name: "", grade: "中1", school_id: "", attendance_days: [] });
    setShowForm(false);
    setSaving(false);
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この生徒を削除しますか？関連する診断データも削除されます。")) return;
    await supabase.from("students").delete().eq("id", id);
    onRefresh();
  };

  const openAccountModal = (s: Student) => {
    const auto = "s-" + Math.random().toString(36).slice(2, 7);
    setAccountModal({ studentId: s.id, studentName: s.name, loginId: s.login_id ?? auto, password: "" });
    setIssuedResult(null);
  };

  const issueAccount = async () => {
    if (!accountModal || !accountModal.loginId || accountModal.password.length < 6) return;
    setIssuing(true);
    const res = await fetch("/api/student/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: accountModal.studentId,
        login_id: accountModal.loginId,
        password: accountModal.password,
      }),
    });
    const data = await res.json();
    setIssuing(false);
    if (data.error) { alert("エラー: " + data.error); return; }
    setIssuedResult({ loginId: accountModal.loginId, password: accountModal.password });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={() => setShowCsvModal(true)}
          className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          CSVインポート
        </button>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 生徒を追加"}
        </button>
      </div>

      {showCsvModal && (
        <StudentCsvModal schools={schools} onClose={() => setShowCsvModal(false)} onRefresh={onRefresh} />
      )}

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
          <div className="mt-3 grid gap-1 text-sm text-slate-700">
            通塾曜日
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const checked = form.attendance_days.includes(day);
                return (
                  <label key={day} className={`flex cursor-pointer items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${checked ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => setForm({ ...form, attendance_days: checked ? form.attendance_days.filter((d) => d !== day) : [...form.attendance_days, day] })} />
                    {day}
                  </label>
                );
              })}
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
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{s.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{s.grade}</p>
                  {s.school_id && <p className="text-xs text-slate-400">{schoolName(s.school_id)}</p>}
                  {s.attendance_days && s.attendance_days.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {DAYS.filter((d) => s.attendance_days!.includes(d)).map((d) => (
                        <span key={d} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-600">{d}</span>
                      ))}
                    </div>
                  )}
                  {s.login_id ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-xs font-medium text-green-700">ID: {s.login_id}</span>
                    </div>
                  ) : (
                    <button onClick={() => openAccountModal(s)}
                      className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100">
                      アカウント発行
                    </button>
                  )}
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

      {/* アカウント発行モーダル */}
      {accountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
            {issuedResult ? (
              <>
                <div className="mb-4 text-center text-4xl">✅</div>
                <h3 className="mb-1 text-center text-lg font-bold text-slate-900">アカウント発行完了</h3>
                <p className="mb-6 text-center text-sm text-slate-500">{accountModal.studentName}さんのログイン情報</p>
                <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                  <div>
                    <p className="text-xs text-slate-500">ログインURL</p>
                    <p className="font-mono text-sm font-semibold text-indigo-700">
                      {typeof window !== "undefined" ? window.location.origin : ""}/student/login
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ログインID</p>
                    <p className="font-mono text-lg font-bold text-slate-900">{issuedResult.loginId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">パスワード</p>
                    <p className="font-mono text-lg font-bold text-slate-900">{issuedResult.password}</p>
                  </div>
                </div>
                <p className="mt-4 text-center text-xs text-slate-400">この情報を生徒・保護者に伝えてください</p>
                <button onClick={() => setAccountModal(null)}
                  className="mt-4 w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white hover:bg-slate-800">
                  閉じる
                </button>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-lg font-bold text-slate-900">アカウント発行</h3>
                <p className="mb-6 text-sm text-slate-500">{accountModal.studentName}さんのログイン情報を設定します</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">ログインID</label>
                    <input value={accountModal.loginId}
                      onChange={(e) => setAccountModal({ ...accountModal, loginId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="例：s-tanaka-01" />
                    <p className="mt-1 text-xs text-slate-400">英数字・ハイフンのみ使用可</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">初期パスワード（6文字以上）</label>
                    <input type="text" value={accountModal.password}
                      onChange={(e) => setAccountModal({ ...accountModal, password: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="例：tanaka2025" />
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <button onClick={issueAccount}
                    disabled={!accountModal.loginId || accountModal.password.length < 6 || issuing}
                    className="flex-1 rounded-2xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                    {issuing ? "発行中..." : "発行する"}
                  </button>
                  <button onClick={() => setAccountModal(null)}
                    className="flex-1 rounded-2xl border border-slate-300 bg-white py-3 text-slate-700 hover:bg-slate-50">
                    キャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 講師CSVインポートモーダル ─────────────────────────
type TeacherRow = { name: string; email: string; role: Teacher["role"]; school_id: string; schoolName: string; error?: string };

const ROLE_MAP: Record<string, Teacher["role"]> = {
  管理者: "admin", admin: "admin",
  講師: "teacher", teacher: "teacher",
  非常勤: "part-time", "非常勤講師": "part-time", "part-time": "part-time",
};

function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) =>
    line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""))
  );
}

function TeacherCsvModal({ schools, onClose, onRefresh }: {
  schools: School[]; onClose: () => void; onRefresh: () => void;
}) {
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const allLines = parseCsv(text);
      const lines = allLines[0]?.[0] === "氏名" ? allLines.slice(1) : allLines;
      const parsed: TeacherRow[] = lines
        .filter((cols) => cols.length >= 1 && cols[0])
        .map((cols) => {
          const [name = "", email = "", roleRaw = "", schoolRaw = ""] = cols;
          const role = ROLE_MAP[roleRaw] ?? "teacher";
          const school = schools.find((s) => s.name === schoolRaw.trim());
          const error = !name ? "氏名が空" : undefined;
          return { name, email, role, school_id: school?.id ?? "", schoolName: schoolRaw, error };
        });
      setRows(parsed);
    };
    reader.readAsText(file, "utf-8");
  };

  const importAll = async () => {
    const valid = rows.filter((r) => !r.error);
    if (!valid.length) return;
    setImporting(true);
    await supabase.from("teachers").insert(
      valid.map((r) => ({ name: r.name, email: r.email || null, role: r.role, school_id: r.school_id || null }))
    );
    setImporting(false);
    setDone(true);
    onRefresh();
  };

  const sampleCsv = "氏名,メールアドレス,役職,校舎名\n田中花子,tanaka@school.jp,講師,本校\n山田一郎,yamada@school.jp,管理者,東校";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">講師CSVインポート</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-4">✅</p>
            <p className="text-lg font-bold text-slate-900 mb-2">{rows.filter((r) => !r.error).length}件 登録しました</p>
            <button onClick={onClose} className="mt-4 rounded-2xl bg-slate-950 px-8 py-3 text-white font-semibold hover:bg-slate-800">閉じる</button>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold mb-1">CSV形式（1行目はヘッダー行として自動スキップ）</p>
              <p className="font-mono text-xs">氏名,メールアドレス,役職,校舎名</p>
              <p className="mt-1 text-xs text-slate-400">役職：管理者 / 講師 / 非常勤</p>
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`} download="teachers_sample.csv"
                className="mt-2 inline-block text-xs text-indigo-600 underline">サンプルCSVをダウンロード</a>
            </div>

            <input type="file" accept=".csv,text/csv" onChange={handleFile}
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" />

            {rows.length > 0 && (
              <div className="mb-4 max-h-64 overflow-y-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">氏名</th>
                      <th className="px-3 py-2 text-left">メール</th>
                      <th className="px-3 py-2 text-left">役職</th>
                      <th className="px-3 py-2 text-left">校舎</th>
                      <th className="px-3 py-2 text-left">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t border-slate-100 ${r.error ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-slate-500">{r.email || "—"}</td>
                        <td className="px-3 py-2">{ROLE_LABEL[r.role]}</td>
                        <td className="px-3 py-2 text-slate-500">{r.schoolName || "未所属"}</td>
                        <td className="px-3 py-2">{r.error ? <span className="text-red-600 text-xs">{r.error}</span> : <span className="text-green-600 text-xs">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-slate-700 hover:bg-slate-50">キャンセル</button>
              <button onClick={importAll} disabled={!rows.some((r) => !r.error) || importing}
                className="rounded-2xl bg-slate-950 px-6 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {importing ? "登録中..." : `${rows.filter((r) => !r.error).length}件を登録`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 生徒CSVインポートモーダル ─────────────────────────
type StudentRow = { name: string; grade: string; school_id: string; schoolName: string; attendance_days: string[]; error?: string };

function StudentCsvModal({ schools, onClose, onRefresh }: {
  schools: School[]; onClose: () => void; onRefresh: () => void;
}) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const allLines = parseCsv(text);
      const lines = allLines[0]?.[0] === "氏名" ? allLines.slice(1) : allLines;
      const parsed: StudentRow[] = lines
        .filter((cols) => cols.length >= 1 && cols[0])
        .map((cols) => {
          const [name = "", grade = "", schoolRaw = "", daysRaw = ""] = cols;
          const school = schools.find((s) => s.name === schoolRaw.trim());
          const validGrade = GRADE_ORDER.includes(grade) ? grade : "";
          const attendance_days = [...daysRaw].filter((c) => (DAYS as readonly string[]).includes(c));
          let error: string | undefined;
          if (!name) error = "氏名が空";
          else if (!validGrade) error = `学年「${grade}」が不正`;
          return { name, grade: validGrade || grade, school_id: school?.id ?? "", schoolName: schoolRaw, attendance_days, error };
        });
      setRows(parsed);
    };
    reader.readAsText(file, "utf-8");
  };

  const importAll = async () => {
    const valid = rows.filter((r) => !r.error);
    if (!valid.length) return;
    setImporting(true);
    await supabase.from("students").insert(
      valid.map((r) => ({
        name: r.name,
        grade: r.grade,
        school_id: r.school_id || null,
        attendance_days: r.attendance_days.length > 0 ? r.attendance_days : null,
      }))
    );
    setImporting(false);
    setDone(true);
    onRefresh();
  };

  const sampleCsv = "氏名,学年,校舎名,通塾曜日\n山田太郎,中1,本校,月水金\n佐藤花子,小5,東校,火木";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">生徒CSVインポート</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-4">✅</p>
            <p className="text-lg font-bold text-slate-900 mb-2">{rows.filter((r) => !r.error).length}件 登録しました</p>
            <button onClick={onClose} className="mt-4 rounded-2xl bg-slate-950 px-8 py-3 text-white font-semibold hover:bg-slate-800">閉じる</button>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold mb-1">CSV形式（1行目はヘッダー行として自動スキップ）</p>
              <p className="font-mono text-xs">氏名,学年,校舎名,通塾曜日</p>
              <p className="mt-1 text-xs text-slate-400">学年：小1〜小6, 中1〜中3, 高1〜高3　通塾曜日：月火水木金土日（例：月水金）</p>
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`} download="students_sample.csv"
                className="mt-2 inline-block text-xs text-indigo-600 underline">サンプルCSVをダウンロード</a>
            </div>

            <input type="file" accept=".csv,text/csv" onChange={handleFile}
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" />

            {rows.length > 0 && (
              <div className="mb-4 max-h-64 overflow-y-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">氏名</th>
                      <th className="px-3 py-2 text-left">学年</th>
                      <th className="px-3 py-2 text-left">校舎</th>
                      <th className="px-3 py-2 text-left">通塾曜日</th>
                      <th className="px-3 py-2 text-left">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t border-slate-100 ${r.error ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">{r.grade}</td>
                        <td className="px-3 py-2 text-slate-500">{r.schoolName || "未所属"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.attendance_days.length > 0 ? r.attendance_days.join("・") : "—"}</td>
                        <td className="px-3 py-2">{r.error ? <span className="text-red-600 text-xs">{r.error}</span> : <span className="text-green-600 text-xs">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-slate-700 hover:bg-slate-50">キャンセル</button>
              <button onClick={importAll} disabled={!rows.some((r) => !r.error) || importing}
                className="rounded-2xl bg-slate-950 px-6 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {importing ? "登録中..." : `${rows.filter((r) => !r.error).length}件を登録`}
              </button>
            </div>
          </>
        )}
      </div>
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
