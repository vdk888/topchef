import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import logging

load_dotenv() # Load environment variables from .env file

DATABASE_URL = os.getenv("DATABASE_URL")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_db_connection():
    """Establishes a connection to the database."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except psycopg2.OperationalError as e:
        logging.error(f"Database connection failed: {e}")
        return None

def initialize_database():
    """Creates the candidates table if it doesn't exist."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS candidates (
                    id SERIAL PRIMARY KEY,
                    chef_name VARCHAR(255) UNIQUE NOT NULL, -- Assuming chef name is unique identifier
                    restaurant_name VARCHAR(255),
                    restaurant_address TEXT,
                    top_chef_season INTEGER,
                    -- Minor fields (add more as needed)
                    culinary_style TEXT,
                    career_highlights TEXT,
                    signature_dish TEXT,
                    -- Metadata
                    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    major_fields_last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Add indexes for frequently queried columns
            cur.execute("CREATE INDEX IF NOT EXISTS idx_chef_name ON candidates (chef_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_top_chef_season ON candidates (top_chef_season);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_last_updated ON candidates (last_updated);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_major_fields_last_updated ON candidates (major_fields_last_updated);")

            conn.commit()
            logging.info("Database initialized successfully.")
    except psycopg2.Error as e:
        logging.error(f"Error initializing database: {e}")
        conn.rollback() # Rollback changes on error
    finally:
        if conn:
            conn.close()

def upsert_candidate(candidate_data):
    """Inserts a new candidate or updates an existing one based on chef_name."""
    conn = get_db_connection()
    if not conn:
        return False

    now = datetime.now(psycopg2.tz.FixedOffsetTimezone(offset=0, name=None)) # Use UTC for timestamps

    # Define major and minor fields based on the spec
    major_fields = ['restaurant_name', 'restaurant_address', 'top_chef_season']
    all_fields = ['chef_name', 'restaurant_name', 'restaurant_address', 'top_chef_season',
                  'culinary_style', 'career_highlights', 'signature_dish'] # Add all potential fields

    # Prepare data for insertion/update
    data_to_insert = {field: candidate_data.get(field) for field in all_fields if field in candidate_data}
    data_to_insert['last_updated'] = now

    # Check if any major field is being updated
    major_updated = any(field in data_to_insert for field in major_fields)
    if major_updated:
        data_to_insert['major_fields_last_updated'] = now

    # Build the UPSERT query dynamically
    columns = ', '.join(data_to_insert.keys())
    placeholders = ', '.join(['%s'] * len(data_to_insert))
    values = [data_to_insert[key] for key in data_to_insert.keys()]

    update_setters = []
    for key in data_to_insert.keys():
        if key != 'chef_name': # Don't update the unique key itself
             update_setters.append(f"{key} = EXCLUDED.{key}")
    update_clause = ', '.join(update_setters)

    sql = f"""
        INSERT INTO candidates ({columns})
        VALUES ({placeholders})
        ON CONFLICT (chef_name) DO UPDATE SET
            {update_clause};
    """

    try:
        with conn.cursor() as cur:
            cur.execute(sql, values)
            conn.commit()
            logging.info(f"Upserted candidate: {candidate_data.get('chef_name')}")
            return True
    except psycopg2.Error as e:
        logging.error(f"Error upserting candidate {candidate_data.get('chef_name')}: {e}")
        conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def get_candidates_needing_major_update(age_limit_months=3):
    """Finds candidates whose major fields haven't been updated recently."""
    conn = get_db_connection()
    if not conn:
        return []
    candidates = []
    try:
        with conn.cursor() as cur:
            three_months_ago = datetime.now(psycopg2.tz.FixedOffsetTimezone(offset=0, name=None)) - timedelta(days=age_limit_months * 30)
            cur.execute("""
                SELECT chef_name, top_chef_season
                FROM candidates
                WHERE major_fields_last_updated < %s OR major_fields_last_updated IS NULL;
            """, (three_months_ago,))
            candidates = cur.fetchall()
            logging.info(f"Found {len(candidates)} candidates needing major field updates.")
    except psycopg2.Error as e:
        logging.error(f"Error fetching candidates needing major update: {e}")
    finally:
        if conn:
            conn.close()
    # Return list of (chef_name, season) tuples
    return [(row[0], row[1]) for row in candidates]


def get_seasons_needing_candidates(min_candidates=15):
    """Finds seasons with fewer than the minimum required candidates."""
    conn = get_db_connection()
    if not conn:
        return []
    seasons = []
    try:
        with conn.cursor() as cur:
            # First, get all distinct seasons present in the DB
            cur.execute("SELECT DISTINCT top_chef_season FROM candidates WHERE top_chef_season IS NOT NULL ORDER BY top_chef_season;")
            all_seasons_in_db = [row[0] for row in cur.fetchall()]

            # Then, find seasons with counts below the threshold
            cur.execute("""
                SELECT top_chef_season, COUNT(*)
                FROM candidates
                WHERE top_chef_season IS NOT NULL
                GROUP BY top_chef_season
                HAVING COUNT(*) < %s;
            """, (min_candidates,))
            underrepresented_seasons = [row[0] for row in cur.fetchall()]

            # Determine the latest season known (assuming sequential seasons)
            latest_season = max(all_seasons_in_db) if all_seasons_in_db else 0
            # You might need a more robust way to know the *actual* latest season aired
            # For now, we'll just check up to the latest one found in the DB.

            # Check for missing seasons entirely (gaps)
            expected_seasons = set(range(1, latest_season + 1))
            missing_seasons = list(expected_seasons - set(all_seasons_in_db))

            seasons_to_check = sorted(list(set(underrepresented_seasons + missing_seasons)))

            logging.info(f"Seasons needing candidates (count < {min_candidates} or missing): {seasons_to_check}")
            return seasons_to_check
    except psycopg2.Error as e:
        logging.error(f"Error fetching seasons needing candidates: {e}")
    finally:
        if conn:
            conn.close()
    return seasons

def get_all_candidates():
    """Retrieves all candidates from the database."""
    conn = get_db_connection()
    if not conn:
        return []
    candidates = []
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT chef_name, restaurant_name, restaurant_address, top_chef_season,
                       culinary_style, career_highlights, signature_dish, last_updated
                FROM candidates
                ORDER BY top_chef_season DESC, chef_name ASC;
            """)
            # Fetch column names to create dicts
            colnames = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            candidates = [dict(zip(colnames, row)) for row in rows]
            logging.info(f"Fetched {len(candidates)} candidates from database.")
    except psycopg2.Error as e:
        logging.error(f"Error fetching all candidates: {e}")
    finally:
        if conn:
            conn.close()
    return candidates

if __name__ == "__main__":
    # Example usage: Initialize DB when script is run directly
    logging.info("Initializing database schema...")
    initialize_database()
    logging.info("Database schema initialization check complete.")

    # Example: Add a dummy candidate (replace with actual data flow later)
    # dummy_data = {
    #     "chef_name": "Test Chef",
    #     "restaurant_name": "Testaurant",
    #     "restaurant_address": "123 Test St",
    #     "top_chef_season": 1,
    #     "culinary_style": "Testing Cuisine",
    # }
    # upsert_candidate(dummy_data)

    # Example: Check for updates needed
    # print("Candidates needing major update:", get_candidates_needing_major_update())
    # print("Seasons needing candidates:", get_seasons_needing_candidates())
    # print("All candidates:", get_all_candidates())
