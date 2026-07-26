// 自塾株（CLASS_STOCK）算出アルゴリズム ── 純粋関数のみ（副作用なし・単体テスト可能）。
//
//   P_new = P_current × (1 + Δstudy + Δcontrib + Δgrowth − Δpenalty)
//
//   毎週日曜 23:59 の Cron（/api/cron/calculate-stock）が校舎ごとに週次集計を作り、
//   この関数に渡して次週の「始値株価」を得る。集計の生データ取得は API 側の責務、
//   ここは「数値 → 数値」の計算だけに閉じる（テストしやすく・仕様を1か所に集約）。
//
//   企画書の係数:
//     Δstudy   = (総学習量 + テスト80点以上数×2) / (在籍数×10) × 0.05
//     Δcontrib = (清掃・消毒・ルール遵守の実行数)   / 在籍数     × 0.03
//     Δgrowth  = (今週の体験・新規入塾数)                        × 0.04
//     Δpenalty = (無断遅刻・宿題未提出の割合[0..1])              × 0.05

/** 週次の集計インプット（すべて「その週の合計/割合」）。 */
export type WeeklyAggregate = {
  studentCount: number;      // 在籍生徒数
  studyUnits: number;        // 総学習量（進捗入力＋完了課題などの活動量）
  tests80plus: number;       // テスト80点以上の件数
  contributions: number;     // 清掃・消毒・ルール遵守などの貢献実行数
  newStudents: number;       // 今週の体験・新規入塾数
  penaltyRatio: number;      // 無断遅刻・宿題未提出の割合（0..1）
};

/** 4成分の内訳（履歴 detail に保存し、UI で内訳表示する）。 */
export type StockDeltas = {
  study: number;
  contrib: number;
  growth: number;
  penalty: number;
};

export type StockCalcResult = {
  prevPrice: number;
  newPrice: number;
  deltas: StockDeltas;
  changeRate: number;        // (newPrice - prevPrice) / prevPrice
};

// 安全パラメータ
export const STOCK_FLOOR = 100;          // 株価の下限（0 に張り付かせない）
export const MAX_WEEKLY_MOVE = 0.2;       // 1週間の変動幅を ±20% に制限（暴走防止）
export const ALLOCATION_CAP = 0.5;        // 投資はウォレットの 50% まで（破産防止）

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** 週次集計から4成分のΔを計算する。 */
export function computeDeltas(a: WeeklyAggregate): StockDeltas {
  const students = Math.max(1, a.studentCount); // 0除算回避
  const study = ((a.studyUnits + a.tests80plus * 2) / (students * 10)) * 0.05;
  const contrib = (a.contributions / students) * 0.03;
  const growth = a.newStudents * 0.04;
  const penalty = clamp(a.penaltyRatio, 0, 1) * 0.05;
  return { study, contrib, growth, penalty };
}

/** 現在株価と週次集計から次週の株価を算出する。 */
export function computeNewPrice(prevPrice: number, a: WeeklyAggregate): StockCalcResult {
  const deltas = computeDeltas(a);
  const rawRate = deltas.study + deltas.contrib + deltas.growth - deltas.penalty;
  const rate = clamp(rawRate, -MAX_WEEKLY_MOVE, MAX_WEEKLY_MOVE);
  const newPrice = Math.max(STOCK_FLOOR, Math.round(prevPrice * (1 + rate)));
  return {
    prevPrice,
    newPrice,
    deltas,
    changeRate: prevPrice > 0 ? (newPrice - prevPrice) / prevPrice : 0,
  };
}

/**
 * 破産防止の 50% アロケーション上限。
 * 「投資運用中(locked)」がウォレット総額(balance+locked)の50%を超えないよう、
 * これ以上いくら投資できるか（AC）を返す。買付では総額は不変なので単純式。
 */
export function maxInvestableAC(balance: number, locked: number): number {
  const total = balance + locked;
  const cap = Math.floor(total * ALLOCATION_CAP);
  return Math.max(0, Math.min(balance, cap - locked));
}

/** 現在株価で、あと何株まで買えるか（50%制限＋残高の両方を満たす最大株数）。 */
export function maxBuyableShares(balance: number, locked: number, price: number): number {
  if (price <= 0) return 0;
  return Math.floor(maxInvestableAC(balance, locked) / price);
}

/** 保有の評価額・損益（現在株価ベース）。 */
export function holdingValuation(shares: number, avgPrice: number, currentPrice: number) {
  const marketValue = shares * currentPrice;
  const costBasis = shares * avgPrice;
  return {
    marketValue,
    costBasis,
    unrealizedPL: marketValue - costBasis,
    plRate: costBasis > 0 ? (marketValue - costBasis) / costBasis : 0,
  };
}
