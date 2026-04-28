"use client";

import Link from "next/link";
import { useState } from "react";

interface School {
  id: number;
  name: string;
  address: string;
  phone: string;
  admin: string;
}

interface Teacher {
  id: number;
  name: string;
  email: string;
  schoolId: number;
  role: "admin" | "teacher" | "part-time";
}

export default function TeacherSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([
    { id: 1, name: "本校", address: "東京都渋谷区", phone: "03-XXXX-XXXX", admin: "山田太郎" },
  ]);
  const [teachers, setTeachers] = useState<Teacher[]>([
    { id: 1, name: "山田太郎", email: "yamada@school.jp", schoolId: 1, role: "admin" },
    { id: 2, name: "佐藤花子", email: "sato@school.jp", schoolId: 1, role: "teacher" },
  ]);
  const [showSchoolForm, setShowSchoolForm] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: "", address: "", phone: "", admin: "" });
  const [newTeacher, setNewTeacher] = useState({ name: "", email: "", schoolId: 1, role: "teacher" as const });

  const addSchool = () => {
    if (!newSchool.name || !newSchool.admin) {
      alert("必須項目を入力してください");
      return;
    }
    setSchools([...schools, { ...newSchool, id: Date.now() }]);
    setNewSchool({ name: "", address: "", phone: "", admin: "" });
    setShowSchoolForm(false);
    alert("塾を登録しました");
  };

  const addTeacher = () => {
    if (!newTeacher.name || !newTeacher.email) {
      alert("必須項目を入力してください");
      return;
    }
    setTeachers([...teachers, { ...newTeacher, id: Date.now() }]);
    setNewTeacher({ name: "", email: "", schoolId: 1, role: "teacher" });
    setShowTeacherForm(false);
    alert("講師を登録しました");
  };

  const deleteSchool = (id: number) => {
    setSchools(schools.filter((s) => s.id !== id));
  };

  const deleteTeacher = (id: number) => {
    setTeachers(teachers.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">校舎・講師管理</h1>
            <p className="mt-2 text-slate-600">塾と講師の登録・管理を行います。</p>
          </div>
          <Link href="/teacher/dashboard" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-950 transition hover:bg-slate-50">
            ダッシュボードに戻る
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-950">登録済み塾（{schools.length}件）</h2>
              <button
                onClick={() => setShowSchoolForm(!showSchoolForm)}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white transition hover:bg-slate-800"
              >
                {showSchoolForm ? "キャンセル" : "+ 塾追加"}
              </button>
            </div>

            {showSchoolForm && (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 grid gap-3">
                <input
                  type="text"
                  placeholder="塾名"
                  value={newSchool.name}
                  onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <input
                  type="text"
                  placeholder="住所"
                  value={newSchool.address}
                  onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <input
                  type="tel"
                  placeholder="電話番号"
                  value={newSchool.phone}
                  onChange={(e) => setNewSchool({ ...newSchool, phone: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <input
                  type="text"
                  placeholder="管理者名"
                  value={newSchool.admin}
                  onChange={(e) => setNewSchool({ ...newSchool, admin: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  onClick={addSchool}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  塾を登録
                </button>
              </div>
            )}

            {schools.length > 0 ? (
              <div className="space-y-3">
                {schools.map((school) => (
                  <div key={school.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-950">{school.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{school.address}</p>
                        <p className="text-sm text-slate-600">{school.phone}</p>
                        <p className="mt-2 text-xs text-slate-500">管理者：{school.admin}</p>
                      </div>
                      <button
                        onClick={() => deleteSchool(school.id)}
                        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 transition hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">登録されている塾はありません</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-950">登録講師（{teachers.length}人）</h2>
              <button
                onClick={() => setShowTeacherForm(!showTeacherForm)}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white transition hover:bg-slate-800"
              >
                {showTeacherForm ? "キャンセル" : "+ 講師追加"}
              </button>
            </div>

            {showTeacherForm && (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 grid gap-3">
                <input
                  type="text"
                  placeholder="講師名"
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <input
                  type="email"
                  placeholder="メールアドレス"
                  value={newTeacher.email}
                  onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
                <select
                  value={newTeacher.role}
                  onChange={(e) => setNewTeacher({ ...newTeacher, role: e.target.value as "admin" | "teacher" | "part-time" })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="admin">管理者</option>
                  <option value="teacher">講師</option>
                  <option value="part-time">非常勤講師</option>
                </select>
                <button
                  onClick={addTeacher}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  講師を登録
                </button>
              </div>
            )}

            {teachers.length > 0 ? (
              <div className="space-y-3">
                {teachers.map((teacher) => (
                  <div key={teacher.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-950">{teacher.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{teacher.email}</p>
                        <div className="mt-2 inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900">
                          {teacher.role === "admin" ? "管理者" : teacher.role === "teacher" ? "講師" : "非常勤"}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTeacher(teacher.id)}
                        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 transition hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">登録されている講師はいません</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
