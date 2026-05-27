"""
茨城県立高校 koho@ メールアドレス一括生成スクリプト
ibk.ed.jp ドメインのURL一覧から生成
"""
import json, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

# 茨城県教育委員会ページから取得したURL一覧 → email pattern
# URL: http://www.{prefix}.ibk.ed.jp/ → email: koho@{prefix}.ibk.ed.jp
IBARAKI_URL_MAP = {
    "高萩清松高等学校":       "takahagiseisho-h",
    "日立第一高等学校":       "hitachi1-h",
    "日立第二高等学校":       "hitachi2-h",
    "日立工業高等学校":       "hitachi-th",
    "多賀高等学校":           "taga-h",
    "日立商業高等学校":       "hitachi-ch",
    "日立北高等学校":         "hitachikita-h",
    "磯原郷英高等学校":       "isoharakyoei-h",
    "太田第一高等学校":       "ota1-h",
    "太田西山高等学校":       "otaseizan-h",
    "大子清流高等学校":       "daigoseiryu-h",
    "小瀬高等学校":           "ose-h",
    "常陸大宮高等学校":       "hitachiomiya-h",
    "水戸第一高等学校":       "mito1-h",
    "水戸第二高等学校":       "mito2-h",
    "水戸第三高等学校":       "mito3-h",
    "緑岡高等学校":           "midorioka-h",
    "水戸農業高等学校":       "mito-ah",
    "水戸工業高等学校":       "mito-th",
    "水戸商業高等学校":       "mito-ch",
    "水戸桜ノ牧高等学校":     "mitosakuranomaki-h",
    "勝田工業高等学校":       "katsuta-th",
    "佐和高等学校":           "sawa-h",
    "那珂湊高等学校":         "nakaminato-h",
    "海洋高等学校":           "kaiyo-h",
    "笠間高等学校":           "kasama-h",
    "大洗高等学校":           "oarai-h",
    "東海高等学校":           "tokai-h",
    "茨城東高等学校":         "ibarakihigashi-h",
    "那珂高等学校":           "naka-h",
    "鉾田第一高等学校":       "hokota1-h",
    "鉾田第二高等学校":       "hokota2-h",
    "玉造工業高等学校":       "tamatsukuri-th",
    "麻生高等学校":           "asou-h",
    "潮来高等学校":           "itako-h",
    "鹿島高等学校":           "kashima-h",
    "神栖高等学校":           "kamisu-h",
    "波崎高等学校":           "hasaki-h",
    "波崎柳川高等学校":       "hasakiyanagawa-h",
    "土浦第一高等学校":       "tsuchiura1-h",
    "土浦第二高等学校":       "tsuchiura2-h",
    "土浦第三高等学校":       "tsuchiura3-h",
    "土浦工業高等学校":       "tsuchiura-th",
    "土浦湖北高等学校":       "tsuchiurakohoku-h",
    "石岡第一高等学校":       "ishioka1-h",
    "石岡第二高等学校":       "ishioka2-h",
    "石岡商業高等学校":       "ishioka-ch",
    "中央高等学校":           "chuo-h",
    "竜ヶ崎第一高等学校":     "ryugasaki1-h",
    "竜ヶ崎第二高等学校":     "ryugasaki2-h",
    "竜ヶ崎南高等学校":       "ryugasakiminami-h",
    "江戸崎総合高等学校":     "edosakisougou-h",
    "取手第一高等学校":       "toride1-h",
    "取手第二高等学校":       "toride2-h",
    "取手松陽高等学校":       "torideshoyo-h",
    "藤代高等学校":           "fujishiro-h",
    "藤代紫水高等学校":       "fujishiroshisui-h",
    "牛久高等学校":           "ushiku-h",
    "牛久栄進高等学校":       "ushikueishin-h",
    "筑波高等学校":           "tsukuba-h",
    "竹園高等学校":           "takezono-h",
    "つくばサイエンス高等学校": "tsukuba-science-h",
    "岩瀬高等学校":           "iwase-h",
    "真壁高等学校":           "makabe-h",
    "下館第一高等学校":       "shimodate1-h",
    "下館第二高等学校":       "shimodate2-h",
    "下館工業高等学校":       "shimodate-th",
    "明野高等学校":           "akeno-h",
    "下妻第一高等学校":       "shimotsuma1-h",
    "下妻第二高等学校":       "shimotsuma2-h",
    "結城第一高等学校":       "yuki1-h",
    "鬼怒商業高等学校":       "kinu-ch",
    "石下紫峰高等学校":       "ishigeshiho-h",
    "水海道第一高等学校":     "mitsukaido1-h",
    "水海道第二高等学校":     "mitsukaido2-h",
    "古河第一高等学校":       "koga1-h",
    "古河第二高等学校":       "koga2-h",
    "古河第三高等学校":       "koga3-h",
    "総和工業高等学校":       "sowa-th",
    "三和高等学校":           "sanwa-h",
    "境高等学校":             "sakai-h",
    "坂東清風高等学校":       "bandoseifu-h",
    "守谷高等学校":           "moriya-h",
    "伊奈高等学校":           "ina-h",
    # 既知だが念のため（重複は上書きしない）
    "水戸南高等学校":         "mitominami-h",
    "那珂湊高等学校":         "nakaminato-h",
}

# 特殊パターン（koho@ ではなく別prefix）
SPECIAL_EMAILS = {
    "鉾田第一高等学校": "ac-koho@hokota1-h.ibk.ed.jp",
}

OUT_DIR = Path(__file__).parent
RESULTS_JSON = OUT_DIR / "contact_results.json"
RESULTS_SQL  = OUT_DIR / "contact_results.sql"

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

def main():
    with open(RESULTS_JSON, encoding="utf-8") as f:
        results = json.load(f)

    added = 0
    for school, prefix in IBARAKI_URL_MAP.items():
        if school in results and (results[school].get("email") or results[school].get("form_url")):
            continue  # already have contact
        if school in SPECIAL_EMAILS:
            email = SPECIAL_EMAILS[school]
        else:
            email = f"koho@{prefix}.ibk.ed.jp"
        results[school] = {"email": email, "source": "pattern_ibk"}
        added += 1
        print(f"  {school} → {email}")

    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    write_sql(results)

    print(f"\n追加: {added} 件 (茨城パターン)")
    print(f"Total: {len(results)} 校")
    counts = {"email": 0, "form": 0, "fax": 0}
    for v in results.values():
        if v.get("email"):    counts["email"] += 1
        elif v.get("form_url"): counts["form"] += 1
        elif v.get("fax"):    counts["fax"]   += 1
    print(f"  メール:{counts['email']} / フォーム:{counts['form']} / FAX:{counts['fax']}")

if __name__ == "__main__":
    main()
