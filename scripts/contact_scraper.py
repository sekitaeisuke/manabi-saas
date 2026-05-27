"""
まなびナビ 学校連絡先収集スクリプト v3（都道府県ディレクトリ方式）
=================================================================
都道府県の公式学校ディレクトリから学校ウェブサイトURLを収集し、
各校の問い合わせページからメール・フォームURL・FAXを取得する。

対象:
  東京都公立: https://www.metro.ed.jp/school/
  千葉県公立: https://www.chiba-c.ed.jp/schools/
  茨城県公立: https://www.edu.pref.ibaraki.jp/board/school/

使い方:
  python scripts/contact_scraper.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page

# ===== 出力ファイル =====
OUT_DIR      = Path(__file__).parent
RESULTS_JSON = OUT_DIR / "contact_results.json"
RESULTS_SQL  = OUT_DIR / "contact_results.sql"
NEW_FORMS    = OUT_DIR / "new_form_urls.txt"

# ===== 正規表現 =====
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
FAX_RE   = re.compile(r"(?:FAX|Fax|fax|ファックス|ＦＡＸ)[^\d]{0,5}([0-9０-９]{2,4}[-－][0-9０-９]{2,4}[-－][0-9０-９]{4})")
SKIP_EMAIL_DOMAINS = {"example.com", "sentry.io", "cloudflare.com", "google.com",
                      "w3.org", "schema.org", "ogp.me", "facebook.com", "twitter.com"}

def norm_fax(raw: str) -> str:
    t = raw.translate(str.maketrans("０１２３４５６７８９－", "0123456789-"))
    return re.sub(r"[^0-9\-]", "", t)

def clean_email(raw: str) -> str | None:
    dom = raw.split("@")[-1].lower()
    if any(d in dom for d in SKIP_EMAIL_DOMAINS):
        return None
    if not re.search(r"\.(ed|ac|lg|go|co|or)\.jp$|\.jp$", dom):
        return None
    return raw

# ===== ファイル I/O =====

def load_results() -> dict:
    if RESULTS_JSON.exists():
        with open(RESULTS_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_results(results: dict):
    with open(RESULTS_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

def write_sql(results: dict):
    lines = ["-- contact_scraper.py 収集結果", ""]
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
    # form URL 一覧（form_sender.py 用）
    forms = [f'{{"school": "{s}", "url": "{d["form_url"]}"}}'
             for s, d in results.items() if d.get("form_url")]
    with open(NEW_FORMS, "w", encoding="utf-8") as f:
        f.write("\n".join(forms))

# ===== スクレイプ共通 =====

async def extract_contact(page: Page, url: str) -> dict:
    """指定URLのページからメール・フォームリンク・FAXを抽出"""
    result: dict = {}
    try:
        await page.goto(url, timeout=20000, wait_until="domcontentloaded")
        await asyncio.sleep(0.5)
        html = await page.content()

        # メール
        for raw in EMAIL_RE.findall(html):
            e = clean_email(raw)
            if e:
                result["email"] = e
                return result

        # 問い合わせフォームリンク
        for link in await page.locator("a").all():
            href = (await link.get_attribute("href") or "").strip()
            text = (await link.inner_text()).strip()
            combined = text + href
            if any(kw in combined for kw in
                   ["お問い合わせ", "問合せ", "contact", "Contact",
                    "inquiry", "Inquiry", "ご連絡", "問い合わせフォーム"]):
                if href.startswith("http"):
                    result["form_url"] = href
                elif href and "javascript:" not in href:
                    base = re.sub(r"(https?://[^/]+).*", r"\1", url)
                    result["form_url"] = base + "/" + href.lstrip("/")
                if result.get("form_url"):
                    return result

        # FAX
        m = FAX_RE.search(html)
        if m:
            result["fax"] = norm_fax(m.group(1))
    except Exception as e:
        result["error"] = str(e)[:80]
    return result

async def find_contact_from_site(page: Page, site_url: str) -> dict:
    """学校公式サイトを起点にcontactページまで掘り下げてメール/フォームを探す"""
    data = await extract_contact(page, site_url)
    if data.get("email") or data.get("form_url"):
        data["source"] = site_url
        return data

    # /contact/ /inquiry/ など典型パスを試す
    base = re.sub(r"(https?://[^/]+).*", r"\1", site_url)
    for sub in ["/contact/", "/inquiry/", "/contact.html", "/inquiry.html",
                "/otoiawase/", "/toiawase/", "/contact/index.html"]:
        d = await extract_contact(page, base + sub)
        if d.get("email") or d.get("form_url"):
            d["source"] = base + sub
            return d

    if data.get("fax"):
        data["source"] = site_url
        return data
    return {"status": "not_found", "source": site_url}


# ===== 東京都公立（metro.ed.jp） =====

async def scrape_tokyo_metro(page: Page) -> dict[str, str]:
    """metro.ed.jp の学校一覧から {学校名: URL} を取得"""
    school_map: dict[str, str] = {}
    print("[東京都] metro.ed.jp を収集中...")
    try:
        await page.goto("https://www.metro.ed.jp/school/", timeout=20000)
        await asyncio.sleep(1)
        links = await page.locator("a").all()
        for link in links:
            href = (await link.get_attribute("href") or "").strip()
            text = (await link.inner_text()).strip()
            # 学校名らしいリンク（高校・中学含む）
            if ("高等学校" in text or "中学校" in text or "中等教育学校" in text) and href.startswith("http"):
                school_map[text] = href
    except Exception as e:
        print(f"  [!!] metro.ed.jp 読み込み失敗: {e}")
    print(f"  取得: {len(school_map)} 校")
    return school_map


# ===== 千葉県公立 =====

async def scrape_chiba(page: Page) -> dict[str, str]:
    """chiba-c.ed.jp から {学校名: URL} を取得"""
    school_map: dict[str, str] = {}
    print("[千葉県] chiba-c.ed.jp を収集中...")
    try:
        for list_url in [
            "https://www.chiba-c.ed.jp/zenkouichiran/",
            "https://www.chiba-c.ed.jp/schools/",
        ]:
            await page.goto(list_url, timeout=15000)
            await asyncio.sleep(0.8)
            links = await page.locator("a").all()
            for link in links:
                href = (await link.get_attribute("href") or "").strip()
                text = (await link.inner_text()).strip()
                if ("高等学校" in text or "中学校" in text) and href.startswith("http"):
                    school_map[text] = href
            if school_map:
                break
    except Exception as e:
        print(f"  [!!] chiba-c.ed.jp 読み込み失敗: {e}")
    print(f"  取得: {len(school_map)} 校")
    return school_map


# ===== 茨城県公立 =====

IBARAKI_EMAIL_PATTERN = {
    # 既知のパターン（ローマ字コード→メール）
    "水戸第一高等学校":     "koho@mito1-h.ibk.ed.jp",
    "水戸第二高等学校":     "koho@mito2-h.ibk.ed.jp",
    "水戸第三高等学校":     "koho@mito3-h.ibk.ed.jp",
    "竹園高等学校":         "koho@takezono-h.ibk.ed.jp",
    "緑岡高等学校":         "koho@midorioka-h.ibk.ed.jp",
    "日立第一高等学校":     "koho@hitachi1-h.ibk.ed.jp",
    "日立第二高等学校":     "koho@hitachi2-h.ibk.ed.jp",
    "守谷高等学校":         "koho@moriya-h.ibk.ed.jp",
    "取手松陽高等学校":     "koho@torideshoyo-h.ibk.ed.jp",
    "土浦第一高等学校":     "koho@tsuchiura1-h.ibk.ed.jp",
    "土浦第二高等学校":     "koho@tsuchiura2-h.ibk.ed.jp",
    "牛久栄進高等学校":     "koho@ushikueishin-h.ibk.ed.jp",
    "龍ヶ崎第一高等学校":   "koho@ryugasaki1-h.ibk.ed.jp",
    "つくば工科高等学校":   "koho@tsukuba-kogyo-h.ibk.ed.jp",
    "茨城高等学校附属中学校": "koho@ibaraki-h.ibk.ed.jp",
    "常陸大宮高等学校":     "koho@hitachiomiya-h.ibk.ed.jp",  # 既知
    "茨城県立並木中等教育学校": "koho@namiki-cs.ibk.ed.jp",  # 既知
    "土浦日本大学高等学校": "sec-sch@tng.ac.jp",  # 既知
}

# ===== SQL ファイルから学校名抽出 =====

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
    "流通経済大学付属柏高等学校", "千葉明徳高等学校", "二松學舎大学附属柏高等学校",
}

def extract_schools() -> list[str]:
    pat = re.compile(r"'([^']{3,35}(?:高等学校|中学校|中等教育学校|高等部|高等科|女学校))'")
    names, seen = [], set()
    for f in SQL_FILES:
        fp = BASE / f
        if not fp.exists(): continue
        with open(fp, encoding="utf-8") as fh:
            for line in fh:
                if line.strip().startswith("--") or "UPDATE" in line: continue
                for m in pat.finditer(line):
                    n = m.group(1).strip()
                    if n not in seen:
                        seen.add(n); names.append(n)
    return names


# ===== メイン =====

async def main():
    all_schools = extract_schools()
    todo = [s for s in all_schools if s not in ALREADY_CONTACTED]
    results = load_results()
    # 既に有効な結果があるものを除外
    already_done = {k for k, v in results.items() if v.get("email") or v.get("form_url") or v.get("fax")}
    todo = [s for s in todo if s not in already_done]

    print(f"対象 {len(todo)} 校")

    found = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
            locale="ja-JP",
        )
        page = await ctx.new_page()

        # STEP 1: 茨城パターンマッチ
        print("\n=== STEP 1: 茨城県パターンメール ===")
        for school in list(todo):
            if school in IBARAKI_EMAIL_PATTERN:
                email = IBARAKI_EMAIL_PATTERN[school]
                results[school] = {"email": email, "source": "pattern"}
                todo.remove(school)
                found += 1
                print(f"  [pattern] {school} -> {email}")

        # STEP 2: 東京都公立（metro.ed.jp）
        print("\n=== STEP 2: 東京都公立 metro.ed.jp ===")
        tokyo_map = await scrape_tokyo_metro(page)
        for school in list(todo):
            # 「都立○○高等学校」→「○○高校」「○○高等学校」などでマッチ
            matched_url = tokyo_map.get(school)
            if not matched_url:
                # 「都立」を除いて試す
                short = school.replace("都立", "").replace("東京都立", "")
                for k, v in tokyo_map.items():
                    if short in k or k in school:
                        matched_url = v
                        break
            if matched_url:
                sys.stdout.write(f"  {school} ...")
                sys.stdout.flush()
                data = await find_contact_from_site(page, matched_url)
                results[school] = data
                if data.get("email") or data.get("form_url"):
                    found += 1
                    print(f" [OK] {data.get('email') or data.get('form_url', '')[:50]}")
                else:
                    print(" [--]")
                todo.remove(school)
                await asyncio.sleep(1.5)

        # STEP 3: 千葉県公立
        print("\n=== STEP 3: 千葉県公立 ===")
        chiba_map = await scrape_chiba(page)
        for school in list(todo):
            matched_url = chiba_map.get(school)
            if not matched_url:
                short = school.replace("千葉県立", "").replace("市立", "")
                for k, v in chiba_map.items():
                    if short in k or k in school:
                        matched_url = v
                        break
            if matched_url:
                sys.stdout.write(f"  {school} ...")
                sys.stdout.flush()
                data = await find_contact_from_site(page, matched_url)
                results[school] = data
                if data.get("email") or data.get("form_url"):
                    found += 1
                    print(f" [OK] {data.get('email') or data.get('form_url', '')[:50]}")
                else:
                    print(" [--]")
                todo.remove(school)
                await asyncio.sleep(1.5)

        # STEP 4: 残りを private school として既知 website から試行
        print(f"\n=== STEP 4: 残り {len(todo)} 校（個別検索）===")
        for i, school in enumerate(todo, 1):
            # 私立学校は website フィールドがないため対応困難
            # まず results に status=manual を記録
            if school not in results:
                results[school] = {"status": "manual_required"}
            sys.stdout.write(f"  [{i}/{len(todo)}] {school} -> manual\n")
            sys.stdout.flush()

        await browser.close()

    save_results(results)
    write_sql(results)
    print(f"\n完了: 新規取得 {found} 件")
    print(f"  JSON: {RESULTS_JSON}")
    print(f"  SQL : {RESULTS_SQL}")
    print(f"  手動調査が必要な学校: {len([v for v in results.values() if v.get('status') == 'manual_required'])} 校")


if __name__ == "__main__":
    asyncio.run(main())
