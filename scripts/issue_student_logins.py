# -*- coding: utf-8 -*-
"""生徒ログインアカウントの一括発行（未発行の生徒だけ）

既存の採番規則（教室コード3文字＋連番3桁）に合わせて login_id を割り当て、
Supabase Auth に <login_id>@students.local のアカウントを作り、
students.login_id / auth_user_id を埋める。

  python scripts/issue_student_logins.py            # ドライラン（何も書き込まない）
  python scripts/issue_student_logins.py --apply    # 実行
  python scripts/issue_student_logins.py --apply --school こいがくぼ翼学習塾

冪等：login_id と auth_user_id が両方入っている生徒は必ず飛ばす。
途中で失敗しても、もう一度流せば残りだけを作る。
"""
import argparse
import io
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ENV_PATH = r"C:\Users\user\Desktop\manabi-saas\.env.local"

# 教室名 → ログインIDの接頭辞
PREFIX = {
    "柏の葉教育工房": "knh",
    "豊四季教育工房": "tys",
    "柏たなか教育工房": "ktn",
    "こいがくぼ翼学習塾": "koi",
    "きみのまなびおてつだい": "kmn",
}

INITIAL_PASSWORD = "manabi2026"

GRADE_ORDER = ["小1", "小2", "小3", "小4", "小5", "小6", "中1", "中2", "中3", "高1", "高2", "高3"]


def load_env():
    env = {}
    for line in open(ENV_PATH, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


class Supa:
    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _req(self, path, method="GET", body=None, extra_headers=None):
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
            return json.loads(text) if text.strip() else None

    def rest(self, path):
        return self._req(f"/rest/v1/{path}")

    def patch(self, table, match, body):
        return self._req(
            f"/rest/v1/{table}?{match}", method="PATCH", body=body,
            extra_headers={"Prefer": "return=representation"},
        )

    def create_user(self, email, password):
        return self._req(
            "/auth/v1/admin/users", method="POST",
            body={"email": email, "password": password, "email_confirm": True},
        )

    def find_user(self, email):
        """同じメールのAuthユーザーが既にいれば返す（作り直しの二重作成を防ぐ）"""
        res = self._req(f"/auth/v1/admin/users?page=1&per_page=200&filter={urllib.parse.quote(email)}")
        users = res.get("users", []) if isinstance(res, dict) else []
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u
        return None


def grade_key(g):
    try:
        return GRADE_ORDER.index(g or "")
    except ValueError:
        return len(GRADE_ORDER)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="実際に作成する（既定はドライラン）")
    ap.add_argument("--school", help="教室名で絞る")
    ap.add_argument("--password", default=INITIAL_PASSWORD, help=f"初期パスワード（既定 {INITIAL_PASSWORD}）")
    args = ap.parse_args()

    env = load_env()
    sb = Supa(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    schools = {s["id"]: s["name"] for s in sb.rest("schools?select=id,name")}
    students = sb.rest("students?select=id,name,grade,school_id,login_id,auth_user_id&limit=1000")

    # 教室ごとの使用済み番号（規則外のIDは採番に混ぜない）
    used = defaultdict(set)
    for s in students:
        lid = s.get("login_id") or ""
        m = re.match(r"^([a-z]+)(\d{3})$", lid)
        if m:
            used[m.group(1)].add(int(m.group(2)))

    targets = defaultdict(list)
    for s in students:
        if s.get("login_id") and s.get("auth_user_id"):
            continue  # 発行済み
        name = schools.get(s.get("school_id"), "(未設定)")
        if args.school and args.school != name:
            continue
        targets[name].append(s)

    if not targets:
        print("未発行の生徒はいません。")
        return

    plan = []
    for school in sorted(targets, key=lambda n: -len(targets[n])):
        pref = PREFIX.get(school)
        if not pref:
            print(f"!! 教室『{school}』の接頭辞が未定義のため飛ばします（{len(targets[school])}名）")
            continue
        arr = sorted(targets[school], key=lambda s: (grade_key(s.get("grade")), s["name"]))
        # 欠番は埋めない。退塾した生徒のIDを再利用すると、
        # その子の古いAuthアカウントを別の子に付け替えてしまう。
        n = max(used[pref]) if used[pref] else 0
        for s in arr:
            n += 1
            used[pref].add(n)
            plan.append({
                "student_id": s["id"], "name": s["name"], "grade": s.get("grade"),
                "school": school, "login_id": f"{pref}{n:03d}",
                "had_login_id": s.get("login_id"),
            })

    print(f"{'教室':22s} {'学年':4s} {'氏名':16s} ログインID")
    print("-" * 66)
    for p in plan:
        print(f"{p['school']:22s} {str(p['grade'] or '-'):4s} {p['name']:16s} {p['login_id']}")
    print(f"\n対象 {len(plan)}名 / 初期パスワード: {args.password}")

    if not args.apply:
        print("\n(ドライラン。実行するには --apply を付けてください)")
        return

    print("\n=== 作成開始 ===")
    ok = fail = 0
    for p in plan:
        email = f"{p['login_id']}@students.local"
        try:
            # 同じメールのAuthが既にあるのは想定外（採番は最大値の次から）。
            # 黙って流用すると別人のアカウントを付け替えかねないので止める。
            if sb.find_user(email):
                raise RuntimeError("同名のAuthアカウントが既にあります。採番を確認してください")
            created = sb.create_user(email, args.password)
            uid = created["id"]
            note = "新規作成"
            sb.patch("students", f"id=eq.{p['student_id']}",
                     {"login_id": p["login_id"], "auth_user_id": uid})
            print(f"  OK  {p['name']:16s} {p['login_id']}  ({note})")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  NG  {p['name']:16s} {p['login_id']}  {e.code} {e.read().decode()[:160]}")
            fail += 1
        except Exception as e:
            print(f"  NG  {p['name']:16s} {p['login_id']}  {str(e)[:160]}")
            fail += 1
    print(f"\n完了: 成功 {ok}名 / 失敗 {fail}名")


if __name__ == "__main__":
    import urllib.parse  # find_user で使う
    main()
