# -*- coding: utf-8 -*-
"""保護者向けログイン案内を教室別に書き出す（配布用）

1家庭につき1枚（A4に2家庭ぶん・切り取り線あり）。
他のご家庭の情報が同じ紙に載らないようにしてある。

  python scripts/export_parent_guide.py --password koubou2025
  python scripts/export_parent_guide.py --password koubou2025 --school 豊四季教育工房

出力: output/parent_guide/印刷用.html（ブラウザで開いて Ctrl+P → PDF）
生成物は output/ 配下＝.gitignore 済み。配り終えたら削除すること。
"""
import argparse
import html
import io
import json
import os
import sys
import urllib.request
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ENV_PATH = r"C:\Users\user\Desktop\manabi-saas\.env.local"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "parent_guide")
LOGIN_URL = "https://manabi-saas.vercel.app/login/parent"

# 保護者ダッシュボードで実際に見られるもの（src/app/parent/dashboard のナビと対応）
CAN_SEE = [
    ("報告書", "授業のたびの記録を、その日のうちに読めます"),
    ("3か月ビジョン", "お子さんの現在地と、これから3か月で目指すところ"),
    ("多層診断", "学力・学習習慣・学習法を多角的に見た診断の結果"),
    ("カレンダー", "通塾予定の確認"),
    ("振替リクエスト", "お休みの連絡と振替のご相談"),
    ("メッセージ", "教室とのやりとり"),
    ("ポイント・商店", "お子さんが塾で貯めたポイントの様子"),
]


def load_env():
    env = {}
    for line in open(ENV_PATH, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def rest(url, key, path):
    req = urllib.request.Request(f"{url.rstrip('/')}/rest/v1/{path}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


CSS = """
@page { size: A4; margin: 10mm; }
body { font-family: "Yu Gothic", "Meiryo", sans-serif; color: #1f2937; margin: 0; }
.slip { height: 132mm; box-sizing: border-box; padding: 8mm 9mm 4mm;
        border-bottom: 1px dashed #9ca3af; position: relative; }
.slip:nth-child(2n) { border-bottom: none; page-break-after: always; }
.brand { font-size: 8.5pt; color: #6d28d9; font-weight: 700; letter-spacing: .5px; }
h1 { font-size: 14.5pt; margin: 1mm 0 1.5mm; }
.to { font-size: 11pt; margin: 0 0 3mm; }
.to b { font-size: 12.5pt; }
.lead { font-size: 9pt; line-height: 1.65; margin: 0 0 3mm; color: #374151; }
.cred { border: 1.5px solid #6d28d9; border-radius: 6px; padding: 3mm 4mm; margin-bottom: 3mm; }
.cred table { border-collapse: collapse; font-size: 10pt; width: 100%; }
.cred th { text-align: left; width: 26mm; padding: 1.2mm 0; color: #6b7280; font-weight: 600; }
.cred td { padding: 1.2mm 0; font-family: Consolas, monospace; font-weight: 700; word-break: break-all; }
.cols { display: flex; gap: 5mm; }
.see { flex: 1; font-size: 8.6pt; line-height: 1.55; }
.see li { margin-bottom: .8mm; }
.see b { color: #4c1d95; }
.qr { width: 30mm; text-align: center; font-size: 7.5pt; color: #6b7280; }
.foot { position: absolute; bottom: 4mm; left: 9mm; right: 9mm;
        font-size: 8pt; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 1.5mm; }
ul { margin: 0; padding-left: 4.5mm; }
"""


def slip(parent, kids, password, school):
    kids_txt = "・".join(kids) if kids else "（お子さんの登録をご確認ください）"
    see = "\n".join(f"<li><b>{html.escape(a)}</b>　{html.escape(b)}</li>" for a, b in CAN_SEE)
    return f"""
<section class="slip">
  <div class="brand">つながるまなび</div>
  <h1>保護者ページのご案内</h1>
  <p class="to"><b>{html.escape(parent.get('name') or 'ご家庭')} 様</b>
     （{html.escape(school)}／{html.escape(kids_txt)}）</p>
  <p class="lead">
    お子さんの授業の記録や、これから目指すところを、いつでもご覧いただけるページをご用意しました。
    下記からログインしてください。スマートフォンからでもご覧いただけます。
  </p>
  <div class="cred">
    <table>
      <tr><th>ログイン先</th><td>{LOGIN_URL}</td></tr>
      <tr><th>メールアドレス</th><td>{html.escape(parent.get('email') or '—')}</td></tr>
      <tr><th>初期パスワード</th><td>{html.escape(password)}</td></tr>
    </table>
  </div>
  <div class="cols">
    <div class="see"><ul>{see}</ul></div>
  </div>
  <div class="foot">
    パスワードが分からない・ログインできないときは、教室までお気軽にお申し付けください。再設定いたします。<br>
    この用紙にはログイン情報が記載されています。お手元で大切に保管してください。
  </div>
</section>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", required=True, help="案内に載せる初期パスワード")
    ap.add_argument("--school", help="教室名で絞る")
    args = ap.parse_args()

    env = load_env()
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]

    schools = {s["id"]: s["name"] for s in rest(url, key, "schools?select=id,name")}
    students = {s["id"]: s for s in rest(url, key, "students?select=id,name,school_id&limit=1000")}
    parents = rest(url, key, "parents?select=id,name,email,auth_user_id&limit=1000")
    links = rest(url, key, "parent_student_links?select=parent_id,student_id&limit=3000")

    kids_of = defaultdict(list)
    for l in links:
        kids_of[l["parent_id"]].append(l["student_id"])

    by_school = defaultdict(list)
    skipped = []
    for p in parents:
        if not p.get("auth_user_id"):
            skipped.append((p.get("name"), "認証アカウント未作成"))
            continue
        if not p.get("email"):
            skipped.append((p.get("name"), "メール未登録"))
            continue
        sids = kids_of.get(p["id"], [])
        names = [students[s]["name"] for s in sids if s in students]
        if not names:
            # 宛名に「お子さんの登録をご確認ください」と書かれた紙は保護者に渡せない。
            # 印刷対象から外し、先に紐付けを直してもらう。
            skipped.append((p.get("name"), "お子さんが紐付いていない"))
            continue
        school = next((schools.get(students[s].get("school_id")) for s in sids
                       if s in students and students[s].get("school_id")), None) or "(教室未設定)"
        if args.school and args.school != school:
            continue
        by_school[school].append((p, names))

    os.makedirs(OUT_DIR, exist_ok=True)
    parts = []
    for school in sorted(by_school):
        rows = sorted(by_school[school], key=lambda x: (x[1][0] if x[1] else ""))
        for p, kids in rows:
            parts.append(slip(p, kids, args.password, school))
        print(f"  {school:22s} {len(rows):3d}家庭")

    path = os.path.join(OUT_DIR, "印刷用.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"<!doctype html><meta charset='utf-8'><title>保護者ログイン案内</title>"
                f"<style>{CSS}</style>{''.join(parts)}")
    print(f"\n合計 {sum(len(v) for v in by_school.values())}家庭ぶん -> {path}")
    if skipped:
        print(f"\n案内を出せない保護者 {len(skipped)}名（先に登録が必要）:")
        for n, why in skipped[:15]:
            print(f"  - {n or '(名前なし)'}: {why}")
    print("\n※ output/ は .gitignore 済み。配り終えたら削除してください。")


if __name__ == "__main__":
    main()
