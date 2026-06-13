"""
database.py — loads all game patch JSON files into Supabase (PostgreSQL)

Run this once to set up the table and load data.
Re-run any time patches_*.json is updated — duplicates are skipped automatically.
"""

import json
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent

# Add new game JSON files here as you add more games
PATCH_FILES = [
    ROOT / "patches_valorant.json",
    # ROOT / "patches_lol.json",
]


def create_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS patches (
                id       SERIAL PRIMARY KEY,
                game     TEXT    NOT NULL,
                title    TEXT    NOT NULL,
                url      TEXT    NOT NULL UNIQUE,
                date     TEXT,
                content  TEXT,
                summary  JSONB,
                tags     JSONB
            )
        """)
    conn.commit()
    print("Table ready.")


def insert_patches(conn, patches):
    inserted = 0
    skipped = 0
    with conn.cursor() as cur:
        for patch in patches:
            try:
                cur.execute(
                    """
                    INSERT INTO patches (game, title, url, date, content, summary, tags)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    """,
                    (
                        patch.get("game", ""),
                        patch.get("title", ""),
                        patch.get("url", ""),
                        patch.get("date", ""),
                        patch.get("content", ""),
                        json.dumps(patch.get("summary", [])),
                        json.dumps(patch.get("tags", [])),
                    ),
                )
                if cur.rowcount == 1:
                    inserted += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f"  ERROR inserting {patch.get('title')}: {e}")
                skipped += 1
    conn.commit()
    return inserted, skipped


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    create_table(conn)

    total_inserted = 0
    total_skipped = 0

    for patch_file in PATCH_FILES:
        if not patch_file.exists():
            print(f"File not found, skipping: {patch_file.name}")
            continue

        patches = json.loads(patch_file.read_text(encoding="utf-8"))
        print(f"Loading {len(patches)} patches from {patch_file.name}...")
        inserted, skipped = insert_patches(conn, patches)
        print(f"  Inserted: {inserted}  Skipped (duplicates): {skipped}")
        total_inserted += inserted
        total_skipped += skipped

    conn.close()
    print(f"\nDone! Total inserted: {total_inserted}  Total skipped: {total_skipped}")


if __name__ == "__main__":
    main()