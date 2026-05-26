"use client";

import { useState } from "react";

const FEATURES_OPTIONS = [
  "特進コース", "英語重視", "理数特化", "国際バカロレア", "SSH指定校", "SGH指定校",
  "文武両道", "スポーツ強化", "芸術・音楽", "少人数制", "ICT教育", "キャリア教育",
  "大学附属", "帰国生受入", "海外留学制度", "宗教教育", "探究学習", "難関大実績",
];

const PREFECTURE_OPTIONS = ["東京都", "千葉県", "茨城県", "その他"];

type FormData = {
  name: string;
  school_type: string;
  school_level: string;
  prefecture: string;
  city: string;
  address: string;
  access: string;
  phone: string;
  email: string;
  website: string;
  deviation_value_min: string;
  deviation_value_max: string;
  features: string[];
  club_features: string;
  academic_features: string;
  university_results: string;
  student_atmosphere: string;
  teacher_atmosphere: string;
  appeal_points: string;
};

const EMPTY: FormData = {
  name: "", school_type: "公立", school_level: "高校",
  prefecture: "東京都", city: "", address: "", access: "",
  phone: "", email: "", website: "",
  deviation_value_min: "", deviation_value_max: "",
  features: [],
  club_features: "", academic_features: "",
  university_results: "",
  student_atmosphere: "", teacher_atmosphere: "",
  appeal_points: "",
};

const STEPS = ["基本情報", "アクセス・連絡先", "学習・進路", "雰囲気・PR"] as const;

export default function SchoolRegisterPage() {
  const [form, setForm] = useState<FormData>(EMPTY);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof FormData, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const toggleFeature = (f: string) =>
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(f)
        ? prev.features.filter((x) => x !== f)
        : [...prev.features, f],
    }));

  const next = () => {
    if (step === 0 && !form.name) { setError("学校名を入力してください"); return; }
    setError("");
    setStep((prev) => Math.min(3, prev + 1) as 0 | 1 | 2 | 3);
  };
  const back = () => { setError(""); setStep((prev) => Math.max(0, prev - 1) as 0 | 1 | 2 | 3); };

  const submit = async () => {
    if (!form.name) { setError("学校名を入力してください"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/schools/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          school_type: form.school_type,
          school_level: form.school_level,
          prefecture: form.prefecture,
          city: form.city,
          address: form.address,
          access: form.access,
          phone: form.phone,
          email: form.email,
          website: form.website,
          deviation_value_min: form.deviation_value_min ? Number(form.deviation_value_min) : null,
          deviation_value_max: form.deviation_value_max ? Number(form.deviation_value_max) : null,
          features: form.features,
          club_features: form.club_features,
          academic_features: form.academic_features,
          university_results: form.university_results,
          student_atmosphere: form.student_atmosphere,
          teacher_atmosphere: form.teacher_atmosphere,
          appeal_points: form.appeal_points,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDone(true);
    } catch (e) {
      setError("送信に失敗しました: " + String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full rounded-3xl bg-white p-12 shadow-xl text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">ご登録ありがとうございます</h1>
          <p className="text-slate-600 leading-relaxed mb-6">
            {form.name}の情報を受け付けました。<br />
            審査後、まなびシステムの学校おすすめ機能に掲載されます。<br />
            通常1〜3営業日以内にご連絡いたします。
          </p>
          <div className="rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-700">
            登録メールアドレス: <strong>{form.email || "未入力"}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* ヘッダー */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1 text-sm font-semibold text-indigo-700 mb-4">
            学校情報登録フォーム
          </div>
          <h1 className="text-3xl font-bold text-slate-900">まなびシステムへの学校登録</h1>
          <p className="mt-3 text-slate-600 leading-relaxed">
            生徒の多層診断テスト結果に、貴校をおすすめ校として掲載できます。<br />
            以下のフォームに学校情報をご入力ください。（無料・審査制）
          </p>
        </div>

        {/* ステップインジケーター */}
        <div className="mb-8 flex items-center justify-center gap-1 flex-wrap">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                step === i ? "bg-indigo-600 text-white shadow-md"
                : step > i ? "bg-green-500 text-white"
                : "bg-slate-200 text-slate-500"
              }`}>
                {step > i ? "✓" : i + 1}
              </div>
              <span className={`text-xs hidden sm:inline ${step === i ? "font-semibold text-indigo-700" : "text-slate-400"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-4 bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="rounded-3xl bg-white p-8 shadow-xl">

          {/* STEP 0: 基本情報 */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 mb-2">基本情報</h2>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">学校名 <span className="text-red-500">*</span></span>
                <input value={form.name} onChange={(e) => set("name", e.target.value)}
                  placeholder="例：○○高等学校"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">学校種別 <span className="text-red-500">*</span></span>
                  <select value={form.school_type} onChange={(e) => set("school_type", e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>公立</option><option>私立</option><option>国立</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">学校レベル <span className="text-red-500">*</span></span>
                  <select value={form.school_level} onChange={(e) => set("school_level", e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>高校</option><option>中高一貫</option><option>中学</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">都道府県 <span className="text-red-500">*</span></span>
                  <select value={form.prefecture} onChange={(e) => set("prefecture", e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400">
                    {PREFECTURE_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">市区町村</span>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)}
                    placeholder="例：水戸市"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">住所</span>
                <input value={form.address} onChange={(e) => set("address", e.target.value)}
                  placeholder="例：茨城県水戸市○○1-2-3"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">偏差値の目安</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm text-slate-700">
                    下限
                    <input type="number" min={30} max={80} value={form.deviation_value_min}
                      onChange={(e) => set("deviation_value_min", e.target.value)}
                      placeholder="例：55"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-700">
                    上限
                    <input type="number" min={30} max={80} value={form.deviation_value_max}
                      onChange={(e) => set("deviation_value_max", e.target.value)}
                      placeholder="例：65"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={next} className="rounded-2xl bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-700">次へ →</button>
              </div>
            </div>
          )}

          {/* STEP 1: アクセス・連絡先 */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 mb-2">アクセス・連絡先</h2>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">アクセス</span>
                <textarea value={form.access} onChange={(e) => set("access", e.target.value)}
                  rows={3}
                  placeholder="例：JR常磐線「水戸駅」北口より徒歩15分、またはバス「○○バス停」下車すぐ"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">電話番号</span>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                    placeholder="029-000-0000"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-700">
                  <span className="font-semibold">メールアドレス</span>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                    placeholder="info@school.ed.jp"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">WebサイトURL</span>
                <input value={form.website} onChange={(e) => set("website", e.target.value)}
                  placeholder="https://www.school.ed.jp"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>

              <div className="flex justify-between pt-2">
                <button onClick={back} className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-slate-700 hover:bg-slate-50">← 戻る</button>
                <button onClick={next} className="rounded-2xl bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-700">次へ →</button>
              </div>
            </div>
          )}

          {/* STEP 2: 学習・部活・進路 */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 mb-2">学習・部活動・進路</h2>

              <div>
                <p className="mb-3 text-sm font-semibold text-slate-700">学校の特色・コース（複数選択可）</p>
                <div className="flex flex-wrap gap-2">
                  {FEATURES_OPTIONS.map((f) => (
                    <button key={f} type="button" onClick={() => toggleFeature(f)}
                      className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                        form.features.includes(f)
                          ? "border-indigo-400 bg-indigo-100 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}>
                      {form.features.includes(f) ? "✓ " : ""}{f}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">学習上の特色</span>
                <textarea value={form.academic_features} onChange={(e) => set("academic_features", e.target.value)}
                  rows={4}
                  placeholder="例：授業は予習・復習を重視した反転学習形式。英語は週6コマ、ネイティブ教員との少人数対話授業あり。ICT教育に力を入れており、全生徒にタブレットを貸与しています。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">部活動の特色</span>
                <textarea value={form.club_features} onChange={(e) => set("club_features", e.target.value)}
                  rows={4}
                  placeholder="例：吹奏楽部は全国大会常連。サッカー部・剣道部も全国レベル。文化系ではロボット部が高校生ロボコンで入賞実績あり。部活と勉強の両立を全力でサポートしています。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">進路実績</span>
                <textarea value={form.university_results} onChange={(e) => set("university_results", e.target.value)}
                  rows={4}
                  placeholder="例：東京大学3名、一橋大学5名、東北大学8名、早稲田大学25名、慶應義塾大学18名。医学部進学者も毎年5名前後。国公立大学合格率は例年80%以上を維持。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <div className="flex justify-between pt-2">
                <button onClick={back} className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-slate-700 hover:bg-slate-50">← 戻る</button>
                <button onClick={next} className="rounded-2xl bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-700">次へ →</button>
              </div>
            </div>
          )}

          {/* STEP 3: 雰囲気・PR・確認 */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 mb-2">雰囲気・おすすめポイント</h2>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">生徒の雰囲気</span>
                <textarea value={form.student_atmosphere} onChange={(e) => set("student_atmosphere", e.target.value)}
                  rows={4}
                  placeholder="例：明るく活発な生徒が多く、文武両道を体現しています。勉強も部活も全力で取り組む校風で、互いに切磋琢磨し合える仲間に出会えます。自分の意見をしっかり持ち、積極的に発言できる生徒が多いのが特徴です。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">先生方の雰囲気</span>
                <textarea value={form.teacher_atmosphere} onChange={(e) => set("teacher_atmosphere", e.target.value)}
                  rows={4}
                  placeholder="例：ベテランから若手まで、生徒一人ひとりに丁寧に向き合う先生方が揃っています。進路相談はいつでも歓迎。休み時間も積極的に生徒とコミュニケーションをとり、勉強の悩みも気軽に相談できる環境です。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-700">
                <span className="font-semibold">おすすめポイント</span>
                <textarea value={form.appeal_points} onChange={(e) => set("appeal_points", e.target.value)}
                  rows={4}
                  placeholder="例：「探究学習」に力を入れており、地域課題を生徒自身が発見・解決するプロジェクト型学習が充実。県内唯一のSSH指定校として、最先端の理科実験設備も整っています。"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>

              {/* 確認サマリー */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                <p className="font-semibold mb-3 text-slate-900">登録内容の確認</p>
                <div className="grid gap-1.5">
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">学校名</span><span className="font-medium">{form.name || "—"}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">種別</span><span>{form.school_type} / {form.school_level}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">所在地</span><span>{form.prefecture} {form.city}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">住所</span><span>{form.address || "—"}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">アクセス</span><span className="line-clamp-1">{form.access || "—"}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">偏差値</span><span>{form.deviation_value_min && form.deviation_value_max ? `${form.deviation_value_min}〜${form.deviation_value_max}` : "未入力"}</span></div>
                  <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">特色タグ</span><span>{form.features.length > 0 ? form.features.join("、") : "なし"}</span></div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={back} className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-slate-700 hover:bg-slate-50">← 戻る</button>
                <button onClick={submit} disabled={submitting}
                  className="rounded-2xl bg-indigo-600 px-8 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {submitting ? "送信中..." : "登録を申請する"}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          登録された情報は審査後に掲載されます。お問い合わせ: info@kyouiku-koubou.com
        </p>
      </div>
    </div>
  );
}
