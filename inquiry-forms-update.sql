-- ============================================================
-- 問い合わせフォームURL 一括登録
-- contact_status は送信後に手動で 'フォーム送信済' に更新する
-- ============================================================

-- ============================================================
-- 東京都 私立高校（フォームあり 18校）
-- ============================================================
UPDATE school_mailing_list SET inquiry_form_url = 'https://kaiseigakuen.jp/contact/'                              WHERE school_name IN ('開成高等学校', '開成中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.azabu-jh.ed.jp/contact/'                           WHERE school_name IN ('麻布高等学校', '麻布中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.agh.aoyama.ed.jp/contact/index.html'               WHERE school_name = '青山学院高等部';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.jh.aoyama.ed.jp/contact/index.html'                WHERE school_name = '青山学院中等部';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.hosei.ed.jp/contact/'                              WHERE school_name = '法政大学高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.meiji.ac.jp/ko_chu/contact/inquiry.html'           WHERE school_name = '明治大学付属明治高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.musashi.ed.jp/contact/index.html'                  WHERE school_name = '武蔵高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.toshimagaoka.ed.jp/contact/'                       WHERE school_name IN ('豊島岡女子学園高等学校', '豊島岡女子学園中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.kichijo-joshi.jp/contact/'                         WHERE school_name = '吉祥女子高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.hs.chuo-u.ac.jp/inquiry/'                          WHERE school_name = '中央大学附属高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.hiroogakuen.ed.jp/info/contact.html'               WHERE school_name = '広尾学園高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.ohyu.jp/contact/'                                  WHERE school_name = '鷗友学園女子高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.waseda.jp/school/shs/contact/'                     WHERE school_name = '早稲田大学高等学院';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.shirayuri.ed.jp/examinee/contact.html'             WHERE school_name = '白百合学園高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.nakanogakuen.ac.jp/information/contact.html'       WHERE school_name = '明治大学付属中野高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.johoku.ac.jp/contact/'                             WHERE school_name = '城北高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.buzan.hs.nihon-u.ac.jp/inquiry/'                   WHERE school_name = '日本大学豊山高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.nodai-1-h.ed.jp/?page_id=526'                     WHERE school_name = '東京農業大学第一高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://chiyoda.ed.jp/contact_high/'                           WHERE school_name = '武蔵野大学附属千代田高等学院';

-- ============================================================
-- 東京都 中学（フォームあり 追加分）
-- ============================================================
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.oin.ed.jp/contact/'                                WHERE school_name = '桜蔭中学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.shibushibu.jp/information/contact.html'            WHERE school_name = '渋谷教育学園渋谷中学校';

-- ============================================================
-- 茨城県（フォームあり）
-- ============================================================
UPDATE school_mailing_list SET inquiry_form_url = 'https://nozomi.kaichigakuen.ed.jp/contact/'                    WHERE school_name IN ('開智望高等学校', '開智望中等教育学校');

-- ============================================================
-- 千葉県 私立高校（フォームあり 14校）
-- ============================================================
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.shibumaku.jp/inquiry/'                             WHERE school_name IN ('渋谷教育学園幕張高等学校', '渋谷教育学園幕張中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.ichigaku.ac.jp/contact/'                           WHERE school_name IN ('市川高等学校', '市川中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.tohojh.toho-u.ac.jp/request.html'                 WHERE school_name IN ('東邦大学付属東邦高等学校', '東邦大学付属東邦中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.senshu-u-matsudo.ed.jp/inquiry.html'               WHERE school_name IN ('専修大学松戸高等学校', '専修大学松戸中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.chibanichi.ed.jp/information/contact/'             WHERE school_name = '千葉日本大学第一高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.hs.reitaku.jp/inquiry/index.html'                  WHERE school_name = '麗澤高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.koryo.ed.jp/inquiry/'                              WHERE school_name = '拓殖大学紅陵高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.showa-shuei.ed.jp/inquiry/'                        WHERE school_name IN ('昭和学院秀英高等学校', '昭和学院秀英中学校');
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.nnhs.cst.nihon-u.ac.jp/inquiry/'                   WHERE school_name = '日本大学習志野高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://cms1.chiba-c.ed.jp/kemigawa-h/feaaeb5c200c5163948c98356fc7328a/schoolcontact'    WHERE school_name = '検見川高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://cms1.chiba-c.ed.jp/kashiwachuo-h/0b30702ef44dc4a2cbaf83a949b4a703/schoolcontact' WHERE school_name = '柏中央高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://www.ryukei.ed.jp/inquiry.html'                         WHERE school_name = '流通経済大学付属柏高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://edu.chibameitoku.ac.jp/senior/inquiry-s/'              WHERE school_name = '千葉明徳高等学校';
UPDATE school_mailing_list SET inquiry_form_url = 'https://nishogakusha-kashiwa.ed.jp/sh/request/index.html'      WHERE school_name = '二松學舎大学附属柏高等学校';

-- ============================================================
-- 確認クエリ：連絡手段の内訳
-- ============================================================
SELECT
  CASE
    WHEN email IS NOT NULL            THEN '① メールあり'
    WHEN inquiry_form_url IS NOT NULL THEN '② フォームあり（メールなし）'
    WHEN fax_number IS NOT NULL       THEN '③ FAXのみ'
    ELSE                                   '④ 連絡先未登録'
  END AS 連絡手段,
  COUNT(*) AS 件数
FROM school_mailing_list
GROUP BY 1
ORDER BY 1;
