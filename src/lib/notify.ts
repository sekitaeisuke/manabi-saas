import { supabase } from "@/lib/supabase";
import { FEATURES } from "@/lib/features";

export type NotifyActor = "parent" | "teacher" | "student";

export type NotifyInput = {
  actor_kind: NotifyActor;
  actor_id: string;
  event_type: string;
  subject: string;
  body_text: string;
  body_html?: string;
  link?: string;
};

/**
 * Fire-and-forget notification. Failures are swallowed so they never block UX.
 * The server logs each attempt to notification_log for audit.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    await fetch("/api/notify", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    // 失敗は無視（通知はベストエフォート）
  }
}

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

export const links = {
  parentMessages:    () => `${origin()}/parent/dashboard/messages`,
  parentReschedule:  () => `${origin()}/parent/dashboard/reschedule`,
  teacherMessages:   () => `${origin()}/teacher/dashboard/messages`,
  teacherReschedule: () => `${origin()}${FEATURES.separateSchedulePages ? "/teacher/dashboard/reschedules" : "/teacher/dashboard/calendar"}`,
  studentDashboard:  () => `${origin()}/student/dashboard`,
};
