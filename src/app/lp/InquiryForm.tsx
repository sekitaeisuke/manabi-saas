"use client";

import { useState } from "react";

const SCHOOL_COUNT = [
  { v: "1", label: "1教室" },
  { v: "2-3", label: "2〜3教室" },
  { v: "4-9", label: "4〜9教室" },
  { v: "10+", label: "10教室以上" },
];

const STUDENT_COUNT = [
  { v: "-50", label: "〜50名" },
  { v: "50-150", label: "50〜150名" },
  { v: "150-400", label: "150〜400名" },
  { v: "400+", label: "400名以上" },
];

/** 気になっている機能。値は @/lib/modules の ModuleKey に合わせる（core だけ独自） */
const INTERESTS = [
  { v: "core", label: "報告書・保護者連絡" },
  { v: "progress", label: "教材進捗" },
  { v: "karte_ai", label: "カルテ・3か月ビジョン" },
  { v: "tests", label: "学力診断・テスト" },
  { v: "collaboration", label: "講師連携" },
  { v: "parent_portal", label: "保護者ポータル・振替" },
  { v: "shift", label: "シフト・勤怠" },
  { v: "class_stock", label: "塾内経済（AC・自塾株）" },
];

type Form = {
  juku_name: string;
  person_name: string;
  email: string;
  phone: string;
  school_count: string;
  student_count: string;
  interests: string[];
  message: string;
  company_website: string; // honeypot
};

const EMPTY: Form = {
  juku_name: "", person_name: "", email: "", phone: "",
  school_count: "", student_count: "", interests: [], message: "",
  company_website: "",
};

const fieldClass =
  "mt-1.5 w-full rounded-[14px] border border-line-strong bg-surface px-3.5 py-2.5 text-sm " +
  "text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none " +
  "focus:ring-2 focus:ring-brand-200";

export function InquiryForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleInterest = (v: string) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(v)
        ? f.interests.filter((x) => x !== v)
        : [...f.interests, v],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/lp/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "送信に失敗しました。時間をおいてお試しください。");
        return;
      }
      setDone(true);
    } catch {
      setError("通信に失敗しました。電波の良いところでお試しください。");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-[28px] border border-line bg-surface p-10 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-positive-50 text-3xl">
          ✓
        </div>
        <h3 className="text-lg font-bold text-ink">お送りいただき、ありがとうございます</h3>
        <p className="mt-3 text-sm leading-7 text-ink-muted">
          担当（関田）より、2営業日以内にご連絡いたします。
          <br />
          画面をお見せしながらのオンライン相談も承っています。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-ink">
            塾名 <span className="text-critical-600">*</span>
          </span>
          <input
            required value={form.juku_name} onChange={(e) => set("juku_name", e.target.value)}
            placeholder="○○進学塾" className={fieldClass} autoComplete="organization"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">
            ご担当者名 <span className="text-critical-600">*</span>
          </span>
          <input
            required value={form.person_name} onChange={(e) => set("person_name", e.target.value)}
            placeholder="山田 太郎" className={fieldClass} autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">
            メールアドレス <span className="text-critical-600">*</span>
          </span>
          <input
            required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com" className={fieldClass} autoComplete="email"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">電話番号</span>
          <input
            type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
            placeholder="04-0000-0000" className={fieldClass} autoComplete="tel"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">教室数</span>
          <select
            value={form.school_count} onChange={(e) => set("school_count", e.target.value)}
            className={fieldClass}
          >
            <option value="">選択してください</option>
            {SCHOOL_COUNT.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-ink">生徒数</span>
          <select
            value={form.student_count} onChange={(e) => set("student_count", e.target.value)}
            className={fieldClass}
          >
            <option value="">選択してください</option>
            {STUDENT_COUNT.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-ink">気になっている機能（複数可）</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTERESTS.map((o) => {
            const on = form.interests.includes(o.v);
            return (
              <button
                key={o.v} type="button" onClick={() => toggleInterest(o.v)} aria-pressed={on}
                className={
                  on
                    ? "rounded-pill border border-brand-600 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 transition"
                    : "rounded-pill border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand-200 hover:text-ink"
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-6 block">
        <span className="text-sm font-semibold text-ink">ご相談・お困りごと</span>
        <textarea
          rows={5} value={form.message} onChange={(e) => set("message", e.target.value)}
          placeholder="例）報告書は書いているが、次の指導につながっていない。保護者への共有も手作業で追いついていない。"
          className={fieldClass}
        />
      </label>

      {/* ハニーポット。人には見えない。埋まっていたらbot扱い */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            tabIndex={-1} autoComplete="off" value={form.company_website}
            onChange={(e) => set("company_website", e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="mt-5 rounded-[14px] border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-700">
          {error}
        </p>
      )}

      <button
        type="submit" disabled={sending}
        className="mt-6 w-full rounded-pill bg-brand-gradient px-6 py-4 text-sm font-bold text-white shadow-brand transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "送信中…" : "この内容で相談する"}
      </button>

      <p className="mt-4 text-center text-xs leading-6 text-ink-faint">
        しつこい営業はいたしません。いただいた情報はご相談の対応にのみ使用します。
      </p>
    </form>
  );
}
