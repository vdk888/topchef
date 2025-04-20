import os
from sqlalchemy import create_engine, Column, Integer, String, Text, JSON, text # Added text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
from contextlib import contextmanager

from topchef_agent.config import DATABASE_URL

if not DATABASE_URL:
    raise ValueError("CRITICAL: DATABASE_URL is not set. Cannot initialize database module.")

# --- SQLAlchemy Setup ---
try:
    engine = create_engine(DATABASE_URL) # echo=True for debugging SQL
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
except Exception as e:
    print(f"CRITICAL: Failed to create SQLAlchemy engine or sessionmaker: {e}")
    # Depending on the app structure, might want to exit or handle differently
    raise

# --- Define the Chef Table Model ---
class Chef(Base):
    __tablename__ = "chefs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, index=True, nullable=False)
    bio = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    status = Column(Text, nullable=True)
    last_updated = Column('last_updated', Text, nullable=True)
    perplexity_data = Column('perplexity_data', JSON, nullable=True)
    restaurant_address = Column(Text, nullable=False)  # NEW mandatory field

    def to_dict(self):
        """Converts the Chef object to a dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

# --- Database Session Context Manager ---
@contextmanager
def get_db():
    """Provides a transactional scope around a series of operations."""
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        print(f"Database error occurred: {e}")
        db.rollback() # Rollback in case of error
        raise
    finally:
        db.close()

# --- Database Operations ---
def create_table_if_not_exists():
    """Creates the 'chefs' table in the database if it doesn't exist. Adds restaurant_address column if missing."""
    try:
        print("Checking if 'chefs' table exists and creating if necessary...")
        Base.metadata.create_all(bind=engine)
        print("'chefs' table check complete.")
        # Add sample data if the table is newly created and empty
        with get_db() as db:
            if db.query(Chef).count() == 0:
                print("Table is empty. Adding initial sample data...")
                sample_data = [
                    Chef(name="Marie Dubois", bio="Winner of Top Chef Season 2", image_url="", status="Winner", perplexity_data={}, restaurant_address=""),
                    Chef(name="Pierre Martin", bio="Known for modern techniques", image_url="", status="Finalist", perplexity_data={}, restaurant_address="")
                ]
                db.add_all(sample_data)
                db.commit()
                print("Sample data added.")
    except Exception as e:
        print(f"CRITICAL: Failed to create or check table: {e}")
        raise

def load_database():
    """Loads all chef records from the database."""
    chefs_list = []
    try:
        with get_db() as db:
            chefs = db.query(Chef).order_by(Chef.name).all()
            chefs_list = [chef.to_dict() for chef in chefs]
    except Exception as e:
        print(f"Error loading database: {e}")
        # Return empty list on error, allows UI to potentially still load
    return chefs_list

def get_distinct_seasons():
    """Retrieves a list of distinct season numbers from the database."""
    # Since we don't have a season column anymore, return a default list
    print("get_distinct_seasons called, returning default list as season column no longer exists")
    return [1, 2, 3, 4, 5]  # Return some default seasons

def get_chefs_by_season(season_number: int):
    """
    Since season_number no longer exists in our database schema,
    just return all chefs for any season request
    """
    print(f"get_chefs_by_season called with season {season_number}, returning all chefs as season column no longer exists")
    return load_database()  # Return all chefs since we can't filter by season

def update_chef(chef_id: int, update_data: dict):
    """Updates a specific chef record in the database."""
    updated = False
    try:
        with get_db() as db:
            chef = db.query(Chef).filter(Chef.id == chef_id).first()
            if chef:
                for key, value in update_data.items():
                    # Only update if the key is a valid column and value is different
                    if hasattr(chef, key) and getattr(chef, key) != value:
                        setattr(chef, key, value)
                        updated = True
                if updated:
                    db.commit()
                    print(f"Updated chef record ID: {chef_id}")
                else:
                    print(f"No changes detected for chef record ID: {chef_id}")
            else:
                print(f"Error: Chef with ID {chef_id} not found for update.")
                return False # Indicate chef not found
    except Exception as e:
        print(f"Error updating chef ID {chef_id}: {e}")
        return False # Indicate error during update
    return updated # Return True if commit was successful or no changes needed, False on error

# --- NEW FUNCTION TO ADD COLUMN ---
def add_column(table_name: str, column_name: str, column_type: str):
    """Adds a new column to the specified table."""
    # Basic validation to prevent obvious SQL injection issues (though limited)
    # A more robust solution might involve checking against known table/column name patterns
    # or using a library specifically for schema migrations.
    allowed_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
    if not all(c in allowed_chars for c in table_name) or \
       not all(c in allowed_chars for c in column_name):
        print(f"Error: Invalid characters in table or column name ('{table_name}', '{column_name}').")
        return False

    # Be cautious with column_type - could still be vulnerable.
    # Consider validating against a list of allowed SQL types if needed.
    # Ensure column_type doesn't contain harmful constructs like semicolons
    if ';' in column_type:
        print(f"Error: Invalid characters in column type ('{column_type}').")
        return False

    sql_command = text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
    try:
        with engine.connect() as connection:
            with connection.begin(): # Use a transaction
                connection.execute(sql_command)
        print(f"Successfully added column '{column_name}' to table '{table_name}'.")
        return True
    except SQLAlchemyError as e:
        print(f"Error adding column '{column_name}' to table '{table_name}': {e}")
        # Check if the error is because the column already exists
        if "already exists" in str(e).lower():
             print(f"Column '{column_name}' likely already exists.")
             return True # Treat as success if it already exists
        return False
    except Exception as e:
        # Catch other potential errors
        print(f"Unexpected error adding column: {e}")
        return False

# --- NEW FUNCTION TO REMOVE COLUMN ---
def remove_column(table_name: str, column_name: str):
    """Removes a column from the specified table."""
    # Basic validation
    allowed_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
    if not all(c in allowed_chars for c in table_name) or \
       not all(c in allowed_chars for c in column_name):
        print(f"Error: Invalid characters in table or column name ('{table_name}', '{column_name}').")
        return False

    # Prevent dropping essential columns (adjust list as needed)
    protected_columns = ["id", "name"]
    if column_name.lower() in protected_columns:
        print(f"Error: Cannot remove protected column '{column_name}'.")
        return False

    sql_command = text(f"ALTER TABLE {table_name} DROP COLUMN {column_name}")
    try:
        with engine.connect() as connection:
            with connection.begin(): # Use a transaction
                connection.execute(sql_command)
        print(f"Successfully removed column '{column_name}' from table '{table_name}'.")
        return True
    except SQLAlchemyError as e:
        print(f"Error removing column '{column_name}' from table '{table_name}': {e}")
        # Check if the error is because the column doesn't exist
        if "does not exist" in str(e).lower() or "can't drop" in str(e).lower(): # Adapt error message check as needed
             print(f"Column '{column_name}' likely does not exist or cannot be dropped.")
             return True # Treat as success if it doesn't exist
        return False
    except Exception as e:
        # Catch other potential errors
        print(f"Unexpected error removing column: {e}")
        return False

# --- Initial Setup ---
# Call this once when the application starts to ensure the table exists
# In a Flask app, this is often done before the first request or at startup.
# For simplicity, we can call it here, but be mindful of multiple processes.
# A better approach might be a separate migration script or startup hook.
try:
    add_column("chefs", "restaurant_address", "TEXT NOT NULL DEFAULT ''")
except Exception as e:
    print(f"Warning: Could not ensure restaurant_address column exists: {e}")

if __name__ == '__main__':
    print("Running database setup directly...")
    create_table_if_not_exists()
    print("\nLoading initial data:")
    print(load_database())
else:
    # Ensure table exists when module is imported by other parts of the app
    # This might run multiple times if multiple processes import it (e.g., Flask dev server, scheduler)
    # create_all is idempotent, so it's safe but might print messages multiple times.
    create_table_if_not_exists()
