# -*- coding: utf-8 -*-
"""生徒ログイン一覧を教室別に書き出す（配布用）

  python scripts/export_student_logins.py                    # 全教室
  python scripts/export_student_logins.py --school こいがくぼ翼学習塾

出力先: output/student_logins/<教室名>.csv と 印刷用.html
パスワードは保存していないため復元できない（Supabaseはハッシュのみ保持）。
初期パスワードを載せたいときは --password で明示的に渡す。

生成物は output/ 配下＝.gitignore 済み。配布したら手元から消すこと。
"""
import argparse
import html
import io
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ENV_PATH = r"C:\Users\user\Desktop\manabi-saas\.env.local"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "student_logins")
LOGIN_URL = "https://manabi-saas.vercel.app/student/login"
GRADE_ORDER = ["小1", "小2", "小3", "小4", "小5", "小6", "中1", "中2", "中3", "高1", "高2", "高3"]

# issue_student_logins.py が発行したIDの形（教室コード3文字＋連番3桁）。
# これ以外（講師ダッシュボードで手動発行した s-xxxxx など）は作成時に
# 講師が打ったパスワードなので、共通の初期パスワードではない。
ISSUED_ID = re.compile(r"^[a-z]+\d{3}$")
MANUAL_PW = "個別設定（不明なら講師画面でリセット）"


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


def grade_key(g):
    try:
        return GRADE_ORDER.index(g or "")
    except ValueError:
        return len(GRADE_ORDER)


PAGE_CSS = """
@page { size: A4; margin: 14mm; }
body { font-family: "Yu Gothic", "Meiryo", sans-serif; color: #1f2937; }
h1 { font-size: 17pt; margin: 0 0 2mm; }
.sub { font-size: 9.5pt; color: #6b7280; margin: 0 0 5mm; }
.note { background: #fff7ed; border: 1px solid #fdba74; border-radius: 6px;
        padding: 3mm 4mm; font-size: 9pt; margin: 0 0 5mm; line-height: 1.6; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th, td { border: 1px solid #d1d5db; padding: 2.2mm 3mm; text-align: left; }
th { background: #eef2ff; font-weight: 700; }
td.id { font-family: Consolas, monospace; font-weight: 700; letter-spacing: .4px; }
td.manual { font-size: 8.5pt; color: #b45309; }
tr:nth-child(even) td { background: #fafafa; }
.school { page-break-before: always; }
.school:first-of-type { page-break-before: auto; }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--school", help="教室名で絞る")
    ap.add_argument("--password", default="", help="一覧に載せる初期パスワード（既定は載せない）")
    args = ap.parse_args()

    env = load_env()
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
    schools = {s["id"]: s["name"] for s in rest(url, key, "schools?select=id,name")}
    students = rest(url, key, "students?select=name,grade,school_id,login_id,auth_user_id&limit=1000")

    by = defaultdict(list)
    for s in students:
        name = schools.get(s.get("school_id"), "(教室未設定)")
        if args.school and args.school != name:
            continue
        by[name].append(s)

    os.makedirs(OUT_DIR, exist_ok=True)
    parts = []
    for school in sorted(by):
        arr = sorted(by[school], key=lambda s: (grade_key(s.get("grade")), s["name"]))

        def pw_of(s):
            """この子のパスワード欄。一括発行ぶんだけ共通の初期パスワードが効く。"""
            if not args.password:
                return ""
            return args.password if ISSUED_ID.match(s.get("login_id") or "") else MANUAL_PW

        csv_path = os.path.join(OUT_DIR, f"{school}.csv")
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            f.write("学年,氏名,ログインID,パスワード,状態\n")
            for s in arr:
                state = "利用可" if s.get("auth_user_id") else "未発行"
                f.write(f"{s.get('grade') or ''},{s['name']},{s.get('login_id') or ''},{pw_of(s)},{state}\n")

        rows = "\n".join(
            f"<tr><td>{html.escape(s.get('grade') or '')}</td>"
            f"<td>{html.escape(s['name'])}</td>"
            f"<td class='id'>{html.escape(s.get('login_id') or '—')}</td>"
            f"<td class='{'id' if ISSUED_ID.match(s.get('login_id') or '') else 'manual'}'>"
            f"{html.escape(pw_of(s))}</td>"
            f"<td>{'利用可' if s.get('auth_user_id') else '未発行'}</td></tr>"
            for s in arr
        )
        n_manual = sum(1 for s in arr if not ISSUED_ID.match(s.get("login_id") or ""))
        pw = (f"<br>初期パスワード（全員共通）：<b>{html.escape(args.password)}</b>"
              "　初回ログイン後、講師画面から個別に変更できます。") if args.password else ""
        if args.password and n_manual:
            pw += (f"<br>ただし<b>{n_manual}名</b>は登録のしかたが違うため、この共通パスワードでは入れません"
                   "（表に「個別設定」と書いてある子）。分からなければ講師画面からリセットしてください。")
        parts.append(f"""
<section class="school">
  <h1>{html.escape(school)}　生徒ログイン一覧</h1>
  <p class="sub">{len(arr)}名　／　ログインページ：{LOGIN_URL}</p>
  <div class="note">
    ログインは<b>ログインID</b>とパスワードで行います（メールアドレスは不要）。{pw}
    <br>この紙にはログイン情報が載っています。配り終えたら手元に残さないでください。
  </div>
  <table>
    <tr><th style="width:9%">学年</th><th style="width:29%">氏名</th>
        <th style="width:17%">ログインID</th><th style="width:30%">パスワード</th>
        <th style="width:15%">状態</th></tr>
    {rows}
  </table>
</section>""")
        print(f"  {school:22s} {len(arr):3d}名  -> {csv_path}")

    html_path = os.path.join(OUT_DIR, "印刷用.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(f"<!doctype html><meta charset='utf-8'><title>生徒ログイン一覧</title>"
                f"<style>{PAGE_CSS}</style>{''.join(parts)}")
    print(f"\n印刷用（ブラウザで開いて Ctrl+P → PDF）: {html_path}")
    print("※ output/ は .gitignore 済み。配布後は削除してください。")


if __name__ == "__main__":
    main()
