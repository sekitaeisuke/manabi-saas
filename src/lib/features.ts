// 画面に出す機能のフラグ（不要な機能を一時的に隠す。true に戻せば復活）。
//   dailyKarte=false … 「カルテ（日次の現在地スナップショット）」を隠す。
//   北極星＝3か月ビジョン と、そこから出る「今日やること(TODO)」は常時表示。
export const FEATURES = {
  dailyKarte: false,
} as const;
