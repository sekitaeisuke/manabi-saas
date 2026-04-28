import Link from "next/link";

export default function TeacherCollaborationPage() {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-10 shadow-xl">
        <h1 className="text-3xl font-bold text-slate-950">講師連携</h1>
        <p className="mt-4 text-slate-600">講師同士で生徒指導の連携を行う場所です。</p>
        <div className="mt-8 text-slate-700">連携機能をこれから実装します。</div>
        <div className="mt-8">
          <Link href="/teacher/dashboard" className="rounded-2xl bg-slate-950 px-5 py-3 text-white transition hover:bg-slate-800">
            ダッシュボードに戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
