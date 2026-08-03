"""docs/ai-key-manual.html を A4 PDF にする。

  python scripts/render_ai_key_manual.py

出力: output/つながるまなび_生成AI管理マニュアル.pdf
図はHTML内のSVG／CSSで描いているので、画像ファイルの同梱は不要。
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "ai-key-manual.html"
OUT = ROOT / "output" / "つながるまなび_生成AI管理マニュアル.pdf"


def main() -> int:
    if not SRC.exists():
        print(f"[エラー] {SRC} がありません")
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.goto(SRC.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(400)
        page.pdf(path=str(OUT), prefer_css_page_size=True, print_background=True)
        b.close()
    print(f"[完了] {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
