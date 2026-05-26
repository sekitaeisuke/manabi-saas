import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    name, school_type, school_level, prefecture, city, address, access,
    phone, email, website,
    deviation_value_min, deviation_value_max,
    features, club_features, academic_features,
    university_results, student_atmosphere, teacher_atmosphere, appeal_points,
  } = body;

  if (!name || !school_type || !school_level || !prefecture) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
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

  await supabaseAdmin
    .from("school_mailing_list")
    .update({ contact_status: "登録済", high_school_id: data.id })
    .eq("school_name", name.trim())
    .eq("contact_status", "送信済");

  return NextResponse.json({ success: true, id: data.id });
}
