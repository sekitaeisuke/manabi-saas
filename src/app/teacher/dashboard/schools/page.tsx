"use client";
import { showToast } from "@/lib/toast";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import type { School, Teacher, Student } from "@/lib/supabase";
import { GRADE_ORDER } from "@/lib/curriculum";

type Tab = "schools" | "teachers" | "students" | "highschools" | "mailing";

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
const DAY_TO_JS: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };

// duration: null = 無制限（DBには 0 で保存）
async function autoGenerateLessons(
  studentId: string,
  attendanceDays: string[],
  startTime = "17:00",
  duration: number | null = 60,
  teacherId: string | null = null,
) {
  if (attendanceDays.length === 0) return;
  const [h, m] = startTime.split(":").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + 56); // 8週間分

  const { data: existing } = await supabase
    .from("lessons")
    .select("scheduled_at")
    .eq("student_id", studentId)
    .gte("scheduled_at", today.toISOString())
    .lt("scheduled_at", end.toISOString());

  const existingKeys = new Set(
    (existing ?? []).map((l) => {
      const d = new Date(l.scheduled_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  const toInsert: { student_id: string; teacher_id: string | null; scheduled_at: string; duration_minutes: number; status: string }[] = [];
  const cursor = new Date(today);
  while (cursor <= end) {
    const jsDay = cursor.getDay();
    const dayName = Object.keys(DAY_TO_JS).find((k) => DAY_TO_JS[k] === jsDay);
    if (dayName && attendanceDays.includes(dayName)) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (!existingKeys.has(key)) {
        const dt = new Date(cursor);
        dt.setHours(h, m, 0, 0);
        toInsert.push({
          student_id: studentId,
          teacher_id: teacherId,
          scheduled_at: dt.toISOString(),
          duration_minutes: duration ?? 0,
          status: "scheduled",
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (toInsert.length > 0) {
    await supabase.from("lessons").insert(toInsert);
  }
}

export default function SchoolsPage() {
  // ナビの入口が「生徒一覧・登録」なので、既定は生徒タブで着地する
  // （校舎・講師は上のタブから開く）。
  const [tab, setTab] = useState<Tab>("students");
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
        <div className="mb-6 flex flex-wrap gap-2">
          {(["schools", "teachers", "students"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === t ? "bg-slate-950 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              {t === "schools" ? `校舎（${visibleSchools.length}）` : t === "teachers" ? `講師（${visibleTeachers.length}）` : `生徒（${visibleStudents.length}）`}
            </button>
          ))}
          <button onClick={() => setTab("highschools")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === "highschools" ? "bg-indigo-600 text-white" : "bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100"}`}>
            高校データベース
          </button>
          <button onClick={() => setTab("mailing")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === "mailing" ? "bg-teal-600 text-white" : "bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100"}`}>
            メーリングリスト
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : (
          <>
            {tab === "schools" && (
              <SchoolsTab schools={visibleSchools} isAdmin={isAdmin} onRefresh={fetchAll} />
            )}
            {tab === "teachers" && (
              <TeachersTab teachers={visibleTeachers} schools={visibleSchools} schoolName={schoolName} isAdmin={isAdmin} onRefresh={fetchAll} />
            )}
            {tab === "students" && (
              <StudentsTab students={visibleStudents} schools={visibleSchools} teachers={visibleTeachers} schoolName={schoolName} onRefresh={fetchAll} />
            )}
            {tab === "highschools" && <HighSchoolsTab />}
            {tab === "mailing"     && <MailingListTab />}
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
type TeacherPwModal =
  | { teacherId: string; teacherName: string; email: string; password: string; mode: "issue" | "reset" }
  | null;

function TeachersTab({ teachers, schools, schoolName, isAdmin, onRefresh }: {
  teachers: Teacher[]; schools: School[]; schoolName: (id: string | null) => string;
  isAdmin: boolean; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: Teacher["role"]; school_id: string }>({
    name: "", email: "", password: "", role: "teacher", school_id: "",
  });
  const [saving, setSaving] = useState(false);
  // ログインできる講師（＝Supabase Auth ユーザがあるメール）の一覧
  const [accountEmails, setAccountEmails] = useState<Set<string>>(new Set());
  const [pwModal, setPwModal] = useState<TeacherPwModal>(null);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!isAdmin) return;
    const res = await authFetch("/api/teacher/accounts");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.emails)) {
      setAccountEmails(new Set(data.emails.map((e: string) => e.toLowerCase())));
    }
  }, [isAdmin]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts, teachers]);

  const hasAccount = (t: Teacher) => Boolean(t.email && accountEmails.has(t.email.toLowerCase()));

  const save = async () => {
    if (!form.name) return;
    if (form.password && !form.email) {
      showToast("パスワードを設定するにはメールアドレスが必要です", "error"); return;
    }
    if (form.password && form.password.length < 6) {
      showToast("パスワードは6文字以上にしてください", "error"); return;
    }
    setSaving(true);
    const res = await authFetch("/api/teacher/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, email: form.email, password: form.password,
        role: form.role, school_id: form.school_id,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) { showToast("エラー: " + data.error, "error"); return; }

    if (form.password) {
      // 登録と同時にアカウントを発行したので、そのままログイン情報を表示する
      setPwModal({ teacherId: data.teacher_id, teacherName: form.name, email: form.email, password: "", mode: "issue" });
      setIssued({ email: form.email, password: form.password });
    } else {
      showToast(`${form.name}さんを登録しました（ログインは未発行）`, "success");
    }
    setForm({ name: "", email: "", password: "", role: "teacher", school_id: "" });
    setShowForm(false);
    await fetchAccounts();
    onRefresh();
  };

  const del = async (id: string) => {
    if (!confirm("この講師を削除しますか？")) return;
    await supabase.from("teachers").delete().eq("id", id);
    onRefresh();
  };

  const openPwModal = (t: Teacher, mode: "issue" | "reset") => {
    setIssued(null);
    setPwModal({ teacherId: t.id, teacherName: t.name, email: t.email ?? "", password: "", mode });
  };

  const submitPassword = async () => {
    if (!pwModal || pwModal.password.length < 6) return;
    setIssuing(true);
    const res = await authFetch("/api/teacher/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_id: pwModal.teacherId, password: pwModal.password }),
    });
    const data = await res.json();
    setIssuing(false);
    if (data.error) { showToast("エラー: " + data.error, "error"); return; }
    setIssued({ email: data.email ?? pwModal.email, password: pwModal.password });
    await fetchAccounts();
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
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
      )}

      {showCsvModal && (
        <TeacherCsvModal schools={schools} onClose={() => setShowCsvModal(false)}
          onRefresh={() => { fetchAccounts(); onRefresh(); }} />
      )}

      {isAdmin && showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">新規講師登録</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="氏名 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例：田中花子" />
            <Field label="メールアドレス（ログインID）" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="例：tanaka@school.jp" type="email" />
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
            <div className="sm:col-span-2">
              <label className="grid gap-1 text-sm text-slate-700">
                初期パスワード（6文字以上・空欄なら後から発行）
                <div className="flex gap-2">
                  <input type="text" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="例：koubou2025"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-slate-400" />
                  <button type="button" onClick={() => setForm({ ...form, password: genPassword() })}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    自動生成
                  </button>
                </div>
              </label>
              <p className="mt-1 text-xs text-slate-400">
                メールアドレスとこのパスワードで講師ログイン（/login）ができるようになります。
              </p>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLOR[t.role]}`}>
                      {ROLE_LABEL[t.role]}
                    </span>
                    {isAdmin && (
                      hasAccount(t)
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">ログイン可</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">ログイン未発行</span>
                    )}
                  </div>
                  {t.email && <p className="mt-1 text-sm text-slate-500">{t.email}</p>}
                  <p className="mt-1 text-sm text-slate-500">所属：{schoolName(t.school_id)}</p>
                  <p className="mt-2 text-xs text-slate-400">登録：{t.created_at.slice(0, 10)}</p>
                  {isAdmin && (
                    t.email ? (
                      <button onClick={() => openPwModal(t, hasAccount(t) ? "reset" : "issue")}
                        className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                        {hasAccount(t) ? "パスワード再設定" : "アカウント発行"}
                      </button>
                    ) : (
                      <p className="mt-3 text-xs text-amber-600">メール未登録のためログインを発行できません</p>
                    )
                  )}
                </div>
                {isAdmin && (
                  <button onClick={() => del(t.id)}
                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 講師アカウント発行／パスワード再設定モーダル */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
            {issued ? (
              <>
                <div className="mb-4 text-center text-4xl">✅</div>
                <h3 className="mb-1 text-center text-lg font-bold text-slate-900">
                  {pwModal.mode === "reset" ? "パスワード再設定完了" : "アカウント発行完了"}
                </h3>
                <p className="mb-6 text-center text-sm text-slate-500">{pwModal.teacherName}先生のログイン情報</p>
                <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                  <div>
                    <p className="text-xs text-slate-500">ログインURL</p>
                    <p className="font-mono text-sm font-semibold text-indigo-700">
                      {typeof window !== "undefined" ? window.location.origin : ""}/login
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ログインID（メールアドレス）</p>
                    <p className="font-mono text-sm font-bold break-all text-slate-900">{issued.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">パスワード</p>
                    <p className="font-mono text-lg font-bold text-slate-900">{issued.password}</p>
                  </div>
                </div>
                <p className="mt-4 text-center text-xs text-slate-400">この情報を講師本人に伝えてください</p>
                <button onClick={() => { setPwModal(null); setIssued(null); }}
                  className="mt-4 w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white hover:bg-slate-800">
                  閉じる
                </button>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-lg font-bold text-slate-900">
                  {pwModal.mode === "reset" ? "パスワード再設定" : "アカウント発行"}
                </h3>
                <p className="mb-6 text-sm text-slate-500">
                  {pwModal.mode === "reset"
                    ? `${pwModal.teacherName}先生の新しいパスワードを設定します（現在のパスワードは確認できません）`
                    : `${pwModal.teacherName}先生がログインできるようにします`}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">ログインID（メールアドレス）</label>
                    <input value={pwModal.email} readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-500 outline-none" />
                    <p className="mt-1 text-xs text-slate-400">変更するには講師の登録メールを編集してください</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      {pwModal.mode === "reset" ? "新しいパスワード（6文字以上）" : "初期パスワード（6文字以上）"}
                    </label>
                    <div className="flex gap-2">
                      <input type="text" value={pwModal.password}
                        onChange={(e) => setPwModal({ ...pwModal, password: e.target.value })}
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="例：koubou2025" />
                      <button type="button" onClick={() => setPwModal({ ...pwModal, password: genPassword() })}
                        className="rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        自動生成
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <button onClick={submitPassword} disabled={pwModal.password.length < 6 || issuing}
                    className="flex-1 rounded-2xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                    {issuing ? (pwModal.mode === "reset" ? "設定中..." : "発行中...") : (pwModal.mode === "reset" ? "再設定する" : "発行する")}
                  </button>
                  <button onClick={() => { setPwModal(null); setIssued(null); }}
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

// ─── 生徒タブ ────────────────────────────────────────
type AccountModal = { studentId: string; studentName: string; loginId: string; password: string; mode: "issue" | "reset" } | null;
type EditModal = {
  id: string; name: string; grade: string; school_id: string;
  attendance_days: string[];
  lesson_start_time: string;
  lesson_duration: number | null; // null = 無制限
  lesson_teacher_id: string;
} | null;

const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: "30分", value: 30 },
  { label: "45分", value: 45 },
  { label: "60分", value: 60 },
  { label: "90分", value: 90 },
  { label: "120分", value: 120 },
  { label: "無制限", value: null },
];

// 生徒名の正規化（つなぐディレクトリの name_key と同じルール：空白/全角空白除去）
const normalizeName = (s: string) => s.replace(/[\s　]/g, "").trim();

// 保護者アカウントの初期パスワードを自動生成（10桁英数）。イベントハンドラ内でのみ使用。
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function StudentsTab({ students, schools, teachers, schoolName, onRefresh }: {
  students: Student[]; schools: School[]; teachers: Teacher[];
  schoolName: (id: string | null) => string; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [form, setForm] = useState({
    name: "", grade: "中1", school_id: "",
    attendance_days: [] as string[],
    lesson_start_time: "17:00",
    lesson_duration: 60 as number | null,
    lesson_teacher_id: "",
    parent_name: "", parent_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [tsunaguLookup, setTsunaguLookup] = useState(false);
  const [tsunaguHint, setTsunaguHint] = useState<string | null>(null);
  // 生徒＋保護者を作成した直後に初期パスワードを1回だけ見せるためのモーダル
  const [parentCreated, setParentCreated] = useState<
    { studentName: string; email: string; password: string | null; note: string | null } | null
  >(null);
  const [accountModal, setAccountModal] = useState<AccountModal>(null);
  const [issuing, setIssuing] = useState(false);
  const [issuedResult, setIssuedResult] = useState<{ loginId: string; password: string } | null>(null);
  const [editModal, setEditModal] = useState<EditModal>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [search, setSearch] = useState("");

  const openEdit = (s: Student) => {
    setEditModal({
      id: s.id,
      name: s.name,
      grade: s.grade,
      school_id: s.school_id ?? "",
      attendance_days: s.attendance_days ?? [],
      lesson_start_time: "17:00",
      lesson_duration: 60,
      lesson_teacher_id: "",
    });
  };

  const saveEdit = async () => {
    if (!editModal || !editModal.name) return;
    setEditSaving(true);
    await supabase.from("students").update({
      name: editModal.name,
      grade: editModal.grade,
      school_id: editModal.school_id || null,
      attendance_days: editModal.attendance_days.length > 0 ? editModal.attendance_days : null,
    }).eq("id", editModal.id);
    if (editModal.attendance_days.length > 0) {
      await autoGenerateLessons(editModal.id, editModal.attendance_days, editModal.lesson_start_time, editModal.lesson_duration, editModal.lesson_teacher_id || null);
    }
    setEditSaving(false);
    setEditModal(null);
    onRefresh();
  };

  // つなぐディレクトリを生徒名で照合し、保護者名・メールを自動補完する
  const lookupTsunagu = async (rawName: string) => {
    const key = normalizeName(rawName);
    if (!key) return;
    setTsunaguLookup(true);
    setTsunaguHint(null);
    const { data } = await supabase
      .from("tsunagu_parent_directory")
      .select("parent_name, parent_email, student_name")
      .eq("name_key", key)
      .order("synced_at", { ascending: false })
      .limit(1);
    setTsunaguLookup(false);
    const hit = data?.[0];
    if (hit && (hit.parent_email || hit.parent_name)) {
      setForm((f) => ({
        ...f,
        parent_name: hit.parent_name ?? f.parent_name,
        parent_email: hit.parent_email ?? f.parent_email,
      }));
      setTsunaguHint(
        hit.parent_email
          ? `つなぐ一致：${hit.parent_name ?? "保護者"}様 <${hit.parent_email}>`
          : `つなぐ一致：${hit.parent_name ?? "保護者"}様（メール未登録・手入力で作成可）`
      );
    } else {
      setTsunaguHint("つなぐ未登録。手入力で保護者を作成できます（メール空欄なら生徒のみ登録）");
    }
  };

  const resetForm = () =>
    setForm({
      name: "", grade: "中1", school_id: "", attendance_days: [],
      lesson_start_time: "17:00", lesson_duration: 60, lesson_teacher_id: "",
      parent_name: "", parent_email: "",
    });

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    const { data: inserted } = await supabase.from("students").insert({
      name: form.name,
      grade: form.grade,
      school_id: form.school_id || null,
      attendance_days: form.attendance_days.length > 0 ? form.attendance_days : null,
    }).select("id").single();
    if (!inserted) { setSaving(false); showToast("生徒の登録に失敗しました", "error"); return; }
    if (form.attendance_days.length > 0) {
      await autoGenerateLessons(inserted.id, form.attendance_days, form.lesson_start_time, form.lesson_duration, form.lesson_teacher_id || null);
    }

    // 保護者メールがあれば、保護者アカウント（ID＝メール／自動生成PW）を作成し生徒に紐付ける。
    // 生徒登録は成功済みなので、保護者作成に失敗しても生徒はロールバックしない。
    const parentEmail = form.parent_email.trim();
    if (parentEmail) {
      const password = genPassword();
      const res = await authFetch("/api/parent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parentEmail,
          password,
          name: form.parent_name.trim() || `${form.name}保護者`,
          phone: null,
          student_ids: [inserted.id],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(`生徒は登録しましたが保護者作成に失敗：${json.error ?? "unknown"}`, "error");
      } else {
        // 既存メール流用時は json.note が入り password は無効（既存PWのまま）
        setParentCreated({
          studentName: form.name,
          email: parentEmail,
          password: json.note ? null : password,
          note: json.note ?? null,
        });
      }
    } else {
      showToast("生徒を登録しました（保護者メール未入力のため保護者は未作成）", "info");
    }

    resetForm();
    setTsunaguHint(null);
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
    // イベントハンドラ内での仮ログインID生成（render 中ではないため非決定でも問題なし）
    // eslint-disable-next-line react-hooks/purity
    const auto = "s-" + Math.random().toString(36).slice(2, 7);
    setAccountModal({ studentId: s.id, studentName: s.name, loginId: s.login_id ?? auto, password: "", mode: "issue" });
    setIssuedResult(null);
  };

  const openResetModal = (s: Student) => {
    setAccountModal({ studentId: s.id, studentName: s.name, loginId: s.login_id ?? "", password: "", mode: "reset" });
    setIssuedResult(null);
  };

  const issueAccount = async () => {
    if (!accountModal || !accountModal.loginId || accountModal.password.length < 6) return;
    setIssuing(true);
    const endpoint = accountModal.mode === "reset" ? "/api/student/reset-password" : "/api/student/create";
    const body = accountModal.mode === "reset"
      ? { student_id: accountModal.studentId, password: accountModal.password }
      : { student_id: accountModal.studentId, login_id: accountModal.loginId, password: accountModal.password };
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setIssuing(false);
    if (data.error) { showToast("エラー: " + data.error, "error"); return; }
    setIssuedResult({ loginId: accountModal.loginId, password: accountModal.password });
    onRefresh();
  };

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.grade.toLowerCase().includes(q) ||
      schoolName(s.school_id).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="氏名・学年・校舎で検索"
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>
          )}
        </div>
        <button onClick={() => setShowCsvModal(true)}
          className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          CSVインポート
        </button>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          {showForm ? "キャンセル" : "+ 生徒を追加"}
        </button>
      </div>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-6 text-amber-900">
        パスワードは暗号化して保存しているため、後から確認することはできません。
        生徒が分からなくなったら、その子のカードの「🔑 パスワードを再設定」から新しいパスワードを決めて伝えてください。
      </p>

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
          {form.attendance_days.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1 text-sm text-slate-700">
                授業開始時刻
                <input
                  type="time"
                  value={form.lesson_start_time}
                  onChange={(e) => setForm({ ...form, lesson_start_time: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                授業時間
                <select
                  value={form.lesson_duration ?? "null"}
                  onChange={(e) => setForm({ ...form, lesson_duration: e.target.value === "null" ? null : Number(e.target.value) })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={String(o.value)} value={o.value ?? "null"}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                担当講師
                <select
                  value={form.lesson_teacher_id}
                  onChange={(e) => setForm({ ...form, lesson_teacher_id: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">未指定</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── 保護者（同時登録） ── */}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">保護者（同時に登録）</p>
              <button type="button" onClick={() => lookupTsunagu(form.name)}
                disabled={!form.name || tsunaguLookup}
                className="rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                {tsunaguLookup ? "つなぐ照合中…" : "つなぐから保護者を取得"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="保護者氏名" value={form.parent_name}
                onChange={(v) => setForm({ ...form, parent_name: v })} placeholder="例：山田花子" />
              <Field label="保護者メール（ログインID）" value={form.parent_email}
                onChange={(v) => setForm({ ...form, parent_email: v })} placeholder="parent@example.com" />
            </div>
            {tsunaguHint && <p className="mt-2 text-xs text-slate-500">{tsunaguHint}</p>}
            <p className="mt-2 text-xs text-slate-400">
              メールを入れて登録すると、保護者アカウント（初期パスワード自動生成）を作成し、この生徒と自動で紐付けます。空欄なら生徒のみ登録します。
            </p>
          </div>

          <button onClick={save} disabled={!form.name || saving}
            className="mt-4 rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <Empty text="生徒が登録されていません" />
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          「{search}」に一致する生徒が見つかりません
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
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
                  {/* ログイン情報：パスワードは保存していないので「再設定」しかできない */}
                  <div className="mt-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-500">ログイン情報</p>
                    {s.login_id ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                          <span className="truncate font-mono text-xs font-semibold text-slate-700">{s.login_id}</span>
                        </div>
                        <button onClick={() => openResetModal(s)}
                          className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                          🔑 パスワードを再設定
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500">未発行（まだログインできません）</p>
                        <button onClick={() => openAccountModal(s)}
                          className="mt-2 w-full rounded-xl border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                          アカウント発行
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">登録：{s.created_at.slice(0, 10)}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => openEdit(s)}
                    className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50">
                    編集
                  </button>
                  <button onClick={() => del(s.id)}
                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 生徒編集モーダル */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">生徒情報を編集</h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <Field label="氏名 *" value={editModal.name} onChange={(v) => setEditModal({ ...editModal, name: v })} placeholder="例：山田太郎" />
              <div className="grid gap-1 text-sm text-slate-700">
                学年
                <select value={editModal.grade} onChange={(e) => setEditModal({ ...editModal, grade: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                  {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                所属校舎
                <select value={editModal.school_id} onChange={(e) => setEditModal({ ...editModal, school_id: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400">
                  <option value="">未所属</option>
                  {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                通塾曜日
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const checked = editModal.attendance_days.includes(day);
                    return (
                      <label key={day} className={`flex cursor-pointer items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${checked ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        <input type="checkbox" className="sr-only" checked={checked}
                          onChange={() => setEditModal({ ...editModal, attendance_days: checked ? editModal.attendance_days.filter((d) => d !== day) : [...editModal.attendance_days, day] })} />
                        {day}
                      </label>
                    );
                  })}
                </div>
              </div>
              {editModal.attendance_days.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1 text-sm text-slate-700">
                    授業開始時刻
                    <input
                      type="time"
                      value={editModal.lesson_start_time}
                      onChange={(e) => setEditModal({ ...editModal, lesson_start_time: e.target.value })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    授業時間
                    <select
                      value={editModal.lesson_duration ?? "null"}
                      onChange={(e) => setEditModal({ ...editModal, lesson_duration: e.target.value === "null" ? null : Number(e.target.value) })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {DURATION_OPTIONS.map((o) => (
                        <option key={String(o.value)} value={o.value ?? "null"}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    担当講師
                    <select
                      value={editModal.lesson_teacher_id}
                      onChange={(e) => setEditModal({ ...editModal, lesson_teacher_id: e.target.value })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="">未指定</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={saveEdit} disabled={!editModal.name || editSaving}
                className="flex-1 rounded-2xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                {editSaving ? "保存中..." : "保存する"}
              </button>
              <button onClick={() => setEditModal(null)}
                className="flex-1 rounded-2xl border border-slate-300 bg-white py-3 text-slate-700 hover:bg-slate-50">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アカウント発行モーダル */}
      {parentCreated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
            <div className="mb-4 text-center text-4xl">👪</div>
            <h3 className="mb-1 text-center text-lg font-bold text-slate-900">保護者アカウント作成</h3>
            <p className="mb-6 text-center text-sm text-slate-500">
              {parentCreated.studentName}さんの保護者ログイン情報
            </p>
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <div>
                <p className="text-xs text-slate-500">ログインURL</p>
                <p className="font-mono text-sm font-semibold text-indigo-700">
                  {typeof window !== "undefined" ? window.location.origin : ""}/login/parent
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">ログインID（メール）</p>
                <p className="font-mono text-sm font-bold text-slate-900 break-all">{parentCreated.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">初期パスワード</p>
                {parentCreated.password ? (
                  <p className="font-mono text-lg font-bold text-slate-900">{parentCreated.password}</p>
                ) : (
                  <p className="text-sm text-slate-600">{parentCreated.note ?? "既存アカウントのため未変更"}</p>
                )}
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-amber-600">
              パスワードはこの画面でしか表示されません。保護者へお伝えください。
            </p>
            <button onClick={() => setParentCreated(null)}
              className="mt-4 w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white hover:bg-slate-800">
              閉じる
            </button>
          </div>
        </div>
      )}

      {accountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
            {issuedResult ? (
              <>
                <div className="mb-4 text-center text-4xl">✅</div>
                <h3 className="mb-1 text-center text-lg font-bold text-slate-900">{accountModal.mode === "reset" ? "パスワード再設定完了" : "アカウント発行完了"}</h3>
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
                <h3 className="mb-1 text-lg font-bold text-slate-900">{accountModal.mode === "reset" ? "パスワード再設定" : "アカウント発行"}</h3>
                <p className="mb-6 text-sm text-slate-500">
                  {accountModal.mode === "reset"
                    ? `${accountModal.studentName}さんの新しいパスワードを設定します（現在のパスワードは確認できません）`
                    : `${accountModal.studentName}さんのログイン情報を設定します`}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">ログインID</label>
                    <input value={accountModal.loginId}
                      onChange={(e) => setAccountModal({ ...accountModal, loginId: e.target.value })}
                      readOnly={accountModal.mode === "reset"}
                      className={`w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400 ${accountModal.mode === "reset" ? "bg-slate-100 text-slate-500" : "bg-slate-50"}`}
                      placeholder="例：s-tanaka-01" />
                    <p className="mt-1 text-xs text-slate-400">{accountModal.mode === "reset" ? "ログインIDは変更できません" : "英数字・ハイフンのみ使用可"}</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{accountModal.mode === "reset" ? "新しいパスワード（6文字以上）" : "初期パスワード（6文字以上）"}</label>
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
                    {issuing ? (accountModal.mode === "reset" ? "設定中..." : "発行中...") : (accountModal.mode === "reset" ? "再設定する" : "発行する")}
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
  // 空欄なら teachers 行だけ作る（ログインは後から個別に発行できる）
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);

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
    if (password && password.length < 6) {
      showToast("パスワードは6文字以上にしてください", "error"); return;
    }
    setImporting(true);
    // 1件ずつ API へ（teachers 行と Auth ユーザをまとめて作る）
    const errs: { name: string; error: string }[] = [];
    for (const r of valid) {
      const res = await authFetch("/api/teacher/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.name,
          email: r.email,
          password: r.email ? password : "",
          role: r.role,
          school_id: r.school_id,
        }),
      });
      const data = await res.json();
      if (data.error) errs.push({ name: r.name, error: data.error });
    }
    setFailed(errs);
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
            <p className="text-lg font-bold text-slate-900 mb-2">
              {rows.filter((r) => !r.error).length - failed.length}件 登録しました
              {password && "（ログイン発行済み）"}
            </p>
            {failed.length > 0 && (
              <div className="mx-auto mt-4 max-w-md rounded-2xl bg-red-50 p-4 text-left text-sm text-red-700">
                <p className="mb-2 font-semibold">{failed.length}件は登録できませんでした</p>
                <ul className="space-y-1 text-xs">
                  {failed.map((f, i) => <li key={i}>・{f.name}：{f.error}</li>)}
                </ul>
              </div>
            )}
            {password && (
              <p className="mt-4 text-xs text-slate-500">
                初期パスワードは全員共通で「{password}」です。各講師に伝えてください。
              </p>
            )}
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

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">共通の初期パスワード（任意・6文字以上）</label>
              <div className="flex gap-2">
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="空欄ならログインは発行しない"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-400" />
                <button type="button" onClick={() => setPassword(genPassword())}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  自動生成
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">メールがある講師だけ、このパスワードでログインを発行します</p>
            </div>

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

// ─── 高校データベース タブ ────────────────────────────────
type HighSchool = {
  id: string;
  name: string;
  school_type: string;
  school_level: string;
  prefecture: string;
  city: string | null;
  email: string | null;
  website: string | null;
  deviation_value_min: number | null;
  deviation_value_max: number | null;
  features: string[] | null;
  description: string | null;
  appeal_points: string | null;
  status: "pending" | "active" | "inactive";
  registered_by_school: boolean;
  created_at: string;
};

function HighSchoolsTab() {
  const [schools, setSchools] = useState<HighSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "active">("all");
  const [prefFilter, setPrefFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("high_schools")
      .select("*")
      .order("prefecture")
      .order("deviation_value_max", { ascending: false });
    setSchools((data ?? []) as HighSchool[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const approve = async (id: string) => {
    setUpdating(id);
    await supabase.from("high_schools").update({ status: "active" }).eq("id", id);
    setSchools((prev) => prev.map((s) => s.id === id ? { ...s, status: "active" } : s));
    setUpdating(null);
  };

  const deactivate = async (id: string) => {
    setUpdating(id);
    await supabase.from("high_schools").update({ status: "inactive" }).eq("id", id);
    setSchools((prev) => prev.map((s) => s.id === id ? { ...s, status: "inactive" } : s));
    setUpdating(null);
  };

  const del = async (id: string) => {
    if (!confirm("この学校を削除しますか？")) return;
    await supabase.from("high_schools").delete().eq("id", id);
    setSchools((prev) => prev.filter((s) => s.id !== id));
  };

  const copyRegisterUrl = () => {
    const url = `${window.location.origin}/school-register`;
    navigator.clipboard.writeText(url);
    showToast("URLをコピーしました", "success");
  };

  const filtered = schools.filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (prefFilter !== "all" && s.prefecture !== prefFilter) return false;
    if (typeFilter !== "all" && s.school_type !== typeFilter) return false;
    return true;
  });

  const pendingCount = schools.filter((s) => s.status === "pending").length;
  const activeCount  = schools.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">高校データベース</h2>
          <p className="mt-1 text-sm text-slate-500">
            掲載校 {activeCount}件 / 審査待ち {pendingCount}件
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyRegisterUrl}
            className="rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
            登録URLをコピー
          </button>
          <a href="/school-register" target="_blank"
            className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            登録ページを開く →
          </a>
        </div>
      </div>

      {/* 審査待ちバナー */}
      {pendingCount > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 font-bold text-white text-sm">{pendingCount}</span>
          <p className="text-sm font-semibold text-amber-900">審査待ちの学校があります。下の一覧から「承認」してください。</p>
          <button onClick={() => setFilter("pending")} className="ml-auto rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
            確認する
          </button>
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "active"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filter === f ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {f === "all" ? "すべて" : f === "pending" ? "審査待ち" : "掲載中"}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1" />
        {(["all", "東京都", "千葉県", "茨城県"] as const).map((p) => (
          <button key={p} onClick={() => setPrefFilter(p)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${prefFilter === p ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {p === "all" ? "全都県" : p}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1" />
        {(["all", "公立", "私立"] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${typeFilter === t ? "bg-teal-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {t === "all" ? "公私立" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          条件に合う学校がありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const isExpanded = expandedId === s.id;
            return (
              <div key={s.id} className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${
                s.status === "pending" ? "border-amber-300" : s.status === "inactive" ? "border-slate-200 opacity-60" : "border-slate-200"
              }`}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{s.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.school_type === "公立" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>{s.school_type}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.school_level}</span>
                        {s.registered_by_school && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">学校自己申請</span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.status === "pending" ? "bg-amber-100 text-amber-700"
                          : s.status === "active"  ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                        }`}>
                          {s.status === "pending" ? "審査待ち" : s.status === "active" ? "掲載中" : "非掲載"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {s.prefecture} {s.city && `/ ${s.city}`}
                        {s.deviation_value_min && s.deviation_value_max && (
                          <span className="ml-2 font-semibold text-indigo-700">偏差値 {s.deviation_value_min}〜{s.deviation_value_max}</span>
                        )}
                      </p>
                      {s.features && s.features.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.features.map((f) => (
                            <span key={f} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        {isExpanded ? "閉じる" : "詳細"}
                      </button>
                      {s.status === "pending" && (
                        <button onClick={() => approve(s.id)} disabled={updating === s.id}
                          className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                          {updating === s.id ? "..." : "承認"}
                        </button>
                      )}
                      {s.status === "active" && (
                        <button onClick={() => deactivate(s.id)} disabled={updating === s.id}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          非掲載
                        </button>
                      )}
                      {s.status === "inactive" && (
                        <button onClick={() => approve(s.id)} disabled={updating === s.id}
                          className="rounded-xl border border-green-300 px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-40">
                          再掲載
                        </button>
                      )}
                      <button onClick={() => del(s.id)}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                        削除
                      </button>
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-5 text-sm space-y-2 text-slate-700">
                    {s.email    && <p><span className="text-slate-500 mr-2">メール</span>{s.email}</p>}
                    {s.website  && <p><span className="text-slate-500 mr-2">サイト</span><a href={s.website} target="_blank" className="text-indigo-600 underline">{s.website}</a></p>}
                    {s.description   && <p><span className="text-slate-500 mr-2">説明</span>{s.description}</p>}
                    {s.appeal_points && <p><span className="text-slate-500 mr-2">アピール</span>{s.appeal_points}</p>}
                    <p className="text-xs text-slate-400">登録日: {s.created_at.slice(0, 10)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── メーリングリスト タブ ────────────────────────────────
type MailingEntry = {
  id: string;
  school_name: string;
  school_type: string | null;
  prefecture: string | null;
  city: string | null;
  email: string | null;
  contact_status: "未送信" | "送信済" | "登録済" | "辞退";
  notes: string | null;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  "未送信": "bg-slate-100 text-slate-600",
  "送信済": "bg-blue-100 text-blue-700",
  "登録済": "bg-green-100 text-green-700",
  "辞退":   "bg-red-100 text-red-600",
};

function MailingListTab() {
  const [entries, setEntries] = useState<MailingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefFilter, setPrefFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ school_name: "", school_type: "公立", prefecture: "東京都", city: "", email: "" });
  const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("school_mailing_list")
      .select("*")
      .order("prefecture")
      .order("school_name");
    setEntries((data ?? []) as MailingEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const updateStatus = async (id: string, status: MailingEntry["contact_status"]) => {
    setUpdating(id);
    const updates: Record<string, unknown> = { contact_status: status };
    if (status === "送信済") updates.sent_at = new Date().toISOString();
    if (emailInput[id]) updates.email = emailInput[id];
    await supabase.from("school_mailing_list").update(updates).eq("id", id);
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, contact_status: status, email: emailInput[id] || e.email } : e));
    setUpdating(null);
  };

  const addEntry = async () => {
    if (!newEntry.school_name) return;
    setAdding(true);
    const { data } = await supabase.from("school_mailing_list").insert({
      school_name: newEntry.school_name,
      school_type: newEntry.school_type,
      prefecture: newEntry.prefecture,
      city: newEntry.city || null,
      email: newEntry.email || null,
      contact_status: "未送信",
    }).select().single();
    if (data) setEntries((prev) => [...prev, data as MailingEntry]);
    setNewEntry({ school_name: "", school_type: "公立", prefecture: "東京都", city: "", email: "" });
    setShowAdd(false);
    setAdding(false);
  };

  const exportCsv = () => {
    const header = "学校名,種別,都道府県,市区町村,メールアドレス,状況\n";
    const rows = filtered.map((e) =>
      `"${e.school_name}","${e.school_type ?? ""}","${e.prefecture ?? ""}","${e.city ?? ""}","${e.email ?? ""}","${e.contact_status}"`
    ).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `学校メーリングリスト_${new Date().toLocaleDateString("ja-JP").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = entries.filter((e) => {
    if (prefFilter !== "all" && e.prefecture !== prefFilter) return false;
    if (statusFilter !== "all" && e.contact_status !== statusFilter) return false;
    if (typeFilter !== "all" && e.school_type !== typeFilter) return false;
    return true;
  });

  const counts = {
    未送信: entries.filter((e) => e.contact_status === "未送信").length,
    送信済: entries.filter((e) => e.contact_status === "送信済").length,
    登録済: entries.filter((e) => e.contact_status === "登録済").length,
    辞退:   entries.filter((e) => e.contact_status === "辞退").length,
  };

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">メーリングリスト</h2>
          <p className="mt-1 text-sm text-slate-500">
            全 {entries.length}件 ／ 未送信 {counts["未送信"]} ／ 送信済 {counts["送信済"]} ／ 登録済 {counts["登録済"]}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)}
            className="rounded-2xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100">
            + 学校を追加
          </button>
          <button onClick={exportCsv}
            className="rounded-2xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            CSVエクスポート
          </button>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-3">
        {(["未送信", "送信済", "登録済", "辞退"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-2xl border p-4 text-center transition ${statusFilter === s ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <p className="text-2xl font-bold text-slate-900">{counts[s]}</p>
            <p className={`mt-1 text-xs font-semibold rounded-full px-2 py-0.5 inline-block ${STATUS_COLOR[s]}`}>{s}</p>
          </button>
        ))}
      </div>

      {/* 追加フォーム */}
      {showAdd && (
        <div className="rounded-3xl border border-teal-200 bg-teal-50 p-6">
          <h3 className="mb-4 font-semibold text-teal-900">学校を追加</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              学校名
              <input value={newEntry.school_name} onChange={(e) => setNewEntry((p) => ({ ...p, school_name: e.target.value }))}
                placeholder="○○高等学校"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-teal-400" />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              都道府県
              <select value={newEntry.prefecture} onChange={(e) => setNewEntry((p) => ({ ...p, prefecture: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-teal-400">
                {["東京都","千葉県","茨城県","その他"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              種別
              <select value={newEntry.school_type} onChange={(e) => setNewEntry((p) => ({ ...p, school_type: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-teal-400">
                <option>公立</option><option>私立</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              メールアドレス
              <input type="email" value={newEntry.email} onChange={(e) => setNewEntry((p) => ({ ...p, email: e.target.value }))}
                placeholder="info@school.ed.jp"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-teal-400" />
            </label>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">キャンセル</button>
            <button onClick={addEntry} disabled={!newEntry.school_name || adding}
              className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
              {adding ? "追加中..." : "追加"}
            </button>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap gap-2">
        {(["all", "東京都", "千葉県", "茨城県"] as const).map((p) => (
          <button key={p} onClick={() => setPrefFilter(p)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${prefFilter === p ? "bg-teal-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {p === "all" ? "全都県" : p}
          </button>
        ))}
        <div className="w-px bg-slate-200 mx-1" />
        {(["all", "公立", "私立"] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${typeFilter === t ? "bg-teal-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {t === "all" ? "公私立" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">学校名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">種別</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">所在地</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">メール</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">状況</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{e.school_name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.school_type === "公立" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {e.school_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e.prefecture} {e.city}</td>
                  <td className="px-4 py-3">
                    {e.contact_status === "未送信" ? (
                      <input
                        value={emailInput[e.id] ?? (e.email || "")}
                        onChange={(ev) => setEmailInput((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                        placeholder="メールアドレスを入力"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-teal-400 w-44"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">{e.email || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[e.contact_status]}`}>
                      {e.contact_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {e.contact_status === "未送信" && (
                        <button onClick={() => updateStatus(e.id, "送信済")} disabled={updating === e.id}
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                          {updating === e.id ? "..." : "送信済にする"}
                        </button>
                      )}
                      {e.contact_status === "送信済" && (
                        <button onClick={() => updateStatus(e.id, "辞退")} disabled={updating === e.id}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
                          辞退
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-slate-400">条件に合う学校がありません</div>
          )}
        </div>
      )}
    </div>
  );
}
