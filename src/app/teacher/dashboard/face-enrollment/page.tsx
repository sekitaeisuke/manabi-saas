"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { saveDescriptor } from "@/lib/faceRecognition";
import { FaceCamera } from "@/components/FaceCamera";
import type { Student, Teacher } from "@/lib/supabase";

type PersonType = "teacher" | "student";

export default function FaceEnrollmentPage() {
  const [personType, setPersonType] = useState<PersonType>("student");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [{ data: ts }, { data: ss }, { data: ds }] = await Promise.all([
        supabase.from("teachers").select("*").order("name"),
        supabase.from("students").select("*").order("name"),
        supabase.from("face_descriptors").select("person_id"),
      ]);
      setTeachers(ts ?? []);
      setStudents(ss ?? []);
      setEnrolled(new Set((ds ?? []).map((d: { person_id: string }) => d.person_id)));
    })();
  }, [result]);

  const list = personType === "teacher" ? teachers : students;

  const handleDescriptor = async (descriptor: Float32Array) => {
    if (!selectedId) return;
    try {
      await saveDescriptor(personType, selectedId, descriptor);
      setResult({ ok: true, msg: "顔を登録しました ✓" });
    } catch (e) {
      setResult({ ok: false, msg: `登録失敗: ${e instanceof Error ? e.message : String(e)}` });
    }
    setScanning(false);
    setSelectedId("");
  };

  const personName = (id: string) => {
    const t = teachers.find(x => x.id === id);
    if (t) return t.name;
    const s = students.find(x => x.id === id);
    if (s) return `${s.name}（${s.grade}）`;
    return id;
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-950 mb-1">顔登録</h1>
        <p className="text-slate-600 mb-8">講師・生徒の顔データを登録します。1人ずつカメラで撮影してください。</p>

        {result && (
          <div className={`mb-6 rounded-2xl px-5 py-4 text-sm font-semibold ${result.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.msg}
            <button onClick={() => setResult(null)} className="ml-4 text-xs opacity-60 hover:opacity-100">閉じる</button>
          </div>
        )}

        {scanning ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-center font-semibold text-slate-800 mb-4">
              {personName(selectedId)} の顔を登録中
            </p>
            <FaceCamera
              label="顔をカメラに向けてください（自動検出）"
              onDescriptor={handleDescriptor}
              onError={(msg) => { setResult({ ok: false, msg }); setScanning(false); }}
            />
            <button onClick={() => setScanning(false)} className="mt-4 w-full rounded-2xl border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50">
              キャンセル
            </button>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex gap-2">
              {(["student", "teacher"] as PersonType[]).map((t) => (
                <button key={t} onClick={() => { setPersonType(t); setSelectedId(""); }}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${personType === t ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {t === "student" ? "生徒" : "講師"}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {list.map((p) => {
                const hasData = enrolled.has(p.id);
                const isSelected = selectedId === p.id;
                return (
                  <button key={p.id} onClick={() => setSelectedId(isSelected ? "" : p.id)}
                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${isSelected ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <span className="font-medium text-slate-900">
                      {p.name}
                      {"grade" in p && <span className="ml-2 text-xs text-slate-500">{(p as Student).grade}</span>}
                    </span>
                    {hasData
                      ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">登録済</span>
                      : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">未登録</span>
                    }
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => { setResult(null); setScanning(true); }}
              disabled={!selectedId}
              className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {selectedId ? `${personName(selectedId)} の顔を登録する` : "上から人を選択してください"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
