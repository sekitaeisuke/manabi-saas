import { createClient } from "@supabase/supabase-js";
import { Logo } from "@/components/Logo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 60;

export default async function AnnouncementsPage() {
  const { data: announcements } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">お知らせ</h1>

        {!announcements || announcements.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center text-slate-400 shadow-sm">
            現在お知らせはありません
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h2 className="font-bold text-slate-900">{a.title}</h2>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(a.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.content}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <a href="/contact" className="text-sm text-indigo-600 hover:underline">
            お問い合わせはこちら →
          </a>
        </div>
      </div>
    </div>
  );
}
