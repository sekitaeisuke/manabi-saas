"use client";
import { showToast } from "@/lib/toast";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import type { Student, School } from "@/lib/supabase";

type LinkedStudent = { id: string; name: string; grade: string };

type Parent = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
  students: LinkedStudent[];
};

const EMPTY_CREATE = {
  email: "",
  password: "",
  name: "",
  phone: "",
  student_ids: [] as string[],
};

export default function ParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createNotice, setCreateNotice] = useState("");

  const [editing, setEditing] = useState<Parent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [editBusy, setEditBusy] = useState(false);

  const [linkBusy, setLinkBusy] = useState(false);
  const [addStudentId, setAddStudentId] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: ps }, { data: ss }, { data: scs }] = await Promise.all([
      supabase
        .from("parents")
        .select("id, email, name, phone, created_at, parent_student_links(student:students(id, name, grade))")
        .order("created_at", { ascending: false }),
      supabase.from("students").select("*").order("name"),
      supabase.from("schools").select("*").order("name"),
    ]);

    const list: Parent[] = (ps ?? []).map((p: {
      id: string; email: string; name: string; phone: string | null; created_at: string;
      parent_student_links: { student: LinkedStudent | LinkedStudent[] | null }[] | null;
    }) => ({
      id: p.id,
      email: p.email,
      name: p.name,
      phone: p.phone,
      created_at: p.created_at,
      students: (p.parent_student_links ?? [])
        .map((l) => Array.isArray(l.student) ? l.student[0] : l.student)
        .filter((s): s is LinkedStudent => Boolean(s)),
    }));

    setParents(list);
    setStudents(ss ?? []);
    setSchools(scs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredStudents = useMemo(() => {
    if (!filterSchool) return students;
    return students.filter((s) => s.school_id === filterSchool);
  }, [students, filterSchool]);

  const filteredParents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) =>
      p.name.toLowerCase().includes(q)
      || p.email.toLowerCase().includes(q)
      || p.students.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [parents, search]);

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE);
    setCreateError("");
    setCreateNotice("");
    setShowCreate(true);
  };

  const submitCreate = async () => {
    setCreateBusy(true);
    setCreateError("");
    setCreateNotice("");
    const res = await authFetch("/api/parent/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const json = await res.json();
    setCreateBusy(false);
    if (!res.ok) { setCreateError(json.error ?? "作成に失敗しました"); return; }
    const base = `「${createForm.name}」さんを作成しました。`;
    setCreateNotice(json.note
      ? `${base} ${json.note}`
      : `${base}初回パスワードを保護者へ共有してください。`);
    setCreateForm(EMPTY_CREATE);
    fetchAll();
  };

  const openEdit = (p: Parent) => {
    setEditing(p);
    setEditForm({ name: p.name, phone: p.phone ?? "" });
    setAddStudentId("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditBusy(true);
    const { error } = await supabase
      .from("parents")
      .update({ name: editForm.name, phone: editForm.phone || null })
      .eq("id", editing.id);
    setEditBusy(false);
    if (error) { showToast(`更新失敗: ${error.message}`, "error"); return; }
    fetchAll();
    setEditing((prev) => prev ? { ...prev, name: editForm.name, phone: editForm.phone || null } : prev);
  };

  const addLink = async () => {
    if (!editing || !addStudentId) return;
    setLinkBusy(true);
    const { error } = await supabase.from("parent_student_links").insert({
      parent_id: editing.id,
      student_id: addStudentId,
    });
    setLinkBusy(false);
    if (error) {
      if (error.code === "23505") {
        showToast("既に紐付け済みです", "info");
      } else {
        showToast(`紐付け失敗: ${error.message}`, "error");
      }
      return;
    }
    setAddStudentId("");
    await fetchAll();
    const updated = (await supabase
      .from("parents")
      .select("id, email, name, phone, created_at, parent_student_links(student:students(id, name, grade))")
      .eq("id", editing.id)
      .maybeSingle()
    ).data as {
      id: string; email: string; name: string; phone: string | null; created_at: string;
      parent_student_links: { student: LinkedStudent | LinkedStudent[] | null }[] | null;
    } | null;
    if (updated) {
      setEditing({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        phone: updated.phone,
        created_at: updated.created_at,
        students: (updated.parent_student_links ?? [])
          .map((l) => Array.isArray(l.student) ? l.student[0] : l.student)
          .filter((s): s is LinkedStudent => Boolean(s)),
      });
    }
  };

  const removeLink = async (studentId: string) => {
    if (!editing) return;
    if (!confirm("この生徒との紐付けを解除しますか？")) return;
    const { error } = await supabase
      .from("parent_student_links")
      .delete()
      .eq("parent_id", editing.id)
      .eq("student_id", studentId);
    if (error) { showToast(`解除失敗: ${error.message}`, "error"); return; }
    setEditing((prev) => prev
      ? { ...prev, students: prev.students.filter((s) => s.id !== studentId) }
      : prev);
    fetchAll();
  };

  const removeParent = async (p: Parent) => {
    if (!confirm(`保護者「${p.name}」を削除しますか？`)) return;
    const res = await authFetch("/api/parent/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parent_id: p.id }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(`削除失敗: ${json.error ?? "unknown"}`, "error"); return; }
    if (editing?.id === p.id) setEditing(null);
    if (json.note) showToast(json.note, "info");
    if (json.auth_error) showToast(`Auth ユーザ削除に失敗: ${json.auth_error}`, "error");
    fetchAll();
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">保護者管理</h1>
            <p className="mt-1 text-slate-600">保護者アカウントの作成・編集と生徒との紐付け管理。</p>
          </div>
          <button onClick={openCreate}
            className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
            ＋ 保護者を新規作成
          </button>
        </div>

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="氏名・Email・お子さま名で検索"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm" />
        </section>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : filteredParents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            保護者がまだ登録されていません。「＋ 保護者を新規作成」から追加してください。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">保護者</th>
                  <th className="px-4 py-3">連絡先</th>
                  <th className="px-4 py-3">お子さま</th>
                  <th className="px-4 py-3">登録日</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParents.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="truncate">{p.email}</p>
                      {p.phone && <p className="text-xs text-slate-400">{p.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {p.students.length === 0 ? (
                        <span className="text-xs text-amber-600">未紐付け</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.students.map((s) => (
                            <span key={s.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                              {s.name}（{s.grade}）
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{p.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        編集
                      </button>
                      <button onClick={() => removeParent(p)}
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

        {showCreate && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !createBusy && setShowCreate(false)}>
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-1 text-lg font-bold text-slate-950">保護者を新規作成</h3>
              <p className="mb-4 text-xs text-slate-500">
                Supabase Auth ユーザ＋ parents 行＋ parent_student_links を一括作成します。
                Email 認証は Supabase Auth 設定で無効化しておくか、初回ログイン前に保護者へ確認メールの承認を依頼してください。
              </p>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">氏名 *
                    <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">電話番号
                    <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                </div>
                <label className="text-xs text-slate-600">Email *
                  <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">初回パスワード *
                  <input type="text" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="8文字以上"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono" />
                </label>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-slate-600">紐付ける生徒（複数可）</label>
                    <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                      <option value="">全校舎</option>
                      {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {filteredStudents.map((s) => {
                      const checked = createForm.student_ids.includes(s.id);
                      return (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white">
                          <input type="checkbox" checked={checked}
                            onChange={(e) => setCreateForm({
                              ...createForm,
                              student_ids: e.target.checked
                                ? [...createForm.student_ids, s.id]
                                : createForm.student_ids.filter((x) => x !== s.id),
                            })} />
                          <span className="font-medium text-slate-800">{s.name}</span>
                          <span className="text-slate-400">{s.grade}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {createError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{createError}</p>}
                {createNotice && <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{createNotice}</p>}
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setShowCreate(false)} disabled={createBusy}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  閉じる
                </button>
                <button onClick={submitCreate} disabled={createBusy || !createForm.name || !createForm.email || !createForm.password}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {createBusy ? "作成中..." : "作成"}
                </button>
              </div>
            </div>
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-4 text-lg font-bold text-slate-950">保護者を編集</h3>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">氏名
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">電話番号
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </label>
                </div>
                <p className="text-xs text-slate-500">Email: <span className="font-mono">{editing.email}</span>（変更は Supabase Auth 側で行ってください）</p>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">紐付け中のお子さま</p>
                  {editing.students.length === 0 ? (
                    <p className="text-xs text-slate-400">未紐付け</p>
                  ) : (
                    <div className="space-y-1">
                      {editing.students.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                          <span className="font-medium">{s.name} <span className="text-slate-400">{s.grade}</span></span>
                          <button onClick={() => removeLink(s.id)}
                            className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-50">
                            解除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <select value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
                      <option value="">＋ 紐付ける生徒を選択</option>
                      {students
                        .filter((s) => !editing.students.some((es) => es.id === s.id))
                        .map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
                    </select>
                    <button onClick={addLink} disabled={!addStudentId || linkBusy}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                      追加
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setEditing(null)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  閉じる
                </button>
                <button onClick={saveEdit} disabled={editBusy}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {editBusy ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
