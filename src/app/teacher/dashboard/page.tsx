"use client";

import Link from "next/link";

const QUICK_ACTIONS = [
  {
    title: "診断テスト作成",
    desc: "AIで問題を自動生成し、URLで生徒に配布",
    href: "/teacher/dashboard/tests",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400 hover:shadow-blue-100",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "多層診断システム",
    desc: "学力・学習量・学習の質を多角的に診断しレポートを生成",
    href: "/teacher/dashboard/diagnosis",
    color: "bg-indigo-50 border-indigo-200 hover:border-indigo-400 hover:shadow-indigo-100",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: "生徒・講師管理",
    desc: "校舎・講師・生徒の登録と管理を一元化",
    href: "/teacher/dashboard/schools",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "メッセージ送信",
    desc: "生徒・保護者への個別・一括連絡",
    href: "/teacher/dashboard/messages",
    color: "bg-amber-50 border-amber-200 hover:border-amber-400 hover:shadow-amber-100",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "分析とカルテ",
    desc: "テスト結果を分析し、学習カルテを作成",
    href: "/teacher/dashboard/analysis",
    color: "bg-violet-50 border-violet-200 hover:border-violet-400 hover:shadow-violet-100",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "報告書作成",
    desc: "保護者向けの報告書テンプレート管理",
    href: "/teacher/dashboard/reports",
    color: "bg-rose-50 border-rose-200 hover:border-rose-400 hover:shadow-rose-100",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
];

export default function TeacherDashboardPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="px-8 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <p className="text-sm text-slate-400">{today}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">今日も生徒の成長をサポートしましょう。</p>
      </div>

      {/* クイックアクション */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">クイックアクション</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((item) => (
            <Link key={item.title} href={item.href}
              className={`group flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${item.color}`}>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}>
                <span className={item.iconColor}>{item.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* システム情報 */}
      <section className="mt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">システム稼働中</p>
              <p className="text-xs text-slate-400">Supabase • Claude AI • OpenAI GPT-4o</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium text-emerald-600">正常</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
