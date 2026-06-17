"""
inspect_bungie_page_2.py — run this on your machine, in the same folder
as bungie_sample.html (already saved by the first inspector).

This digs deeper than the first pass: it looks for the date (since no
<time>/[datetime] exists) and tries to find the real content container
(since <article> doesn't exist and there are only 8 raw <p> tags on an
800KB page, meaning the real body text likely isn't in plain <p> tags
at top level, or is nested inside something we haven't checked yet).
"""

import re
from bs4 import BeautifulSoup

with open("bungie_sample.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

print("=" * 60)
print("1) All <p> tag contents (the 8 found):")
print("=" * 60)
for i, p in enumerate(soup.find_all("p")):
    print(f"  [{i}] {p.get_text(' ', strip=True)[:120]!r}")

print()
print("=" * 60)
print("2) Searching raw HTML for date-like patterns (e.g. 'Jun', '2024', ISO dates):")
print("=" * 60)
# common formats: "June 5, 2024", "2024-06-05", "06/05/2024"
patterns = [
    r"[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}",      # June 5, 2024
    r"\d{4}-\d{2}-\d{2}T[\d:.]+Z",               # ISO timestamp
    r"\d{1,2}/\d{1,2}/\d{4}",                    # 06/05/2024
]
for pat in patterns:
    matches = re.findall(pat, html)
    if matches:
        print(f"  Pattern {pat!r}: {matches[:5]}")

print()
print("=" * 60)
print("3) Elements near the <h1> (siblings/parents) — likely where date/body live:")
print("=" * 60)
h1 = soup.find("h1")
if h1:
    parent = h1.parent
    for depth in range(4):
        if parent is None:
            break
        print(f"  --- ancestor depth {depth}: <{parent.name} class={parent.get('class')}> ---")
        text_preview = parent.get_text(" ", strip=True)[:200]
        print(f"      text preview: {text_preview!r}")
        parent = parent.parent

print()
print("=" * 60)
print("4) Largest text-containing divs (by text length) — likely the real article body:")
print("=" * 60)
divs = soup.find_all("div")
scored = []
for d in divs:
    text = d.get_text(" ", strip=True)
    # avoid double-counting nested divs by checking direct text contribution roughly
    scored.append((len(text), d))
scored.sort(key=lambda x: x[0], reverse=True)
for length, d in scored[:5]:
    classes = d.get("class")
    print(f"  len={length:<6} class={classes} preview={d.get_text(' ', strip=True)[:150]!r}")

print()
print("=" * 60)
print("5) Script tags containing JSON data (Next.js __NEXT_DATA__ or similar):")
print("=" * 60)
for script in soup.find_all("script"):
    sid = script.get("id", "")
    if sid or (script.string and len(script.string) > 500):
        preview = (script.string or "")[:150]
        print(f"  id={sid!r} len={len(script.string or '')} preview={preview!r}")