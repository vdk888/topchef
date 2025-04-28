# inspect_db_schema.py
import os
import sys
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

# Ensure the project root is in the path if running from root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from .env file relative to this script
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    print("Warning: .env file not found in project root.", file=sys.stderr)

DATABASE_URL = os.getenv("DATABASE_URL")
TABLE_NAME = "chefs" # Assuming the table name is 'chefs'

if not DATABASE_URL:
    print("CRITICAL: DATABASE_URL is not set. Cannot connect to the database.", file=sys.stderr)
    sys.exit(1)

try:
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)

    if not inspector.has_table(TABLE_NAME):
        print(f"Error: Table '{TABLE_NAME}' does not exist in the database.", file=sys.stderr)
        sys.exit(1)

    columns = inspector.get_columns(TABLE_NAME)
    # Use a simple print format easily parsable
    print(f"Schema for table '{TABLE_NAME}':")
    for c in columns:
        print(f"  - Name: {c['name']}, Type: {str(c['type'])}, Nullable: {c['nullable']}, PrimaryKey: {c.get('primary_key', False)}")

except SQLAlchemyError as e:
    print(f"Database error occurred: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"An unexpected error occurred: {e}", file=sys.stderr)
    sys.exit(1)
