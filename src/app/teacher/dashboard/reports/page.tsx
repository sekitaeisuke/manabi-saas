"use client";

import Link from "next/link";
import { useState } from "react";

const reportTemplate = {
  sections: [
    { id: "intro", label: "はじめに", placeholder: "お子さまの学習状況についての総評" },
    { id: "achievement", label: "学習成果", placeholder: "テスト結果や改善点" },
    { id: "issues", label: "課題と改善策", placeholder: "現在の課題と今後の指導方針" },
    { id: "parent", label: "保護者へのお願い", placeholder: "家庭学習への協力依頼など" },
  ],
};

export default function TeacherReportsPage() {
  const [studentName, setStudentName] = useState("");
  const [reportData, setReportData] = useState<Record<string, string>>({
    intro: "",
    achievement: "",
    issues: "",
    parent: "",
  });
  const [savedReports, setSavedReports] = useState<Array<{id: number, name: string, data: Record<string, string>}>>([]);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSectionChange = (sectionId: string, value: string) => {
    setReportData({ ...reportData, [sectionId]: value });
  };

  const saveReport = () => {
    if (!studentName) {
      alert("生徒名を入力してください");
      return;
    }
    const newReport = {
      id: Date.now(),
      name: studentName,
      data: reportData,
    };
    setSavedReports([...savedReports, newReport]);
    setStudentName("");
    setReportData({ intro: "", achievement: "", issues: "", parent: "" });
    alert(`${studentName} の報告書を保存しました`);
  };

  const deleteReport = (id: number) => {
    setSavedReports(savedReports.filter((r) => r.id !== id));
  };

  const downloadReport = (report: typeof savedReports[0]) => {
    const text = `${report.name} 様へ\n\n${reportTemplate.sections.map((sec) => `【${sec.label}】\n${report.data[sec.id]}`).join("\n\n")}`;
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", `report_${report.name}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">報告書作成</h1>
            <p className="mt-2 text-slate-600">保護者向けの報告書をここから作成します。</p>
          </div>
          <Link href="/teacher/dashboard" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-950 transition hover:bg-slate-50">
            ダッシュボードに戻る
          </Link>
        </div>

        {!previewMode ? (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <label className="grid gap-2 text-sm text-slate-700">
                  <p className="font-semibold">生徒名</p>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="例：田中太郎"
                  />
                </label>
              </section>

              {reportTemplate.sections.map((section) => (
                <section key={section.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                  <label className="grid gap-2 text-sm text-slate-700">
                    <p className="font-semibold">{section.label}</p>
                    <textarea
                      value={reportData[section.id]}
                      onChange={(e) => handleSectionChange(section.id, e.target.value)}
                      className="min-h-[100px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-400"
                      placeholder={section.placeholder}
                    />
                  </label>
                </section>
              ))}

              <div className="flex gap-3">
                <button
                  onClick={saveReport}
                  className="flex-1 rounded-2xl bg-slate-950 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
                >
                  報告書を保存
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-50"
                >
                  プレビュー
                </button>
              </div>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm h-fit">
              <h3 className="font-semibold text-slate-950 mb-4">作成済み報告書</h3>
              {savedReports.length > 0 ? (
                <div className="space-y-3">
                  {savedReports.map((report) => (
                    <div key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <p className="font-semibold text-sm text-slate-950">{report.name}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => downloadReport(report)}
                          className="flex-1 text-xs text-blue-600 transition hover:text-blue-700"
                        >
                          ダウンロード
                        </button>
                        <button
                          onClick={() => deleteReport(report.id)}
                          className="flex-1 text-xs text-red-600 transition hover:text-red-700"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">作成済みの報告書はありません</p>
              )}
            </aside>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-3xl">
            <h2 className="text-2xl font-bold text-slate-950 mb-6">{studentName} 様へ</h2>
            <div className="space-y-8 text-slate-700 leading-8">
              {reportTemplate.sections.map((section) => (
                <div key={section.id}>
                  <h3 className="font-semibold text-slate-950 mb-2">【{section.label}】</h3>
                  <p className="whitespace-pre-wrap">{reportData[section.id]}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPreviewMode(false)}
              className="mt-8 w-full rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-50"
            >
              編集に戻る
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
