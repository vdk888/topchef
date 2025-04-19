import os
from sqlalchemy import create_engine, Column, Integer, String, Text
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
    name = Column(String, index=True, nullable=False)
    restaurant_name = Column(String, nullable=True)
    address = Column(Text, nullable=True) # Use Text for potentially longer addresses
    season = Column(Integer, nullable=True) # Allow null if season is unknown
    status = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

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
                    Chef(name="Jean Dupont", restaurant_name="Le Petit Bistro", address="1 Rue de la Paix, Paris", season=1, status="Candidate", notes="Specializes in classic French cuisine."),
                    Chef(name="Marie Dubois", restaurant_name=None, address="Lyon", season=2, status="Winner", notes=""),
                    Chef(name="Pierre Martin", restaurant_name="La Belle Assiette", address=None, season=1, status="Finalist", notes="Known for modern techniques.")
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
            chefs = db.query(Chef).order_by(Chef.season, Chef.name).all()
            chefs_list = [chef.to_dict() for chef in chefs]
    except Exception as e:
        print(f"Error loading database: {e}")
        # Return empty list on error, allows UI to potentially still load
    return chefs_list

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
