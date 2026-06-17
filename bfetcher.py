# ─────────────────────────────────────────────
#  BUNGIE FETCHER (v2 — direct article rendering)
#
#  WHY THIS REPLACES THE RSS-FEED APPROACH:
#  The old fetcher paged through /Platform/Content/Rss/NewsArticles/{page}/
#  looking for specific slugs. That feed is Bungie's general news/blog
#  feed — it does not reliably contain individual patch-note articles,
#  and there's no way to search it by slug. Paging back far enough to
#  find an old patch note is not guaranteed to ever succeed.
#
#  Since we already know the exact slugs we want
#  (https://www.bungie.net/7/en/News/Article/<slug>), the simpler and
#  more reliable approach is to render each article page directly with
#  a real browser (the page is a client-rendered SPA — plain requests.get()
#  only fetches the empty JS shell) and parse the rendered HTML.
#
#  Requires: pip install playwright && playwright install chromium
# ─────────────────────────────────────────────

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BUNGIE_ARTICLE_BASE = "https://www.bungie.net/7/en/News/Article/"

BUNGIE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _extract_article_fields(html: str) -> dict:
    """
    Parse the rendered HTML of a Bungie article page into title/date/content.

    NOTE: These selectors are best-effort placeholders. Run
    inspect_bungie_page.py first against a real article and confirm
    (or correct) the selectors below against the actual rendered DOM —
    do not trust this blind, the same way the old RSS code blindly
    trusted a response shape that didn't match reality.
    """
    soup = BeautifulSoup(html, "html.parser")

    # --- Title ---
    title = ""
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)

    # --- Date ---
    date_iso = ""
    time_el = soup.find("time")
    if time_el and time_el.get("datetime"):
        raw_date = time_el["datetime"]
        try:
            dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            date_iso = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except ValueError:
            date_iso = raw_date

    # --- Body content ---
    # Prefer an <article> wrapper if present; fall back to all <p> tags.
    article_el = soup.find("article")
    container = article_el if article_el else soup
    parts = []
    for tag in container.find_all(["p", "li", "h2", "h3", "h4"]):
        text = tag.get_text(" ", strip=True)
        if len(text) > 10:
            parts.append(text)
    content = " ".join(parts)[:6000]

    return {"title": title, "date": date_iso, "content": content}


def fetch_articles_bungie(game_config: dict) -> list[dict]:
    """
    Fetch Destiny 2 patch notes by rendering each article slug directly
    with a headless browser, in the order given by
    game_config["bungie_patch_slugs"] (oldest -> newest in config;
    returned newest-first to match the other fetchers).
    """
    target_slugs: list[str] = game_config.get("bungie_patch_slugs", [])
    if not target_slugs:
        print("  No bungie_patch_slugs defined — nothing to fetch.")
        return []

    # Skip slugs we've already scraped successfully.
    output_file: Path = game_config["output_file"]
    existing: dict[str, dict] = {}
    if output_file.exists():
        try:
            for p in json.loads(output_file.read_text(encoding="utf-8")):
                for slug in target_slugs:
                    if p.get("url", "").rstrip("/").endswith(slug):
                        existing[slug] = p
                        break
        except Exception:
            pass

    remaining_slugs = [s for s in target_slugs if s not in existing]
    found: dict[str, dict] = dict(existing)

    if not remaining_slugs:
        print(f"  All {len(target_slugs)} slugs already cached — skipping browser fetch.")
        return [found[s] for s in reversed(target_slugs) if s in found]

    print(f"  Rendering {len(remaining_slugs)} new article page(s) with a headless browser...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=BUNGIE_USER_AGENT)

        for slug in remaining_slugs:
            url = f"{BUNGIE_ARTICLE_BASE}{slug}"
            print(f"    Loading {slug} ...")
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
                # Client-rendered content can land slightly after networkidle.
                page.wait_for_timeout(1500)
                html = page.content()
            except PlaywrightTimeoutError:
                print(f"    ⚠ Timed out loading {slug} — skipping.")
                continue
            except Exception as e:
                print(f"    ⚠ Error loading {slug}: {e} — skipping.")
                continue

            fields = _extract_article_fields(html)
            if not fields["title"] or not fields["content"]:
                print(f"    ⚠ Got page for {slug} but couldn't extract title/content — "
                      f"selectors in _extract_article_fields likely need adjusting. "
                      f"Run inspect_bungie_page.py against this slug to check.")
                continue

            found[slug] = {
                "game": game_config["name"],
                "title": fields["title"],
                "url": url,
                "date": fields["date"],
                "content": fields["content"],
            }
            print(f"    ✓ {slug} | {fields['date'][:10] if fields['date'] else 'no date'} | "
                  f"{fields['title'][:60]}")
            time.sleep(1.0)  # be polite between page loads

        browser.close()

    missing = [s for s in target_slugs if s not in found]
    if missing:
        print(f"\n  ⚠ Could not fetch {len(missing)} slug(s):")
        for s in missing:
            print(f"      • {s}")

    ordered = [found[s] for s in reversed(target_slugs) if s in found]
    print(f"\n  Total Destiny 2 patches collected: {len(ordered)}")
    return ordered