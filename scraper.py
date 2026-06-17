"""
scraper.py — multi-game patch note scraper
"""

import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

ROOT = Path(__file__).resolve().parent

CS2_LAUNCH_DATE = "2023-09-27"
D2_FROM_DATE    = "2022-01-01"

# ─────────────────────────────────────────────
#  GAME CONFIGS
# ─────────────────────────────────────────────
GAMES = {
    "valorant": {
        "name": "Valorant",
        "type": "riot",
        "list_url": "https://playvalorant.com/en-us/news/game-updates/",
        "base_url": "https://playvalorant.com",
        "title_filter": "patch notes",
        "output_file": ROOT / "patches_valorant.json",
        "hash_file": ROOT / "hash_valorant.txt",
        "groq_analyst": "Valorant patch notes analyst",
        "tags": [
            "agent-buff", "agent-nerf", "weapon-buff", "weapon-nerf",
            "map-change", "bug-fix", "economy", "performance",
            "new-feature", "premier",
        ],
    },
    "cs2": {
        "name": "CS2",
        "type": "steam",
        "steam_app_id": 730,
        "title_filter": ["release notes", "counter-strike 2 update"],
        "date_from": CS2_LAUNCH_DATE,
        "output_file": ROOT / "patches_cs2.json",
        "hash_file":   ROOT / "hash_cs2.txt",
        "groq_analyst": "CS2 (Counter-Strike 2) patch notes analyst",
        "tags": [
            "weapon-change", "map-change", "bug-fix", "performance",
            "gameplay", "ui-change", "new-feature", "anti-cheat",
        ],
    },
    "destiny2": {
        "name": "Destiny 2",
        "type": "bungie",
        # Explicit list of patch slugs in version order (oldest → newest).
        # Add new slugs here as Bungie publishes them.
        "bungie_patch_slugs": [
            "destiny_update_9_5_0_5",
            "destiny_update_9_5_1",
            "destiny_update_9_5_2",
            "destiny_update_9_5_3",
            "destiny_update_9_5_4",
            "destiny_update_9_5_5",
            "destiny_update_9_5_5_1",
            "destiny_update_9_5_5_2",
            "destiny_update_9_5_5_3",
            "destiny_update_9_5_5_4",
            "destiny_update_9_5_5_5",
            "destiny_update_9_5_6_1",
            "destiny_update_9_5_6_2",
            "destiny_update_9_5_6_3",
            "destiny_update_9_7_0",
            "destiny_update_9_7_0_1",
        ],
        "output_file": ROOT / "patches_destiny2.json",
        "hash_file":   ROOT / "hash_destiny2.txt",
        "groq_analyst": "Destiny 2 patch notes analyst",
        "tags": [
            "weapon-buff", "weapon-nerf", "ability-change", "subclass-change",
            "bug-fix", "new-feature", "raid-change", "pvp-change",
            "economy", "performance",
            "hunter", "titan", "warlock",
            "gunslinger", "arcstrider", "nightstalker", "revenant", "threadrunner",
            "sunbreaker", "striker", "sentinel", "behemoth", "berserker",
            "dawnblade", "stormcaller", "voidwalker", "shadebinder", "broodweaver",
            "prismatic",
        ],
    },
}

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


# ─────────────────────────────────────────────
#  BAD SUMMARY DETECTION
# ─────────────────────────────────────────────

BAD_PHRASES = [
    "no key changes", "no significant changes", "patch notes are incomplete",
    "more information is needed", "further information is needed",
    "no changes mentioned", "no major changes", "unable to provide",
    "not enough information", "no specific changes", "no details provided",
    "not fully provided", "accurately summarize",
]

def is_bad_summary(patch):
    summary = patch.get("summary", [])
    if not summary:
        return True
    if len(summary) == 1 and summary[0].strip().startswith("{"):
        return True
    return any(
        any(phrase in bullet.lower() for phrase in BAD_PHRASES)
        for bullet in summary
    )


# ─────────────────────────────────────────────
#  TITLE FILTER HELPER
# ─────────────────────────────────────────────

def matches_title_filter(title: str, title_filter) -> bool:
    filters = title_filter if isinstance(title_filter, list) else [title_filter]
    return any(f in title.casefold() for f in filters)


# ─────────────────────────────────────────────
#  GROQ SUMMARISATION
# ─────────────────────────────────────────────

def summarise_patch(patch, game_config):
    tags_list = ", ".join(f'"{t}"' for t in game_config["tags"])
    prompt = f"""You are a {game_config['groq_analyst']}. Analyse the patch note below and return ONLY a valid JSON object — no markdown, no backticks, no explanation, no extra text before or after.

The JSON must have exactly these two fields:
1. "summary": an array of 3-5 strings, each a bullet point describing a key change.
   - NEVER write filler like "No key changes", "patch notes are incomplete", "more information is needed", or similar.
   - Always produce 3 meaningful, specific bullet points based on what is actually written.
   - If content is minimal, describe what IS there (bug fixes, stability, minor balance).

2. "tags": an array of 3-8 short lowercase tags chosen ONLY from this exact list: {tags_list}
   - WEAPON TAGS: include "weapon-buff" if ANY weapon has increased damage, range, handling, reload, or magazine. Include "weapon-nerf" if ANY weapon has decreased stats. Apply these even if only one weapon is affected.
   - ABILITY TAGS: include "ability-change" if ANY ability, super, or grenade is modified — ALWAYS apply this alongside the specific subclass tag (e.g. "ability-change" + "gunslinger"). Never use only the subclass tag without "ability-change" when abilities are changed.
   - SUBCLASS TAGS: include "subclass-change" if subclass mechanics, keywords, or verbs (e.g. Scorch, Suspend, Weaken) are changed at a systemic level.
   - CLASS TAGS: include "hunter", "titan", or "warlock" whenever that class is mentioned, alongside any subclass tags.
   - ALWAYS include "performance" if the patch has no major gameplay changes.
   - NEVER invent tags not in the list above.
   - Example: "The Last Word damage increased" → ["weapon-buff", ...]
   - Example: "Gunslinger Golden Gun damage increased" → ["ability-change", "hunter", "gunslinger", ...]

Example format:
{{"summary": ["Change one.", "Change two.", "Change three."], "tags": ["weapon-buff", "hunter", "gunslinger"]}}

Title: {patch['title']}
Date: {patch['date']}
Content: {patch['content'][:3000]}
"""
    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed.get("summary"), str):
            parsed["summary"] = [parsed["summary"]]
        return parsed
    except json.JSONDecodeError:
        return {"summary": [raw], "tags": []}


def summarise_all(patches, game_config):
    total = len(patches)
    print(f"\nSummarising {total} patches with Groq...\n")
    for i, patch in enumerate(patches, start=1):
        if patch.get("summary") and not is_bad_summary(patch):
            print(f"  Skipping {i}/{total}: {patch['title']} (already summarised)")
            continue
        print(f"  Summarising {i}/{total}: {patch['title']}")
        try:
            result = summarise_patch(patch, game_config)
            patch["summary"] = result.get("summary", [])
            patch["tags"]    = result.get("tags", [])
        except Exception as e:
            print(f"    ERROR: {e} — skipping")
            patch["summary"] = []
            patch["tags"]    = []
        time.sleep(2)
    return patches


# ─────────────────────────────────────────────
#  DATE FILTERING
# ─────────────────────────────────────────────

def filter_by_date(articles, game_config):
    date_from = game_config.get("date_from")
    if not date_from:
        return articles
    cutoff = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    before = len(articles)
    filtered = []
    for a in articles:
        date_str = a.get("date", "")
        if not date_str:
            filtered.append(a)
            continue
        try:
            patch_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if patch_date >= cutoff:
                filtered.append(a)
        except ValueError:
            filtered.append(a)
    dropped = before - len(filtered)
    if dropped:
        print(f"  Filtered out {dropped} pre-date patches (before {date_from}).")
    return filtered


# ─────────────────────────────────────────────
#  HASH DETECTION
# ─────────────────────────────────────────────

def compute_hash(articles):
    url_string = "\n".join(a["url"] if isinstance(a, dict) else a for a in articles)
    return hashlib.sha256(url_string.encode()).hexdigest()

def load_saved_hash(hash_file):
    if hash_file.exists():
        return hash_file.read_text(encoding="utf-8").strip()
    return None

def save_hash(hash_file, hash_value):
    hash_file.write_text(hash_value + "\n", encoding="utf-8")


# ─────────────────────────────────────────────
#  RIOT FETCHER (Next.js sites)
# ─────────────────────────────────────────────

def fetch_articles_riot(game_config):
    response = requests.get(game_config["list_url"], headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    base_url = game_config["base_url"]
    title_filter = game_config["title_filter"]
    articles = []
    seen_urls = set()

    next_data = soup.find("script", id="__NEXT_DATA__")
    if next_data and next_data.string:
        page_data = json.loads(next_data.string)
        blades = page_data.get("props", {}).get("pageProps", {}).get("page", {}).get("blades", [])
        for blade in blades:
            if blade.get("type") != "articleCardGrid":
                continue
            for item in blade.get("items", []):
                href = item.get("action", {}).get("payload", {}).get("url")
                title = item.get("title")
                if not href or not title:
                    continue
                url = urljoin(base_url, href)
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                articles.append({"title": title, "url": url})

    if not articles:
        for link in soup.select('a[href*="/news/game-updates/"]'):
            href = link.get("href", "")
            if href.rstrip("/").endswith("/game-updates"):
                continue
            url = urljoin(base_url, href)
            if url in seen_urls:
                continue
            title_el = link.select_one('[data-testid="card-title"]')
            title = link.get("aria-label") or (
                title_el.get_text(strip=True) if title_el else link.get_text(strip=True)
            )
            seen_urls.add(url)
            articles.append({"title": title, "url": url})

    return [
        a for a in articles
        if a["url"].startswith(base_url) and matches_title_filter(a["title"], title_filter)
    ]


def scrape_patch_content_riot(url, game_config):
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    title_el = soup.select_one('[data-testid="title"]')
    title = title_el.get_text(strip=True) if title_el else ""
    time_el = soup.find("time")
    date = time_el.get("datetime", "") if time_el else ""
    paragraphs = [
        p.get_text(strip=True)
        for p in soup.select('[data-testid="rich-text-html"] p')
        if p.get_text(strip=True)
    ]
    if not title or not date or not paragraphs:
        next_data = soup.find("script", id="__NEXT_DATA__")
        if next_data and next_data.string:
            page = json.loads(next_data.string)["props"]["pageProps"]["page"]
            if not title:
                title = page.get("title", "")
            if not date:
                date = page.get("displayedPublishDate", "")
                for blade in page.get("blades", []):
                    if blade.get("type") == "articleMasthead":
                        date = date or blade.get("publishDate", "")
                        break
            if not paragraphs:
                for blade in page.get("blades", []):
                    if blade.get("type") != "articleRichText":
                        continue
                    html = blade.get("richText", {}).get("body", "")
                    if not html:
                        continue
                    cs = BeautifulSoup(html, "html.parser")
                    paragraphs.extend(
                        p.get_text(strip=True) for p in cs.find_all("p")
                        if p.get_text(strip=True)
                    )
    return {"game": game_config["name"], "title": title, "url": url, "date": date, "content": " ".join(paragraphs)}


# ─────────────────────────────────────────────
#  STEAM FETCHER (ISteamNews API + pagination)
# ─────────────────────────────────────────────

STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"

def fetch_articles_steam(game_config):
    app_id = game_config["steam_app_id"]
    title_filter = game_config["title_filter"]
    date_from = game_config.get("date_from")
    articles = []
    seen_gids = set()
    cutoff_ts = None
    if date_from:
        cutoff_ts = int(datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc).timestamp())
    end_date = int(datetime.now(tz=timezone.utc).timestamp())
    page = 0
    max_pages = 300

    print(f"  Fetching Steam news via ISteamNews API...")
    if cutoff_ts:
        print(f"  Will stop at {date_from}.")

    while page < max_pages:
        params = {"appid": app_id, "count": 100, "maxlength": 0, "enddate": end_date,
                  "feeds": "steam_community_announcements", "format": "json"}
        try:
            resp = requests.get(STEAM_NEWS_URL, params=params, headers=REQUEST_HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  API error on page {page}: {e}")
            break

        items = data.get("appnews", {}).get("newsitems", [])
        if not items:
            break

        matched = 0
        oldest_date = end_date
        hit_cutoff = False

        for item in items:
            gid = str(item.get("gid", ""))
            title = item.get("title", "").strip()
            date_ts = int(item.get("date", 0))
            if date_ts < oldest_date:
                oldest_date = date_ts
            if cutoff_ts and date_ts < cutoff_ts:
                hit_cutoff = True
                continue
            if gid in seen_gids:
                continue
            seen_gids.add(gid)
            if not matches_title_filter(title, title_filter):
                continue
            body_html = item.get("contents", "")
            body_text = BeautifulSoup(body_html, "html.parser").get_text(separator=" ", strip=True) if body_html else ""
            date_iso = datetime.fromtimestamp(date_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            url = item.get("url") or f"https://store.steampowered.com/news/app/{app_id}/view/{gid}"
            articles.append({"game": game_config["name"], "title": title, "url": url, "date": date_iso, "content": body_text})
            matched += 1

        print(f"  Page {page:>3} | items={len(items):>3} | matched={matched:>3} | total so far={len(articles)}")
        if hit_cutoff:
            print(f"  Reached {date_from} cutoff — stopping.")
            break
        if len(items) < 100:
            print("  Reached beginning of news history.")
            break
        end_date = oldest_date - 1
        page += 1
        time.sleep(0.4)

    print(f"  Total patches collected: {len(articles)}")
    articles.sort(key=lambda a: a["date"], reverse=True)
    return articles


# ─────────────────────────────────────────────
#  BUNGIE FETCHER
#
#  bungie.net/7/en/News/Article/<slug> is a client-rendered SPA —
#  plain requests.get() only gets the JS shell.  The official
#  /Platform/Content/Rss/NewsArticles/ endpoint returns the same
#  articles as server-side JSON (with full HTML body) and only
#  requires a free X-API-Key (register at bungie.net/en/Application).
#
#  Add BUNGIE_API_KEY=<your key> to your .env file.
#
#  The fetcher iterates through RSS pages until every slug in
#  game_config["bungie_patch_slugs"] has been found, then returns
#  them in newest-first order.
# ─────────────────────────────────────────────

BUNGIE_RSS_URL = "https://www.bungie.net/Platform/Content/Rss/NewsArticles/{page}/"
BUNGIE_ARTICLE_BASE = "https://www.bungie.net/7/en/News/Article/"


def _bungie_headers() -> dict:
    """Return request headers including the Bungie API key from env."""
    api_key = os.environ.get("BUNGIE_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "BUNGIE_API_KEY is not set in your .env file.\n"
            "Register a free key at https://www.bungie.net/en/Application"
        )
    headers = dict(REQUEST_HEADERS)
    headers["X-API-Key"] = api_key
    return headers


def _parse_bungie_body(html_body: str) -> str:
    """Strip HTML tags from a Bungie article body and return plain text."""
    if not html_body:
        return ""
    soup = BeautifulSoup(html_body, "html.parser")
    # Remove script/style noise
    for tag in soup.select("script, style"):
        tag.decompose()
    parts = []
    for tag in soup.find_all(["p", "li", "h2", "h3", "h4"]):
        text = tag.get_text(" ", strip=True)
        if len(text) > 10:
            parts.append(text)
    return " ".join(parts)[:6000]


def fetch_articles_bungie(game_config: dict) -> list[dict]:
    """
    Fetch Destiny 2 patch notes from the Bungie Platform RSS API.

    Pages through /Platform/Content/Rss/NewsArticles/{page}/?includebody=true
    until all slugs in game_config["bungie_patch_slugs"] are found or we
    exhaust all pages.  Returns articles newest-first.
    """
    target_slugs: list[str] = game_config.get("bungie_patch_slugs", [])
    if not target_slugs:
        print("  No bungie_patch_slugs defined — nothing to fetch.")
        return []

    headers = _bungie_headers()

    # Load existing patches so we can skip already-scraped slugs
    output_file: Path = game_config["output_file"]
    existing: dict[str, dict] = {}
    if output_file.exists():
        try:
            for p in json.loads(output_file.read_text(encoding="utf-8")):
                # key by slug extracted from URL
                m = re.search(r"/News/Article/([^/?#]+)", p.get("url", ""))
                if m:
                    existing[m.group(1)] = p
        except Exception:
            pass

    remaining_slugs = set(target_slugs) - set(existing.keys())
    found: dict[str, dict] = dict(existing)  # slug → article

    if not remaining_slugs:
        print(f"  All {len(target_slugs)} slugs already cached — skipping API calls.")
    else:
        print(f"  Fetching {len(remaining_slugs)} new slug(s) from Bungie RSS API...")
        page = 0
        max_pages = 50  # safety ceiling; there are rarely more than ~10 pages of news

        while remaining_slugs and page < max_pages:
            url = BUNGIE_RSS_URL.format(page=page)
            params = {"includebody": "true", "categoryfilter": "Destiny"}
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"  API error on page {page}: {e}")
                break

            # Response shape: {"Response": {"NewsArticles": [...], "CurrentPaginationToken": N, "ResultCountThisPage": N}}
            response_body = data.get("Response", {})
            news_items = response_body.get("NewsArticles", [])

            if not news_items:
                print(f"  Page {page}: no articles returned — stopping.")
                break

            matched_this_page = 0
            for item in news_items:
                # The article URL slug lives in item["Properties"]["Url"] or item["Url"]
                props = item.get("Properties", item)  # some API versions nest under Properties
                raw_url = props.get("Url", "") or item.get("Url", "")
                # Extract just the slug: e.g. "destiny_update_9_5_0_5"
                slug_match = re.search(r"/News/Article/([^/?#\s]+)", raw_url)
                if not slug_match:
                    # Some items use a bare slug without the full path prefix
                    slug = raw_url.strip().rstrip("/").split("/")[-1]
                else:
                    slug = slug_match.group(1)

                if slug not in remaining_slugs:
                    continue

                # Parse date
                date_str = props.get("ArticleDate", "") or item.get("ArticleDate", "")
                date_iso = ""
                if date_str:
                    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                        try:
                            dt = datetime.strptime(date_str[:19], fmt).replace(tzinfo=timezone.utc)
                            date_iso = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
                            break
                        except ValueError:
                            continue

                # Parse title
                title = props.get("Title", "") or item.get("Title", "") or f"Destiny 2 Update {slug}"

                # Parse content body (HTML → plain text)
                body_html = props.get("Content", "") or item.get("Content", "")
                content = _parse_bungie_body(body_html)

                article_url = f"{BUNGIE_ARTICLE_BASE}{slug}"

                found[slug] = {
                    "game":    game_config["name"],
                    "title":   title,
                    "url":     article_url,
                    "date":    date_iso,
                    "content": content,
                }
                remaining_slugs.discard(slug)
                matched_this_page += 1
                print(f"    ✓ Found slug '{slug}' | {date_iso[:10] if date_iso else 'no date'} | {title[:50]}")

            print(f"  Page {page}: {len(news_items)} items, {matched_this_page} matched | {len(remaining_slugs)} slug(s) still needed")

            if not remaining_slugs:
                break

            result_count = response_body.get("ResultCountThisPage", len(news_items))
            if result_count == 0:
                break

            page += 1
            time.sleep(0.4)

        if remaining_slugs:
            print(f"\n  ⚠ Could not find {len(remaining_slugs)} slug(s) in the RSS feed:")
            for s in sorted(remaining_slugs):
                print(f"      • {s}")
            print("  These may not be published yet, or the slug spelling may differ.")

    # Return in the order defined by bungie_patch_slugs (newest last → reverse for newest-first output)
    ordered = []
    for slug in reversed(target_slugs):
        if slug in found:
            ordered.append(found[slug])

    print(f"\n  Total Destiny 2 patches collected: {len(ordered)}")
    return ordered


# ─────────────────────────────────────────────
#  DISPATCHER
# ─────────────────────────────────────────────

def fetch_articles(game_config):
    if game_config.get("type") == "steam":
        return fetch_articles_steam(game_config)
    if game_config.get("type") == "bungie":
        return fetch_articles_bungie(game_config)
    return fetch_articles_riot(game_config)

def scrape_patch_content(article, game_config):
    if game_config.get("type") in ("steam", "bungie"):
        return article
    url = article if isinstance(article, str) else article["url"]
    return scrape_patch_content_riot(url, game_config)


# ─────────────────────────────────────────────
#  PER-GAME PIPELINE
# ─────────────────────────────────────────────

def run_game(game_key, game_config):
    print(f"\n{'='*55}")
    print(f"  {game_config['name']}")
    print(f"{'='*55}")

    print("Fetching patch list...")
    articles = fetch_articles(game_config)
    articles = filter_by_date(articles, game_config)

    total = len(articles)
    print(f"Found {total} patch notes.")

    if total == 0:
        print("Nothing to process.")
        return

    current_hash = compute_hash(articles)
    saved_hash   = load_saved_hash(game_config["hash_file"])
    output_file  = game_config["output_file"]

    if current_hash == saved_hash and output_file.exists():
        print("No change detected — loading existing file for summarisation.")
    else:
        print("Change detected — saving patches...\n")
        if game_config.get("type") in ("steam", "bungie"):
            results = articles
        else:
            results = []
            for i, article in enumerate(articles, start=1):
                title = article["title"] if isinstance(article, dict) else article
                print(f"  Scraping {i}/{total}: {title}")
                try:
                    patch = scrape_patch_content(article, game_config)
                    results.append(patch)
                except Exception as e:
                    print(f"  ERROR: {e} — skipping")
                time.sleep(0.8)

        output_file.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        save_hash(game_config["hash_file"], current_hash)
        print(f"Saved {len(results)} patches → {output_file.name}")

    if not output_file.exists():
        print("No output file found — skipping summarisation.")
        return

    patches = json.loads(output_file.read_text(encoding="utf-8"))
    patches = filter_by_date(patches, game_config)

    requeued = 0
    for patch in patches:
        if is_bad_summary(patch):
            patch.pop("summary", None)
            patch.pop("tags", None)
            requeued += 1
    if requeued:
        print(f"\nRe-queuing {requeued} patch(es) with bad or missing summaries...")

    patches = summarise_all(patches, game_config)

    output_file.write_text(json.dumps(patches, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summarised = sum(1 for p in patches if p.get("summary"))
    print(f"Done! {summarised}/{len(patches)} patches have summaries.")


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def main():
    import sys
    if len(sys.argv) > 1:
        key = sys.argv[1]
        if key in GAMES:
            run_game(key, GAMES[key])
        else:
            print(f"Unknown game key '{key}'. Available: {', '.join(GAMES.keys())}")
    else:
        for game_key, game_config in GAMES.items():
            run_game(game_key, game_config)

if __name__ == "__main__":
    main()