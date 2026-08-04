# -*- coding: utf-8 -*-
"""保護者のログインパスワードを再設定する

保護者側にはパスワード再設定の導線が無く、忘れると誰も助けられないため、
教室から再設定できる手段としてこれを置く。

  python scripts/reset_parent_password.py --email oya@example.com --password 新しいパスワード
  python scripts/reset_parent_password.py --name "細井"                 # 誰が対象か検索するだけ
  python scripts/reset_parent_password.py --all --password koubou2025   # 全員（要 --yes）

パスワードは復号できない（ハッシュ保存）ため「今の値を調べる」ことはできない。
上書きのみ。
"""
import argparse
import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ENV_PATH = r"C:\Users\user\Desktop\manabi-saas\.env.local"


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
        self.url, self.key = url.rstrip("/"), key

    def _req(self, path, method="GET", body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.url}{path}", data=data, method=method,
            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode()
            return json.loads(t) if t.strip() else None

    def parents(self):
        return self._req("/rest/v1/parents?select=id,name,email,auth_user_id&limit=1000")

    def set_password(self, auth_user_id, password):
        return self._req(f"/auth/v1/admin/users/{auth_user_id}", method="PUT",
                         body={"password": password})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", help="対象の保護者メール")
    ap.add_argument("--name", help="氏名の一部で検索")
    ap.add_argument("--all", action="store_true", help="全保護者を対象にする")
    ap.add_argument("--password", help="新しいパスワード（6文字以上）")
    ap.add_argument("--yes", action="store_true", help="--all のときの確認を省く")
    args = ap.parse_args()

    env = load_env()
    sb = Supa(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    parents = sb.parents()

    if args.email:
        targets = [p for p in parents if (p.get("email") or "").lower() == args.email.lower()]
    elif args.name:
        targets = [p for p in parents if args.name in (p.get("name") or "")]
    elif args.all:
        targets = list(parents)
    else:
        ap.error("--email / --name / --all のいずれかを指定してください")

    if not targets:
        print("該当する保護者が見つかりません。")
        return

    print(f"対象 {len(targets)}名:")
    for p in targets[:20]:
        state = "認証あり" if p.get("auth_user_id") else "認証なし(再設定不可)"
        print(f"  {p.get('name') or '(名前なし)':16s} {p.get('email') or '':34s} {state}")
    if len(targets) > 20:
        print(f"  ... ほか {len(targets)-20}名")

    if not args.password:
        print("\n(--password が無いため検索のみ。再設定するには --password を付けてください)")
        return
    if len(args.password) < 6:
        print("\nパスワードは6文字以上にしてください。")
        return
    if args.all and not args.yes:
        print(f"\n{len(targets)}名全員のパスワードを上書きします。実行するには --yes を付けてください。")
        return

    print("\n=== 再設定 ===")
    ok = fail = skip = 0
    for p in targets:
        uid = p.get("auth_user_id")
        if not uid:
            print(f"  スキップ {p.get('name')}（認証アカウント未作成）")
            skip += 1
            continue
        try:
            sb.set_password(uid, args.password)
            print(f"  OK  {p.get('name') or p.get('email')}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  NG  {p.get('name') or p.get('email')}  {e.code} {e.read().decode()[:140]}")
            fail += 1
    print(f"\n完了: 成功 {ok} / 失敗 {fail} / スキップ {skip}")


if __name__ == "__main__":
    main()
