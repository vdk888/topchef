import os
from dotenv import load_dotenv

# Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    # If running directly inside topchef_agent, check parent dir for .env
    dotenv_path_parent = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(dotenv_path_parent):
        load_dotenv(dotenv_path_parent)
    else:
        print("Warning: .env file not found in project root or parent directory.")


# --- API Keys ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") # Needed for DeepSeek agent
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY") # Needed for search tool

# --- OpenRouter Settings ---
# Optional: Site URL/Name for OpenRouter ranking
YOUR_SITE_URL = os.getenv("YOUR_SITE_URL", "http://localhost:5000") # Default if not set
YOUR_SITE_NAME = os.getenv("YOUR_SITE_NAME", "TopChef Agent") # Default if not set

# --- Database ---
# DATABASE_FILE = os.getenv("DATABASE_FILE", "chefs.json") # No longer using JSON file
DATABASE_URL = os.getenv("DATABASE_URL") # Load PostgreSQL URL from environment

# --- Validation ---
# Add validation for OPENROUTER_API_KEY again
if not OPENROUTER_API_KEY:
    print("Warning: OPENROUTER_API_KEY is not set in the environment variables or .env file.")
if not PERPLEXITY_API_KEY:
    print("Warning: PERPLEXITY_API_KEY is not set in the environment variables or .env file.")
if not DATABASE_URL:
    print("CRITICAL: DATABASE_URL is not set in the environment variables or .env file. Application cannot connect to the database.")
