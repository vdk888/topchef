import os
from sqlalchemy import create_engine, Column, Integer, String, Text, JSON
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
from contextlib import contextmanager

from config import DATABASE_URL

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
    """Creates the 'chefs' table in the database if it doesn't exist."""
    try:
        print("Checking if 'chefs' table exists and creating if necessary...")
        Base.metadata.create_all(bind=engine)
        print("'chefs' table check complete.")
        # Add sample data if the table is newly created and empty
        with get_db() as db:
            if db.query(Chef).count() == 0:
                print("Table is empty. Adding initial sample data...")
                sample_data = [
                    Chef(name="Jean Dupont", bio="Specializes in classic French cuisine.", image_url="", status="Candidate", perplexity_data={}),
                    Chef(name="Marie Dubois", bio="Winner of Top Chef Season 2", image_url="", status="Winner", perplexity_data={}),
                    Chef(name="Pierre Martin", bio="Known for modern techniques", image_url="", status="Finalist", perplexity_data={})
                ]
                db.add_all(sample_data)
                db.commit()
                print("Sample data added.")
    except Exception as e:
        print(f"CRITICAL: Failed to create or check table: {e}")
        # This is a critical error, might prevent the app from starting
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


# --- Initial Setup ---
# Call this once when the application starts to ensure the table exists
# In a Flask app, this is often done before the first request or at startup.
# For simplicity, we can call it here, but be mindful of multiple processes.
# A better approach might be a separate migration script or startup hook.
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
