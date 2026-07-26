# 塾内経済（アカデミーコイン・自塾株）

## Phase 2：AC獲得の自動化 ＋ 紹介 ＋ 購入ショップ（`class-stock-earn-setup.sql`）

**目的**：AC の付与を講師の手入力から**自動化**する。既存シグナルを直近N日窓で読み、
`ac_award_once`（source key で冪等）で二重付与なく付与する。

| ルール(event_key) | 既定pt | 自動ソース | 冪等キー |
|---|---|---|---|
| attend | 3 | `student_room_logs`(type='entry'・`recorded_at`) | `attend:{student}:{date}`（1日1回） |
| testpass | 10 | `lesson_reports`(report_source='test', percentage≥合格ライン80) | `testpass:{report_id}` |
| manabi | 1 | `textbook_progress` | `manabi:{student}:{date}`（1日1回） |
| report | 0(既定OFF) | `lesson_reports` | `report:{report_id}` |
| clean | 1 | kiosk「🧹掃除した」ボタン（顔認証直後・当日1回） | `clean:{student}:{date}` |
| refer | 1000 | 紹介(講師確認) | `refer:{referral_id}` |
| refereed | 100 | 紹介(講師確認)・友人が生徒化後 | `refereed:{referral_id}` |

- pt・合格ライン・ON/OFF は `ac_rules` 表で編集可（講師画面）。コード直書きにしない。
- 冪等：`ac_transactions(source_type,source_id)` の一意索引＋`ac_award_once`(ON CONFLICT DO NOTHING)。
  何度スキャンしても増えない。
- 実行：`POST /api/economy/scan-earnings`（内部secret or admin・`?dry=1`でプレビュー）。
  講師 `/teacher/dashboard/economy` の「獲得ルール」→「今すぐ自動付与」から手動実行可。
- **日次cron推奨**（例 毎晩23:30）に scan-earnings を x-internal-secret で。株価週次計算とは別枠。
- kiosk 掃除：`POST /api/economy/kiosk-action`（匿名端末だが「直近15分に顔認証入室あり」を要件化）。
- 紹介(講師確認型)：`referral_rewards`＋`/api/economy/referral`（create→enroll→link）。
- 購入ショップ：`reward_items.category`（goods/card/pass/online/other）を追加。承認済み→
  「受け渡し完了(completed)」を `/api/economy/exchange/approve`（{complete:true}）で。seedに
  グッズ/紹介カード/1週間通い放題/オンライン授業。

> セットアップ：Supabase SQL Editor で **`class-stock-earn-setup.sql`**（Phase1実行済みが前提・冪等）。

---

# 塾内経済（アカデミーコイン・自塾株）Phase 1

自塾成長連動型「教室株式」× 塾内エコノミー の第一段（**実課金なし**）。
アカデミーコイン（AC）は現金価値を持たない塾内ポイント。生徒の学習・貢献・成長で
「自塾株（CLASS_STOCK）」の株価が毎週動き、生徒は AC で自塾株を売買できる。

> Stripe による従量課金・模試手数料・紹介手数料、他塾授業の相互販売（特許モジュール）は
> **本フェーズには含めない**（外向き・金銭・法務が絡むため別フェーズ）。

## 1. セットアップ（初回のみ）

Supabase SQL Editor で以下を実行:

```
class-stock-setup.sql
```

作られるもの:

| 種別 | 名前 |
|---|---|
| テーブル | `student_wallets` / `ac_transactions` / `class_stock_history` / `class_stock_holdings` / `contribution_events` / `check_ins` / `reward_items` / `reward_exchanges` |
| schools 追加列 | `current_stock_price`（既定1000）/ `shares_outstanding` |
| ヘルパー | `auth_student_id()` |
| RPC（原子的・service_role専用） | `ac_checkin` / `buy_class_stock` / `sell_class_stock` / `ac_award` / `redeem_reward` / `decide_reward_exchange` |

**重要**: ミューテーション RPC は `SECURITY DEFINER`。SQL 末尾で PUBLIC/anon/authenticated から
EXECUTE を剥奪し `service_role` のみに許可している。金額の変わる操作は必ず API ルート
（`requireStudent` / `requireTeacher` で認可）を通り、service role で RPC を呼ぶ設計。
生徒がブラウザから直接 RPC を叩いて他人のウォレットを操作することはできない。

モジュールは既定 **OFF**（`class_stock`, defaultEnabled:false）。使う会社/グループは
`/teacher/dashboard/modules`（管理者）または `module_settings` で ON にする。

## 2. 画面

- **生徒**: `/student/dashboard` の「経済（AC・自塾株）」タブ
  （資産サマリー・チェックイン・株価チャート・売買・報酬交換・AC履歴）
- **講師**: `/teacher/dashboard/economy`
  （株価一覧＋週次計算プレビュー/更新・AC付与/貢献記録・交換承認・報酬マスタ・ウォレット一覧）

## 3. 株価アルゴリズム（週次 Cron）

`src/lib/classStock.ts`（純粋関数）に集約:

```
P_new = P_current × (1 + Δstudy + Δcontrib + Δgrowth − Δpenalty)
  Δstudy   = (学習量 + テスト80点以上×2) / (在籍数×10) × 0.05
  Δcontrib = 貢献実行数 / 在籍数 × 0.03
  Δgrowth  = 新規入塾数 × 0.04
  Δpenalty = 遅刻・宿題未提出の割合 × 0.05
```

安全装置: 1週間の変動は ±20% に制限（`MAX_WEEKLY_MOVE`）、株価下限100（`STOCK_FLOOR`）。
投資はウォレット総額の50%まで（`ALLOCATION_CAP` / RPC 内で強制）。

### 集計のデータ源（既存テーブルを流用・防御的に0へ倒す）

| 成分 | 源 |
|---|---|
| 学習量 | `textbook_progress`（直近7日の入力数）＋ `daily_tasks`（done=true, task_date 7日以内） |
| テスト80+ | `lesson_reports`（percentage>=80, 7日以内） |
| 貢献 | `contribution_events`（polarity=positive, 7日以内） |
| 成長 | `students.created_at` が7日以内 |
| ペナルティ | `contribution_events`（polarity=negative）/ 在籍数（上限1.0） |

取得に失敗した成分は 0 とみなして計算を止めない。

### 実行

```
POST /api/cron/calculate-stock            # 全校舎の株価を算出・更新
POST /api/cron/calculate-stock?dry=1      # 保存せず結果だけ返す（プレビュー）
```

認可は **x-internal-secret（`INTERNAL_API_SECRET`）** または **管理者ログイン**。
講師画面の「週次計算プレビュー / いま更新」から手動実行できる。

### スケジュール（毎週日曜 23:59）

いずれかで叩く:
- Vercel Cron → `POST /api/cron/calculate-stock` に `x-internal-secret` ヘッダ付与
- ai-system 側の automode / PC タスクから内部シークレット付きで curl

## 4. AC の入口（獲得）

| 種別(type) | 入口 |
|---|---|
| `EARN_CHECKIN` | 生徒がチェックイン（1日1回・`ac_checkin`） |
| `EARN_CONTRIBUTION` | 講師が貢献記録＋付与（`/api/economy/award` モードA） |
| `EARN_TASK` / `EARN_TEST` / `ADMIN_ADJUSTMENT` | 講師が直接付与（モードB・負値=調整） |
| `INVEST_*` | 自塾株の売買（`/api/stock/trade`） |
| `EXCHANGE_REWARD` | 報酬交換（`redeem_reward`・承認待ち→講師承認/却下） |

## 5. API 一覧

```
POST /api/economy/checkin              本日のチェックイン（本人）
POST /api/stock/trade                  自塾株の買付/売却（本人・50%制限はRPC内）
GET  /api/stock/chart                  株価推移（?school_id 省略時は本人の所属校）
GET  /api/economy/reward               交換可能な報酬一覧（本人）
POST /api/economy/reward               報酬交換申請（本人・AC前引き）
POST /api/economy/award                AC付与/貢献記録（講師）
POST /api/economy/exchange/approve     交換の承認/却下＝返金（講師）
POST /api/cron/calculate-stock         週次株価計算（内部シークレット or 管理者）
```
