import Link from "next/link";

const stats = [
  { label: "担当生徒", value: "24", description: "進捗管理と指導状況を確認" },
  { label: "診断テスト", value: "8", description: "作成済みテスト数" },
  { label: "未読メッセージ", value: "12", description: "生徒・保護者からの連絡" },
  { label: "カルテ", value: "5", description: "作成中の学習カルテ" },
];

const cards = [
  { title: "メッセージ送信", description: "個別・全体へ連絡ができます。", href: "/teacher/dashboard/messages" },
  { title: "診断テスト作成", description: "学力診断テストを作成・管理します。", href: "/teacher/dashboard/tests" },
  { title: "分析とカルテ", description: "テスト結果を分析し、カルテを作成します。", href: "/teacher/dashboard/analysis" },
  { title: "報告書作成", description: "保護者向けの報告書を準備します。", href: "/teacher/dashboard/reports" },
  { title: "講師連携", description: "講師同士で生徒指導の情報共有を行います。", href: "/teacher/dashboard/collaboration" },
  { title: "校舎・講師管理", description: "新しい塾登録や講師の階層管理を行います。", href: "/teacher/dashboard/schools" },
];

export default function TeacherDashboardPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-green-200 bg-gradient-to-r from-blue-50 to-green-50 p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-green-600">講師ダッシュボード</p>
              <h1 className="mt-3 text-4xl font-bold text-slate-900">生徒管理・診断・連携をここから</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
                メッセージ送信、診断テスト、分析、カルテ、報告書、講師間連携を進めるための操作をまとめた画面です。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full border border-green-300 bg-white px-5 py-3 text-sm font-semibold text-green-700 transition hover:bg-green-50"
              >
                トップに戻る
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item, index) => (
            <div key={item.label} className={`rounded-3xl border p-6 shadow-sm ${index % 2 === 0 ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white' : 'border-green-200 bg-gradient-to-br from-green-50 to-white'}`}>
              <p className={`text-sm font-semibold ${index % 2 === 0 ? 'text-blue-600' : 'text-green-600'}`}>{item.label}</p>
              <p className="mt-4 text-3xl font-bold text-slate-900">{item.value}</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {cards.map((card, index) => (
            <Link
              key={card.title}
              href={card.href}
              className={`group rounded-3xl border p-6 transition ${index < 3 ? 'border-blue-300 bg-white hover:border-blue-400 hover:shadow-lg hover:shadow-blue-100' : 'border-green-300 bg-white hover:border-green-400 hover:shadow-lg hover:shadow-green-100'}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-lg font-semibold ${index < 3 ? 'text-blue-900' : 'text-green-900'}`}>{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{card.description}</p>
                </div>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${index < 3 ? 'bg-blue-100 text-blue-600 group-hover:bg-blue-200' : 'bg-green-100 text-green-600 group-hover:bg-green-200'}`}>
                  →
                </span>
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">今後の拡張</h2>
          <ul className="mt-4 space-y-3 text-slate-600">
            <li>・生徒個別ページで成績・提出物・指導メモを確認</li>
            <li>・診断テストの詳細設計と自動集計</li>
            <li>・保護者向け報告書のテンプレート管理</li>
            <li>・講師の権限・校舎階層の管理画面</li>
            <li>・チャット形式の講師連携コメント</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
