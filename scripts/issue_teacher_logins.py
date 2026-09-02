# -*- coding: utf-8 -*-
"""講師のログインを揃える（Chatwork の在籍名簿が正・不足ぶんを発行する）

教室の講師の多くは業務用メールを持たず、メール前提の登録ではアカウントが
作れないまま「ログインできない」状態が残っていた。そこで生徒（@students.local）
と同じ考え方で、メールの代わりに短いログインID（t001 など）を発行し、
内部では <id>@teachers.local として扱う。
メールを持っている講師は今までどおりメールでも入れる。

  python scripts/issue_teacher_logins.py                 # ドライラン（何も書き込まない）
  python scripts/issue_teacher_logins.py --apply         # 不足ぶんを発行
  python scripts/issue_teacher_logins.py --apply --reset-passwords
                                                         # 既存ぶんも共通PWに揃える

名簿は Chatwork の4教室＋社員チャットの参加者（＝実際に働いている人）から取る。
冪等：既にログインできる人には触れない（--reset-passwords のときだけPWを上書き）。
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

MANABI_ENV = r"C:\Users\user\Desktop\manabi-saas\.env.local"
AI_ENV = r"C:\Users\user\Desktop\ai-system\.env"

INITIAL_PASSWORD = "koubou2025"
ID_DOMAIN = "@teachers.local"
ID_PREFIX = "t"

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "teacher_logins.json"
)

# 教室名 → Chatwork ルームID（社員チャットは教室ではないので school には使わない）
CLASSROOMS = [
    ("豊四季教育工房", "374587077"),
    ("柏たなか教育工房", "374569651"),
    ("柏の葉教育工房", "374571783"),
    ("こいがくぼ翼学習塾", "415500367"),
]
STAFF_ROOM = ("社員＆連絡チャット", "175121509")

# Chatwork の氏名（正規化後）→ teachers 行の氏名。
# teachers 側の表記が名簿と違う人をここで結びつける。
# （姓だけだった「佐藤」「竹川」は 2026-09-02 にフルネームへ直したので今は空。
#   同姓の別人を巻き込まないよう、前方一致ではなくここに明示する運用にしている）
ALIAS = {}

# 名簿に出てくるが講師ではない人（居れば正規化名をここに書いて除外する）
NOT_TEACHERS = set()


def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def norm(name):
    """表記ゆれを吸収する。空白（半角・全角）を落とし、異体字を寄せる。"""
    s = (name or "").replace(" ", "").replace("\u3000", "")
    for a, b in (("髙", "高"), ("﨑", "崎"), ("邊", "辺"), ("邉", "辺")):
        s = s.replace(a, b)
    return s


class Supa:
    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _req(self, path, method="GET", body=None, extra=None):
        headers = {
            "apikey": self.key,
            "Authorization": "Bearer " + self.key,
            "Content-Type": "application/json",
        }
        if extra:
            headers.update(extra)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
            return json.loads(text) if text.strip() else None

    def rest(self, path):
        return self._req("/rest/v1/" + path)

    def insert(self, table, body):
        return self._req("/rest/v1/" + table, method="POST", body=body,
                         extra={"Prefer": "return=representation"})

    def auth_users(self):
        users, page = [], 1
        while page <= 20:
            d = self._req("/auth/v1/admin/users?page=%d&per_page=1000" % page)
            batch = d.get("users", []) if isinstance(d, dict) else (d or [])
            users += batch
            if len(batch) < 1000:
                break
            page += 1
        return users

    def create_user(self, email, password):
        return self._req("/auth/v1/admin/users", method="POST",
                         body={"email": email, "password": password, "email_confirm": True})

    def set_password(self, user_id, password):
        return self._req("/auth/v1/admin/users/" + user_id, method="PUT",
                         body={"password": password})


def chatwork_members(token, room_id):
    req = urllib.request.Request(
        "https://api.chatwork.com/v2/rooms/%s/members" % room_id,
        headers={"X-ChatWorkToken": token},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def build_roster(token):
    """Chatwork の参加者から {正規化名: {name, rooms:[教室名], staff:bool}} を作る"""
    roster = {}
    for label, room_id in CLASSROOMS:
        for m in chatwork_members(token, room_id):
            k = norm(m["name"])
            e = roster.setdefault(k, {"name": m["name"], "rooms": [], "staff": False})
            e["rooms"].append(label)
    for m in chatwork_members(token, STAFF_ROOM[1]):
        k = norm(m["name"])
        e = roster.setdefault(k, {"name": m["name"], "rooms": [], "staff": False})
        e["staff"] = True
    for k in list(roster):
        if k in NOT_TEACHERS:
            del roster[k]
    return roster


def match_teacher(key, teachers_by_key):
    """Chatwork の氏名 → teachers 行。

    前方一致は使わない。teachers 側に姓だけの行（「佐藤」「竹川」）があるため、
    前方一致にすると同姓の別人（佐藤大翔・佐藤珠里）まで既存扱いになり、
    その人のアカウントが永遠に作られない。名寄せは ALIAS に明示する。
    """
    if key in teachers_by_key:
        return teachers_by_key[key]
    alias = ALIAS.get(key)
    return teachers_by_key.get(alias) if alias else None


def next_ids(existing_emails, count):
    """未使用の t### を必要数だけ払い出す"""
    used = set()
    pat = re.compile("^" + ID_PREFIX + r"(\d+)" + re.escape(ID_DOMAIN) + "$")
    for e in existing_emails:
        m = pat.match((e or "").lower())
        if m:
            used.add(int(m.group(1)))
    out, n = [], 1
    while len(out) < count:
        if n not in used:
            out.append("%s%03d" % (ID_PREFIX, n))
            used.add(n)
        n += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="実際に発行する（既定はドライラン）")
    ap.add_argument("--reset-passwords", action="store_true",
                    help="既存の講師も共通の初期パスワードに揃える")
    ap.add_argument("--password", default=INITIAL_PASSWORD)
    args = ap.parse_args()

    menv = load_env(MANABI_ENV)
    aenv = load_env(AI_ENV)
    supa = Supa(menv["NEXT_PUBLIC_SUPABASE_URL"], menv["SUPABASE_SERVICE_ROLE_KEY"])
    cw_token = aenv["CHATWORK_API_TOKEN"]

    teachers = supa.rest("teachers?select=id,name,email,role,school_id")
    schools = {s["name"]: s["id"] for s in supa.rest("schools?select=id,name")}
    auth_by_email = {(u.get("email") or "").lower(): u for u in supa.auth_users()}
    roster = build_roster(cw_token)

    teachers_by_key = {norm(t["name"]): t for t in teachers}

    to_create, to_activate, ok_rows = [], [], []
    for key, info in sorted(roster.items()):
        t = match_teacher(key, teachers_by_key)
        rooms = info["rooms"]
        school_id = schools.get(rooms[0]) if len(rooms) == 1 else None
        if t is None:
            to_create.append({"name": info["name"], "rooms": rooms, "school_id": school_id})
        elif (t.get("email") or "").lower() not in auth_by_email:
            to_activate.append({"teacher": t, "rooms": rooms})
        else:
            ok_rows.append({"teacher": t, "rooms": rooms})

    listed = set()
    for key in roster:
        t = match_teacher(key, teachers_by_key)
        if t:
            listed.add(t["id"])
    others = [t for t in teachers if t["id"] not in listed]

    ids = next_ids([t.get("email") for t in teachers], len(to_create))
    for row, login_id in zip(to_create, ids):
        row["login_id"] = login_id
        row["email"] = login_id + ID_DOMAIN

    print("名簿（Chatwork 4教室＋社員）: %d名 ／ teachers 行: %d件\n" % (len(roster), len(teachers)))
    print("■ 新規に発行する（アカウントが無い）: %d名" % len(to_create))
    for r in to_create:
        print("   %s  %-10s  %s" % (r["login_id"], r["name"],
                                    "/".join(r["rooms"]) or "（教室ルーム未所属）"))
    print("\n■ teachers 行はあるが Auth が無い（発行だけ必要）: %d名" % len(to_activate))
    for r in to_activate:
        print("   %-10s  %s" % (r["teacher"]["name"], r["teacher"].get("email")))
    print("\n■ 既にログインできる: %d名" % len(ok_rows))
    print("■ 教室ルームに居ない登録済み講師: %d名 （%s）"
          % (len(others), ", ".join(t["name"] for t in others)))

    if not args.apply:
        print("\n[ドライラン] 何も書き込んでいない。--apply で実行する。")
        return

    created = []
    for r in to_create:
        try:
            user = supa.create_user(r["email"], args.password)
        except urllib.error.HTTPError as e:
            print("   × Auth作成失敗 %s: %s" % (r["name"], e.read().decode()[:120]))
            continue
        body = {"name": r["name"], "email": r["email"], "role": "teacher"}
        if r["school_id"]:
            body["school_id"] = r["school_id"]
        try:
            supa.insert("teachers", body)
        except urllib.error.HTTPError as e:
            print("   × teachers行作成失敗 %s: %s → Auth %s が宙に浮いた（手当てが必要）"
                  % (r["name"], e.read().decode()[:120], (user or {}).get("id")))
            continue
        created.append(r)
        print("   ✓ 発行 %s  %s" % (r["login_id"], r["name"]))

    for r in to_activate:
        em = (r["teacher"].get("email") or "").lower()
        try:
            supa.create_user(em, args.password)
            print("   ✓ アカウント発行 %s  %s" % (r["teacher"]["name"], em))
        except urllib.error.HTTPError as e:
            print("   × 失敗 %s: %s" % (r["teacher"]["name"], e.read().decode()[:120]))

    if args.reset_passwords:
        auth_by_email = {(u.get("email") or "").lower(): u for u in supa.auth_users()}
        n = 0
        for t in supa.rest("teachers?select=id,name,email"):
            em = (t.get("email") or "").lower()
            u = auth_by_email.get(em)
            if not u:
                continue
            try:
                supa.set_password(u["id"], args.password)
                n += 1
            except urllib.error.HTTPError as e:
                print("   × PW更新失敗 %s: %s" % (t["name"], e.read().decode()[:120]))
        print("\n   ✓ パスワードを共通値に揃えた: %d名" % n)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"password": args.password, "created": created}, f, ensure_ascii=False, indent=2)
    print("\n発行ぶんを %s に控えた。" % OUT_PATH)


if __name__ == "__main__":
    main()
