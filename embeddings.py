"""
embeddings.py — generates embeddings for all patches and stores them in Supabase
"""

import os
import json
import time
import psycopg2
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

def get_embedding(text):
    result = client.models.embed_content(
        model="models/gemini-embedding-2",
        contents=text
    )
    return result.embeddings[0].values

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
            time.sleep(0.5)
        except Exception as e:
            print(f"  ERROR {title}: {e}")

    cur.close()
    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()