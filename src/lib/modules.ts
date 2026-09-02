// 機能モジュール（オプション）の定義と有効/無効の解決。
// コア機能（生徒一覧・授業予定・来塾カレンダー・報告書・保護者管理・メッセージ・通知）は
// 常時ONのためここには含めない。ここに載っている機能だけが会社/グループでON/OFFできる。
//
// 有効判定の優先順位: グループ設定 > 会社設定(company) > 既定(defaultEnabled=true)。
// 既定は全てtrueなので、未設定でも従来どおり全機能が見える（無効化した塾だけ消える）。

export type ModuleKey =
  | "karte_ai"
  | "progress"
  | "collaboration"
  | "tests"
  | "shift"
  | "attendance"
  | "parent_portal"
  | "billing"
  | "class_stock";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  description: string;
  paths: string[];        // このモジュールに属するナビ項目のhref
  defaultEnabled: boolean;
};

export const MODULES: ModuleDef[] = [
  { key: "karte_ai", label: "学習指導AI（カルテ・3か月ビジョン）",
    description: "日次カルテ／3か月ビジョンの作成・共有", defaultEnabled: true,
    paths: ["/teacher/dashboard/karte", "/teacher/dashboard/karte-daily"] },
  { key: "progress", label: "教材進捗",
    description: "「何をどこまで」の教材進捗管理", defaultEnabled: true,
    paths: ["/teacher/dashboard/progress"] },
  { key: "collaboration", label: "講師連携",
    description: "気がかりな生徒の自動掲載・講師間タスク", defaultEnabled: true,
    paths: ["/teacher/dashboard/collaboration"] },
  { key: "tests", label: "テスト・診断",
    description: "診断テスト作成・多層診断・結果・分析", defaultEnabled: true,
    paths: ["/teacher/dashboard/tests", "/teacher/dashboard/diagnosis",
            "/teacher/dashboard/results", "/teacher/dashboard/analysis"] },
  { key: "shift", label: "シフト管理",
    description: "シフト希望・確定", defaultEnabled: true,
    paths: ["/teacher/dashboard/shifts", "/teacher/dashboard/shifts/admin"] },
  { key: "attendance", label: "勤怠・顔認証",
    description: "出退勤・出勤怠集計・顔登録", defaultEnabled: true,
    paths: ["/teacher/dashboard/attendance", "/teacher/dashboard/attendance/admin",
            "/teacher/dashboard/face-enrollment"] },
  { key: "parent_portal", label: "保護者ポータル・振替",
    description: "保護者からの振替リクエスト等", defaultEnabled: true,
    paths: ["/teacher/dashboard/reschedules"] },
  { key: "billing", label: "お月謝",
    description: "つなぐの契約から月謝を取り込み、保護者へ公開する", defaultEnabled: true,
    paths: ["/teacher/dashboard/billing"] },
  { key: "class_stock", label: "塾内経済（AC・自塾株）",
    description: "アカデミーコイン付与・貢献記録・報酬承認・自塾株の株価", defaultEnabled: false,
    paths: ["/teacher/dashboard/economy"] },
];

// href → moduleKey（載っていないhrefはコア＝常時表示）
export const HREF_MODULE: Record<string, ModuleKey> = Object.fromEntries(
  MODULES.flatMap((m) => m.paths.map((p) => [p, m.key] as const))
) as Record<string, ModuleKey>;

// パス → そのページが属するモジュール（コアページは null）。
// 子パス（/shifts/admin など）も親のモジュールとして扱う。
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const m of MODULES) {
    for (const p of m.paths) {
      if (pathname === p || pathname.startsWith(p + "/")) return m.key;
    }
  }
  return null;
}

export const COMPANY_SCOPE = "company";
export const groupScope = (groupName: string | null | undefined) =>
  groupName ? `group:${groupName}` : null;

export type ModuleSettingRow = { scope: string; module_key: string; enabled: boolean };

// 会社設定＋グループ設定から、そのグループでの各モジュールの有効/無効を解決する
export function resolveEnabled(
  rows: ModuleSettingRow[],
  groupName: string | null | undefined,
): Record<ModuleKey, boolean> {
  const company = new Map<string, boolean>();
  const group = new Map<string, boolean>();
  const gs = groupScope(groupName);
  for (const r of rows) {
    if (r.scope === COMPANY_SCOPE) company.set(r.module_key, r.enabled);
    else if (gs && r.scope === gs) group.set(r.module_key, r.enabled);
  }
  const out = {} as Record<ModuleKey, boolean>;
  for (const m of MODULES) {
    out[m.key] = group.has(m.key) ? group.get(m.key)!
      : company.has(m.key) ? company.get(m.key)!
      : m.defaultEnabled;
  }
  return out;
}
