import { supabase } from "./supabase";

type StoredDescriptor = {
  person_id: string;
  descriptor: number[];
};

const THRESHOLD = 0.5;

function euclidean(a: Float32Array | number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export async function saveDescriptor(
  personType: "teacher" | "student",
  personId: string,
  descriptor: Float32Array
) {
  await supabase.from("face_descriptors").delete()
    .eq("person_type", personType).eq("person_id", personId);

  const { error } = await supabase.from("face_descriptors").insert({
    person_type: personType,
    person_id: personId,
    descriptor: Array.from(descriptor),
  });
  if (error) throw error;
}

export async function findMatch(
  personType: "teacher" | "student",
  descriptor: Float32Array
): Promise<string | null> {
  const { data } = await supabase
    .from("face_descriptors")
    .select("person_id, descriptor")
    .eq("person_type", personType);

  if (!data || data.length === 0) return null;

  let best: { id: string; dist: number } | null = null;
  for (const row of data as StoredDescriptor[]) {
    const dist = euclidean(descriptor, row.descriptor);
    if (!best || dist < best.dist) best = { id: row.person_id, dist };
  }

  return best && best.dist < THRESHOLD ? best.id : null;
}
