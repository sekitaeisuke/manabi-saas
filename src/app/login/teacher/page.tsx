import Link from "next/link";

export default function TeacherLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-6 py-10">
      <main className="w-full max-w-2xl rounded-3xl border border-green-200 bg-white p-10 shadow-2xl">
        <div className="inline-flex items-center justify-center rounded-full bg-green-100 p-3 mb-4">
          <p className="text-2xl">👨‍🏫</p>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">講師ログイン</h1>
        <p className="mt-4 text-slate-700">講師用のダッシュボードにログインして、生徒管理や分析を開始します。</p>

        <form className="mt-8 grid gap-6">
          <label className="grid gap-2 text-sm text-slate-700">
            メールアドレス
            <input className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-green-400" type="email" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            パスワード
            <input className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-green-400" type="password" />
          </label>
          <Link
            href="/teacher/dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-6 py-3 text-white transition hover:bg-green-700"
          >
            ログイン
          </Link>
        </form>

        <div className="mt-8 text-sm text-slate-600">
          <p>この段階ではログインボタンが講師ダッシュボードへ移動します。今後、認証を追加します。</p>
        </div>

        <div className="mt-8 text-sm text-slate-600">
          <Link href="/" className="font-medium text-green-600 hover:text-green-700 underline">トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
