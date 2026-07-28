import Link from "next/link";

// 講師アカウントは管理者が作成する運用。
// 以前ここにあった自己登録フォームは teachers 行を作れず（RLS の teachers_insert は admin 限定）、
// 「登録完了」と表示しながら実際にはログインしても何も保存できないアカウントを量産していた。
// 役職に「管理者」を選べる自己登録は権限昇格の入口でもあるため、フォームごと廃止した。
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen">
      {/* 左：ブランドパネル */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">つ</div>
          <span className="text-xl font-bold">つながるまなび</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">アカウントは<br />管理者が作成します。</h1>
          <p className="mt-4 text-indigo-200">
            講師アカウントの発行は管理者が行います。作成後、メールアドレスと初期パスワードをお伝えします。
          </p>
        </div>
        <p className="text-xs text-indigo-300">© 2025 つながるまなび. All rights reserved.</p>
      </div>

      {/* 右：案内パネル */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">つ</div>
            <span className="text-xl font-bold text-slate-900">つながるまなび</span>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">新規登録は受け付けていません</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              講師アカウントは管理者が作成します。アカウントが必要な方、ログインできない方は、
              管理者（関田）までご連絡ください。折り返しメールアドレスと初期パスワードをお伝えします。
            </p>

            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ご自身でアカウントを作り直しても、教材進捗の保存はできるようになりません。
              お手数ですが管理者にお声がけください。
            </div>

            <Link
              href="/login"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              ログインページへ →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
