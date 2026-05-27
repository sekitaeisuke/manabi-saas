"""
まなびナビ 問い合わせフォーム半自動送信スクリプト
使い方:
  pip install playwright
  playwright install chromium
  python scripts/form_sender.py

動作:
  各校の問い合わせフォームをブラウザで開き、入力可能なフィールドを自動入力。
  Enter キーで次へ、s キーでスキップ、q キーで終了。
  送信ボタンは自動クリックしない（ユーザーが確認後に手動クリック）。
"""

import asyncio
import os
import re
import sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.async_api import async_playwright

# ----- 送信者情報 -----
SENDER_NAME      = "関田英介"
SENDER_ORG       = "地域教育工房 / つながるまなび"
SENDER_EMAIL     = "sekitaeisuke@kyouiku-koubou.com"
SENDER_TEL       = "0297-38-8857"  # 必要に応じて変更

INQUIRY_SUBJECT  = "【つながるまなび】学校情報の無料掲載のご案内"
INQUIRY_BODY     = """拝啓

貴校ますますご清栄のこととお慶び申し上げます。

私どもは、中学生・高校生の進路選択をサポートするWeb進学情報サービス「つながるまなび」を運営しております。

この度は、貴校の情報をより多くの生徒・保護者の方々にお届けするため、学校情報の無料掲載をご案内させていただく次第です。

■つながるまなびとは
・生徒の学力・学校タイプ・特色への希望をもとに、最適な学校を推薦するマッチングサービスです
・塾の指導者や保護者が活用し、一人ひとりの進路選択をサポートします
・現在、東京都・千葉県・茨城県の学校情報を掲載中です

■ご登録の流れ
下記の学校情報登録フォームから、所要時間10〜15分でご登録いただけます。
登録内容は審査後、順次公開いたします。

▼学校情報登録フォーム
https://manabi-saas.vercel.app/school-register

掲載は現在すべて無料にて承っております。
ご不明な点がございましたら、お気軽にお問い合わせください。

敬具

──────────────────────
関田 英介
地域教育工房 / つながるまなび
メール: sekitaeisuke@kyouiku-koubou.com
──────────────────────"""

# ----- フォームURLリスト（未送信のみ） -----
FORM_LIST = [
    # 東京都 私立高校
    {"school": "開成高等学校・中学校",          "url": "https://kaiseigakuen.jp/contact/"},
    {"school": "麻布高等学校・中学校",          "url": "https://www.azabu-jh.ed.jp/contact/"},
    {"school": "青山学院高等部",               "url": "https://www.agh.aoyama.ed.jp/contact/index.html"},
    {"school": "青山学院中等部",               "url": "https://www.jh.aoyama.ed.jp/contact/index.html"},
    {"school": "法政大学高等学校",             "url": "https://www.hosei.ed.jp/contact/"},
    {"school": "明治大学付属明治高等学校",       "url": "https://www.meiji.ac.jp/ko_chu/contact/inquiry.html"},
    {"school": "武蔵高等学校",                "url": "https://www.musashi.ed.jp/contact/index.html"},
    {"school": "豊島岡女子学園高等学校・中学校", "url": "https://www.toshimagaoka.ed.jp/contact/"},
    {"school": "吉祥女子高等学校",             "url": "https://www.kichijo-joshi.jp/contact/"},
    {"school": "中央大学附属高等学校",          "url": "https://www.hs.chuo-u.ac.jp/inquiry/"},
    {"school": "広尾学園高等学校",             "url": "https://www.hiroogakuen.ed.jp/info/contact.html"},
    {"school": "鷗友学園女子高等学校",          "url": "https://www.ohyu.jp/contact/"},
    {"school": "早稲田大学高等学院",            "url": "https://www.waseda.jp/school/shs/contact/"},
    {"school": "白百合学園高等学校",            "url": "https://www.shirayuri.ed.jp/examinee/contact.html"},
    {"school": "明治大学付属中野高等学校",       "url": "https://www.nakanogakuen.ac.jp/information/contact.html"},
    {"school": "城北高等学校",                "url": "https://www.johoku.ac.jp/contact/"},
    {"school": "日本大学豊山高等学校",          "url": "https://www.buzan.hs.nihon-u.ac.jp/inquiry/"},
    {"school": "東京農業大学第一高等学校",       "url": "https://www.nodai-1-h.ed.jp/?page_id=526"},
    {"school": "武蔵野大学附属千代田高等学院",   "url": "https://chiyoda.ed.jp/contact_high/"},
    # 東京都 中学
    {"school": "桜蔭中学校",                  "url": "https://www.oin.ed.jp/contact/"},
    {"school": "渋谷教育学園渋谷中学校",        "url": "https://www.shibushibu.jp/information/contact.html"},
    # 茨城県
    {"school": "開智望高等学校・中等教育学校",   "url": "https://nozomi.kaichigakuen.ed.jp/contact/"},
    # 千葉県
    {"school": "渋谷教育学園幕張高等学校・中学校", "url": "https://www.shibumaku.jp/inquiry/"},
    {"school": "市川高等学校・中学校",          "url": "https://www.ichigaku.ac.jp/contact/"},
    {"school": "東邦大学付属東邦高等学校・中学校", "url": "https://www.tohojh.toho-u.ac.jp/request.html"},
    {"school": "専修大学松戸高等学校・中学校",   "url": "https://www.senshu-u-matsudo.ed.jp/inquiry.html"},
    {"school": "千葉日本大学第一高等学校",       "url": "https://www.chibanichi.ed.jp/information/contact/"},
    {"school": "麗澤高等学校",                "url": "https://www.hs.reitaku.jp/inquiry/index.html"},
    {"school": "拓殖大学紅陵高等学校",          "url": "https://www.koryo.ed.jp/inquiry/"},
    {"school": "昭和学院秀英高等学校・中学校",   "url": "https://www.showa-shuei.ed.jp/inquiry/"},
    {"school": "日本大学習志野高等学校",         "url": "https://www.nnhs.cst.nihon-u.ac.jp/inquiry/"},
    {"school": "検見川高等学校",               "url": "https://cms1.chiba-c.ed.jp/kemigawa-h/feaaeb5c200c5163948c98356fc7328a/schoolcontact"},
    {"school": "柏中央高等学校",               "url": "https://cms1.chiba-c.ed.jp/kashiwachuo-h/0b30702ef44dc4a2cbaf83a949b4a703/schoolcontact"},
    {"school": "流通経済大学付属柏高等学校",     "url": "https://www.ryukei.ed.jp/inquiry.html"},
    {"school": "千葉明徳高等学校",             "url": "https://edu.chibameitoku.ac.jp/senior/inquiry-s/"},
    {"school": "二松學舎大学附属柏高等学校",     "url": "https://nishogakusha-kashiwa.ed.jp/sh/request/index.html"},

    # ===== 新規追加（contact_results.json より） =====
    # 東京私立高校
    {"school": "法政大学国際高等学校",           "url": "https://kokusai-high.ws.hosei.ac.jp/request/"},
    {"school": "日本大学第二高等学校",           "url": "https://www.nichidai2.ac.jp/request_information/"},
    {"school": "帝京大学高等学校",               "url": "https://www.teikyo-u.ed.jp/document/"},
    {"school": "東海大学菅生高等学校",           "url": "https://tokaisugao.ac.jp/contact-us/"},
    {"school": "攻玉社高等学校・中学校",         "url": "https://kogyokusha.ed.jp/contact/"},
    {"school": "世田谷学園高等学校・中学校",     "url": "https://www.setagayagakuen.ac.jp/contact/"},
    {"school": "成城学園高等学校",               "url": "https://www.seijogakuen.ed.jp/info/"},
    {"school": "頌栄女子学院高等学校・中学校",   "url": "https://www.shoei.ed.jp/contact/"},
    {"school": "共立女子高等学校",               "url": "https://www.kyoritsu-wu.ac.jp/chukou/"},
    {"school": "恵泉女学園高等学校・中学校",     "url": "https://www.keisen.jp/form_inquiry/"},
    {"school": "光塩女子学院高等部",             "url": "https://www.koen-ejh.ed.jp/jh/contact/"},
    {"school": "香蘭女学校高等科",               "url": "https://www.koran.ed.jp/contact"},
    {"school": "田園調布学園高等部",             "url": "https://www.chofu.ed.jp/contact/"},
    {"school": "山脇学園高等学校",               "url": "https://www.yamawaki.ed.jp/contact/"},
    {"school": "跡見学園高等学校",               "url": "https://www.atomi.ac.jp/jh/contact/"},
    {"school": "晃華学園高等学校・中学校",       "url": "https://jhs.kokagakuen.ac.jp/toiawase/"},
    {"school": "品川女子学院高等部",             "url": "https://www.shinagawajoshigakuin.jp/contact/"},
    {"school": "昭和女子大学附属昭和高等学校・中学校", "url": "https://jhs.swu.ac.jp/"},
    {"school": "明治大学付属中野八王子高等学校", "url": "https://www.mnh.ed.jp/request/"},
    {"school": "日本大学鶴ヶ丘高等学校",         "url": "https://www.tsurugaoka.hs.nihon-u.ac.jp/request/"},
    {"school": "帝京大学系属帝京高等学校",       "url": "https://www.teikyo.ed.jp/contact/"},
    {"school": "東京農業大学第三高等学校",       "url": "https://www.nodai-3-h.ed.jp/contact"},
    {"school": "国士館高等学校",                 "url": "https://hs.kokushikan.ed.jp/contact/"},
    {"school": "広尾学園小石川高等学校",         "url": "https://hiroo-koishikawa.ed.jp/inquiry"},
    {"school": "国学院大学久我山高等学校",       "url": "https://www.kugayama-h.ed.jp/mail/"},
    {"school": "安田学園高等学校",               "url": "https://www.yasuda.ed.jp/contact/"},
    {"school": "杉並学院高等学校",               "url": "https://suginami.ed.jp/contact/"},
    {"school": "立正大学付属立正高等学校",       "url": "https://www.rissho-hs.ac.jp/inquiry/"},
    {"school": "駒澤大学附属高等学校",           "url": "https://www.komazawa.net/inquiry/"},
    {"school": "実践女子学園高等学校・中学校",   "url": "https://hs.jissen.ac.jp/contact/"},
    {"school": "共立女子第二高等学校",           "url": "https://reg31.smp.ne.jp/regist/is?SMPFORM=lemg-ngocr-829b5e02c7201148bbe2d51f67f0ca33"},
    {"school": "共栄学園高等学校・中学校",       "url": "https://kyoei-g.ed.jp/contact/"},
    {"school": "和洋九段女子高等学校",           "url": "https://www.wayokudan.ed.jp/inquiry/"},
    {"school": "大妻多摩高等学校",               "url": "https://www.otsuma-tama.ed.jp/contact/"},
    {"school": "自由ヶ丘学園高等学校",           "url": "https://www.jiyugaoka.ed.jp/contact/"},
    {"school": "目黒日本大学高等学校",           "url": "https://www.meguro-nichidai.ed.jp/senior/contact/"},
    {"school": "宝仙学園高等学校",               "url": "https://www.hosen.ed.jp/top/inquiry/"},
    {"school": "明治大学付属明治中学校",         "url": "https://www.meiji.ac.jp/ko_chu/contact/inquiry.html"},
    {"school": "工学院大学附属中学校",           "url": "https://www.js.kogakuin.ac.jp/about/contact.html"},

    # 千葉私立
    {"school": "東葛飾高等学校",                 "url": "https://forms.office.com/r/9xDJ5bLGqN"},
    {"school": "千葉東高等学校",                 "url": "https://apply.e-tumo.jp/pref-chiba-u/offer/offerList_detail?tempSeq=46962"},
    {"school": "芝浦工業大学柏高等学校・中学校", "url": "https://www.ka.shibaura-it.ac.jp/contact/"},
    {"school": "千葉黎明高等学校",               "url": "https://www.reimei.ac.jp/contact/"},
    {"school": "八千代松陰高等学校・中学校",     "url": "https://www.yachiyoshoin.ac.jp/index/form-request/"},
    {"school": "東海大学付属市原望洋高等学校",   "url": "https://www.boyo.tokai.ed.jp/contact/form/"},
    {"school": "西武台千葉高等学校",             "url": "https://www.seibudai-chiba.jp/admissions/briefing-sessions/"},
    {"school": "聖徳大学附属女子高等学校・中学校", "url": "https://www.matsudo-seitoku.ed.jp/contact/"},

    # 茨城私立
    {"school": "霞ヶ浦高等学校",                 "url": "https://www.kasumi.ed.jp/お問い合わせ/"},
    {"school": "茨城キリスト教学院高等学校・中学校", "url": "https://www.icc.ac.jp/ich/toiawase.html"},
    {"school": "つくば秀英高等学校",             "url": "https://tsukubashuei.com/contact.html"},
    {"school": "鹿島学園高等学校",               "url": "https://kgh.ed.jp/contact/main.html"},

    # 武蔵野東（Google Form）
    {"school": "武蔵野東高等学校",               "url": "https://docs.google.com/forms/d/e/1FAIpQLSf2YE0TLxcAAJWY9naXOUg_RrHp_yFKqdl2up4jS-71WHI-8A/viewform"},

    # 流通経済大付属柏中学校
    {"school": "流通経済大学付属柏中学校",       "url": "https://www.ryukei.ed.jp/inquiry.html"},
]

# 自動入力を試みるセレクタパターン（優先順）
NAME_SELECTORS = [
    'input[name*="name" i]:not([type="hidden"])',
    'input[name*="氏名"]:not([type="hidden"])',
    'input[placeholder*="お名前"]',
    'input[placeholder*="氏名"]',
    'input[placeholder*="名前"]',
    'input[id*="name" i]:not([type="hidden"])',
]
ORG_SELECTORS = [
    'input[name*="company" i]',
    'input[name*="organization" i]',
    'input[name*="organ" i]',
    'input[name*="school" i]',
    'input[placeholder*="学校名"]',
    'input[placeholder*="会社名"]',
    'input[placeholder*="機関名"]',
    'input[placeholder*="所属"]',
    'input[id*="company" i]',
    'input[id*="organ" i]',
]
EMAIL_SELECTORS = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[name*="mail" i]',
    'input[placeholder*="メール"]',
    'input[placeholder*="Email"]',
    'input[id*="email" i]',
]
TEL_SELECTORS = [
    'input[type="tel"]',
    'input[name*="tel" i]',
    'input[name*="phone" i]',
    'input[placeholder*="電話"]',
    'input[placeholder*="TEL"]',
]
SUBJECT_SELECTORS = [
    'input[name*="subject" i]',
    'input[name*="title" i]',
    'input[placeholder*="件名"]',
    'input[placeholder*="タイトル"]',
]
BODY_SELECTORS = [
    'textarea[name*="message" i]',
    'textarea[name*="content" i]',
    'textarea[name*="body" i]',
    'textarea[name*="inquiry" i]',
    'textarea[name*="text" i]',
    'textarea[placeholder*="お問い合わせ"]',
    'textarea[placeholder*="内容"]',
    'textarea[placeholder*="メッセージ"]',
    'textarea',  # fallback: 最初のtextarea
]


async def try_fill(page, selectors: list[str], value: str) -> bool:
    for sel in selectors:
        try:
            elem = page.locator(sel).first
            if await elem.count() > 0 and await elem.is_visible():
                await elem.fill(value)
                return True
        except Exception:
            pass
    return False


async def process_school(page, school: str, url: str, index: int, total: int) -> str:
    print(f"\n[{index}/{total}] {school}")
    print(f"  URL: {url}")

    try:
        await page.goto(url, timeout=30000, wait_until="domcontentloaded")
        await asyncio.sleep(1)
    except Exception as e:
        print(f"  ❌ ページ読み込み失敗: {e}")
        return "error"

    # 自動入力
    results = {
        "氏名":   await try_fill(page, NAME_SELECTORS, SENDER_NAME),
        "組織名": await try_fill(page, ORG_SELECTORS, SENDER_ORG),
        "メール": await try_fill(page, EMAIL_SELECTORS, SENDER_EMAIL),
        "電話":   await try_fill(page, TEL_SELECTORS, SENDER_TEL),
        "件名":   await try_fill(page, SUBJECT_SELECTORS, INQUIRY_SUBJECT),
        "本文":   await try_fill(page, BODY_SELECTORS, INQUIRY_BODY),
    }

    filled = [k for k, v in results.items() if v]
    missed = [k for k, v in results.items() if not v]

    print(f"  ✅ 自動入力: {', '.join(filled) if filled else 'なし'}")
    if missed:
        print(f"  ⚠️  手動入力が必要: {', '.join(missed)}")

    print()
    print("  ブラウザでフォームを確認・手動補完・送信してください。")
    print("  [Enter] 送信済み → 次へ  /  [s] スキップ  /  [q] 終了")

    while True:
        ans = input("  > ").strip().lower()
        if ans == "" :
            return "sent"
        elif ans == "s":
            return "skipped"
        elif ans == "q":
            return "quit"
        else:
            print("  Enter / s / q のいずれかを入力してください。")


async def main():
    total = len(FORM_LIST)
    sent = []
    skipped = []

    # 進捗ファイル（再開用）
    progress_file = "scripts/form_sender_progress.txt"
    done_schools: set[str] = set()
    if os.path.exists(progress_file):
        with open(progress_file, encoding="utf-8") as f:
            done_schools = {line.strip() for line in f if line.strip()}
        print(f"前回の進捗を読み込みました: {len(done_schools)} 校スキップ")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=200)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()

        for i, item in enumerate(FORM_LIST, 1):
            school = item["school"]
            if school in done_schools:
                print(f"[{i}/{total}] {school} - スキップ（送信済み）")
                sent.append(school)
                continue

            result = await process_school(page, school, item["url"], i, total)

            if result == "sent":
                sent.append(school)
                with open(progress_file, "a", encoding="utf-8") as f:
                    f.write(school + "\n")
            elif result == "skipped":
                skipped.append(school)
            elif result == "quit":
                break

        await browser.close()

    print("\n" + "="*50)
    print(f"送信済み: {len(sent)} 校")
    print(f"スキップ: {len(skipped)} 校")
    if skipped:
        print("スキップした学校:")
        for s in skipped:
            print(f"  - {s}")
    print("="*50)


if __name__ == "__main__":
    asyncio.run(main())
