import sys, json, re
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

BASE = Path(__file__).parent.parent
SQL_FILES = [
    "high-schools-setup.sql", "schools-extended-setup.sql",
    "schools-extended2-setup.sql", "schools-extended3-setup.sql",
    "middle-schools-setup.sql",
]
ALREADY_CONTACTED = {
    "水戸第一高等学校", "竹園高等学校", "緑岡高等学校", "日立第一高等学校",
    "江戸川学園取手高等学校", "江戸川学園取手中学校", "茗溪学園高等学校", "茗溪学園中学校",
    "常総学院高等学校", "常総学院中学校", "土浦日本大学高等学校", "守谷高等学校",
    "取手松陽高等学校", "水戸第二高等学校", "土浦第二高等学校", "茨城県立並木中等教育学校",
    "常陸大宮高等学校", "市立千葉高等学校", "ICU高等学校", "中央大学杉並高等学校",
    "立教新座高等学校", "東洋英和女学院高等部", "東京都市大学付属高等学校",
    "都立新宿高等学校", "都立両国高等学校", "都立墨田川高等学校", "都立白鷗高等学校",
    "都立大泉高等学校", "海城高等学校", "海城中学校",
    "開成高等学校", "開成中学校", "麻布高等学校", "麻布中学校",
    "青山学院高等部", "青山学院中等部", "法政大学高等学校",
    "明治大学付属明治高等学校", "武蔵高等学校", "豊島岡女子学園高等学校",
    "豊島岡女子学園中学校", "吉祥女子高等学校", "中央大学附属高等学校",
    "広尾学園高等学校", "鷗友学園女子高等学校", "早稲田大学高等学院",
    "白百合学園高等学校", "明治大学付属中野高等学校", "城北高等学校",
    "日本大学豊山高等学校", "東京農業大学第一高等学校", "武蔵野大学附属千代田高等学院",
    "桜蔭中学校", "渋谷教育学園渋谷中学校", "開智望高等学校", "開智望中等教育学校",
    "渋谷教育学園幕張高等学校", "渋谷教育学園幕張中学校", "市川高等学校", "市川中学校",
    "東邦大学付属東邦高等学校", "東邦大学付属東邦中学校", "専修大学松戸高等学校",
    "専修大学松戸中学校", "千葉日本大学第一高等学校", "麗澤高等学校",
    "拓殖大学紅陵高等学校", "昭和学院秀英高等学校", "昭和学院秀英中学校",
    "日本大学習志野高等学校", "検見川高等学校", "柏中央高等学校",
    "流通経済大学付属柏高等学校", "千葉明徳高等学校", "二松學舍大学附属柏高等学校",
}

pat = re.compile(r"'([^']{3,35}(?:高等学校|中学校|中等教育学校|高等部|高等科|女学校))'")
names, seen = [], set()
for f in SQL_FILES:
    fp = BASE / f
    if not fp.exists():
        print(f"MISSING: {f}")
        continue
    with open(fp, encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("--") or "UPDATE" in line:
                continue
            for m in pat.finditer(line):
                n = m.group(1).strip()
                if n not in seen:
                    seen.add(n)
                    names.append(n)

results = json.load(open(Path(__file__).parent / "contact_results.json", encoding="utf-8"))
todo = [s for s in names if s not in ALREADY_CONTACTED and s not in results]
print(f"全校: {len(names)} / ALREADY: {len(ALREADY_CONTACTED)} / 調査済み: {len(results)} / 残り: {len(todo)}")
# Save to file for reference
with open(Path(__file__).parent / "remaining_schools.txt", "w", encoding="utf-8") as f:
    for s in todo:
        f.write(s + "\n")
print(f"残校リストを remaining_schools.txt に保存しました")
print("\n最初の50校:")
for s in todo[:50]:
    print(f"  {s}")
