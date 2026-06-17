import os
import psycopg2
from dotenv import load_dotenv
load_dotenv()

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("DELETE FROM patches WHERE game = 'Destiny 2'")
print(f"Deleted {cur.rowcount} Destiny 2 patches")
conn.commit()
cur.close()
conn.close()
