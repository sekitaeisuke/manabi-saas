import asyncio, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "textbook_progress_manual.html")
PDF  = os.path.join(HERE, "教材進捗_入力マニュアル.pdf")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page()
        await page.goto("file:///" + HTML.replace("\\", "/"))
        await page.wait_for_timeout(400)
        await page.pdf(path=PDF, format="A4", print_background=True,
                       margin={"top":"0","bottom":"0","left":"0","right":"0"})
        await b.close()
    print("PDF ->", PDF)

asyncio.run(main())
