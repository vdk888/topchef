import os
import time # Import time for sleep
import datetime # Import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Float, text # Removed JSON
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError, OperationalError # Import OperationalError for retry
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
    restaurant_address = Column(Text, nullable=False) # Changed to nullable=False
    latitude = Column(Float, nullable=True) # NEW coordinate field
    longitude = Column(Float, nullable=True) # NEW coordinate field
    season = Column(Integer, nullable=True)  # Ensure season column exists
    current_restaurant = Column(Text, nullable=True) # NEW column
    season_number = Column(Integer, nullable=True) # NEW column
    signature_dish = Column(Text, nullable=True) # NEW column
    cool_anecdote = Column(Text, nullable=True) # NEW column

    def to_dict(self):
        """Converts the Chef object to a dictionary, handling potential missing columns."""
        data = {}
        for c in self.__table__.columns:
            # Check if the attribute exists on the instance before accessing
            # This helps if the DB schema is slightly ahead/behind the model definition during transitions
            if hasattr(self, c.name):
                value = getattr(self, c.name)
                # Convert datetime objects to ISO format string for JSON serialization
                if isinstance(value, datetime.datetime):
                    data[c.name] = value.isoformat()
                else:
                    data[c.name] = value
            else:
                data[c.name] = None # Or some other default value
        return data

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
# Helper to check if a column exists
def column_exists(engine, table_name, column_name):
    from sqlalchemy import inspect
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def create_table_if_not_exists(drop_first=False):
    """Creates the 'chefs' table. Optionally drops it first."""
    try:
        print("Checking if 'chefs' table exists and creating/updating if necessary...")
        if drop_first:
            print(f"Dropping table '{Chef.__tablename__}' before creation...")
            try:
                Base.metadata.drop_all(bind=engine, tables=[Chef.__table__])
                print(f"Table '{Chef.__tablename__}' dropped successfully.")
            except Exception as drop_err:
                print(f"Warning: Could not drop table '{Chef.__tablename__}' (might not exist): {drop_err}")

        # Create table based on the model
        Base.metadata.create_all(bind=engine)
        print(f"Table '{Chef.__tablename__}' created/ensured.")

        # Manually check and add columns if they don't exist (SQLAlchemy create_all might not add columns to existing tables)
        # This is a simple migration strategy; Alembic is recommended for complex changes.
        columns_to_ensure = [
            ("restaurant_address", "TEXT"),
            ("latitude", "FLOAT"),
            ("longitude", "FLOAT"),
            ("season", "INTEGER"),  # Ensure season column exists
            ("current_restaurant", "TEXT"),  # NEW column
            ("season_number", "INTEGER"),  # NEW column
            ("signature_dish", "TEXT"),  # NEW column
            ("cool_anecdote", "TEXT")  # NEW column
        ]
        with engine.connect() as connection:
            for col_name, col_type in columns_to_ensure:
                 if not column_exists(engine, Chef.__tablename__, col_name):
                     print(f"Column '{col_name}' missing, attempting to add...")
                     try:
                         # Use ALTER TABLE to add the column
                         # Making address nullable initially to avoid breaking existing data
                         null_constraint = "NULL" if col_name == "restaurant_address" else "NULL"
                         sql_command = text(f"ALTER TABLE {Chef.__tablename__} ADD COLUMN {col_name} {col_type} {null_constraint}")
                         with connection.begin():
                             connection.execute(sql_command)
                         print(f"Successfully added column '{col_name}'.")
                     except SQLAlchemyError as alter_err:
                         # Check if the error is because it *now* exists (race condition?) or other issue
                         if "already exists" in str(alter_err).lower():
                             print(f"Column '{col_name}' already exists (detected after check).")
                         else:
                             print(f"Error adding column '{col_name}': {alter_err}")
                             # Decide if this is critical; maybe raise error or just warn
                             # raise # Uncomment to make failure critical


        # Add sample data if the table is empty
        with get_db() as db:
            if db.query(Chef).count() == 0:
                print("Table is empty. Adding initial sample data...")
                sample_data = [
                    Chef(name="Marie Dubois", bio="Winner of Top Chef Season 2", image_url="", status="Winner", restaurant_address="1 Rue de Rivoli, 75001 Paris, France", latitude=48.8566, longitude=2.3522, season=2, current_restaurant="Le Rivoli", season_number=2, signature_dish="Duck L'Orange"), # Example coords, season
                    Chef(name="Pierre Martin", bio="Known for modern techniques", image_url="", status="Finalist", restaurant_address="10 Avenue des Champs-Élysées, 75008 Paris, France", latitude=48.8698, longitude=2.3070, season=1, current_restaurant="Le Champs", season_number=1, signature_dish="Foie Gras Torchon") # Example coords, season
                ]
                db.add_all(sample_data)
                db.commit()
                print("Sample data added.")
    except Exception as e:
        print(f"CRITICAL: Failed during table creation/update: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging
        # Decide whether to raise or allow the app to continue potentially broken
        # raise # Uncomment to make failure critical

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

def load_database(max_retries=2, delay=1):
    """Loads all chef records from the database with retry logic for connection errors."""
    chefs_list = []
    attempts = 0
    while attempts <= max_retries:
        attempts += 1
        try:
            with get_db() as db:
                chefs = db.query(Chef).order_by(Chef.name).all()
                chefs_list = [chef.to_dict() for chef in chefs]
                return chefs_list # Success, exit loop and return
        except OperationalError as e: # Catch specific connection errors
            print(f"Warning: Database operational error on attempt {attempts}/{max_retries+1}: {e}", flush=True)
            if attempts > max_retries:
                print("Error: Max retries reached for loading database.", flush=True)
                raise # Re-raise the exception after max retries
            print(f"Retrying in {delay} second(s)...", flush=True)
            time.sleep(delay)
        except Exception as e:
            print(f"Error loading database (non-retryable): {e}", flush=True)
            # Return empty list on other errors, allows UI to potentially still load
            return [] # Return empty list for non-connection errors

    # Should not be reached if successful, but return empty list as fallback
    return []

def get_chefs_by_season(season_number, max_retries=2, delay=1):
    """Loads all chef records for a given season from the database with retry logic for connection errors."""
    chefs_list = []
    attempts = 0
    while attempts <= max_retries:
        attempts += 1
        try:
            with get_db() as db:
                chefs = db.query(Chef).filter(Chef.season == season_number).order_by(Chef.name).all()
                chefs_list = [chef.to_dict() for chef in chefs]
                return chefs_list  # Success, exit loop and return
        except OperationalError as e:
            print(f"Warning: Database operational error on attempt {attempts}/{max_retries+1}: {e}", flush=True)
            if attempts > max_retries:
                print("Error: Max retries reached for loading chefs by season.", flush=True)
                raise
            print(f"Retrying in {delay} second(s)...", flush=True)
            time.sleep(delay)
        except Exception as e:
            print(f"Error loading chefs by season (non-retryable): {e}", flush=True)
            return []
    return []

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

# --- NEW FUNCTION TO ADD CHEF ---
def add_chef(name: str, season: int, bio: str = None, image_url: str = None, status: str = None, restaurant_address: str = None, latitude: float = None, longitude: float = None, max_retries=2, delay=1):
    """Adds a new chef record to the database with retry logic for connection errors.

    Args:
        name (str): The name of the chef (required).
        season (int): The season the chef participated in (required).
        bio (str, optional): Biography of the chef. Defaults to None.
        image_url (str, optional): URL to the chef's image. Defaults to None.
        status (str, optional): Status (e.g., Winner, Finalist). Defaults to None.
        restaurant_address (str, optional): Address of the chef's restaurant. Defaults to None.
        latitude (float, optional): Latitude coordinate. Defaults to None.
        longitude (float, optional): Longitude coordinate. Defaults to None.
        max_retries (int): Maximum number of retries for connection errors. Defaults to 2.
        delay (int): Delay in seconds between retries. Defaults to 1.

    Returns:
        int or None: The ID of the newly created chef, or None if creation failed.
    """
    attempts = 0
    last_exception = None
    while attempts <= max_retries:
        attempts += 1
        try:
            with get_db() as db:
                new_chef = Chef(
                    name=name,
                    season=season,
                    bio=bio,
                    image_url=image_url,
                    status=status,
                    restaurant_address=restaurant_address,
                    latitude=latitude,
                    longitude=longitude,
                    last_updated=datetime.datetime.now(datetime.timezone.utc).isoformat() # Use UTC time
                )
                db.add(new_chef)
                db.commit()
                db.refresh(new_chef) # To get the generated ID
                print(f"Successfully added chef '{name}' with ID {new_chef.id} to season {season}.", flush=True)
                return new_chef.id # Return the ID of the new chef
        except OperationalError as e:
            last_exception = e
            print(f"Warning: Database operational error on attempt {attempts}/{max_retries+1} while adding chef '{name}': {e}", flush=True)
            if attempts > max_retries:
                print(f"Error: Max retries reached for adding chef '{name}'.", flush=True)
                break # Exit loop after max retries
            print(f"Retrying in {delay} second(s)...", flush=True)
            time.sleep(delay)
        except Exception as e:
            last_exception = e
            print(f"Error adding chef '{name}' (non-retryable): {e}", flush=True)
            # Optional: Log traceback
            # import traceback
            # traceback.print_exc()
            break # Exit loop on non-retryable error

    # If loop finished without returning an ID, it failed.
    print(f"Failed to add chef '{name}'. Last error: {last_exception}", flush=True)
    return None

def update_chef(chef_id, update_data, max_retries=2, delay=1):
    """Updates an existing chef record with retry logic."""
    updated = False
    attempts = 0
    while attempts <= max_retries:
        attempts += 1
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
        except OperationalError as e:
            print(f"Warning: Database operational error on attempt {attempts}/{max_retries+1} while updating chef ID {chef_id}: {e}", flush=True)
            if attempts > max_retries:
                print(f"Error: Max retries reached for updating chef ID {chef_id}.", flush=True)
                break # Exit loop after max retries
            print(f"Retrying in {delay} second(s)...", flush=True)
            time.sleep(delay)
        except Exception as e:
            print(f"Error updating chef ID {chef_id} (non-retryable): {e}", flush=True)
            # Optional: Log traceback
            # import traceback
            # traceback.print_exc()
            break # Exit loop on non-retryable error

    # If loop finished without returning, it failed.
    print(f"Failed to update chef ID {chef_id}.", flush=True)
    return False

# --- Initial Setup ---
# Call this once when the application starts to ensure the table exists and has necessary columns.
# This might run multiple times if multiple processes import it (e.g., Flask dev server, scheduler)
# The function `create_table_if_not_exists` is designed to be mostly idempotent.
if __name__ == '__main__':
    print("Running database setup directly (dropping table first)...")
    create_table_if_not_exists(drop_first=True) # Drop the table on direct run
    print("\nLoading initial data:")
    initial_data = load_database()
    print(f"Loaded {len(initial_data)} records.")
    # print(initial_data) # Optionally print the data
else:
    # Ensure table exists and columns are checked when module is imported
    # Set drop_first=False (or omit) for regular imports to avoid data loss on every import
    create_table_if_not_exists(drop_first=False)
