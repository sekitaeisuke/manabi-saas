"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export default function ContactPage() {
  const [form, setForm] = useState({
    parent_name: "",
    student_name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!form.parent_name || !form.message) return;
    setSending(true);
    await supabase.from("parent_messages").insert({
      parent_name: form.parent_name,
      student_name: form.student_name || null,
      email: form.email || null,
      subject: form.subject || null,
      message: form.message,
      status: "unread",
    });
    setSending(false);
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>

        {done ? (
          <div className="rounded-3xl bg-white p-10 shadow-sm text-center">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="text-xl font-bold text-slate-900">送信完了しました</h2>
            <p className="mt-2 text-sm text-slate-500">
              お問い合わせありがとうございます。<br />
              担当より順次ご返信いたします。
            </p>
            <button onClick={() => { setDone(false); setForm({ parent_name: "", student_name: "", email: "", subject: "", message: "" }); }}
              className="mt-6 rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              新しいメッセージを送る
            </button>
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="mb-1 text-2xl font-bold text-slate-900">お問い合わせ</h1>
            <p className="mb-6 text-sm text-slate-500">ご不明な点やご相談はこちらからお送りください。</p>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">保護者氏名 <span className="text-red-500">*</span></span>
                <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                  placeholder="例：山田 花子"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">生徒氏名</span>
                <input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                  placeholder="例：山田 太郎"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">メールアドレス（返信先）</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="例：yamada@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">件名</span>
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="例：授業についての質問"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">メッセージ <span className="text-red-500">*</span></span>
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="お問い合わせ内容をご記入ください..."
                  rows={5}
                  className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
            </div>

            <button onClick={send} disabled={!form.parent_name || !form.message || sending}
              className="mt-6 w-full rounded-2xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition">
              {sending ? "送信中..." : "送信する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
