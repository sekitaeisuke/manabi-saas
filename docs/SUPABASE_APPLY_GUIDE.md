# Supabase SQL 適用手順書（セキュリティ/整合性パッチ）

対象ファイル: `rls-hardening.sql`, `data-integrity.sql`
作業場所: **Supabase 管理画面の SQL Editor**（ブラウザのみ。ローカル環境・Node.js 不要）

> SQL Editor は postgres/service_role 権限で動くため RLS をバイパスします。
> つまりポリシー適用や admin 投入はここから確実に実行できます。

---

## ステップ 0：事前確認（最重要）

`rls-hardening.sql` は **teachers テーブルへの書き込みを admin だけに制限**します。
適用後に「ブラウザから講師を追加」できるよう、**先に自分が admin であること**を確認します。

1. Supabase → 左メニュー **SQL Editor** → **New query**
2. 以下を実行して自分の role を確認：

```sql
select email, role from teachers order by role;
```

3. 自分（`sekitaeisuke@kyouiku-koubou.com`）が `admin` でなければ昇格：

```sql
update teachers set role = 'admin'
where email = 'sekitaeisuke@kyouiku-koubou.com';
```

4. もし teachers に自分の行が無ければ追加（`school_id` は任意）：

```sql
insert into teachers (name, email, role)
values ('関田英介', 'sekitaeisuke@kyouiku-koubou.com', 'admin');
```

> ✅ ここで `admin` が1人以上いることを必ず確認してから次へ。

---

## ステップ 1：（推奨）バックアップの確認

- Supabase は自動で日次バックアップを取っています（Project Settings → Database → Backups）。
- 念のため、これから触るテーブルの行数を控えておくと安心：

```sql
select
  (select count(*) from teachers)                as teachers,
  (select count(*) from students)                as students,
  (select count(*) from results)                 as results,
  (select count(*) from questionnaire_responses) as qr,
  (select count(*) from learning_plans)          as plans;
```

---

## ステップ 2：RLS 強化を適用（`rls-hardening.sql`）

1. リポジトリの **`rls-hardening.sql` の中身を全文コピー**
   （GitHub の manabi-saas → ファイルを開く → Raw でコピーが楽）
2. SQL Editor の **New query** に貼り付け
3. 右下 **Run** を押す
4. エラーが出ず `Success` になればOK
   - もし `policy ... does not exist` 等が出ても、`DROP POLICY IF EXISTS` を使っているため基本は無視可。
   - `relation "xxx" does not exist`（テーブルが無い）が出た場合は、その STEP を飛ばして残りを実行してOK（該当機能を使っていないだけ）。

### 適用後の動作確認（RLSが効いているか）

A) **講師として**：いつものブラウザで `/teacher/dashboard` にログイン →
   生徒一覧・カルテ・診断が**今まで通り表示される**こと。

B) **生徒として権限が締まったか**（任意・推奨）：
   生徒ログイン（`生徒ID@students.local`）で入った状態でブラウザの開発者ツール Console を開き、
   他人のデータが読めない／teachers に書けないことを確認できます。
   面倒なら A) が問題なければ実用上OKです。

---

## ステップ 3：重複チェック → 整合性制約を適用（`data-integrity.sql`）

UNIQUE 制約は**既存の重複があると作成に失敗**します。先に重複を確認します。

1. 重複チェック：

```sql
-- results の重複（同一セッション×生徒名）
select session_id, student_name, count(*)
from results group by 1, 2 having count(*) > 1;

-- answers の重複（同一セッション×生徒名×設問）
select session_id, student_name, question_id, count(*)
from answers group by 1, 2, 3 having count(*) > 1;
```

2. **0件なら** → そのまま `data-integrity.sql` を貼って Run。

3. **重複があった場合** → 各グループで1行だけ残して削除（古い ctid を1つ残す例）：

```sql
-- results：重複を1行だけ残して削除
delete from results a using results b
where a.ctid < b.ctid
  and a.session_id = b.session_id
  and a.student_name = b.student_name;

-- answers：重複を1行だけ残して削除
delete from answers a using answers b
where a.ctid < b.ctid
  and a.session_id = b.session_id
  and a.student_name = b.student_name
  and a.question_id = b.question_id;
```

   その後、再度ステップ3-1で0件を確認 → `data-integrity.sql` を Run。

---

## ステップ 4：デプロイ確認

- コードは master に push 済み。Vercel 連携なら**自動デプロイ**されます。
- Vercel ダッシュボードで最新デプロイが `Ready` になっていることを確認。

---

## もし不具合が出たら（ロールバック）

RLS で意図せずアクセスが詰まった場合、SQL Editor から該当ポリシーを緩められます。
例：いったん旧来の「ログイン済みなら全員」に戻す（応急処置）：

```sql
-- 例: students の読み取りを一時的に全認証ユーザーに戻す
drop policy if exists "students_select" on students;
create policy "students_select" on students for select
  using (auth.uid() is not null);
```

> 応急処置後、原因（どのテーブル/操作が詰まったか）を共有いただければ、
> 正しいポリシーに直します。

---

## 適用順チェックリスト

- [ ] ステップ0：admin が1人以上いることを確認
- [ ] ステップ2：`rls-hardening.sql` を Run → 講師ダッシュボードが正常表示
- [ ] ステップ3：重複0件を確認 →（必要なら重複削除）→ `data-integrity.sql` を Run
- [ ] 環境変数 `SUPABASE_SERVICE_ROLE_KEY` と `INTERNAL_API_SECRET` を設定（下記）

---

## APIルートの認証ガード（2026-06-16 全ルート対応完了）

全ての `/api/*` ルートに認証チェックを入れた。

- 講師専用ルート … `requireTeacher`（`src/lib/apiAuth.ts`）。クライアントは `authFetch`（`src/lib/authFetch.ts`）で Bearer トークンを自動付与。
- 管理者専用（`shifts/confirm` `shifts/ai-adjust` `shifts/ai-events`）… `requireAdmin`。
- `notify` … ログイン済みユーザー（保護者/生徒/講師）または内部呼び出しのみ（`requireUser` / `isInternalCall`）。
- 公開のまま据え置き（設計上ログイン不要）… `test/submit`（生徒のURLトークン受験）、`schools/register`（公開フォーム）。url_token照合・レート制限の追加を推奨。
- 認証なしでダッシュボードに入れた `login/teacher` は削除済み。

### 必要な環境変数（**未設定だと壊れる**）

```
# 全ての講師用API（requireTeacher が teachers を service role で照合）で必須。
# 未設定だと講師ダッシュボードのAPIが全て 401。
SUPABASE_SERVICE_ROLE_KEY=（Project Settings → API → service_role キー）

# お知らせ一斉通知（announcement → notify のサーバ間呼び出し）用の内部シークレット。
# 任意のランダム長文字列。未設定だと一斉通知だけが静かに失敗する。
INTERNAL_API_SECRET=（例: openssl rand -hex 32 の出力）
```

> どちらも秘密鍵。`NEXT_PUBLIC_` を付けない／クライアントに出さないこと。
- [ ] ステップ4：Vercel デプロイ `Ready`
