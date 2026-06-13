"""
embeddings.py — generates embeddings for all patches and stores them in Supabase
Run once to populate, then add to GitHub Actions workflow to keep updated.
"""

import os
import json
import time
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

def get_embedding(text):
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document"
    )
    return result["embedding"]

def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute("SELECT id, title, content FROM patches WHERE embedding IS NULL")
    rows = cur.fetchall()
    print(f"Generating embeddings for {len(rows)} patches...")

    for id, title, content in rows:
        try:
            text = f"{title}\n{content}"
            embedding = get_embedding(text[:8000])
            cur.execute(
                "UPDATE patches SET embedding = %s WHERE id = %s",
                (json.dumps(embedding), id)
            )
            conn.commit()
            print(f"  ✓ {title}")
            time.sleep(0.5)  # avoid rate limiting
        except Exception as e:
            print(f"  ERROR {title}: {e}")

    cur.close()
    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()