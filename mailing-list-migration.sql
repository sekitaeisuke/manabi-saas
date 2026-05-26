-- ============================================================
-- school_mailing_list 拡張マイグレーション
-- 連絡手段（メール→フォーム→FAX）の管理に対応
-- ============================================================

-- Step 1: 列追加
ALTER TABLE school_mailing_list
  ADD COLUMN IF NOT EXISTS fax_number        text,
  ADD COLUMN IF NOT EXISTS inquiry_form_url  text,
  ADD COLUMN IF NOT EXISTS contact_method    text;  -- 'email' | 'form' | 'fax'

-- Step 2: contact_status の CHECK 制約を拡張
ALTER TABLE school_mailing_list
  DROP CONSTRAINT IF EXISTS school_mailing_list_contact_status_check;

ALTER TABLE school_mailing_list
  ADD CONSTRAINT school_mailing_list_contact_status_check
  CHECK (contact_status IN (
    '未送信',       -- まだ何もしていない
    'メール送信済', -- メールを送った
    'フォーム送信済', -- 問い合わせフォームから送った
    'FAX送信済',   -- FAXを送った
    '登録済',       -- 学校側が登録完了
    '辞退'          -- 辞退・不要の連絡あり
  ));

-- Step 3: 既存データを '送信済' → 'メール送信済' に移行（あれば）
UPDATE school_mailing_list
SET contact_status  = 'メール送信済',
    contact_method  = 'email'
WHERE contact_status = '送信済';

-- Step 4: high_schools の全 active 校をメーリングリストに追加（未登録のもの）
UPDATE school_mailing_list ml
SET high_school_id = hs.id
FROM high_schools hs
WHERE ml.school_name = hs.name
  AND ml.high_school_id IS NULL
  AND hs.status = 'active';

INSERT INTO school_mailing_list (school_name, school_type, school_level, prefecture, city, high_school_id, contact_status)
SELECT
  hs.name,
  hs.school_type,
  hs.school_level,
  hs.prefecture,
  hs.city,
  hs.id,
  '未送信'
FROM high_schools hs
WHERE hs.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM school_mailing_list ml WHERE ml.school_name = hs.name
  );

-- Step 5: 既知のメールアドレスを登録
UPDATE school_mailing_list SET email = 'koho@mito1-h.ibk.ed.jp',          contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '水戸第一高等学校';
UPDATE school_mailing_list SET email = 'koho@takezono-h.ibk.ed.jp',        contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '竹園高等学校';
UPDATE school_mailing_list SET email = 'koho@midorioka-h.ibk.ed.jp',       contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '緑岡高等学校';
UPDATE school_mailing_list SET email = 'koho@hitachi1-h.ibk.ed.jp',        contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '日立第一高等学校';
UPDATE school_mailing_list SET email = 'webmaster@e-t.ed.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '江戸川学園取手高等学校';
UPDATE school_mailing_list SET email = 'webmaster@e-t.ed.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '江戸川学園取手中学校';
UPDATE school_mailing_list SET email = 'kouhou@meikei.ac.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '茗溪学園高等学校';
UPDATE school_mailing_list SET email = 'kouhou@meikei.ac.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '茗溪学園中学校';
UPDATE school_mailing_list SET email = 'office-h@joso.ac.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '常総学院高等学校';
UPDATE school_mailing_list SET email = 'office-h@joso.ac.jp',              contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '常総学院中学校';
UPDATE school_mailing_list SET email = 'sec-sch@tng.ac.jp',                contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '土浦日本大学高等学校';
UPDATE school_mailing_list SET email = 'koho@moriya-h.ibk.ed.jp',          contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '守谷高等学校';
UPDATE school_mailing_list SET email = 'koho@torideshoyo-h.ibk.ed.jp',     contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '取手松陽高等学校';
UPDATE school_mailing_list SET email = 'koho@mito2-h.ibk.ed.jp',           contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '水戸第二高等学校';
UPDATE school_mailing_list SET email = 'koho@tsuchiura2-h.ibk.ed.jp',      contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '土浦第二高等学校';
UPDATE school_mailing_list SET email = 'koho@namiki-cs.ibk.ed.jp',         contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '茨城県立並木中等教育学校';
UPDATE school_mailing_list SET email = 'koho@hitachiomiya-h.ibk.ed.jp',    contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '常陸大宮高等学校';
UPDATE school_mailing_list SET email = 'chiba.HIS@city.chiba.lg.jp',       contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '市立千葉高等学校';
UPDATE school_mailing_list SET email = 'icuhs-rs@icu.ac.jp',               contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = 'ICU高等学校';
UPDATE school_mailing_list SET email = 'go@chusugi.jp',                    contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '中央大学杉並高等学校';
UPDATE school_mailing_list SET email = 'rikkyohs@rikkyo.ac.jp',            contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '立教新座高等学校';
UPDATE school_mailing_list SET email = 'chukou@toyoeiwa.ac.jp',            contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '東洋英和女学院高等部';
UPDATE school_mailing_list SET email = 'info@tcu-jsh.ed.jp',               contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '東京都市大学付属高等学校';
UPDATE school_mailing_list SET email = 'admission@kaijo.ed.jp',            contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '海城高等学校';
UPDATE school_mailing_list SET email = 'admission@kaijo.ed.jp',            contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '海城中学校';
UPDATE school_mailing_list SET email = 'S1000025@section.metro.tokyo.jp',  contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '都立新宿高等学校';
UPDATE school_mailing_list SET email = 'ryogoku_high@section.metro.tokyo.jp', contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '都立両国高等学校';
UPDATE school_mailing_list SET email = 'S1000108@section.metro.tokyo.jp',  contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '都立墨田川高等学校';
UPDATE school_mailing_list SET email = 'hakuo@section.metro.tokyo.jp',     contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '都立白鷗高等学校';
UPDATE school_mailing_list SET email = 'S1000056@section.metro.tokyo.jp',  contact_status = 'メール送信済', contact_method = 'email' WHERE school_name = '都立大泉高等学校';

-- Step 6: 既知のFAX番号を登録
-- 茨城県
UPDATE school_mailing_list SET fax_number = '029-826-3521' WHERE school_name = '土浦第一高等学校';
UPDATE school_mailing_list SET fax_number = '0299-83-6414' WHERE school_name = '清真学園高等学校';
UPDATE school_mailing_list SET fax_number = '0297-38-8857' WHERE school_name = '開智望高等学校';
UPDATE school_mailing_list SET fax_number = '029-221-4923' WHERE school_name = '茨城高等学校';
-- 東京都公立
UPDATE school_mailing_list SET fax_number = '03-3597-8331' WHERE school_name = '都立日比谷高等学校';
UPDATE school_mailing_list SET fax_number = '03-3247-1340' WHERE school_name = '都立西高等学校';
UPDATE school_mailing_list SET fax_number = '042-573-9609' WHERE school_name = '都立国立高等学校';
UPDATE school_mailing_list SET fax_number = '03-3204-1045' WHERE school_name = '都立戸山高等学校';
UPDATE school_mailing_list SET fax_number = '03-3404-0182' WHERE school_name = '都立青山高等学校';
UPDATE school_mailing_list SET fax_number = '042-642-2641' WHERE school_name = '都立八王子東高等学校';
UPDATE school_mailing_list SET fax_number = '042-527-9906' WHERE school_name = '都立立川高等学校';
UPDATE school_mailing_list SET fax_number = '03-3714-8163' WHERE school_name = '都立小山台高等学校';
UPDATE school_mailing_list SET fax_number = '03-3466-5240' WHERE school_name = '都立駒場高等学校';
UPDATE school_mailing_list SET fax_number = '03-3453-2899' WHERE school_name = '都立三田高等学校';
UPDATE school_mailing_list SET fax_number = '042-381-4169' WHERE school_name = '都立多摩科学技術高等学校';
UPDATE school_mailing_list SET fax_number = '042-546-0150' WHERE school_name = '都立昭和高等学校';
UPDATE school_mailing_list SET fax_number = '042-724-1330' WHERE school_name = '都立町田高等学校';
UPDATE school_mailing_list SET fax_number = '0422-51-4164' WHERE school_name = '都立武蔵野北高等学校';
-- 東京都私立
UPDATE school_mailing_list SET fax_number = '03-3822-4558' WHERE school_name = '開成高等学校';
UPDATE school_mailing_list SET fax_number = '03-3822-4558' WHERE school_name = '開成中学校';
UPDATE school_mailing_list SET fax_number = '03-3444-2337' WHERE school_name = '麻布高等学校';
UPDATE school_mailing_list SET fax_number = '03-3444-2337' WHERE school_name = '麻布中学校';
UPDATE school_mailing_list SET fax_number = '03-5684-5889' WHERE school_name = '桜蔭中学校';
UPDATE school_mailing_list SET fax_number = '03-3486-1033' WHERE school_name = '渋谷教育学園渋谷高等学校';
UPDATE school_mailing_list SET fax_number = '03-3486-1033' WHERE school_name = '渋谷教育学園渋谷中学校';
UPDATE school_mailing_list SET fax_number = '03-3202-7692' WHERE school_name = '早稲田高等学校';
UPDATE school_mailing_list SET fax_number = '03-3202-7692' WHERE school_name = '早稲田中学校';
UPDATE school_mailing_list SET fax_number = '03-5427-1676' WHERE school_name = '慶應義塾中等部';
UPDATE school_mailing_list SET fax_number = '03-3409-5784' WHERE school_name = '青山学院高等部';
UPDATE school_mailing_list SET fax_number = '03-3409-5784' WHERE school_name = '青山学院中等部';
UPDATE school_mailing_list SET fax_number = '0422-79-6260' WHERE school_name = '法政大学高等学校';
UPDATE school_mailing_list SET fax_number = '042-498-7800' WHERE school_name = '明治大学付属明治高等学校';
UPDATE school_mailing_list SET fax_number = '03-5984-3883' WHERE school_name = '武蔵高等学校';
UPDATE school_mailing_list SET fax_number = '03-3983-5628' WHERE school_name = '豊島岡女子学園高等学校';
UPDATE school_mailing_list SET fax_number = '03-3983-5628' WHERE school_name = '豊島岡女子学園中学校';
UPDATE school_mailing_list SET fax_number = '03-3578-1212' WHERE school_name = '芝高等学校';
UPDATE school_mailing_list SET fax_number = '03-3918-5305' WHERE school_name = '巣鴨高等学校';
UPDATE school_mailing_list SET fax_number = '0422-22-9752' WHERE school_name = '吉祥女子高等学校';
UPDATE school_mailing_list SET fax_number = '0422-22-9752' WHERE school_name = '吉祥女子中学校';
UPDATE school_mailing_list SET fax_number = '042-383-4840' WHERE school_name = '中央大学附属高等学校';
UPDATE school_mailing_list SET fax_number = '03-3444-7192' WHERE school_name = '広尾学園高等学校';
UPDATE school_mailing_list SET fax_number = '03-3420-8782' WHERE school_name = '鷗友学園女子高等学校';
UPDATE school_mailing_list SET fax_number = '03-5992-1016' WHERE school_name = '学習院高等科';
UPDATE school_mailing_list SET fax_number = '03-3234-6970' WHERE school_name = '白百合学園高等学校';
UPDATE school_mailing_list SET fax_number = '03-3368-3113' WHERE school_name = '明治大学付属中野高等学校';
UPDATE school_mailing_list SET fax_number = '03-3788-1190' WHERE school_name = '朋優学院高等学校';
UPDATE school_mailing_list SET fax_number = '03-3956-9779' WHERE school_name = '城北高等学校';
UPDATE school_mailing_list SET fax_number = '042-574-9898' WHERE school_name = '桐朋高等学校';
UPDATE school_mailing_list SET fax_number = '03-3943-1991' WHERE school_name = '日本大学豊山高等学校';
UPDATE school_mailing_list SET fax_number = '03-3420-7199' WHERE school_name = '東京農業大学第一高等学校';
UPDATE school_mailing_list SET fax_number = '03-3264-4728' WHERE school_name = '武蔵野大学附属千代田高等学院';
UPDATE school_mailing_list SET fax_number = '03-3943-0848' WHERE school_name = '筑波大学附属高等学校';
UPDATE school_mailing_list SET fax_number = '03-3421-5152' WHERE school_name = '東京学芸大学附属高等学校';
-- 東京都公立中高一貫
UPDATE school_mailing_list SET fax_number = '03-3946-7397' WHERE school_name = '東京都立小石川中等教育学校';
UPDATE school_mailing_list SET fax_number = '03-3724-7041' WHERE school_name = '東京都立桜修館中等教育学校';
UPDATE school_mailing_list SET fax_number = '0422-51-3966' WHERE school_name = '東京都立武蔵高等学校附属中学校';
-- 千葉県
UPDATE school_mailing_list SET fax_number = '043-221-4014' WHERE school_name = '千葉高等学校';
UPDATE school_mailing_list SET fax_number = '043-221-4014' WHERE school_name = '千葉県立千葉中学校';
UPDATE school_mailing_list SET fax_number = '047-426-0422' WHERE school_name = '船橋高等学校';
UPDATE school_mailing_list SET fax_number = '04-7147-9611' WHERE school_name = '東葛飾高等学校';
UPDATE school_mailing_list SET fax_number = '04-7147-9611' WHERE school_name = '千葉県立東葛飾中学校';
UPDATE school_mailing_list SET fax_number = '043-486-0903' WHERE school_name = '佐倉高等学校';
UPDATE school_mailing_list SET fax_number = '043-255-6575' WHERE school_name = '千葉東高等学校';
UPDATE school_mailing_list SET fax_number = '047-463-4039' WHERE school_name = '薬園台高等学校';
UPDATE school_mailing_list SET fax_number = '04-7134-9557' WHERE school_name = '柏高等学校';
UPDATE school_mailing_list SET fax_number = '0438-22-0376' WHERE school_name = '木更津高等学校';
UPDATE school_mailing_list SET fax_number = '043-271-7221' WHERE school_name = '渋谷教育学園幕張高等学校';
UPDATE school_mailing_list SET fax_number = '043-271-7221' WHERE school_name = '渋谷教育学園幕張中学校';
UPDATE school_mailing_list SET fax_number = '047-337-6288' WHERE school_name = '市川高等学校';
UPDATE school_mailing_list SET fax_number = '047-337-6288' WHERE school_name = '市川中学校';
UPDATE school_mailing_list SET fax_number = '047-475-1355' WHERE school_name = '東邦大学付属東邦高等学校';
UPDATE school_mailing_list SET fax_number = '047-475-1355' WHERE school_name = '東邦大学付属東邦中学校';
UPDATE school_mailing_list SET fax_number = '047-362-9104' WHERE school_name = '専修大学松戸高等学校';
UPDATE school_mailing_list SET fax_number = '047-362-9104' WHERE school_name = '専修大学松戸中学校';
UPDATE school_mailing_list SET fax_number = '04-7176-1741' WHERE school_name = '芝浦工業大学柏高等学校';
UPDATE school_mailing_list SET fax_number = '047-468-0646' WHERE school_name = '千葉日本大学第一高等学校';
UPDATE school_mailing_list SET fax_number = '04-7173-3716' WHERE school_name = '麗澤高等学校';
UPDATE school_mailing_list SET fax_number = '047-487-5466' WHERE school_name = '千葉英和高等学校';
UPDATE school_mailing_list SET fax_number = '0438-36-7286' WHERE school_name = '拓殖大学紅陵高等学校';
UPDATE school_mailing_list SET fax_number = '043-272-4732' WHERE school_name = '昭和学院秀英高等学校';
UPDATE school_mailing_list SET fax_number = '043-272-4732' WHERE school_name = '昭和学院秀英中学校';
UPDATE school_mailing_list SET fax_number = '047-469-5540' WHERE school_name = '日本大学習志野高等学校';
UPDATE school_mailing_list SET fax_number = '047-463-4082' WHERE school_name = '船橋東高等学校';
UPDATE school_mailing_list SET fax_number = '047-349-2030' WHERE school_name = '小金高等学校';
UPDATE school_mailing_list SET fax_number = '047-373-7902' WHERE school_name = '国府台高等学校';
UPDATE school_mailing_list SET fax_number = '0438-62-5916' WHERE school_name = '袖ヶ浦高等学校';
UPDATE school_mailing_list SET fax_number = '047-471-4581' WHERE school_name = '市立習志野高等学校';
UPDATE school_mailing_list SET fax_number = '047-373-2360' WHERE school_name = '市川昴高等学校';
UPDATE school_mailing_list SET fax_number = '043-278-4733' WHERE school_name = '検見川高等学校';
UPDATE school_mailing_list SET fax_number = '0475-55-4045' WHERE school_name = '東金高等学校';
UPDATE school_mailing_list SET fax_number = '047-422-9129' WHERE school_name = '市立船橋高等学校';
UPDATE school_mailing_list SET fax_number = '04-7133-3641' WHERE school_name = '柏中央高等学校';
UPDATE school_mailing_list SET fax_number = '047-346-4002' WHERE school_name = '松戸高等学校';
UPDATE school_mailing_list SET fax_number = '047-445-9366' WHERE school_name = '鎌ヶ谷高等学校';
UPDATE school_mailing_list SET fax_number = '04-7155-6991' WHERE school_name = '流山おおたかの森高等学校';
UPDATE school_mailing_list SET fax_number = '043-211-6317' WHERE school_name = '幕張総合高等学校';
UPDATE school_mailing_list SET fax_number = '04-7127-1138' WHERE school_name = '西武台千葉高等学校';
UPDATE school_mailing_list SET fax_number = '04-7131-4553' WHERE school_name = '流通経済大学付属柏高等学校';
UPDATE school_mailing_list SET fax_number = '043-265-3708' WHERE school_name = '千葉明徳高等学校';
UPDATE school_mailing_list SET fax_number = '04-7191-6712' WHERE school_name = '二松學舎大学附属柏高等学校';

-- 確認クエリ
SELECT
  contact_status,
  COUNT(*) AS 件数
FROM school_mailing_list
GROUP BY contact_status
ORDER BY 件数 DESC;
