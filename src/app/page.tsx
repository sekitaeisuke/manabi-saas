import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-6 py-10">
      <main className="w-full max-w-4xl rounded-3xl border border-blue-200 bg-white p-10 shadow-2xl">
        <section className="mb-10 text-center">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            保護者と講師のための学習管理プラットフォーム</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
            まずはログインしてください。講師は生徒へのメッセージ送信、診断テストの作成、分析とカルテ作成、報告書作成、講師間連携を行えます。保護者はお子さまの学習状況を確認できます。</p>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <Link
            href="/login/parent"
            className="rounded-3xl border-2 border-blue-600 bg-white px-8 py-8 text-center transition hover:bg-blue-50 hover:shadow-lg"
          >
            <div className="inline-flex items-center justify-center rounded-full bg-blue-100 p-3 mb-3">
              <p className="text-lg">👨‍👩‍👧</p>
            </div>
            <p className="text-sm font-semibold text-blue-600">保護者ログイン</p>
            <p className="mt-4 text-xl font-semibold text-slate-900">お子さまの学習状況を確認</p>
            <p className="mt-3 text-sm leading-6 text-slate-700">レポート・成績・連絡の確認ページへ進みます。</p>
          </Link>

          <Link
            href="/login/teacher"
            className="rounded-3xl border-2 border-green-600 bg-white px-8 py-8 text-center transition hover:bg-green-50 hover:shadow-lg"
          >
            <div className="inline-flex items-center justify-center rounded-full bg-green-100 p-3 mb-3">
              <p className="text-lg">👨‍🏫</p>
            </div>
            <p className="text-sm font-semibold text-green-600">講師ログイン</p>
            <p className="mt-4 text-xl font-semibold text-slate-900">生徒を管理・分析する</p>
            <p className="mt-3 text-sm leading-6 text-slate-700">メッセージ、診断テスト、カルテ作成、連携機能を使います。</p>
          </Link>
        </section>
      </main>
    </div>
  );
}
