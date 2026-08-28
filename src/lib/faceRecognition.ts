import { supabase } from "./supabase";

export const DESCRIPTOR_LENGTH = 128;

export type PersonType = "teacher" | "student";

export type MatchReason =
  | "matched"          // 本人と判定できた
  | "no_enrollment"    // そもそも1人も顔登録がない
  | "not_recognized"   // 一番近い登録でもしきい値より遠い
  | "ambiguous"        // 1位と2位が近すぎて決められない
  | "error";

export type MatchResult = {
  personId: string | null;
  distance: number | null;
  reason: MatchReason;
  enrolled: number;   // その種別で顔登録されている人数
  message?: string;
};

function validate(descriptor: Float32Array | number[]): number[] {
  const arr = Array.from(descriptor);
  if (arr.length !== DESCRIPTOR_LENGTH || arr.some((n) => !Number.isFinite(n))) {
    throw new Error("顔データを正しく取得できませんでした。もう一度お試しください。");
  }
  return arr;
}

export async function saveDescriptor(
  personType: PersonType,
  personId: string,
  descriptor: Float32Array
) {
  const arr = validate(descriptor);

  await supabase.from("face_descriptors").delete()
    .eq("person_type", personType).eq("person_id", personId);

  const { error } = await supabase.from("face_descriptors").insert({
    person_type: personType,
    person_id: personId,
    descriptor: arr,
  });
  if (error) throw error;
}

/**
 * 顔の照合。判定はサーバ（/api/face/match）で行う。
 * 顔の特徴量は生体情報なので、端末側へ全件ダウンロードさせない。
 */
export async function matchFace(
  personType: PersonType,
  descriptor: Float32Array
): Promise<MatchResult> {
  let arr: number[];
  try {
    arr = validate(descriptor);
  } catch (e) {
    return { personId: null, distance: null, reason: "error", enrolled: 0, message: (e as Error).message };
  }

  try {
    const res = await fetch("/api/face/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ person_type: personType, descriptor: arr }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { personId: null, distance: null, reason: "error", enrolled: 0, message: d.error ?? `照合に失敗しました (${res.status})` };
    }
    return {
      personId: d.person_id ?? null,
      distance: typeof d.distance === "number" ? d.distance : null,
      reason: (d.reason as MatchReason) ?? "not_recognized",
      enrolled: d.enrolled ?? 0,
    };
  } catch (e) {
    return { personId: null, distance: null, reason: "error", enrolled: 0, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function findMatch(
  personType: PersonType,
  descriptor: Float32Array
): Promise<string | null> {
  return (await matchFace(personType, descriptor)).personId;
}

/** 失敗の理由を、その場でやることが分かる日本語にする。 */
export function matchMessage(r: MatchResult, personType: PersonType): string {
  const who = personType === "student" ? "生徒" : "講師";
  switch (r.reason) {
    case "matched":
      return "認証しました";
    case "no_enrollment":
      return `${who}の顔がまだ1人も登録されていません。講師画面の「顔登録」から登録してください。`;
    case "ambiguous":
      return "よく似た登録が複数あり、判別できませんでした。手動で選んでください。";
    case "error":
      return r.message ?? "照合に失敗しました";
    default:
      return r.enrolled === 0
        ? `${who}の顔がまだ登録されていません。講師画面の「顔登録」から登録してください。`
        : "顔を認識できませんでした。明るい場所で、カメラの正面を向いてもう一度お試しください。";
  }
}
