"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";

export default function StudentDashboardLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/student/login"); return; }

      // 生徒テーブルに存在するか確認（講師が誤って入ってきても弾く）
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!data) { await supabase.auth.signOut(); router.replace("/student/login"); return; }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) router.replace("/student/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          読み込み中...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
