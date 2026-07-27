// 塾内経済の「出す機能」を1か所で絞るフラグ（リーン運用）。
// false にすると講師/生徒の画面から隠れる。コードは残すので true に戻せば復活。
//   リーン構成 = 自動獲得(スキャン) ＋ 商店(交換・承認) ＋ 自塾株の売買 だけ。
//   下記は当面 OFF（配当・ライバルは DB 側でも無効化：ac_rules 'dividend' / stock_benchmarks.active）。
export const ECON = {
  ranking: false,      // 教室ランキング＋ライバル塾の比較
  supportMeter: false, // 「教室の応援AC」メーター
  voice: false,        // 株主の声（意見ボックス）
  referral: false,     // 友達紹介（カード・講師確認）
  dividend: false,     // 配当の案内表示（実配当は ac_rules 'dividend' を無効化）
} as const;
