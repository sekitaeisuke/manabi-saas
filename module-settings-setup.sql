-- module-settings-setup.sql
-- 会社(全体既定)／グループ単位で「機能モジュール(オプション)」をON/OFFする設定。
-- Supabase の SQL エディタで実行してください。
--
-- scope:
--   'company'            … 会社全体の既定
--   'group:<group_name>' … グループ(schools.group_name)ごとの上書き
-- 未設定なら各モジュールの既定(true)＝従来どおり全機能が見える。無効化した所だけ消える。

CREATE TABLE IF NOT EXISTS module_settings (
  scope       text NOT NULL,                       -- 'company' | 'group:<group_name>'
  module_key  text NOT NULL,                        -- @/lib/modules の ModuleKey
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, module_key)
);

ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

-- 参照: 講師なら可（ナビの出し分けに使う）
DROP POLICY IF EXISTS module_settings_select ON module_settings;
CREATE POLICY module_settings_select ON module_settings FOR SELECT
  USING (auth_is_teacher());

-- 追加・更新・削除: 管理者(admin)のみ（既存ヘルパー auth_teacher_role() に合わせる）
DROP POLICY IF EXISTS module_settings_admin ON module_settings;
CREATE POLICY module_settings_admin ON module_settings FOR ALL
  USING (auth_teacher_role() = 'admin')
  WITH CHECK (auth_teacher_role() = 'admin');
