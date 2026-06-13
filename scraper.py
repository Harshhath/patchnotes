"""
scraper.py — multi-game patch note scraper

To add a new game, add a new entry to the GAMES dict at the top of this file.
Each game needs:
  - name:         human-readable name (used in logs and the "game" field)
  - list_url:     the page that lists all patch note articles
  - base_url:     used to filter and resolve relative URLs
  - title_filter: lowercase string that must appear in the article title
  - output_file:  where to save the JSON for this game
  - hash_file:    where to store the URL hash for change detection
  - tags:         list of valid tags for the Groq prompt (game-specific)
  - groq_analyst: short description of the analyst role for the Groq prompt
"""

import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

ROOT = Path(__file__).resolve().parent

# ─────────────────────────────────────────────
#  GAME CONFIGS — add new games here
# ─────────────────────────────────────────────
GAMES = {
    "valorant": {
        "name": "Valorant",
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
    # Example: uncomment and fill in to add League of Legends
    # "lol": {
    #     "name": "League of Legends",
    #     "list_url": "https://www.leagueoflegends.com/en-us/news/game-updates/",
    #     "base_url": "https://www.leagueoflegends.com",
    #     "title_filter": "patch",
    #     "output_file": ROOT / "patches_lol.json",
    #     "hash_file": ROOT / "hash_lol.txt",
    #     "groq_analyst": "League of Legends patch notes analyst",
    #     "tags": [
    #         "champion-buff", "champion-nerf", "item-change", "rune-change",
    #         "bug-fix", "new-feature", "performance", "map-change",
    #     ],
    # },
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
#  GROQ SUMMARISATION
# ─────────────────────────────────────────────

def summarise_patch(patch, game_config):
    tags_list = ", ".join(f'"{t}"' for t in game_config["tags"])
    prompt = f"""You are a {game_config['groq_analyst']}. Analyse the patch note below and return ONLY a valid JSON object — no markdown, no backticks, no explanation, no extra text before or after.

The JSON must have exactly these two fields:
1. "summary": an array of 3-5 strings, each string being one bullet point describing a key change
2. "tags": an array of 3-6 short lowercase tags from this list: {tags_list}

Example of the exact format to return:
{{"summary": ["Key change one.", "Key change two.", "Key change three."], "tags": ["bug-fix", "new-feature"]}}

Title: {patch['title']}
Date: {patch['date']}
Content: {patch['content'][:3000]}
"""

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
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
        if patch.get("summary"):
            print(f"  Skipping {i}/{total}: {patch['title']} (already summarised)")
            continue
        print(f"  Summarising {i}/{total}: {patch['title']}")
        try:
            result = summarise_patch(patch, game_config)
            patch["summary"] = result.get("summary", [])
            patch["tags"] = result.get("tags", [])
        except Exception as e:
            print(f"    ERROR: {e} — skipping")
            patch["summary"] = []
            patch["tags"] = []
        time.sleep(0.5)
    return patches


# ─────────────────────────────────────────────
#  HASH DETECTION
# ─────────────────────────────────────────────

def compute_hash(articles):
    url_string = "\n".join(a["url"] for a in articles)
    return hashlib.sha256(url_string.encode()).hexdigest()


def load_saved_hash(hash_file):
    if hash_file.exists():
        return hash_file.read_text(encoding="utf-8").strip()
    return None


def save_hash(hash_file, hash_value):
    hash_file.write_text(hash_value + "\n", encoding="utf-8")


# ─────────────────────────────────────────────
#  ARTICLE FETCHING (Riot Next.js sites)
# ─────────────────────────────────────────────

def fetch_articles(game_config):
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
        for link in soup.select(f'a[href*="/news/game-updates/"]'):
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

    # Filter to patch notes only
    return [
        a for a in articles
        if a["url"].startswith(base_url) and title_filter in a["title"].casefold()
    ]


# ─────────────────────────────────────────────
#  CONTENT SCRAPING (Riot Next.js sites)
# ─────────────────────────────────────────────

def scrape_patch_content(url, game_config):
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
                    content_soup = BeautifulSoup(html, "html.parser")
                    paragraphs.extend(
                        p.get_text(strip=True)
                        for p in content_soup.find_all("p")
                        if p.get_text(strip=True)
                    )

    return {
        "game": game_config["name"],
        "title": title,
        "url": url,
        "date": date,
        "content": " ".join(paragraphs),
    }


# ─────────────────────────────────────────────
#  PER-GAME PIPELINE
# ─────────────────────────────────────────────

def run_game(game_key, game_config):
    print(f"\n{'='*50}")
    print(f"  {game_config['name']}")
    print(f"{'='*50}")

    print("Fetching patch list...")
    articles = fetch_articles(game_config)
    total = len(articles)
    print(f"Found {total} patch notes.")

    current_hash = compute_hash(articles)
    saved_hash = load_saved_hash(game_config["hash_file"])

    output_file = game_config["output_file"]

    if current_hash == saved_hash:
        print("No change detected — skipping scrape.")
    else:
        print("Change detected — starting scrape...\n")
        results = []
        for i, article in enumerate(articles, start=1):
            print(f"  Scraping {i}/{total}: {article['title']}")
            try:
                patch = scrape_patch_content(article["url"], game_config)
                results.append(patch)
            except Exception as e:
                print(f"  ERROR scraping: {e} — skipping")
            time.sleep(1)

        output_file.write_text(
            json.dumps(results, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        save_hash(game_config["hash_file"], current_hash)
        print(f"\nSaved {len(results)} patches to {output_file.name}")

    if not output_file.exists():
        print("No output file found — skipping summarisation.")
        return

    patches = json.loads(output_file.read_text(encoding="utf-8"))
    patches = summarise_all(patches, game_config)
    output_file.write_text(
        json.dumps(patches, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    summarised = sum(1 for p in patches if p.get("summary"))
    print(f"Done! {summarised}/{len(patches)} patches have summaries.")


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def main():
    for game_key, game_config in GAMES.items():
        run_game(game_key, game_config)


if __name__ == "__main__":
    main()