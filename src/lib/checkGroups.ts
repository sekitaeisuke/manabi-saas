// つなぐ準拠「学習スキル17項目」の単一定義。
// 報告書(lesson_reports.checked_items)の手動チェックUIと、17項目AI推定APIの両方で共有する。
// ここを唯一の真実とし、各所での重複定義を避ける。

export type CheckGroup = {
  label: string;
  color: string; // 報告書UIのグループ色（Tailwind）
  items: readonly string[];
};

export const CHECK_GROUPS: readonly CheckGroup[] = [
  {
    label: "成果物",
    color: "border-indigo-200 bg-indigo-50",
    items: [
      "1日の内容が終えられる",
      "時間通りに進める",
      "暗算・暗記がスムーズ",
      "苦手単元も取り組める",
      "問題量が多い",
    ],
  },
  {
    label: "読む",
    color: "border-blue-200 bg-blue-50",
    items: ["問題を読む／わかる", "解説を読む／わかる", "ノートを読む／わかる"],
  },
  {
    label: "書く",
    color: "border-green-200 bg-green-50",
    items: ["ノートを使う", "途中式を書く", "言葉を書いて練習する"],
  },
  {
    label: "聞く",
    color: "border-amber-200 bg-amber-50",
    items: ["質問・相談する", "授業をわかるまで", "テスト情報収集"],
  },
  {
    label: "考える",
    color: "border-purple-200 bg-purple-50",
    items: ["誤答原因がわかる", "教科バランス良い", "解き直しを実践"],
  },
] as const;

// 17項目のフラット配列（順序は上記の並び）
export const CHECK_ITEMS: string[] = CHECK_GROUPS.flatMap((g) => [...g.items]);

// 学力診断スコアが、どのグループの推定根拠になりやすいかの対応（AI推定プロンプト用の補助）
export const GROUP_SCORE_HINT: Record<string, string> = {
  成果物: "学習習慣・スキル・正答率",
  読む: "言語力・正答率",
  書く: "言語力・学習法",
  聞く: "学習習慣（授業態度）",
  考える: "学習法・正答率",
};
