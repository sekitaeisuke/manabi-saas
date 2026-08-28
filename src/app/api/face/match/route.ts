import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 顔の照合はサーバ（service role）で行う。
//   理由: 顔の特徴量は生体情報。anonキーは公開されているので、端末に全件
//         ダウンロードさせる作りだと生徒123名ぶんの顔データが誰でも取れてしまう。
//         端末へ返すのは「誰か」という答えだけにする。
//   判定: 一番近い登録が THRESHOLD 未満、かつ2位より MARGIN 以上離れていること。
//         2位と僅差なら人違いの恐れがあるので、あえて決めない。

const DESCRIPTOR_LENGTH = 128;
const THRESHOLD = 0.55; // face-api の推奨は0.6。教室運用では少しだけ厳しめ
const MARGIN = 0.05;    // 1位と2位の差がこれ未満なら「判別できない」扱い

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

function isDescriptor(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === DESCRIPTOR_LENGTH
    && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const personType = body?.person_type;
  const descriptor = body?.descriptor;

  if (personType !== "teacher" && personType !== "student") {
    return NextResponse.json({ error: "person_type は teacher / student のいずれかです" }, { status: 400 });
  }
  if (!isDescriptor(descriptor)) {
    return NextResponse.json({ error: "顔データが不正です（128次元の数値配列が必要）" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await svc
    .from("face_descriptors")
    .select("person_id, descriptor")
    .eq("person_type", personType);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 1人が複数枚登録していてもよいよう、人ごとに最も近い距離を採る
  const bestByPerson = new Map<string, number>();
  for (const row of data ?? []) {
    if (!isDescriptor(row.descriptor)) continue;
    const dist = euclidean(descriptor, row.descriptor);
    if (!Number.isFinite(dist)) continue;
    const prev = bestByPerson.get(row.person_id);
    if (prev === undefined || dist < prev) bestByPerson.set(row.person_id, dist);
  }

  const enrolled = bestByPerson.size;
  if (enrolled === 0) {
    return NextResponse.json({ person_id: null, distance: null, reason: "no_enrollment", enrolled: 0 });
  }

  const sorted = [...bestByPerson.entries()].sort((a, b) => a[1] - b[1]);
  const [bestId, bestDist] = sorted[0];
  const secondDist = sorted[1]?.[1];

  if (bestDist >= THRESHOLD) {
    return NextResponse.json({ person_id: null, distance: bestDist, reason: "not_recognized", enrolled });
  }
  if (secondDist !== undefined && secondDist - bestDist < MARGIN) {
    return NextResponse.json({ person_id: null, distance: bestDist, reason: "ambiguous", enrolled });
  }
  return NextResponse.json({ person_id: bestId, distance: bestDist, reason: "matched", enrolled });
}
