"""
調査済み連絡先データで contact_results.json を更新するスクリプト
"""
import json
from pathlib import Path

OUT_DIR = Path(__file__).parent
RESULTS_JSON = OUT_DIR / "contact_results.json"
RESULTS_SQL = OUT_DIR / "contact_results.sql"

# ===== 調査済みデータ =====
NEW_DATA_ROUND2 = {
    # ===== 東京都立（FAX） =====
    "都立戸山高等学校":     {"fax": "03-3204-1045", "source": "websearch", "site_url": "https://www.metro.ed.jp/toyama-h/"},
    "都立青山高等学校":     {"fax": "03-3404-0182", "source": "websearch", "site_url": "https://www.metro.ed.jp/aoyama-h/"},
    "都立八王子東高等学校": {"fax": "042-642-2641", "source": "websearch", "site_url": "https://www.metro.ed.jp/hachiojihigashi-h/"},
    "都立立川高等学校":     {"fax": "042-527-9906", "source": "websearch", "site_url": "https://www.metro.ed.jp/tachikawa-h/"},
    "都立小山台高等学校":   {"fax": "03-3714-8163", "source": "websearch", "site_url": "https://www.metro.ed.jp/koyamadai-h/"},
    "都立駒場高等学校":     {"fax": "03-3466-5240", "source": "websearch", "site_url": "https://www.metro.ed.jp/komaba-h/"},
    "都立豊多摩高等学校":   {"fax": "03-3398-3746", "source": "websearch", "site_url": "https://www.metro.ed.jp/toyotama-h/"},
    "都立調布北高等学校":   {"fax": "042-483-7081", "source": "websearch", "site_url": "https://www.metro.ed.jp/chofukita-h/"},
    "都立井草高等学校":     {"fax": "03-5991-0757", "source": "websearch", "site_url": "https://www.metro.ed.jp/igusa-h/"},
    "都立上水高等学校":     {"fax": "042-590-4581", "source": "websearch", "site_url": "https://www.metro.ed.jp/josui-h/"},
    "都立目黒高等学校":     {"fax": "03-3792-5945", "source": "websearch", "site_url": "https://www.metro.ed.jp/meguro-h/"},
    "都立東高等学校":       {"fax": "03-3615-7463", "source": "websearch", "site_url": "https://www.metro.ed.jp/higashi-h/"},
    "都立竹早高等学校":     {"fax": "03-3812-3565", "source": "websearch", "site_url": "https://www.metro.ed.jp/takehaya-h/"},
    # ===== 私立（フォーム） =====
    "東京農業大学第三高等学校": {"form_url": "https://www.nodai-3-h.ed.jp/contact",                    "source": "websearch"},
    "日本大学鶴ヶ丘高等学校":  {"form_url": "https://www.tsurugaoka.hs.nihon-u.ac.jp/request/",        "source": "websearch"},
    "日本大学第二高等学校":    {"form_url": "https://www.nichidai2.ac.jp/request_information/",         "source": "websearch"},
    "東葛飾高等学校":          {"form_url": "https://forms.office.com/r/9xDJ5bLGqN",                   "source": "websearch"},
    "千葉東高等学校":          {"form_url": "https://apply.e-tumo.jp/pref-chiba-u/offer/offerList_detail?tempSeq=46962", "source": "websearch"},
    "帝京大学高等学校":        {"form_url": "https://www.teikyo-u.ed.jp/document/",                    "source": "websearch"},
    # ===== 私立（メール） =====
    "清真学園高等学校":        {"email": "seishin@seishingakuen.ed.jp",                                "source": "websearch"},
    # ===== 私立（FAX） =====
    "日本大学第一高等学校": {"fax": "03-3625-5856", "source": "websearch", "site_url": "https://www.nichidai-1.ed.jp/"},
    "千葉英和高等学校":     {"fax": "047-487-5466", "source": "websearch", "site_url": "https://www.ceh.ed.jp/"},
}

NEW_DATA = {
    # ===== 東京私立（問い合わせフォーム） =====
    "渋谷教育学園渋谷高等学校": {"form_url": "https://www.shibushibu.jp/information/contact.html", "source": "websearch"},
    "攻玉社高等学校":           {"form_url": "https://kogyokusha.ed.jp/contact/",                  "source": "websearch"},
    "世田谷学園高等学校":       {"form_url": "https://www.setagayagakuen.ac.jp/contact/",           "source": "websearch"},
    "頌栄女子学院高等学校":     {"form_url": "https://www.shoei.ed.jp/contact/",                   "source": "websearch"},
    "成城学園高等学校":         {"form_url": "https://www.seijogakuen.ed.jp/info/",                "source": "websearch"},
    "共立女子高等学校":         {"form_url": "https://www.kyoritsu-wu.ac.jp/chukou/",              "source": "websearch"},
    "恵泉女学園高等学校":       {"form_url": "https://www.keisen.jp/form_inquiry/",                "source": "websearch"},
    "光塩女子学院高等部":       {"form_url": "https://www.koen-ejh.ed.jp/jh/contact/",            "source": "websearch"},
    "香蘭女学校高等科":         {"form_url": "https://www.koran.ed.jp/contact",                   "source": "websearch"},
    "田園調布学園高等部":       {"form_url": "https://www.chofu.ed.jp/contact/",                  "source": "websearch"},
    "山脇学園高等学校":         {"form_url": "https://www.yamawaki.ed.jp/contact/",               "source": "websearch"},
    "跡見学園高等学校":         {"form_url": "https://www.atomi.ac.jp/jh/contact/",               "source": "websearch"},
    "晃華学園高等学校":         {"form_url": "https://jhs.kokagakuen.ac.jp/toiawase/",            "source": "websearch"},
    "品川女子学院高等部":       {"form_url": "https://www.shinagawajoshigakuin.jp/contact/",      "source": "websearch"},
    "明治大学付属中野八王子高等学校": {"form_url": "https://www.mnh.ed.jp/request/",             "source": "websearch"},
    "帝京大学系属帝京高等学校": {"form_url": "https://www.teikyo.ed.jp/contact/",                "source": "websearch"},
    "国士館高等学校":           {"form_url": "https://hs.kokushikan.ed.jp/contact/",              "source": "websearch"},
    "法政大学国際高等学校":     {"form_url": "https://kokusai-high.ws.hosei.ac.jp/request/",      "source": "websearch"},
    "東海大学菅生高等学校":     {"form_url": "https://tokaisugao.ac.jp/contact-us/",              "source": "websearch"},
    "昭和女子大学附属昭和高等学校": {"form_url": "https://jhs.swu.ac.jp/",                       "source": "websearch"},

    # ===== 千葉私立（問い合わせフォーム） =====
    "芝浦工業大学柏高等学校":   {"form_url": "https://www.ka.shibaura-it.ac.jp/contact/",         "source": "websearch"},

    # ===== 茨城私立（問い合わせフォーム） =====
    "茨城キリスト教学院高等学校": {"form_url": "https://www.icc.ac.jp/ich/toiawase.html",         "source": "websearch"},
    "霞ヶ浦高等学校":           {"form_url": "https://www.kasumi.ed.jp/お問い合わせ/",             "source": "websearch"},

    # ===== 茨城県立（メール・パターンマッチ） =====
    "太田第一高等学校":         {"email": "koho@ota1-h.ibk.ed.jp",        "source": "pattern"},
    "下妻第一高等学校":         {"email": "koho@shimotsuma1-h.ibk.ed.jp", "source": "pattern"},
    "石岡第一高等学校":         {"email": "koho@ishioka1-h.ibk.ed.jp",    "source": "pattern"},
    "古河第一高等学校":         {"email": "koho@koga1-h.ibk.ed.jp",       "source": "pattern"},
    "鉾田第一高等学校":         {"email": "ac-koho@hokota1-h.ibk.ed.jp",  "source": "websearch"},

    # ===== 東京都立（FAX） =====
    "都立日比谷高等学校": {"fax": "03-3597-8331", "source": "websearch",
                          "site_url": "https://www.metro.ed.jp/hibiya-h/"},
    "都立西高等学校":     {"fax": "03-3247-1340", "source": "websearch",
                          "site_url": "https://www.metro.ed.jp/nishi-h/"},
    "都立国立高等学校":   {"fax": "042-573-9609", "source": "websearch",
                          "site_url": "https://www.metro.ed.jp/kunitachi-h/"},

    # ===== 千葉県立（FAX） =====
    "薬園台高等学校": {"fax": "047-463-4039", "source": "websearch",
                      "site_url": "https://cms1.chiba-c.ed.jp/yakuendai-h/"},
    "木更津高等学校": {"fax": "0438-22-0376", "source": "websearch",
                      "site_url": "https://cms2.chiba-c.ed.jp/kisarazuhs/"},

    # ===== 東京私立（FAX） =====
    "早稲田高等学校":             {"fax": "03-3202-7692", "source": "websearch",
                                   "site_url": "https://www.waseda-h.ed.jp/"},
    "東海大学付属高輪台高等学校": {"fax": "03-3448-4020", "source": "websearch",
                                   "site_url": "https://www.takanawadai.tokai.ed.jp/"},
    "拓殖大学第一高等学校":       {"fax": "042-590-3211", "source": "websearch",
                                   "site_url": "https://www.takuichi.ed.jp/"},
}

def write_sql(results: dict):
    lines = ["-- contact_scraper.py + websearch 収集結果", ""]
    for school, data in results.items():
        n = school.replace("'", "''")
        if data.get("email"):
            e = data["email"].replace("'", "''")
            lines.append(f"UPDATE school_mailing_list SET email='{e}', contact_method='email' WHERE school_name='{n}';")
        elif data.get("form_url"):
            u = data["form_url"].replace("'", "''")
            lines.append(f"UPDATE school_mailing_list SET inquiry_form_url='{u}', contact_method='form' WHERE school_name='{n}';")
        elif data.get("fax"):
            fx = data["fax"].replace("'", "''")
            lines.append(f"UPDATE school_mailing_list SET fax_number='{fx}', contact_method='fax' WHERE school_name='{n}';")
    with open(RESULTS_SQL, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


NEW_DATA_ROUND3 = {
    # ===== 東京都立（FAX） =====
    "都立江戸川高等学校":         {"fax": "03-3674-0970", "source": "websearch", "site_url": "https://www.metro.ed.jp/edogawa-h/"},
    "都立葛飾商業高等学校":       {"fax": "03-3826-1921", "source": "websearch", "site_url": "https://www.metro.ed.jp/katsushikasyogyo-h/"},
    "都立科学技術高等学校":       {"fax": "03-5609-0228", "source": "websearch", "site_url": "https://www.metro.ed.jp/kagakugijyutu-h/"},
    "都立蔵前工業高等学校":       {"fax": "03-3862-4995", "source": "websearch", "site_url": "https://www.metro.ed.jp/kuramaekoka-h/"},
    "都立墨田工業高等学校":       {"fax": "03-3846-6683", "source": "websearch", "site_url": "https://www.metro.ed.jp/sumidakoka-h/"},
    "都立荒川工業高等学校":       {"fax": "03-3802-8218", "source": "websearch", "site_url": "https://www.metro.ed.jp/arakawakoka-h/"},
    "都立王子工業高等学校":       {"fax": "03-3576-0615", "source": "websearch", "site_url": "https://www.metro.ed.jp/oujisogo-h/"},
    "都立立川国際中等教育学校":   {"fax": "042-527-1829", "source": "websearch", "site_url": "https://www.metro.ed.jp/tachikawa-s/"},
    "都立多摩科学技術高等学校":   {"fax": "042-381-4169", "source": "websearch", "site_url": "https://www.metro.ed.jp/tamakagakugijutsu-h/"},
    "都立三田高等学校":           {"fax": "03-3453-2899", "source": "websearch", "site_url": "https://www.metro.ed.jp/mita-h/"},
    "都立小松川高等学校":         {"fax": "03-3636-1073", "source": "websearch", "site_url": "https://www.metro.ed.jp/komatsugawa-h/"},
    "都立向丘高等学校":           {"fax": "03-3812-4055", "source": "websearch", "site_url": "https://www.metro.ed.jp/mukogaoka-h/"},
    "都立杉並高等学校":           {"fax": "03-3398-3767", "source": "websearch", "site_url": "https://www.metro.ed.jp/suginami-h/"},
    "都立鷺宮高等学校":           {"fax": "03-3339-8420", "source": "websearch", "site_url": "https://www.metro.ed.jp/saginomiya-h/"},
    "都立狛江高等学校":           {"fax": "03-3489-9312", "source": "websearch", "site_url": "https://www.metro.ed.jp/komae-h/"},
    "都立足立高等学校":           {"fax": "03-3880-6757", "source": "websearch", "site_url": "https://www.metro.ed.jp/adachi-h/"},
    "都立足立東高等学校":         {"fax": "03-5697-0272", "source": "websearch", "site_url": "https://www.metro.ed.jp/adachihigashi-h/"},
    "都立葛飾野高等学校":         {"fax": "03-3602-7922", "source": "websearch", "site_url": "https://www.metro.ed.jp/katsushikano-h/"},
    "都立葛飾総合高等学校":       {"fax": "03-3826-1923", "source": "websearch", "site_url": "https://www.metro.ed.jp/katsushikasogo-h/"},
    "都立光丘高等学校":           {"fax": "03-3977-3794", "source": "websearch", "site_url": "https://www.metro.ed.jp/hikarigaoka-h/"},
    "都立練馬高等学校":           {"fax": "03-3926-8373", "source": "websearch", "site_url": "https://www.metro.ed.jp/nerima-h/"},
    "都立永山高等学校":           {"fax": "042-371-5615", "source": "websearch", "site_url": "https://www.metro.ed.jp/nagayama-h/"},
    "都立田園調布高等学校":       {"fax": "03-3750-4360", "source": "websearch", "site_url": "https://www.metro.ed.jp/den-enchofu-h/"},
    "都立松原高等学校":           {"fax": "03-3304-3062", "source": "websearch", "site_url": "https://www.metro.ed.jp/matsubara-h/"},
    "都立芦花高等学校":           {"fax": "03-3305-8180", "source": "websearch", "site_url": "https://www.metro.ed.jp/roka-h/"},
    "都立雪谷高等学校":           {"fax": "03-3754-7871", "source": "websearch", "site_url": "https://www.metro.ed.jp/yukigaya-h/"},
    "都立荻窪高等学校":           {"fax": "03-3398-3284", "source": "websearch", "site_url": "https://www.metro.ed.jp/ogikubo-he/"},
    "都立板橋高等学校":           {"fax": "03-3959-6591", "source": "websearch", "site_url": "https://www.metro.ed.jp/itabashi-h/"},
    "都立城東高等学校":           {"fax": "03-3682-2164", "source": "websearch", "site_url": "https://www.metro.ed.jp/joto-h/"},
    "都立深川高等学校":           {"fax": "03-3646-4816", "source": "websearch", "site_url": "https://www.metro.ed.jp/fukagawa-h/"},

    # ===== 千葉県立（FAX） =====
    "船橋東高等学校":   {"fax": "047-463-4082", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/funabashieast-h/"},
    "千葉女子高等学校": {"fax": "043-255-4170", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/chibajoshi-h/"},
    "国府台高等学校":   {"fax": "047-373-7902", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/kohnodai-h/"},
    "八千代高等学校":   {"fax": "047-485-1473", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/chb-yachiyo-h/"},
    "我孫子高等学校":   {"fax": "04-7185-4640", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/abikohigh/"},
    "市立松戸高等学校": {"fax": "047-385-3467", "source": "websearch", "site_url": "https://www.matsudo.ed.jp/ichimatsu-h/"},
    "鎌ヶ谷高等学校":   {"fax": "047-445-9366", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/kamagaya-h/"},
    "野田中央高等学校": {"fax": "04-7123-7108", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/nodachuo/"},
    "柏の葉高等学校":   {"fax": "04-7133-2435", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/kashiwanoha/"},
    "松戸六実高等学校": {"fax": "047-386-4762", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/mutsumi-h/"},
    "松戸向陽高等学校": {"email": "m.koyo-h@chiba-c.ed.jp", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/m.koyo-h/"},
    "我孫子東高等学校": {"fax": "04-7189-5426", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/abikoeast-h/"},
    "大多喜高等学校":   {"fax": "0470-82-4980", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/otaki-h/"},
    "袖ヶ浦高等学校":   {"fax": "0438-63-8443", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/sodeko/"},
    "一宮商業高等学校": {"fax": "0475-42-7418", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/chb-ichinomiya-ch/"},
    "四街道高等学校":   {"fax": "043-424-4104", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/yotsukaido-h/"},
    "四街道北高等学校": {"fax": "043-424-3937", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/yotsukaidokita-h/"},
    "八千代東高等学校": {"fax": "047-485-4062", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/yachiyohigashi-h/"},
    "市川昴高等学校":   {"fax": "047-373-2360", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/i.subaru-h/"},
    "市川工業高等学校": {"fax": "047-393-2405", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/ichiko/"},
    "浦安南高等学校":   {"fax": "047-352-9804", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/urayasuminami-h/"},
    "船橋啓明高等学校": {"fax": "047-438-4933", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/f.keimei-h/"},
    "船橋二和高等学校": {"fax": "047-449-6737", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/futawa/"},
    "市立習志野高等学校": {"fax": "047-471-4581", "source": "websearch"},
    "船橋豊富高等学校": {"fax": "047-457-7576", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/toyokou/"},
    "千葉工業高等学校": {"fax": "043-268-5524", "source": "websearch", "site_url": "https://cms1.chiba-c.ed.jp/chiba-th/"},
    "君津商業高等学校": {"fax": "0439-65-4430", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/kimisho/"},
    "館山総合高等学校": {"fax": "0470-23-1046", "source": "websearch", "site_url": "https://cms2.chiba-c.ed.jp/tateyamasogo/"},

    # ===== 東京私立（FAX・フォーム・メール） =====
    "広尾学園小石川高等学校":     {"form_url": "https://hiroo-koishikawa.ed.jp/inquiry",             "source": "websearch"},
    "立教女学院高等学校":         {"email": "jogakuin-chuukou@rikkyojogakuin.ac.jp",                 "source": "websearch"},
    "学習院高等科":               {"fax": "03-5992-1016",  "source": "websearch", "site_url": "https://www.gakushuin.ac.jp/bsh/"},
    "明治学院高等学校":           {"fax": "03-5421-5014",  "source": "websearch", "site_url": "https://www.meigaku.ed.jp/"},
    "東京都市大学等々力高等学校": {"fax": "03-3701-2197",  "source": "websearch", "site_url": "https://www.tcu-todoroki.ed.jp/"},
    "国学院大学久我山高等学校":   {"form_url": "https://www.kugayama-h.ed.jp/mail/",                "source": "websearch"},
    "安田学園高等学校":           {"form_url": "https://www.yasuda.ed.jp/contact/",                 "source": "websearch"},
    "杉並学院高等学校":           {"form_url": "https://suginami.ed.jp/contact/",                   "source": "websearch"},
    "立正大学付属立正高等学校":   {"form_url": "https://www.rissho-hs.ac.jp/inquiry/",              "source": "websearch"},
    "駒澤大学附属高等学校":       {"form_url": "https://www.komazawa.net/inquiry/",                 "source": "websearch"},
}


NEW_DATA_ROUND7 = {
    # ===== 東京私立高校（FAX） =====
    "学習院女子高等科":               {"fax": "03-3203-8783",  "source": "websearch"},
    "瀧野川女子学園高等学校":         {"fax": "03-3949-8839",  "source": "websearch"},
    "朋優学院高等学校":               {"fax": "03-3788-1190",  "source": "websearch"},
    "日本大学豊山女子高等学校":       {"fax": "03-3937-5282",  "source": "websearch"},
    "日本工業大学駒場高等学校":       {"fax": "03-3467-2245",  "source": "websearch"},
    "東京電機大学高等学校":           {"fax": "0422-37-6822",  "source": "websearch"},
    "大東文化大学第一高等学校":       {"fax": "03-5399-7891",  "source": "websearch"},
    "多摩大学附属聖ヶ丘高等学校":     {"fax": "042-337-1761",  "source": "websearch"},
    "多摩大学目黒高等学校":           {"fax": "03-3714-2632",  "source": "websearch"},
    "文京学院大学女子高等学校":       {"fax": "03-3946-7294",  "source": "websearch"},
    "女子美術大学付属高等学校":       {"fax": "03-5340-4542",  "source": "websearch"},
    "淑徳巣鴨高等学校":               {"fax": "03-3918-6033",  "source": "websearch"},
    "上野学園高等学校":               {"fax": "03-3847-2013",  "source": "websearch"},

    # ===== 東京私立高校（メール） =====
    "成立学園高等学校":               {"email": "school@seiritsu.ac.jp",         "source": "websearch"},
    "文化学園大学杉並高等学校":       {"email": "info@bunsugi.ed.jp",             "source": "websearch"},

    # ===== 東京私立高校（フォーム） =====
    "共栄学園高等学校":               {"form_url": "https://kyoei-g.ed.jp/contact/",     "source": "websearch"},

    # ===== 国立附属高校（FAX） =====
    "筑波大学附属高等学校":           {"fax": "03-3943-0848",  "source": "websearch"},
    "お茶の水女子大学附属高等学校":   {"fax": "03-5978-5858",  "source": "websearch"},
    "東京工業大学附属科学技術高等学校": {"fax": "03-3454-8571", "source": "websearch"},

    # ===== 国立附属高校（メール） =====
    "東京学芸大学附属高等学校":       {"email": "kgk2@gakugei-hs.setagaya.tokyo.jp", "source": "websearch"},

    # ===== 千葉国際高等学校（現：翔凜） =====
    "千葉国際高等学校":               {"email": "kouho@shorin-global.ed.jp",      "source": "websearch"},

    # ===== 千葉公立高校（FAX） =====
    "習志野高等学校":                 {"fax": "047-471-4581",  "source": "websearch"},
    "市立船橋高等学校":               {"fax": "047-422-9129",  "source": "websearch"},
    "流山おおたかの森高等学校":       {"fax": "04-7155-6991",  "source": "websearch"},
    "松戸国際高等学校":               {"fax": "047-386-8518",  "source": "websearch"},
    "船橋北高等学校":                 {"fax": "047-457-9025",  "source": "websearch"},
    "幕張総合高等学校":               {"fax": "043-211-6317",  "source": "websearch"},
    "市川南高等学校":                 {"fax": "047-327-2176",  "source": "websearch"},
    "津田沼高等学校":                 {"fax": "047-454-3242",  "source": "websearch"},
    "茂原北陵高等学校":               {"fax": "0475-34-4552",  "source": "websearch"},
    "銚子商業高等学校":               {"fax": "0479-24-9819",  "source": "websearch"},
    "千葉商業高等学校":               {"fax": "043-255-8580",  "source": "websearch"},
    "千葉学芸高等学校":               {"fax": "0475-52-1163",  "source": "websearch"},
    "二松學舎大学附属柏高等学校":     {"fax": "04-7191-6712",  "source": "websearch"},
    "千葉敬愛高等学校":               {"fax": "043-423-5866",  "source": "websearch"},
    "東海大学付属浦安高等学校":       {"fax": "047-351-2373",  "source": "websearch"},
    "光英VERITAS高等学校":            {"fax": "047-392-8116",  "source": "websearch"},
    "昭和学院高等学校":               {"fax": "047-326-5310",  "source": "websearch"},

    # ===== 千葉私立高校（メール） =====
    "日本体育大学柏高等学校":         {"email": "jimu@k-nittai.ed.jp",            "source": "websearch"},
    "柏日体高等学校":                 {"email": "jimu@k-nittai.ed.jp",            "source": "websearch"},

    # ===== 千葉私立高校（フォーム） =====
    "西武台千葉高等学校":             {"form_url": "https://www.seibudai-chiba.jp/admissions/briefing-sessions/", "source": "websearch"},
    "聖徳大学附属女子高等学校":       {"form_url": "https://www.matsudo-seitoku.ed.jp/contact/",                  "source": "websearch"},

    # ===== 都立中等教育学校（FAX） =====
    "東京都立小石川中等教育学校":     {"fax": "03-3946-7397",  "source": "websearch"},
    "東京都立南多摩中等教育学校":     {"fax": "042-642-2195",  "source": "websearch"},

    # ===== 茨城公立（メール・古河中等） =====
    "茨城県立古河中等教育学校":       {"email": "koho@koga-cs.ibk.ed.jp",         "source": "websearch"},

    # ===== 茨城公立附属中（ibk.ed.jp パターン） =====
    "茨城県立水戸第一高等学校附属中学校":   {"email": "koho@mito1-h.ibk.ed.jp",       "source": "pattern_ibk"},
    "茨城県立土浦第一高等学校附属中学校":   {"email": "koho@tsuchiura1-h.ibk.ed.jp",  "source": "pattern_ibk"},
    "茨城県立日立第一高等学校附属中学校":   {"email": "koho@hitachi1-h.ibk.ed.jp",    "source": "pattern_ibk"},
    "茨城県立太田第一高等学校附属中学校":   {"email": "koho@ota1-h.ibk.ed.jp",        "source": "pattern_ibk"},
    "茨城県立下館第一高等学校附属中学校":   {"email": "koho@shimodate1-h.ibk.ed.jp",  "source": "pattern_ibk"},
    "茨城県立竜ヶ崎第一高等学校附属中学校": {"email": "koho@ryugasaki1-h.ibk.ed.jp",  "source": "pattern_ibk"},
    "茨城県立水海道第一高等学校附属中学校": {"email": "koho@mitsukaido1-h.ibk.ed.jp", "source": "pattern_ibk"},
    "茨城県立鉾田第一高等学校附属中学校":   {"email": "koho@hokota1-h.ibk.ed.jp",     "source": "pattern_ibk"},

    # ===== 東京私立中学（FAX） =====
    "安田学園中学校":                 {"fax": "03-3624-2643",  "source": "websearch"},
    "広尾学園中学校":                 {"fax": "03-3444-7192",  "source": "websearch"},
    "山脇学園中学校":                 {"fax": "03-3585-3914",  "source": "websearch"},
    "跡見学園中学校":                 {"fax": "03-3941-8685",  "source": "websearch"},
    "十文字中学校":                   {"fax": "03-3576-8428",  "source": "websearch"},
    "目黒日本大学中学校":             {"fax": "03-5759-7584",  "source": "websearch"},
    "京華女子中学校":                 {"fax": "03-3946-4315",  "source": "websearch"},
    "佼成学園中学校":                 {"fax": "03-3380-5656",  "source": "websearch"},
    "郁文館中学校":                   {"fax": "03-3828-1261",  "source": "websearch"},
    "帝京大学中学校":                 {"fax": "03-3963-6415",  "source": "websearch"},

    # ===== 東京私立中学（メール） =====
    "かえつ有明中学校":               {"email": "kikitai@ariake.kaetsu.ac.jp",    "source": "websearch"},
    "鷗友学園女子中学校":             {"email": "info@ohyu.ed.jp",                "source": "websearch"},
    "共立女子中学校":                 {"email": "chukou@kyoritsu-wu.ac.jp",       "source": "websearch"},
    "東洋大学京北中学校":             {"email": "ml-nyushi-j@toyo.jp",            "source": "websearch"},

    # ===== 東京私立中学（フォーム） =====
    "工学院大学附属中学校":           {"form_url": "https://www.js.kogakuin.ac.jp/about/contact.html", "source": "websearch"},
    "実践女子学園中学校":             {"form_url": "https://hs.jissen.ac.jp/contact/",                 "source": "websearch"},

    # ===== 千葉私立中学（FAX） =====
    "和洋国府台女子中学校":           {"fax": "047-371-1128",  "source": "websearch"},
    "成田高等学校付属中学校":         {"fax": "0476-23-0234",  "source": "websearch"},

    # ===== 千葉私立中学（メール） =====
    "暁星国際中学校":                 {"email": "entry@gis.ac.jp",                "source": "websearch"},

    # ===== 光英VERITAS中学校（同高校のFAX） =====
    "光英VERITAS中学校":              {"fax": "047-392-8116",  "source": "websearch"},

    # ===== 茨城私立中学（メール）=====
    "常磐大学中学校":                 {"email": "tokikou@tokiwa.ac.jp",           "source": "websearch"},
}


NEW_DATA_ROUND8 = {
    # ===== 東京私立中学（FAX） =====
    "女子学院中学校":             {"fax": "03-3263-1715",  "source": "websearch"},
    "早稲田中学校":               {"fax": "03-3202-7692",  "source": "websearch"},
    "駒場東邦中学校":             {"fax": "03-3466-8225",  "source": "websearch"},
    "筑波大学附属駒場中学校":     {"fax": "03-3411-8977",  "source": "websearch"},
    "中央大学附属中学校":         {"fax": "042-381-7653",  "source": "websearch"},
    "吉祥女子中学校":             {"fax": "0422-22-9752",  "source": "websearch"},
    "東海大学菅生中学校":         {"fax": "042-559-2202",  "source": "websearch"},
    "淑徳巣鴨中学校":             {"fax": "03-3918-6033",  "source": "websearch"},
    "東京電機大学中学校":         {"fax": "0422-37-6822",  "source": "websearch"},
    "多摩大学附属聖ヶ丘中学校":   {"fax": "042-337-1761",  "source": "websearch"},
    "日本工業大学駒場中学校":     {"fax": "03-3467-2245",  "source": "websearch"},
    "朋優学院中学校":             {"fax": "03-3788-1190",  "source": "websearch"},

    # ===== 神奈川私立中学（FAX） =====
    "鎌倉女学院中学校":           {"fax": "0467-25-1358",  "source": "websearch"},

    # ===== 東京私立中学（メール） =====
    "立教池袋中学校":             {"email": "ikekoho@rikkyo.ac.jp",                  "source": "websearch"},
    "立教女学院中学校":           {"email": "jogakuin-chuukou@rikkyojogakuin.ac.jp",  "source": "websearch"},
    "東京女学館中学校":           {"email": "tjkkoho@tjk.jp",                         "source": "websearch"},
    "成立学園中学校":             {"email": "school@seiritsu.ac.jp",                  "source": "websearch"},

    # ===== 東京私立中学（フォーム） =====
    "明治大学付属明治中学校":     {"form_url": "https://www.meiji.ac.jp/ko_chu/contact/inquiry.html", "source": "websearch"},
    "攻玉社中学校":               {"form_url": "https://kogyokusha.ed.jp/contact/",                   "source": "websearch"},
    "世田谷学園中学校":           {"form_url": "https://www.setagayagakuen.ac.jp/contact/",           "source": "websearch"},
    "頌栄女子学院中学校":         {"form_url": "https://www.shoei.ed.jp/contact/",                   "source": "websearch"},
    "恵泉女学園中学校":           {"form_url": "https://www.keisen.jp/form_inquiry/",                "source": "websearch"},
    "共栄学園中学校":             {"form_url": "https://kyoei-g.ed.jp/contact/",                    "source": "websearch"},

    # ===== 千葉私立中学（FAX） =====
    "昭和学院中学校":             {"fax": "047-326-5310",  "source": "websearch"},
    "二松學舎大学附属柏中学校":   {"fax": "04-7191-6712",  "source": "websearch"},
    "日本大学豊山女子中学校":     {"fax": "03-3937-5282",  "source": "websearch"},

    # ===== 千葉私立中学（メール） =====
    "東京学館浦安中学校":         {"email": "kouhou@gakkan-urayasu.ed.jp",            "source": "websearch"},
    "日出学園中学校":             {"email": "kouhou@hinode.ed.jp",                    "source": "websearch"},

    # ===== 千葉私立中学（フォーム） =====
    "八千代松陰中学校":           {"form_url": "https://www.yachiyoshoin.ac.jp/index/form-request/", "source": "websearch"},
    "聖徳大学附属女子中学校":     {"form_url": "https://www.matsudo-seitoku.ed.jp/contact/",         "source": "websearch"},
    "芝浦工業大学柏中学校":       {"form_url": "https://www.ka.shibaura-it.ac.jp/contact/",          "source": "websearch"},

    # ===== 茨城私立中学（メール） =====
    "明秀学園日立中学校":         {"email": "meishu@meishu.ac.jp",                    "source": "websearch"},
    "清真学園中学校":             {"email": "seishin@seishingakuen.ed.jp",            "source": "websearch"},

    # ===== 茨城私立中学（フォーム） =====
    "茨城キリスト教学院中学校":   {"form_url": "https://www.icc.ac.jp/ich/toiawase.html",            "source": "websearch"},

    # ===== 都立附属中・中等教育学校（FAX） =====
    "東京都立桜修館中等教育学校":     {"fax": "03-3724-7041",  "source": "websearch"},
    "東京都立両国高等学校附属中学校": {"fax": "03-3846-6682",  "source": "websearch"},
    "東京都立三鷹中等教育学校":       {"fax": "0422-49-8429",  "source": "websearch"},
    "東京都立立川国際中等教育学校":   {"fax": "042-527-1829",  "source": "websearch"},
}


NEW_DATA_ROUND9 = {
    # ===== 都立高校（FAX） =====
    "都立広尾高等学校":                   {"fax": "03-3400-8424",  "source": "websearch"},

    # ===== 都立附属中・中等教育学校（FAX） =====
    "東京都立武蔵中学校":                 {"fax": "0422-51-3966",  "source": "websearch"},
    "東京都立白鷗高等学校附属中学校":     {"fax": "03-3841-6925",  "source": "websearch"},
    "東京都立富士高等学校附属中学校":     {"fax": "03-3382-8224",  "source": "websearch"},
    "東京都立大泉高等学校附属中学校":     {"fax": "03-3924-9931",  "source": "websearch"},

    # ===== 区立中等教育学校（FAX） =====
    "千代田区立九段中等教育学校":         {"fax": "03-3288-3499",  "source": "websearch"},

    # ===== 国立附属中（メール・FAX） =====
    "お茶の水女子大学附属中学校":         {"email": "fuzoku-chu@cc.ocha.ac.jp",  "source": "websearch"},
    "筑波大学附属中学校":                 {"fax": "03-3945-3886",  "source": "websearch"},

    # ===== 東京私立中学（FAX） =====
    "白百合学園中学校":                   {"fax": "03-3234-6970",  "source": "websearch"},
    "東京農業大学第一中学校":             {"fax": "03-3420-7199",  "source": "websearch"},
    "日本大学豊山中学校":                 {"fax": "03-3943-1991",  "source": "websearch"},
    "慶應義塾女子中学校":                 {"fax": "03-5427-1676",  "source": "websearch"},
    "富士見丘高等学校":                   {"fax": "03-3378-0695",  "source": "websearch"},
    "富士見丘中学校":                     {"fax": "03-3378-0695",  "source": "websearch"},
    "法政大学中学校":                     {"fax": "0422-79-6260",  "source": "websearch"},
    "明治学院中学校":                     {"fax": "03-5421-5014",  "source": "websearch"},

    # ===== 東京私立中学（フォーム） =====
    "晃華学園中学校":                     {"form_url": "https://jhs.kokagakuen.ac.jp/toiawase/",  "source": "websearch"},
    "昭和女子大学附属昭和中学校":         {"form_url": "https://jhs.swu.ac.jp/",                  "source": "websearch"},

    # ===== 千葉私立中学（FAX） =====
    "千葉明徳中学校":                     {"fax": "043-265-3709",  "source": "websearch"},
    "千葉日本大学第一中学校":             {"fax": "047-468-0646",  "source": "websearch"},
    "秀明八千代中学校":                   {"fax": "047-450-7009",  "source": "websearch"},

    # ===== 千葉私立中学（フォーム） =====
    "流通経済大学付属柏中学校":           {"form_url": "https://www.ryukei.ed.jp/inquiry.html",   "source": "websearch"},

    # ===== 千葉公立中学（FAX） =====
    "千葉県立千葉中学校":                 {"fax": "043-221-4011",  "source": "websearch"},
    "千葉県立東葛飾中学校":               {"fax": "04-7143-8677",  "source": "websearch"},

    # ===== 茨城私立中学（メール） =====
    "水戸英宏中学校":                     {"email": "info@mito-eiko.ed.jp",  "source": "websearch"},
}


NEW_DATA_ROUND10 = {
    # ===== 残17校の調査結果 =====

    # ---- 連絡先あり ----
    "土浦日本大学中等教育学校":       {"email": "sec-sch@tng.ac.jp",             "source": "websearch"},
    "三田国際学園高等学校":           {"email": "international@mita-is.ed.jp",   "source": "websearch"},
    "三田国際学園中学校":             {"email": "international@mita-is.ed.jp",   "source": "websearch"},
    "武蔵野東高等学校":               {"form_url": "https://docs.google.com/forms/d/e/1FAIpQLSf2YE0TLxcAAJWY9naXOUg_RrHp_yFKqdl2up4jS-71WHI-8A/viewform", "source": "websearch"},
    "千葉市立稲毛国際中等教育学校":   {"fax": "043-279-0565",                    "source": "websearch"},

    # ---- 廃校・存在しない学校（not_found としてリストから除外）----
    # 都立：廃校
    "都立南高等学校":     {"status": "not_found", "note": "closed_2005"},  # 2005年閉校
    "都立秋川高等学校":   {"status": "not_found", "note": "closed_2001"},  # 2001年閉校
    "都立北高等学校":     {"status": "not_found", "note": "closed_1997"},  # 1997年閉校
    "都立稲城高等学校":   {"status": "not_found", "note": "closed_2004"},  # 2004年閉校

    # 都立：名称不存在（データベース誤記または廃校）
    "都立南千住高等学校": {"status": "not_found", "note": "no_such_school"},
    "都立八王子高等学校": {"status": "not_found", "note": "no_such_school"},
    "都立あきる野高等学校": {"status": "not_found", "note": "no_such_school"},  # 秋留台が正式名

    # 茨城：名称不存在
    "常陸太田高等学校":       {"status": "not_found", "note": "no_such_school"},  # 太田第一が正式名
    "ひたちなか総合高等学校": {"status": "not_found", "note": "no_such_school"},  # ibk.ed.jpに存在せず

    # 千葉：名称不存在
    "千葉農業高等学校":       {"status": "not_found", "note": "no_such_school"},
    "千葉県立諏訪の杜中学校": {"status": "not_found", "note": "no_such_school"},  # 中学校は存在せず

    # ICU：中学校なし
    "ICU中学校":              {"status": "not_found", "note": "no_such_school"},  # ICUは高校のみ
}


NEW_DATA_ROUND6 = {
    # ===== 東京私立（FAX） =====
    "東京家政学院高等学校":       {"fax": "03-3262-2223",  "source": "websearch"},
    "十文字高等学校":             {"fax": "03-3576-8428",  "source": "websearch"},
    "東星学園高等学校":           {"fax": "042-493-3337", "source": "websearch"},
    "貞静学園高等学校":           {"fax": "03-3945-8895",  "source": "websearch"},
    "東京純心女子高等学校":       {"fax": "042-692-4722", "source": "websearch"},
    "文華女子高等学校":           {"fax": "042-463-5300", "source": "websearch"},
    "聖心女子学院高等科":         {"fax": "03-3444-0094",  "source": "websearch"},
    "八王子実践高等学校":         {"fax": "042-627-1101", "source": "websearch"},

    # ===== 東京私立（フォーム） =====
    "実践女子学園高等学校":       {"form_url": "https://hs.jissen.ac.jp/contact/",      "source": "websearch"},
    "共立女子第二高等学校":       {"form_url": "https://reg31.smp.ne.jp/regist/is?SMPFORM=lemg-ngocr-829b5e02c7201148bbe2d51f67f0ca33", "source": "websearch"},

    # ===== 東京私立（メール） =====
    "千葉経済大学附属高等学校":   {"email": "info@cku-h.ed.jp",                         "source": "websearch"},

    # ===== 茨城私立（FAX） =====
    "つくば国際大学高等学校":     {"fax": "029-824-6495", "source": "websearch"},

    # ===== 茨城私立（メール） =====
    "大成女子高等学校":           {"email": "tghs-info@taisei.ac.jp",                   "source": "websearch"},

    # ===== 千葉私立（FAX） =====
    "志学館高等部":               {"fax": "0438-37-3184", "source": "websearch"},

    # ===== 千葉私立（メール） =====
    "鴨川令徳高等学校":           {"email": "info@reitoku.ed.jp",                       "source": "websearch"},

    # ===== 茨城公立（メール・パターンマッチ） =====
    "鉾田農業高等学校":           {"email": "koho@hokota2-h.ibk.ed.jp", "source": "pattern_ibk"},
    "多賀工業高等学校":           {"email": "koho@taga-h.ibk.ed.jp",   "source": "pattern_ibk"},
    "境農業高等学校":             {"email": "koho@sakai-ah.ibk.ed.jp", "source": "pattern_ibk"},
    "鹿島工業高等学校":           {"email": "koho@kashima-th.ibk.ed.jp","source": "pattern_ibk"},
    "下館商業高等学校":           {"email": "koho@shimodate-ch.ibk.ed.jp","source": "pattern_ibk"},
    # 千葉農業高等学校 は千葉県立のため chiba-c.ed.jp ドメイン → 別途調査

    # ===== 栃木公立（FAX） =====
    "真岡北陵高等学校":           {"fax": "0285-83-4634", "source": "websearch"},

    # ===== 神奈川私立（FAX） =====
    "緑ヶ丘女子高等学校":         {"fax": "046-825-0915", "source": "websearch"},
}


NEW_DATA_ROUND5 = {
    # ===== 東京都立（FAX） =====
    "都立富士森高等学校":         {"fax": "042-662-9830", "source": "websearch", "site_url": "https://www.metro.ed.jp/fujimori-h/"},
    "都立拝島高等学校":           {"fax": "042-546-0730", "source": "websearch", "site_url": "https://www.metro.ed.jp/haijima-h/"},
    "都立田柄高等学校":           {"fax": "03-3977-2617",  "source": "websearch", "site_url": "https://www.metro.ed.jp/tagara-h/"},
    "都立府中東高等学校":         {"fax": "042-369-8506", "source": "websearch", "site_url": "https://www.metro.ed.jp/fuchuhigashi-h/"},
    "都立羽村高等学校":           {"fax": "042-555-0430", "source": "websearch", "site_url": "https://www.metro.ed.jp/hamura-h/"},
    "都立大島高等学校":           {"fax": "04992-2-2461", "source": "websearch", "site_url": "https://www.metro.ed.jp/oshima-h/"},
    "都立昭和高等学校":           {"fax": "042-546-0150", "source": "websearch", "site_url": "https://www.metro.ed.jp/showa-h/"},
    "都立武蔵野北高等学校":       {"fax": "0422-51-4164", "source": "websearch", "site_url": "https://www.metro.ed.jp/musashinokita-h/"},
    "都立町田高等学校":           {"fax": "042-724-1330", "source": "websearch", "site_url": "https://www.metro.ed.jp/machida-h/"},
    "都立府中高等学校":           {"fax": "042-360-0064", "source": "websearch", "site_url": "https://www.metro.ed.jp/fuchu-h/"},
    "都立神代高等学校":           {"fax": "03-3300-5170",  "source": "websearch", "site_url": "https://www.metro.ed.jp/jindai-h/"},
    "都立江北高等学校":           {"fax": "03-3880-6755",  "source": "websearch", "site_url": "https://www.metro.ed.jp/kohoku-h/"},
    "都立成瀬高等学校":           {"fax": "042-724-1336", "source": "websearch", "site_url": "https://www.metro.ed.jp/naruse-h/"},
    "都立山崎高等学校":           {"fax": "042-794-0440", "source": "websearch", "site_url": "https://www.metro.ed.jp/yamasaki-h/"},
    "都立片倉高等学校":           {"fax": "042-635-0682", "source": "websearch", "site_url": "https://www.metro.ed.jp/katakura-h/"},
    "都立武蔵村山高等学校":       {"fax": "042-560-8691", "source": "websearch", "site_url": "https://www.metro.ed.jp/musashimurayama-h/"},
    "都立野津田高等学校":         {"fax": "042-734-9388", "source": "websearch", "site_url": "https://www.metro.ed.jp/nozuta-h/"},
    "都立東久留米総合高等学校":   {"fax": "042-475-8400", "source": "websearch", "site_url": "https://www.metro.ed.jp/higashikurumesogo-h/"},
    "都立瑞穂農芸高等学校":       {"fax": "042-556-2439", "source": "websearch", "site_url": "https://www.metro.ed.jp/mizuhonogei-h/"},
    "都立葛西工業高等学校":       {"fax": "03-3674-6187",  "source": "websearch", "site_url": "https://www.metro.ed.jp/kasaikoka-h/"},
    "都立青梅総合高等学校":       {"fax": "0428-22-7624", "source": "websearch", "site_url": "https://www.metro.ed.jp/omesogo-h/"},
    "都立高島高等学校":           {"fax": "03-3938-4057",  "source": "websearch", "site_url": "https://www.metro.ed.jp/takashima-h/"},

    # ===== 千葉私立（FAX） =====
    "国府台女子学院高等部":           {"fax": "047-326-8844", "source": "websearch"},
    "東京学館高等学校":               {"fax": "043-496-3523", "source": "websearch"},
    "我孫子二階堂高等学校":           {"fax": "04-7184-9453", "source": "websearch"},
    "千葉萌陽高等学校":               {"fax": "0478-55-1091", "source": "websearch"},
    "市原中央高等学校":               {"fax": "0436-36-7141", "source": "websearch"},
    "敬愛学園高等学校":               {"fax": "043-284-3750", "source": "websearch"},

    # ===== 千葉私立（メール） =====
    "東京学館浦安高等学校":           {"email": "kouhou@gakkan-urayasu.ed.jp",    "source": "websearch"},
    "日出学園高等学校":               {"email": "kouhou@hinode.ed.jp",            "source": "websearch"},

    # ===== 千葉私立（フォーム） =====
    "八千代松陰高等学校":             {"form_url": "https://www.yachiyoshoin.ac.jp/index/form-request/", "source": "websearch"},
    "東海大学付属市原望洋高等学校":   {"form_url": "https://www.boyo.tokai.ed.jp/contact/form/",       "source": "websearch"},

    # ===== 茨城私立（メール） =====
    "東洋大学附属牛久高等学校":       {"email": "kouhou@toyo-ushiku.ed.jp",  "source": "websearch"},
    "水戸葵陵高等学校":               {"email": "nyushi@kiryo.ac.jp",         "source": "websearch"},
    "明秀学園日立高等学校":           {"email": "meishu@meishu.ac.jp",        "source": "websearch"},
    "常磐大学高等学校":               {"email": "tokikou@tokiwa.ac.jp",       "source": "websearch"},

    # ===== 茨城私立（FAX） =====
    "岩瀬日本大学高等学校":           {"fax": "0296-75-4905", "source": "websearch"},
    "水戸啓明高等学校":               {"fax": "029-243-9680", "source": "websearch"},

    # ===== 茨城私立（フォーム） =====
    "つくば秀英高等学校":             {"form_url": "https://tsukubashuei.com/contact.html",            "source": "websearch"},
    "鹿島学園高等学校":               {"form_url": "https://kgh.ed.jp/contact/main.html",             "source": "websearch"},

    # ===== 東京私立（FAX） =====
    "関東第一高等学校":               {"fax": "03-3653-1174",  "source": "websearch"},
    "佼成学園高等学校":               {"fax": "03-3380-5656",  "source": "websearch"},
    "聖心女子学院高等科":             {"fax": "03-3444-0094",  "source": "websearch"},
    "実践学園高等学校":               {"fax": "03-3363-8396",  "source": "websearch"},

    # ===== 東京私立（メール） =====
    "錦城学園高等学校":               {"email": "kinjogakuen-mail@kinjogakuen-h.ed.jp", "source": "websearch"},

    # ===== 東京私立（フォーム） =====
    "和洋九段女子高等学校":           {"form_url": "https://www.wayokudan.ed.jp/inquiry/",            "source": "websearch"},
    "大妻多摩高等学校":               {"form_url": "https://www.otsuma-tama.ed.jp/contact/",          "source": "websearch"},
    "自由ヶ丘学園高等学校":           {"form_url": "https://www.jiyugaoka.ed.jp/contact/",            "source": "websearch"},
    "目黒日本大学高等学校":           {"form_url": "https://www.meguro-nichidai.ed.jp/senior/contact/", "source": "websearch"},
    "宝仙学園高等学校":               {"form_url": "https://www.hosen.ed.jp/top/inquiry/",            "source": "websearch"},
}


NEW_DATA_ROUND4 = {
    # ===== 東京都立（FAX） =====
    "都立翔陽高等学校":     {"fax": "042-663-3362", "source": "websearch", "site_url": "https://www.metro.ed.jp/shoyo-h/"},
    "都立南多摩高等学校":   {"fax": "042-642-2195", "source": "websearch", "site_url": "https://www.metro.ed.jp/minamitama-s/"},
    "都立小平高等学校":     {"fax": "042-342-7482", "source": "websearch", "site_url": "https://www.metro.ed.jp/kodaira-h/"},
    "都立清瀬高等学校":     {"fax": "042-491-9491", "source": "websearch", "site_url": "https://www.metro.ed.jp/kiyose-h/"},
    "都立東村山高等学校":   {"fax": "042-392-7275", "source": "websearch", "site_url": "https://www.metro.ed.jp/higashimurayama-h/"},
    "都立東大和高等学校":   {"fax": "042-565-0781", "source": "websearch", "site_url": "https://www.metro.ed.jp/higashiyamato-h/"},
    "都立日野台高等学校":   {"fax": "042-581-5035", "source": "websearch", "site_url": "https://www.metro.ed.jp/hinodai-h/"},
    "都立桜町高等学校":     {"fax": "03-3700-9141",  "source": "websearch", "site_url": "https://www.metro.ed.jp/sakuramachi-h/"},
    "都立多摩高等学校":     {"fax": "0428-23-5581", "source": "websearch", "site_url": "https://www.metro.ed.jp/tama-h/"},
    "都立小岩高等学校":     {"fax": "03-3674-1405", "source": "websearch", "site_url": "https://www.metro.ed.jp/koiwa-h/"},
    "都立大森高等学校":     {"fax": "03-3754-0978", "source": "websearch", "site_url": "https://www.metro.ed.jp/omori-h/"},
    "都立南平高等学校":     {"fax": "042-593-1442", "source": "websearch", "site_url": "https://www.metro.ed.jp/minamidaira-h/"},
    # ===== 千葉私立（フォーム） =====
    "千葉黎明高等学校":     {"form_url": "https://www.reimei.ac.jp/contact/", "source": "websearch"},
}


def main():
    with open(RESULTS_JSON, encoding="utf-8") as f:
        existing = json.load(f)

    updated = 0
    combined = {**NEW_DATA, **NEW_DATA_ROUND2, **NEW_DATA_ROUND3, **NEW_DATA_ROUND4, **NEW_DATA_ROUND5, **NEW_DATA_ROUND6, **NEW_DATA_ROUND7, **NEW_DATA_ROUND8, **NEW_DATA_ROUND9, **NEW_DATA_ROUND10}
    for school, data in combined.items():
        if school in existing:
            old = existing[school]
            if old.get("status") == "not_found" or not (old.get("email") or old.get("form_url") or old.get("fax")):
                existing[school] = data
                updated += 1
        else:
            existing[school] = data
            updated += 1

    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    write_sql(existing)

    print(f"更新: {updated} 件")
    summary = {"email": 0, "form": 0, "fax": 0, "not_found": 0, "other": 0}
    for v in existing.values():
        if v.get("email"):     summary["email"]     += 1
        elif v.get("form_url"): summary["form"]     += 1
        elif v.get("fax"):      summary["fax"]      += 1
        elif v.get("status") == "not_found": summary["not_found"] += 1
        else: summary["other"] += 1
    print(f"  メール: {summary['email']} / フォーム: {summary['form']} / FAX: {summary['fax']} / 未取得: {summary['not_found']}")
    print(f"SQL: {RESULTS_SQL}")


if __name__ == "__main__":
    main()
