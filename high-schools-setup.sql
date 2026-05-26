-- ============================================================
-- 高校データベース & メーリングリスト セットアップ
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ============================================================
-- STEP 1: high_schools（高校・中学校情報）
-- ============================================================
CREATE TABLE IF NOT EXISTS high_schools (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  school_type           text NOT NULL CHECK (school_type IN ('公立', '私立', '国立')),
  school_level          text NOT NULL DEFAULT '高校' CHECK (school_level IN ('高校', '中高一貫', '中学')),
  prefecture            text NOT NULL,
  city                  text,
  address               text,
  phone                 text,
  email                 text,
  website               text,
  deviation_value_min   int  CHECK (deviation_value_min BETWEEN 25 AND 80),
  deviation_value_max   int  CHECK (deviation_value_max BETWEEN 25 AND 80),
  admission_subjects    text[],
  features              text[],
  programs              text[],
  description           text,
  appeal_points         text,
  university_results    text,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  registered_by_school  boolean NOT NULL DEFAULT false,
  registration_token    text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hs_prefecture  ON high_schools(prefecture);
CREATE INDEX IF NOT EXISTS idx_hs_type        ON high_schools(school_type);
CREATE INDEX IF NOT EXISTS idx_hs_status      ON high_schools(status);
CREATE INDEX IF NOT EXISTS idx_hs_deviation   ON high_schools(deviation_value_min, deviation_value_max);

-- ============================================================
-- STEP 2: school_mailing_list（アウトリーチ管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS school_mailing_list (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name      text NOT NULL,
  school_type      text CHECK (school_type IN ('公立', '私立', '国立')),
  school_level     text DEFAULT '高校',
  prefecture       text,
  city             text,
  email            text,
  contact_status   text NOT NULL DEFAULT '未送信'
                    CHECK (contact_status IN ('未送信', '送信済', '登録済', '辞退')),
  high_school_id   uuid REFERENCES high_schools(id) ON DELETE SET NULL,
  sent_at          timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_prefecture ON school_mailing_list(prefecture);
CREATE INDEX IF NOT EXISTS idx_ml_status     ON school_mailing_list(contact_status);

-- ============================================================
-- STEP 3: RLS
-- ============================================================
ALTER TABLE high_schools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_mailing_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read active schools" ON high_schools
  FOR SELECT USING (status = 'active');

CREATE POLICY "teachers read all schools" ON high_schools
  FOR SELECT USING (auth_is_teacher());

CREATE POLICY "teachers manage schools" ON high_schools
  FOR ALL USING (auth_is_teacher());

CREATE POLICY "teachers manage mailing list" ON school_mailing_list
  FOR ALL USING (auth_is_teacher());

-- ============================================================
-- STEP 4: 初期データ — 東京都（公立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('都立日比谷高等学校',    '公立','高校','東京都','千代田区',72,78,ARRAY['進学重点校','SSH指定校'],                    'active'),
  ('都立西高等学校',        '公立','高校','東京都','杉並区',  70,76,ARRAY['進学重点校'],                              'active'),
  ('都立国立高等学校',      '公立','高校','東京都','国立市',  69,74,ARRAY['進学重点校','文武両道'],                    'active'),
  ('都立戸山高等学校',      '公立','高校','東京都','新宿区',  66,71,ARRAY['進学重点校','理数教育'],                    'active'),
  ('都立青山高等学校',      '公立','高校','東京都','渋谷区',  64,69,ARRAY['進学指導推進校','国際交流'],                'active'),
  ('都立新宿高等学校',      '公立','高校','東京都','新宿区',  64,68,ARRAY['進学指導推進校'],                          'active'),
  ('都立八王子東高等学校',  '公立','高校','東京都','八王子市',64,68,ARRAY['進学指導推進校','理数教育'],                'active'),
  ('都立立川高等学校',      '公立','高校','東京都','立川市',  63,67,ARRAY['進学指導推進校','文武両道'],                'active'),
  ('都立小山台高等学校',    '公立','高校','東京都','品川区',  61,66,ARRAY['進学指導推進校'],                          'active'),
  ('都立駒場高等学校',      '公立','高校','東京都','目黒区',  60,64,ARRAY['進学指導特別推進校','体育重視'],            'active'),
  ('都立豊多摩高等学校',    '公立','高校','東京都','杉並区',  58,63,ARRAY[]::text[],                                  'active'),
  ('都立調布北高等学校',    '公立','高校','東京都','調布市',  56,61,ARRAY[]::text[],                                  'active'),
  ('都立井草高等学校',      '公立','高校','東京都','練馬区',  54,59,ARRAY[]::text[],                                  'active'),
  ('都立上水高等学校',      '公立','高校','東京都','東大和市',52,57,ARRAY[]::text[],                                  'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 東京都（私立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('開成高等学校',                  '私立','高校','東京都','荒川区',  75,80,ARRAY['東大合格者日本一','理数特化'],              'active'),
  ('麻布高等学校',                  '私立','高校','東京都','港区',    72,78,ARRAY['自由な校風','東大上位'],                    'active'),
  ('渋谷教育学園渋谷高等学校',      '私立','高校','東京都','渋谷区',  70,76,ARRAY['英語重視','自調自考','帰国生受入'],         'active'),
  ('早稲田高等学校',                '私立','高校','東京都','新宿区',  68,74,ARRAY['早大内部進学','文武両道'],                  'active'),
  ('慶應義塾女子高等学校',          '私立','高校','東京都','港区',    69,74,ARRAY['慶應大内部進学','女子校'],                  'active'),
  ('ICU高等学校',                   '私立','高校','東京都','三鷹市',  67,72,ARRAY['国際バカロレア','英語教育','キリスト教'],   'active'),
  ('法政大学国際高等学校',          '私立','高校','東京都','中野区',  64,69,ARRAY['法政大学内部進学','国際教育'],             'active'),
  ('青山学院高等部',                '私立','高校','東京都','渋谷区',  64,69,ARRAY['青学大内部進学','スポーツ充実'],           'active'),
  ('中央大学杉並高等学校',          '私立','高校','東京都','杉並区',  63,68,ARRAY['中央大学内部進学'],                       'active'),
  ('明治大学付属明治高等学校',      '私立','高校','東京都','調布市',  63,68,ARRAY['明大内部進学','文武両道'],                 'active'),
  ('立教新座高等学校',              '私立','高校','東京都','練馬区',  60,65,ARRAY['立教大内部進学','キリスト教'],             'active'),
  ('法政大学高等学校',              '私立','高校','東京都','三鷹市',  60,65,ARRAY['法政大内部進学'],                         'active'),
  ('日本大学第二高等学校',          '私立','高校','東京都','杉並区',  56,62,ARRAY['日大内部進学'],                           'active'),
  ('帝京大学高等学校',              '私立','高校','東京都','八王子市',52,58,ARRAY['帝京大内部進学','スポーツ'],               'active'),
  ('東海大学菅生高等学校',          '私立','高校','東京都','あきる野市',50,56,ARRAY['東海大内部進学','体育強化'],             'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 千葉県（公立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('千葉高等学校',          '公立','高校','千葉県','千葉市',   72,78,ARRAY['SSH指定校','東大・医学部実績'],                    'active'),
  ('船橋高等学校',          '公立','高校','千葉県','船橋市',   69,74,ARRAY['文武両道','部活動充実'],                          'active'),
  ('東葛飾高等学校',        '公立','高校','千葉県','柏市',     67,73,ARRAY['SSH指定校'],                                      'active'),
  ('佐倉高等学校',          '公立','高校','千葉県','佐倉市',   65,70,ARRAY['SGH指定校','国際教育'],                           'active'),
  ('千葉東高等学校',        '公立','高校','千葉県','千葉市',   63,68,ARRAY[]::text[],                                          'active'),
  ('薬園台高等学校',        '公立','高校','千葉県','船橋市',   62,67,ARRAY['文武両道'],                                        'active'),
  ('柏高等学校',            '公立','高校','千葉県','柏市',     60,65,ARRAY[]::text[],                                          'active'),
  ('成田高等学校',          '公立','高校','千葉県','成田市',   56,61,ARRAY[]::text[],                                          'active'),
  ('長生高等学校',          '公立','高校','千葉県','茂原市',   54,59,ARRAY[]::text[],                                          'active'),
  ('木更津高等学校',        '公立','高校','千葉県','木更津市', 57,62,ARRAY[]::text[],                                          'active'),
  ('匝瑳高等学校',          '公立','高校','千葉県','匝瑳市',   52,57,ARRAY[]::text[],                                          'active'),
  ('銚子高等学校',          '公立','高校','千葉県','銚子市',   50,55,ARRAY[]::text[],                                          'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 千葉県（私立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('渋谷教育学園幕張高等学校',      '私立','高校','千葉県','千葉市',   73,79,ARRAY['国際バカロレア','英語重視','帰国生受入'],   'active'),
  ('市川高等学校',                  '私立','高校','千葉県','市川市',   68,74,ARRAY['SSH指定校','自主自律'],                    'active'),
  ('東邦大学付属東邦高等学校',      '私立','高校','千葉県','習志野市', 67,73,ARRAY['東邦大内部進学','理科重視'],               'active'),
  ('専修大学松戸高等学校',          '私立','高校','千葉県','松戸市',   63,68,ARRAY['専修大内部進学','英語教育'],               'active'),
  ('芝浦工業大学柏高等学校',        '私立','高校','千葉県','柏市',     61,66,ARRAY['理工系重視','芝浦工大内部'],               'active'),
  ('千葉日本大学第一高等学校',      '私立','高校','千葉県','船橋市',   58,63,ARRAY['日大内部進学'],                           'active'),
  ('麗澤高等学校',                  '私立','高校','千葉県','柏市',     56,62,ARRAY['道徳教育','英語重視'],                     'active'),
  ('千葉英和高等学校',              '私立','高校','千葉県','八千代市', 52,58,ARRAY['キリスト教教育','女子校'],                 'active'),
  ('拓殖大学紅陵高等学校',          '私立','高校','千葉県','君津市',   48,54,ARRAY['文武両道','拓大内部進学'],                 'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 茨城県（公立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('水戸第一高等学校',      '公立','高校','茨城県','水戸市',     69,75,ARRAY['SSH指定校','東大・旧帝大実績'],                  'active'),
  ('土浦第一高等学校',      '公立','高校','茨城県','土浦市',     68,74,ARRAY['SSH指定校'],                                    'active'),
  ('竹園高等学校',          '公立','高校','茨城県','つくば市',   64,69,ARRAY['英語重視','国際教育'],                          'active'),
  ('緑岡高等学校',          '公立','高校','茨城県','水戸市',     62,67,ARRAY[]::text[],                                        'active'),
  ('日立第一高等学校',      '公立','高校','茨城県','日立市',     60,65,ARRAY[]::text[],                                        'active'),
  ('太田第一高等学校',      '公立','高校','茨城県','常陸太田市', 58,63,ARRAY[]::text[],                                        'active'),
  ('下妻第一高等学校',      '公立','高校','茨城県','下妻市',     56,61,ARRAY[]::text[],                                        'active'),
  ('石岡第一高等学校',      '公立','高校','茨城県','石岡市',     54,59,ARRAY[]::text[],                                        'active'),
  ('古河第一高等学校',      '公立','高校','茨城県','古河市',     52,57,ARRAY[]::text[],                                        'active'),
  ('鉾田第一高等学校',      '公立','高校','茨城県','鉾田市',     48,53,ARRAY[]::text[],                                        'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 茨城県（私立）
-- ============================================================
INSERT INTO high_schools (name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, status) VALUES
  ('江戸川学園取手高等学校',        '私立','高校','茨城県','取手市',   68,74,ARRAY['東大・医学部特化','特進コース'],            'active'),
  ('茗溪学園高等学校',              '私立','高校','茨城県','つくば市', 65,70,ARRAY['理数教育','国際バカロレア','英語重視'],     'active'),
  ('常総学院高等学校',              '私立','高校','茨城県','土浦市',   59,65,ARRAY['文武両道','スポーツ強化'],                 'active'),
  ('霞ヶ浦高等学校',                '私立','高校','茨城県','土浦市',   50,56,ARRAY['スポーツ重視'],                           'active'),
  ('水城高等学校',                  '私立','高校','茨城県','東茨城郡', 47,53,ARRAY[]::text[],                                  'active'),
  ('茨城キリスト教学院高等学校',    '私立','高校','茨城県','日立市',   50,56,ARRAY['キリスト教教育','英語重視'],               'active'),
  ('清真学園高等学校',              '私立','高校','茨城県','鹿嶋市',   57,63,ARRAY['理数特化','東大実績'],                     'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 5: メーリングリスト初期データ
-- ============================================================
INSERT INTO school_mailing_list (school_name, school_type, school_level, prefecture, city, contact_status) VALUES
  -- 東京都 公立
  ('都立日比谷高等学校',        '公立','高校','東京都','千代田区', '未送信'),
  ('都立西高等学校',            '公立','高校','東京都','杉並区',   '未送信'),
  ('都立国立高等学校',          '公立','高校','東京都','国立市',   '未送信'),
  ('都立戸山高等学校',          '公立','高校','東京都','新宿区',   '未送信'),
  ('都立青山高等学校',          '公立','高校','東京都','渋谷区',   '未送信'),
  ('都立新宿高等学校',          '公立','高校','東京都','新宿区',   '未送信'),
  ('都立八王子東高等学校',      '公立','高校','東京都','八王子市', '未送信'),
  ('都立立川高等学校',          '公立','高校','東京都','立川市',   '未送信'),
  ('都立小山台高等学校',        '公立','高校','東京都','品川区',   '未送信'),
  ('都立駒場高等学校',          '公立','高校','東京都','目黒区',   '未送信'),
  -- 東京都 私立
  ('開成高等学校',              '私立','高校','東京都','荒川区',   '未送信'),
  ('麻布高等学校',              '私立','高校','東京都','港区',     '未送信'),
  ('渋谷教育学園渋谷高等学校',  '私立','高校','東京都','渋谷区',   '未送信'),
  ('早稲田高等学校',            '私立','高校','東京都','新宿区',   '未送信'),
  ('ICU高等学校',               '私立','高校','東京都','三鷹市',   '未送信'),
  ('青山学院高等部',            '私立','高校','東京都','渋谷区',   '未送信'),
  ('中央大学杉並高等学校',      '私立','高校','東京都','杉並区',   '未送信'),
  ('法政大学高等学校',          '私立','高校','東京都','三鷹市',   '未送信'),
  ('立教新座高等学校',          '私立','高校','東京都','練馬区',   '未送信'),
  ('明治大学付属明治高等学校',  '私立','高校','東京都','調布市',   '未送信'),
  -- 千葉県 公立
  ('千葉高等学校',              '公立','高校','千葉県','千葉市',   '未送信'),
  ('船橋高等学校',              '公立','高校','千葉県','船橋市',   '未送信'),
  ('東葛飾高等学校',            '公立','高校','千葉県','柏市',     '未送信'),
  ('佐倉高等学校',              '公立','高校','千葉県','佐倉市',   '未送信'),
  ('千葉東高等学校',            '公立','高校','千葉県','千葉市',   '未送信'),
  ('薬園台高等学校',            '公立','高校','千葉県','船橋市',   '未送信'),
  ('柏高等学校',                '公立','高校','千葉県','柏市',     '未送信'),
  ('木更津高等学校',            '公立','高校','千葉県','木更津市', '未送信'),
  -- 千葉県 私立
  ('渋谷教育学園幕張高等学校',  '私立','高校','千葉県','千葉市',   '未送信'),
  ('市川高等学校',              '私立','高校','千葉県','市川市',   '未送信'),
  ('東邦大学付属東邦高等学校',  '私立','高校','千葉県','習志野市', '未送信'),
  ('専修大学松戸高等学校',      '私立','高校','千葉県','松戸市',   '未送信'),
  ('芝浦工業大学柏高等学校',    '私立','高校','千葉県','柏市',     '未送信'),
  ('千葉日本大学第一高等学校',  '私立','高校','千葉県','船橋市',   '未送信'),
  ('麗澤高等学校',              '私立','高校','千葉県','柏市',     '未送信'),
  ('千葉英和高等学校',          '私立','高校','千葉県','八千代市', '未送信'),
  ('拓殖大学紅陵高等学校',      '私立','高校','千葉県','君津市',   '未送信'),
  -- 茨城県 公立
  ('水戸第一高等学校',          '公立','高校','茨城県','水戸市',   '未送信'),
  ('土浦第一高等学校',          '公立','高校','茨城県','土浦市',   '未送信'),
  ('竹園高等学校',              '公立','高校','茨城県','つくば市', '未送信'),
  ('緑岡高等学校',              '公立','高校','茨城県','水戸市',   '未送信'),
  ('日立第一高等学校',          '公立','高校','茨城県','日立市',   '未送信'),
  -- 茨城県 私立
  ('江戸川学園取手高等学校',    '私立','高校','茨城県','取手市',   '未送信'),
  ('茗溪学園高等学校',          '私立','高校','茨城県','つくば市', '未送信'),
  ('常総学院高等学校',          '私立','高校','茨城県','土浦市',   '未送信'),
  ('清真学園高等学校',          '私立','高校','茨城県','鹿嶋市',   '未送信')
ON CONFLICT DO NOTHING;
