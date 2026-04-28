import Link from "next/link";

export default function ParentLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-6 py-10">
      <main className="w-full max-w-2xl rounded-3xl border border-blue-200 bg-white p-10 shadow-2xl">
        <div className="inline-flex items-center justify-center rounded-full bg-blue-100 p-3 mb-4">
          <p className="text-2xl">👨‍👩‍👧</p>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">保護者ログイン</h1>
        <p className="mt-4 text-slate-700">お子さまの学習状況や報告書を確認するためにログインしてください。</p>

        <form className="mt-8 grid gap-6">
          <label className="grid gap-2 text-sm text-slate-700">
            メールアドレス
            <input className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-400" type="email" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            パスワード
            <input className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-400" type="password" />
          </label>
          <Link
            href="/parent/dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
          >
            ログイン
          </Link>
        </form>

        <div className="mt-8 text-sm text-slate-600">
          <p>この段階ではログインボタンが保護者ダッシュボードへ移動します。今後、認証を追加します。</p>
        </div>

        <div className="mt-8 text-sm text-slate-600">
          <Link href="/" className="font-medium text-blue-600 hover:text-blue-700 underline">トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
