"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { MODULES, COMPANY_SCOPE, groupScope, resolveEnabled, type ModuleSettingRow } from "@/lib/modules";

type GroupVal = "inherit" | "on" | "off";

export default function ModulesSettingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [rows, setRows] = useState<ModuleSettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    let r: string | null = null;
    if (session?.user?.email) {
      const { data } = await supabase.from("teachers").select("role").eq("email", session.user.email).maybeSingle();
      r = data?.role ?? null;
    }
    setRole(r);
    const [{ data: schools }, { data: ms }] = await Promise.all([
      supabase.from("schools").select("group_name"),
      supabase.from("module_settings").select("scope, module_key, enabled"),
    ]);
    const gs = Array.from(
      new Set(((schools ?? []) as { group_name: string | null }[]).map((s) => s.group_name).filter(Boolean) as string[])
    ).sort();
    setGroups(gs);
    setRows((ms as ModuleSettingRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyEnabled = (key: string) => {
    const row = rows.find((r) => r.scope === COMPANY_SCOPE && r.module_key === key);
    return row ? row.enabled : MODULES.find((m) => m.key === key)!.defaultEnabled;
  };
  const groupVal = (group: string, key: string): GroupVal => {
    const row = rows.find((r) => r.scope === groupScope(group) && r.module_key === key);
    return row ? (row.enabled ? "on" : "off") : "inherit";
  };

  const setCompany = async (key: string, enabled: boolean) => {
    const { error } = await supabase.from("module_settings")
      .upsert({ scope: COMPANY_SCOPE, module_key: key, enabled }, { onConflict: "scope,module_key" });
    if (error) { showToast("保存に失敗: " + error.message, "error"); return; }
    setRows((prev) => [...prev.filter((r) => !(r.scope === COMPANY_SCOPE && r.module_key === key)),
                       { scope: COMPANY_SCOPE, module_key: key, enabled }]);
    showToast("保存しました", "success");
  };

  const setGroup = async (group: string, key: string, v: GroupVal) => {
    const scope = groupScope(group)!;
    if (v === "inherit") {
      const { error } = await supabase.from("module_settings").delete().eq("scope", scope).eq("module_key", key);
      if (error) { showToast("保存に失敗: " + error.message, "error"); return; }
      setRows((prev) => prev.filter((r) => !(r.scope === scope && r.module_key === key)));
    } else {
      const enabled = v === "on";
      const { error } = await supabase.from("module_settings")
        .upsert({ scope, module_key: key, enabled }, { onConflict: "scope,module_key" });
      if (error) { showToast("保存に失敗: " + error.message, "error"); return; }
      setRows((prev) => [...prev.filter((r) => !(r.scope === scope && r.module_key === key)),
                         { scope, module_key: key, enabled }]);
    }
    showToast("保存しました", "success");
  };

  if (loading) {
    return <div className="px-6 py-10 text-slate-400">読み込み中...</div>;
  }
  if (role !== "admin") {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-3xl mb-2">🔒</p>
          <p className="font-semibold text-amber-900">この画面は管理者のみ利用できます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-950">モジュール設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            会社（全体の既定）とグループごとに、使う機能をON/OFFできます。OFFにした所ではその機能がナビ・画面から消えます。
            <br />生徒・授業・報告書・連絡などの基本機能は常に有効です。
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left font-semibold text-slate-700">機能</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">会社（既定）</th>
                {groups.map((g) => (
                  <th key={g} className="px-4 py-3 text-center font-semibold text-slate-700">{g}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MODULES.map((m) => (
                <tr key={m.key} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{m.label}</p>
                    <p className="text-xs text-slate-400">{m.description}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={companyEnabled(m.key)}
                        onChange={(e) => setCompany(m.key, e.target.checked)}
                        className="h-5 w-5 accent-indigo-600" />
                      <span className={`text-xs font-semibold ${companyEnabled(m.key) ? "text-indigo-600" : "text-slate-400"}`}>
                        {companyEnabled(m.key) ? "ON" : "OFF"}
                      </span>
                    </label>
                  </td>
                  {groups.map((g) => {
                    const eff = resolveEnabled(rows, g)[m.key];
                    const gv = groupVal(g, m.key);
                    return (
                      <td key={g} className="px-4 py-3 text-center">
                        <select value={gv} onChange={(e) => setGroup(g, m.key, e.target.value as GroupVal)}
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold outline-none ${
                            gv === "inherit" ? "border-slate-200 bg-white text-slate-500"
                            : gv === "on" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-rose-300 bg-rose-50 text-rose-700"
                          }`}>
                          <option value="inherit">継承</option>
                          <option value="on">ON</option>
                          <option value="off">OFF</option>
                        </select>
                        <p className={`mt-1 text-[10px] ${eff ? "text-emerald-600" : "text-rose-500"}`}>
                          {eff ? "表示中" : "非表示"}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {groups.length === 0 && (
          <p className="mt-4 text-sm text-slate-400">
            ※ グループ（schools.group_name）が未設定のため、会社（全体の既定）のみ表示しています。
          </p>
        )}
      </div>
    </div>
  );
}
