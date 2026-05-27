import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function sendAdminEmail(school: {
  id: string; name: string; school_type: string; prefecture: string;
  city: string | null; email: string | null; phone: string | null;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.EMAIL_FROM ?? "noreply@manabi-navi.com";
  const to   = "sekitaeisuke@kyouiku-koubou.com";
  const subject = `【まなびナビ】新規学校登録: ${school.name}`;
  const html = `
<h2>新規学校登録がありました</h2>
<table style="border-collapse:collapse;font-size:14px">
  <tr><td style="padding:4px 12px 4px 0;color:#666">学校名</td><td><strong>${school.name}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">種別</td><td>${school.school_type}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">所在地</td><td>${school.prefecture} ${school.city ?? ""}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">メール</td><td>${school.email ?? "未入力"}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">電話</td><td>${school.phone ?? "未入力"}</td></tr>
</table>
<p style="margin-top:16px">
  <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://manabi-saas.vercel.app"}/teacher/dashboard/schools?tab=pending">
    管理画面で確認 →
  </a>
</p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, html, text: `新規登録: ${school.name} (${school.prefecture})` }),
  }).catch(() => {});
}

async function sendSchoolConfirmEmail(school: { name: string; id: string }, toEmail: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.EMAIL_FROM ?? "noreply@manabi-navi.com";
  const subject = "【まなびナビ】学校情報ご登録ありがとうございます";
  const html = `
<p>${school.name} 様</p>
<p>まなびナビへの学校情報ご登録を受け付けました。</p>
<p>審査完了後（通常1〜3営業日）にご連絡いたします。</p>
<p style="margin-top:12px;color:#666;font-size:12px">
  登録番号: ${school.id}<br>
  お問い合わせ: sekitaeisuke@kyouiku-koubou.com
</p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: toEmail, subject, html, text: `${school.name}様、ご登録を受け付けました。審査後にご連絡いたします。` }),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    name, school_type, school_level, prefecture, city, address, access,
    phone, email, website,
    deviation_value_min, deviation_value_max,
    features, club_features, academic_features,
    university_results, student_atmosphere, teacher_atmosphere, appeal_points,
  } = body;

  if (!name?.trim() || !school_type || !school_level || !prefecture) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }

  // 重複チェック
  const { data: existing } = await supabaseAdmin
    .from("high_schools")
    .select("id, status")
    .eq("name", name.trim())
    .maybeSingle();

  if (existing) {
    const msg = existing.status === "pending"
      ? "この学校名はすでに申請中です。審査完了までお待ちください。"
      : "この学校名はすでに登録されています。修正のご依頼は sekitaeisuke@kyouiku-koubou.com までご連絡ください。";
    return NextResponse.json({ error: msg, duplicate: true }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("high_schools")
    .insert({
      name: name.trim(),
      school_type,
      school_level,
      prefecture,
      city:                city?.trim()               || null,
      address:             address?.trim()             || null,
      access:              access?.trim()              || null,
      phone:               phone?.trim()               || null,
      email:               email?.trim()               || null,
      website:             website?.trim()             || null,
      deviation_value_min: deviation_value_min ? Number(deviation_value_min) : null,
      deviation_value_max: deviation_value_max ? Number(deviation_value_max) : null,
      features:            features?.length ? features : null,
      club_features:       club_features?.trim()       || null,
      academic_features:   academic_features?.trim()   || null,
      university_results:  university_results?.trim()  || null,
      student_atmosphere:  student_atmosphere?.trim()  || null,
      teacher_atmosphere:  teacher_atmosphere?.trim()  || null,
      appeal_points:       appeal_points?.trim()       || null,
      status: "pending",
      registered_by_school: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("School registration error:", error);
    return NextResponse.json({ error: "登録に失敗しました: " + error.message }, { status: 500 });
  }

  // mailing_list のステータスを更新（送信済み校が登録した場合）
  await supabaseAdmin
    .from("school_mailing_list")
    .update({ contact_status: "登録済", high_school_id: data.id })
    .eq("school_name", name.trim())
    .in("contact_status", ["送信済", "メール送信済", "フォーム送信済"]);

  // 管理者通知（非同期・失敗しても無視）
  sendAdminEmail({
    id: data.id, name: name.trim(), school_type, prefecture,
    city: city?.trim() || null, email: email?.trim() || null, phone: phone?.trim() || null,
  });

  // 学校への確認メール（メールアドレスが入力されている場合）
  if (email?.trim()) {
    sendSchoolConfirmEmail({ name: name.trim(), id: data.id }, email.trim());
  }

  return NextResponse.json({ success: true, id: data.id });
}
