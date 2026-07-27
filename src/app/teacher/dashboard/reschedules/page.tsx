"use client";
import { showToast } from "@/lib/toast";

import { useEffect, useState, useCallback, useMemo } from "react";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";
import { notify, links } from "@/lib/notify";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Skeleton } from "@/components/Skeleton";
import { FEATURES } from "@/lib/features";

type Request = {
  id: string;
  lesson_id: string;
  parent_id: string | null;
  student_id: string;
  proposed_at: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  teacher_response: string | null;
  responded_at: string | null;
  created_at: string;
  lessons?: { id: string; subject: string | null; scheduled_at: string; status: string } | null;
  parents?: { name: string; email: string } | null;
};

type Tab = "pending" | "responded";

export default function ReschedulesPage() {
  // 振替リクエストは来塾カレンダーに統合済み。ナビから隠すだけでなく直リンクも封じる。
  if (!FEATURES.separateSchedulePages) redirect("/teacher/dashboard/calendar");
  const [tab, setTab] = useState<Tab>("pending");
  const [requests, setRequests] = useState<Request[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Request | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rs }, { data: stu }] = await Promise.all([
      supabase
        .from("reschedule_requests")
        .select("*, lessons(id, subject, scheduled_at, status), parents(name, email)")
        .order("created_at", { ascending: false }),
      supabase.from("students").select("id, name, grade"),
    ]);
    setRequests((rs as Request[]) ?? []);
    setStudents((stu as Student[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.name}（${s.grade}）` : "—";
  };

  const filtered = useMemo(() => {
    return requests.filter((r) => tab === "pending" ? r.status === "pending" : r.status !== "pending");
  }, [requests, tab]);

  const notifyParent = async (r: Request, decision: "approved" | "rejected", response: string) => {
    if (!r.parent_id) return;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: t } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = t?.id ?? null;
    }
    const stu = students.find((s) => s.id === r.student_id);
    const subject = decision === "approved" ? "振替申請を承認しました" : "振替申請への返答";
    const head = decision === "approved"
      ? `振替申請を承認しました。\n新しい授業日時：${new Date(r.proposed_at).toLocaleString("ja-JP")}`
      : `振替申請にお返事します。\n（元の日時のまま実施予定です）`;
    const body = response.trim() ? `${head}\n\n【講師より】\n${response.trim()}` : head;
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
    notify({
      actor_kind: "parent",
      actor_id: r.parent_id,
      event_type: "reschedule_decision",
      subject,
      body_text: body,
      link: links.parentReschedule(),
    });
  };

  const approve = async (r: Request) => {
    setBusy(r.id);
    const response = responseDraft[r.id] ?? "";
    const nowIso = new Date().toISOString();

    const { error: e1 } = await supabase.from("reschedule_requests").update({
      status: "approved",
      teacher_response: response || null,
      responded_at: nowIso,
    }).eq("id", r.id);

    if (e1) { showToast(`承認失敗: ${e1.message}`, "error"); setBusy(null); return; }

    const { error: e2 } = await supabase.from("lessons").update({
      scheduled_at: r.proposed_at,
      status: "rescheduled",
    }).eq("id", r.lesson_id);

    if (e2) {
      showToast(`授業の更新に失敗: ${e2.message}`, "error");
    }

    await notifyParent(r, "approved", response);

    setBusy(null);
    load();
  };

  const reject = async (r: Request) => {
    const response = responseDraft[r.id] ?? "";
    if (!response.trim()) {
      setRejectTarget(r);
      return;
    }
    await doReject(r);
  };

  const doReject = async (r: Request) => {
    setRejectTarget(null);
    const draftResponse = responseDraft[r.id] ?? "";
    setBusy(r.id);
    const { error } = await supabase.from("reschedule_requests").update({
      status: "rejected",
      teacher_response: draftResponse || null,
      responded_at: new Date().toISOString(),
    }).eq("id", r.id);
    if (error) { showToast(`返答失敗: ${error.message}`, "error"); setBusy(null); return; }
    await notifyParent(r, "rejected", draftResponse);
    setBusy(null);
    load();
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">振替リクエスト</h1>
            <p className="mt-1 text-slate-600">保護者からの振替申請を承認 / 不可で返答できます。</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {([
            { key: "pending",   label: "申請中" },
            { key: "responded", label: "対応済" },
          ] as const).map((t) => {
            const count = t.key === "pending" ? requests.filter((r) => r.status === "pending").length : 0;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === t.key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                {t.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                    tab === t.key ? "bg-white/30 text-white" : "bg-red-500 text-white"
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {rejectTarget && (
          <ConfirmModal
            title="返答なしで却下しますか？"
            message={"講師からの返答メッセージが空です。\nこのまま「不可」で返答しますか？"}
            confirmLabel="このまま却下する"
            cancelLabel="戻る"
            danger
            onConfirm={() => doReject(rejectTarget)}
            onCancel={() => setRejectTarget(null)}
          />
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
                <div className="flex gap-3"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-4 w-32" /></div>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
                <div className="flex gap-2 pt-2"><Skeleton className="h-9 w-28 rounded-xl" /><Skeleton className="h-9 w-20 rounded-xl" /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-4xl mb-3">{tab === "pending" ? "✅" : "📋"}</p>
            <p className="font-semibold text-slate-700">
              {tab === "pending" ? "申請中のリクエストはありません" : "対応済みのリクエストはありません"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <StatusBadge s={r.status} />
                  <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString("ja-JP")} 申請</span>
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {studentName(r.student_id)}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  対象：{r.lessons?.subject ?? "—"} ／ 元の日時：
                  {r.lessons?.scheduled_at ? new Date(r.lessons.scheduled_at).toLocaleString("ja-JP") : "—"}
                </p>
                <p className="mt-1 text-sm font-semibold text-indigo-700">
                  希望：{new Date(r.proposed_at).toLocaleString("ja-JP")}
                </p>
                {r.parents && (
                  <p className="mt-1 text-xs text-slate-500">
                    申請者：{r.parents.name}（{r.parents.email}）
                  </p>
                )}
                {r.reason && (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {r.reason}
                  </p>
                )}

                {r.status === "pending" ? (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <textarea
                      value={responseDraft[r.id] ?? ""}
                      onChange={(e) => setResponseDraft({ ...responseDraft, [r.id]: e.target.value })}
                      rows={2}
                      placeholder="保護者への返答（任意）"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => reject(r)} disabled={busy === r.id}
                        className="rounded-2xl border-2 border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition">
                        ✕ 不可で返答
                      </button>
                      <button onClick={() => approve(r)} disabled={busy === r.id}
                        className="flex items-center gap-2 rounded-2xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-700 active:scale-95 disabled:opacity-40 transition">
                        {busy === r.id
                          ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />処理中...</>
                          : <><span>✓</span><span>承認して日時を変更</span></>}
                      </button>
                    </div>
                  </div>
                ) : (
                  r.teacher_response && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                      <p className="mb-1 text-xs font-semibold text-indigo-700">講師からの返答</p>
                      {r.teacher_response}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Request["status"] }) {
  const map = {
    pending:  { label: "申請中", cls: "bg-amber-100 text-amber-700" },
    approved: { label: "承認",   cls: "bg-green-100 text-green-700" },
    rejected: { label: "不可",   cls: "bg-red-100 text-red-700" },
  };
  const v = map[s];
  return <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>;
}
