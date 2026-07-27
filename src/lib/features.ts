// 画面に出す機能のフラグ（不要な機能を一時的に隠す。true に戻せば復活）。
//   dailyKarte=false … 「カルテ（日次の現在地スナップショット）」を隠す。
//   北極星＝3か月ビジョン と、そこから出る「今日やること(TODO)」は常時表示。
export const FEATURES = {
  dailyKarte: false,
  // 授業予定・振替の別メニュー。false=来塾カレンダーに統合したので隠す（カレンダーに授業追加＋振替パネルあり）。
  separateSchedulePages: false,
  // 通知ログのナビ項目。false=日常不要なので「連絡」から隠す（失敗はダッシュボードのバナー→URLで確認可）。
  notificationLog: false,
  // 多層診断ページの簡易「生徒を追加」。false=二重登録・表記ゆれ防止のため無効（登録は生徒一覧に一本化）。
  diagnosisAddStudent: false,
  // テスト作成の「診断分析多層型テスト」タイプ。false=診断テストの作成は「多層診断」に一本化し、テスト作成は授業確認テスト専用に。
  testDiagnosticType: false,
} as const;
