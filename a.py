"""
inspect_bungie_page.py — run this FIRST, on your own machine.

It loads one known-good Bungie article with a real headless browser,
waits for the client-rendered content to appear, then dumps:
  1. The full rendered HTML to bungie_sample.html (for you/me to inspect)
  2. A best-guess extraction of title/date/body so we can see what's there

Run:
    pip install playwright
    playwright install chromium
    python inspect_bungie_page.py
"""

from playwright.sync_api import sync_playwright

URL = "https://www.bungie.net/7/en/News/Article/destiny_update_9_5_0_5"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        print(f"Loading {URL} ...")
        page.goto(URL, wait_until="networkidle", timeout=60000)

        # Give client-side rendering a bit of extra time beyond networkidle
        page.wait_for_timeout(2000)

        html = page.content()
        with open("bungie_sample.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Saved full rendered HTML -> bungie_sample.html ({len(html)} chars)")

        # Try a few likely selectors and report what we find — this tells us
        # which one is real instead of guessing.
        candidates = {
            "h1": page.locator("h1"),
            "article": page.locator("article"),
            "[class*=title]": page.locator("[class*=title]"),
            "[class*=Article]": page.locator("[class*=Article]"),
            "time": page.locator("time"),
            "[datetime]": page.locator("[datetime]"),
            "p": page.locator("p"),
        }
        for name, loc in candidates.items():
            count = loc.count()
            sample = ""
            if count:
                try:
                    sample = loc.first.inner_text()[:80].replace("\n", " ")
                except Exception:
                    sample = "(could not read text)"
            print(f"  {name:<20} count={count:<4} sample={sample!r}")

        browser.close()

if __name__ == "__main__":
    main()