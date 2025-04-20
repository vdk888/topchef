import os
from sqlalchemy.engine.url import make_url

# Load DATABASE_URL from environment
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "topchef_agent", ".env"))

db_url = os.getenv("DATABASE_URL")
print(f"DATABASE_URL from .env: {db_url}")

url = make_url(db_url)
if url.drivername == "sqlite":
    abs_path = os.path.abspath(url.database)
    print(f"Resolved SQLite DB absolute path: {abs_path}")
else:
    print("Not using SQLite.")
