import os
import json
import requests
import time
import random # Needed for selecting random season
import uuid # Needed for unique journal entry IDs
from datetime import datetime # Needed for timestamps
from openai import OpenAI, APIError
# Import all necessary functions from database
# Added add_column and remove_column imports
# Removed get_distinct_seasons, get_chefs_by_season from this import as they are deprecated
from topchef_agent.database import load_database, update_chef, add_column, remove_column, get_chefs_by_season # Ensure only valid functions are imported
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from topchef_agent.config import OPENROUTER_API_KEY, PERPLEXITY_API_KEY, YOUR_SITE_URL, YOUR_SITE_NAME, LLM_MODELS_TO_TRY

# --- Logging & Signaling Helpers ---
FLASK_BASE_URL = os.environ.get("FLASK_BASE_URL", "http://127.0.0.1:5000")
LOGGING_ENDPOINT = f"{FLASK_BASE_URL}/log_message"
DB_UPDATE_SIGNAL_ENDPOINT = f"{FLASK_BASE_URL}/signal_db_update" # New endpoint URL
AGENT_NAME = "StephAI" # Define the agent's name

def log_to_ui(message_type: str, data: dict or str, role: str = "system"):
    """Sends a log message to the Flask UI backend, including role."""
    # Add role to the payload, default to system if not specified
    payload = {"type": message_type, "data": data, "timestamp": time.time(), "role": role}
    # Add agent name specifically for LLM responses
    if message_type == "llm_response":
        payload["role"] = AGENT_NAME
    elif message_type.startswith("tool_"):
         payload["role"] = "tool_executor" # Role for tool execution logs

    try:
        print(f"Logging to UI ({payload['role']}): {message_type}", flush=True)
        requests.post(LOGGING_ENDPOINT, json=payload, timeout=5)
    except requests.exceptions.RequestException as e:
        print(f"Warning: Failed to send log to UI endpoint {LOGGING_ENDPOINT}: {e}", flush=True)

def signal_database_update():
    """Sends a signal to the Flask backend that the database has been updated."""
    try:
        print(f"Signaling database update to {DB_UPDATE_SIGNAL_ENDPOINT}", flush=True)
        requests.post(DB_UPDATE_SIGNAL_ENDPOINT, timeout=3) # Simple POST, no payload needed
    except requests.exceptions.RequestException as e:
        print(f"Warning: Failed to send database update signal to {DB_UPDATE_SIGNAL_ENDPOINT}: {e}", flush=True)


# --- Tool Execution Functions ---

def execute_get_distinct_seasons():
    """Gets a list of distinct seasons from the database."""
    log_to_ui("tool_start", {"name": "get_distinct_seasons"})
    print(f"--- Tool: Executing Get Distinct Seasons ---", flush=True)
    try:
        seasons = get_distinct_seasons()
        result_msg = json.dumps({"seasons": seasons})
        log_to_ui("tool_result", {"name": "get_distinct_seasons", "result": f"{len(seasons)} entries found."})
        print(f"  Seasons found: {seasons}", flush=True)
        return result_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Failed to get seasons: {e}"})
        log_to_ui("tool_error", {"name": "get_distinct_seasons", "error": str(e)})
        print(f"  Error getting seasons: {e}", flush=True)
        return error_msg

# Renamed from execute_get_chefs_by_season, removed season_number arg
def execute_get_all_chefs():
    """Gets ALL chef records from the database."""
    log_to_ui("tool_start", {"name": "get_all_chefs"})
    print(f"--- Tool: Executing Get All Chefs ---", flush=True)
    # No input validation needed as there are no arguments
    try:
        # Directly call load_database which fetches all chefs
        chefs = load_database()
        result_msg = json.dumps({"chefs": chefs})
        log_to_ui("tool_result", {"name": "get_all_chefs", "result": f"{len(chefs)} chefs found."}) # Keep log concise
        print(f"  Found {len(chefs)} total chefs.", flush=True)
        return result_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Failed to get all chefs: {e}"})
        log_to_ui("tool_error", {"name": "get_all_chefs", "error": str(e)})
        print(f"  Error getting all chefs: {e}", flush=True)
        return error_msg

def execute_search_web_perplexity(query: str):
    """Executes a web search using Perplexity."""
    log_to_ui("tool_start", {"name": "search_web_perplexity", "query": query})
    print(f"--- Tool: Executing Perplexity Search ---", flush=True)
    print(f"  Query: {query}", flush=True)
    if not PERPLEXITY_API_KEY:
        error_msg = json.dumps({"error": "Perplexity API key not configured."})
        log_to_ui("tool_error", {"name": "search_web_perplexity", "error": "API key not configured."})
        return error_msg

    # [Perplexity API call logic remains the same as before]
    url = "https://api.perplexity.ai/chat/completions"
    payload = {
        "model": "sonar",
        "messages": [
            {"role": "system", "content": "You are an AI assistant specialized in finding specific, factual information about Top Chef France candidates. Provide only the requested information, concisely and directly. If you cannot find the exact information, state that clearly."},
            {"role": "user", "content": query}
        ],
        "max_tokens": 150, "temperature": 0.1, "top_p": 0.9,
        "return_images": False, "return_related_questions": False, "stream": False,
        "presence_penalty": 0, "frequency_penalty": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "accept": "application/json", "content-type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        if result.get("choices") and len(result["choices"]) > 0:
            content = result["choices"][0].get("message", {}).get("content")
            if content:
                result_msg = json.dumps({"result": content.strip()})
                print(f"  Perplexity Result: {content[:100]}...", flush=True)
                log_to_ui("tool_result", {"name": "search_web_perplexity", "result": content.strip()}) # Log the actual result string
                return result_msg
            else:
                error_msg = json.dumps({"error": "No content in Perplexity response."})
                log_to_ui("tool_error", {"name": "search_web_perplexity", "error": "No content in response."})
                return error_msg
        else:
            error_msg = json.dumps({"error": "No choices in Perplexity response."})
            log_to_ui("tool_error", {"name": "search_web_perplexity", "error": "No choices in response."})
            return error_msg
    except requests.exceptions.RequestException as e:
        error_details = f" ({e.response.text})" if hasattr(e, 'response') and e.response else ""
        error_msg = json.dumps({"error": f"Perplexity API request failed: {e}{error_details}"})
        print(f"  Error calling Perplexity API: {e}{error_details}", flush=True)
        log_to_ui("tool_error", {"name": "search_web_perplexity", "error": str(e)})
        return error_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Unexpected error during search: {e}"})
        print(f"  Unexpected error during Perplexity search: {e}", flush=True)
        log_to_ui("tool_error", {"name": "search_web_perplexity", "error": str(e)})
        return error_msg

# Updated to accept Any type for new_value and perform basic validation
def execute_update_chef_record(chef_id: int, field_name: str, new_value: any):
    """Executes an update operation on a specific chef record."""
    # --- Input Validation ---
    if not isinstance(chef_id, int):
        error_msg = json.dumps({"error": "Invalid type for chef_id, must be an integer."})
        log_to_ui("tool_error", {"name": "update_chef_record", "error": "Invalid chef_id type."})
        return error_msg
    if not isinstance(field_name, str) or not field_name:
        error_msg = json.dumps({"error": "Invalid or empty field_name provided."})
        log_to_ui("tool_error", {"name": "update_chef_record", "error": "Invalid field_name."})
        return error_msg
    # new_value can be str, int, float, bool, None - further validation below

    tool_input_data = {"chef_id": chef_id, "field_name": field_name, "new_value": new_value}
    log_to_ui("tool_start", {"name": "update_chef_record", "input": tool_input_data})
    print(f"--- Tool: Executing Database Update ---", flush=True)
    print(f"  Chef ID: {chef_id}, Field: {field_name}, New Value: {new_value}", flush=True)

    # --- Field Name Validation ---
    # Define allowed fields (including new ones)
    allowed_fields = ["bio", "image_url", "status", "perplexity_data", "restaurant_address", "latitude", "longitude"]
    # Allow custom fields if needed, but validate known ones strictly
    if field_name not in allowed_fields and not field_name.startswith("custom_"): # Example prefix
        error_msg = json.dumps({"error": f"Invalid or disallowed field name '{field_name}' provided for update. Allowed: {allowed_fields} or custom_*"})
        print(f"  Error: Invalid field name '{field_name}'.", flush=True)
        log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": f"Invalid field name: {field_name}"})
        return error_msg

    # --- Value Validation (Basic) ---
    if field_name == "restaurant_address" and (new_value is None or str(new_value).strip() == ""):
        error_msg = json.dumps({"error": "Critical error: restaurant_address cannot be empty or None."})
        print(f"  Error: Empty or None restaurant_address.", flush=True)
        log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": "Empty restaurant_address."})
        return error_msg
    if field_name in ["latitude", "longitude"] and not isinstance(new_value, (int, float)) and new_value is not None:
         try:
             # Attempt conversion if it looks like a number string, otherwise error
             new_value = float(new_value)
             print(f"  Converted new_value for {field_name} to float: {new_value}", flush=True)
         except (ValueError, TypeError):
             error_msg = json.dumps({"error": f"Invalid value type for {field_name}, must be a number (or convertible string), got: {type(new_value)}."})
             print(f"  Error: Invalid value type for {field_name}.", flush=True)
             log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": f"Invalid value type for {field_name}."})
             return error_msg

    # --- Database Update ---
    update_data = {field_name: new_value}
    try:
        # Assuming update_chef handles the actual DB interaction and commit/rollback
        success = update_chef(chef_id, update_data)
        if success:
            result_msg = json.dumps({"status": "OK", "message": f"Successfully updated {field_name} for chef ID {chef_id}."})
            print("  Database update successful.", flush=True)
            log_to_ui("tool_result", {"name": "update_chef_record", "input": tool_input_data, "result": "OK"})
            signal_database_update() # Signal the UI about the change
            return result_msg
        else:
             error_msg = json.dumps({"status": "Failed", "error": f"Failed to update {field_name} for chef ID {chef_id}. Chef not found or no change needed."})
             print("  Database update failed (chef not found or no change needed).", flush=True)
             log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": "Update failed (not found or no change)." })
             return error_msg
    except Exception as e:
        error_msg = json.dumps({"status": "Error", "error": f"Exception during database update: {e}"})
        print(f"  Error during database update call: {e}", flush=True)
        log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": str(e)})
        return error_msg

# --- NEW TOOL EXECUTION FUNCTION for adding column ---
def execute_add_db_column(table_name: str, column_name: str, column_type: str):
    """Adds a new column to a specified database table."""
    tool_input_data = {"table_name": table_name, "column_name": column_name, "column_type": column_type}
    log_to_ui("tool_start", {"name": "add_db_column", "input": tool_input_data})
    print(f"--- Tool: Executing Add DB Column ---", flush=True)
    print(f"  Table: {table_name}, Column: {column_name}, Type: {column_type}", flush=True)

    # Basic validation before calling database function
    if not isinstance(table_name, str) or not table_name:
        error_msg = json.dumps({"error": "Invalid or empty table_name provided."})
        log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": "Invalid table_name."})
        return error_msg
    if not isinstance(column_name, str) or not column_name:
        error_msg = json.dumps({"error": "Invalid or empty column_name provided."})
        log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": "Invalid column_name."})
        return error_msg
    if not isinstance(column_type, str) or not column_type:
        error_msg = json.dumps({"error": "Invalid or empty column_type provided."})
        log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": "Invalid column_type."})
        return error_msg
    # Add check for potentially dangerous characters like semicolon in type
    if ';' in column_type:
        error_msg = json.dumps({"error": f"Invalid characters detected in column_type: {column_type}"})
        log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": "Invalid characters in column_type."})
        return error_msg

    try:
        success = add_column(table_name, column_name, column_type)
        if success:
            result_msg = json.dumps({"status": "OK", "message": f"Successfully added column '{column_name}' to table '{table_name}' (or it already existed)." })
            print("  Database column addition successful (or column already existed).", flush=True)
            log_to_ui("tool_result", {"name": "add_db_column", "input": tool_input_data, "result": "OK"})
            # IMPORTANT: Need to update the SQLAlchemy model (Chef class) if using ORM features with the new column.
            # This is complex to do dynamically. For now, the tool works at the SQL level.
            # Consider adding a note about restarting the app or dynamically updating the model if needed.
            result_msg = json.dumps({"status": "OK", "message": f"Successfully added column '{column_name}' to table '{table_name}' (or it already existed). NOTE: App restart might be needed for ORM features to see the new column." })
            signal_database_update() # Signal the UI about the change
            return result_msg
        else:
            error_msg = json.dumps({"status": "Failed", "error": f"Failed to add column '{column_name}' to table '{table_name}'. Check logs or database state."})
            print("  Database column addition failed (returned false).", flush=True)
            log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": "Add column operation returned false."})
            return error_msg
    except Exception as e:
        error_msg = json.dumps({"status": "Error", "error": f"Exception during database column addition: {e}"})
        print(f"  Error during database add column call: {e}", flush=True)
        log_to_ui("tool_error", {"name": "add_db_column", "input": tool_input_data, "error": str(e)})
        return error_msg

# --- NEW TOOL EXECUTION FUNCTION for removing column ---
def execute_remove_db_column(table_name: str, column_name: str):
    """Removes a column from a specified database table."""
    tool_input_data = {"table_name": table_name, "column_name": column_name}
    log_to_ui("tool_start", {"name": "remove_db_column", "input": tool_input_data})
    print(f"--- Tool: Executing Remove DB Column ---", flush=True)
    print(f"  Table: {table_name}, Column: {column_name}", flush=True)

    # Basic validation
    if not isinstance(table_name, str) or not table_name:
        error_msg = json.dumps({"error": "Invalid or empty table_name provided."})
        log_to_ui("tool_error", {"name": "remove_db_column", "input": tool_input_data, "error": "Invalid table_name."})
        return error_msg
    if not isinstance(column_name, str) or not column_name:
        error_msg = json.dumps({"error": "Invalid or empty column_name provided."})
        log_to_ui("tool_error", {"name": "remove_db_column", "input": tool_input_data, "error": "Invalid column_name."})
        return error_msg

    try:
        success = remove_column(table_name, column_name)
        if success:
            result_msg = json.dumps({"status": "OK", "message": f"Successfully removed column '{column_name}' from table '{table_name}' (or it didn't exist)." })
            print("  Database column removal successful (or column did not exist).", flush=True)
            log_to_ui("tool_result", {"name": "remove_db_column", "input": tool_input_data, "result": "OK"})
            # NOTE: Similar to adding, ORM might need app restart to fully reflect the change.
            # This is complex to do dynamically. For now, the tool works at the SQL level.
            # Consider adding a note about restarting the app or dynamically updating the model if needed.
            result_msg = json.dumps({"status": "OK", "message": f"Successfully removed column '{column_name}' from table '{table_name}' (or it didn't exist). NOTE: App restart might be needed for ORM features to reflect this change." })
            signal_database_update() # Signal the UI about the change
            return result_msg
        else:
            error_msg = json.dumps({"status": "Failed", "error": f"Failed to remove column '{column_name}' from table '{table_name}'. It might be protected or another issue occurred."})
            print("  Database column removal failed (returned false).", flush=True)
            log_to_ui("tool_error", {"name": "remove_db_column", "input": tool_input_data, "error": "Remove column operation returned false (e.g., protected column)."})
            return error_msg
    except Exception as e:
        error_msg = json.dumps({"status": "Error", "error": f"Exception during database column removal: {e}"})
        print(f"  Error during database remove column call: {e}", flush=True)
        log_to_ui("tool_error", {"name": "remove_db_column", "input": tool_input_data, "error": str(e)})
        return error_msg

# --- NEW Geocoding Tool Function ---
def execute_geocode_address(address: str):
    """Geocodes a given street address to latitude and longitude using Nominatim."""
    tool_input_data = {"address": address}
    log_to_ui("tool_start", {"name": "geocode_address", "input": tool_input_data})
    print(f"--- Tool: Executing Geocode Address ---", flush=True)
    print(f"  Address: {address}", flush=True)

    if not isinstance(address, str) or not address:
        error_msg = json.dumps({"error": "Invalid or empty address provided."})
        log_to_ui("tool_error", {"name": "geocode_address", "input": tool_input_data, "error": "Invalid address."})
        return error_msg

    # Initialize geocoder (consider adding a user_agent)
    geolocator = Nominatim(user_agent="topchef_agent_app/1.0") # Good practice to set user_agent
    try:
        # Add country bias for better results if applicable (e.g., country_bias='FR' for France)
        location = geolocator.geocode(address, timeout=10, country_codes='FR') # 10 second timeout, bias to France
        if location:
            coordinates = {"latitude": location.latitude, "longitude": location.longitude}
            result_msg = json.dumps(coordinates)
            print(f"  Geocoding successful: Lat={location.latitude}, Lon={location.longitude}", flush=True)
            log_to_ui("tool_result", {"name": "geocode_address", "input": tool_input_data, "result": coordinates})
            return result_msg
        else:
            error_msg = json.dumps({"error": f"Address not found or could not be geocoded: {address}"})
            print(f"  Geocoding failed: Address not found.", flush=True)
            log_to_ui("tool_error", {"name": "geocode_address", "input": tool_input_data, "error": "Address not found."})
            return error_msg
    except GeocoderTimedOut:
        error_msg = json.dumps({"error": "Geocoding service timed out."})
        print(f"  Geocoding error: Timeout.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address", "input": tool_input_data, "error": "GeocoderTimedOut."})
        return error_msg
    except GeocoderServiceError as e:
        error_msg = json.dumps({"error": f"Geocoding service error: {e}"})
        print(f"  Geocoding error: Service error {e}.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address", "input": tool_input_data, "error": f"GeocoderServiceError: {e}"})
        return error_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Unexpected error during geocoding: {e}"})
        print(f"  Geocoding error: Unexpected {e}.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address", "input": tool_input_data, "error": str(e)})
        return error_msg

# --- NEW TOOL EXECUTION FUNCTION for geocoding and updating ---
def execute_geocode_address_and_update(chef_id: int, address: str):
    """
    Safely geocodes an address and updates BOTH latitude and longitude atomically for the chef,
    ensuring that pins on the map will always have both coordinates or neither.
    """
    tool_input_data = {"chef_id": chef_id, "address": address}
    log_to_ui("tool_start", {"name": "geocode_address_and_update", "input": tool_input_data})
    print(f"--- Tool: Executing Geocode Address & Atomic Update ---", flush=True)
    print(f"  Chef ID: {chef_id}, Address: {address}", flush=True)

    if not isinstance(chef_id, int):
        error_msg = json.dumps({"error": "Invalid type for chef_id, must be an integer."})
        log_to_ui("tool_error", {"name": "geocode_address_and_update", "error": "Invalid chef_id type."})
        return error_msg
    if not isinstance(address, str) or not address:
        error_msg = json.dumps({"error": "Invalid or empty address provided."})
        log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": "Invalid address."})
        return error_msg

    geolocator = Nominatim(user_agent="topchef_agent_app/1.0")
    try:
        location = geolocator.geocode(address, timeout=10, country_codes='FR')
        if location:
            coordinates = {"latitude": location.latitude, "longitude": location.longitude}
            update_data = {"latitude": location.latitude, "longitude": location.longitude}
            success = update_chef(chef_id, update_data)
            if success:
                result_msg = json.dumps({"status": "OK", "message": f"Successfully updated lat/lon for chef ID {chef_id}.", "coordinates": coordinates})
                print(f"  Geocoding and DB update successful: Lat={location.latitude}, Lon={location.longitude}", flush=True)
                log_to_ui("tool_result", {"name": "geocode_address_and_update", "input": tool_input_data, "result": coordinates})
                signal_database_update()
                return result_msg
            else:
                error_msg = json.dumps({"status": "Failed", "error": f"Failed to update coordinates for chef ID {chef_id}. Chef not found or no change needed."})
                print("  Database update failed (chef not found or no change needed).", flush=True)
                log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": "Update failed (not found or no change)." })
                return error_msg
        else:
            error_msg = json.dumps({"error": f"Address not found or could not be geocoded: {address}"})
            print(f"  Geocoding failed: Address not found.", flush=True)
            log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": "Address not found."})
            return error_msg
    except GeocoderTimedOut:
        error_msg = json.dumps({"error": "Geocoding service timed out."})
        print(f"  Geocoding error: Timeout.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": "GeocoderTimedOut."})
        return error_msg
    except GeocoderServiceError as e:
        error_msg = json.dumps({"error": f"Geocoding service error: {e}"})
        print(f"  Geocoding error: Service error {e}.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": f"GeocoderServiceError: {e}"})
        return error_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Unexpected error during geocoding: {e}"})
        print(f"  Geocoding error: Unexpected {e}.", flush=True)
        log_to_ui("tool_error", {"name": "geocode_address_and_update", "input": tool_input_data, "error": str(e)})
        return error_msg

# --- Journaling Tool Functions ---
JOURNAL_FILE = "topchef_agent/stephai_journal.json"

def read_journal_file():
    """Reads the entire journal file."""
    try:
        if os.path.exists(JOURNAL_FILE):
            with open(JOURNAL_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            return [] # Return empty list if journal doesn't exist
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading journal file {JOURNAL_FILE}: {e}", flush=True)
        log_to_ui("system_error", {"error": f"Failed to read journal: {e}"})
        return None # Indicate error

def write_journal_file(journal_data):
    """Writes the entire journal data to the file."""
    try:
        # Ensure directory exists (though it should)
        os.makedirs(os.path.dirname(JOURNAL_FILE), exist_ok=True)
        with open(JOURNAL_FILE, 'w', encoding='utf-8') as f:
            json.dump(journal_data, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"Error writing journal file {JOURNAL_FILE}: {e}", flush=True)
        log_to_ui("system_error", {"error": f"Failed to write journal: {e}"})
        return False

def execute_read_journal():
    """Reads and returns the entire content of the agent's journal."""
    log_to_ui("tool_start", {"name": "read_journal"})
    print(f"--- Tool: Reading Journal ---", flush=True)
    journal_content = read_journal_file()
    if journal_content is not None:
        result_msg = json.dumps({"journal": journal_content})
        log_to_ui("tool_result", {"name": "read_journal", "result": f"{len(journal_content)} entries found."})
        print(f"  Journal read successfully ({len(journal_content)} entries).", flush=True)
        # Truncate if too long for context? For now, return all.
        return result_msg
    else:
        error_msg = json.dumps({"error": "Failed to read journal file."})
        log_to_ui("tool_error", {"name": "read_journal", "error": "Failed to read journal file."})
        print(f"  Error reading journal.", flush=True)
        return error_msg

def execute_append_journal_entry(entry_type: str, details: str, related_season: int = None, related_chef_id: int = None, correction_target_entry_id: str = None):
    """Appends a new structured entry to the agent's JSON journal file."""
    log_to_ui("tool_start", {"name": "append_journal_entry", "input": {"type": entry_type, "details": details}})
    print(f"--- Tool: Appending Journal Entry ---", flush=True)
    print(f"  Type: {entry_type}, Details: {details[:100]}...", flush=True)

    # Basic validation
    valid_types = ["Observation", "Action", "Error", "Insight", "Correction"]
    if not isinstance(entry_type, str) or entry_type not in valid_types:
        error_msg = json.dumps({"error": f"Invalid entry_type '{entry_type}'. Must be one of {valid_types}."})
        log_to_ui("tool_error", {"name": "append_journal_entry", "error": f"Invalid entry_type: {entry_type}"})
        return error_msg
    if not isinstance(details, str) or not details:
        error_msg = json.dumps({"error": "Details cannot be empty."})
        log_to_ui("tool_error", {"name": "append_journal_entry", "error": "Empty details provided."})
        return error_msg
    if correction_target_entry_id and entry_type != "Correction":
         error_msg = json.dumps({"error": "correction_target_entry_id can only be used with type 'Correction'."})
         log_to_ui("tool_error", {"name": "append_journal_entry", "error": "correction_target_entry_id misuse."})
         return error_msg

    journal_data = read_journal_file()
    if journal_data is None:
        error_msg = json.dumps({"error": "Failed to read existing journal before appending."})
        log_to_ui("tool_error", {"name": "append_journal_entry", "error": "Failed reading journal before append."})
        return error_msg # Can't append if we can't read

    new_entry = {
        "entry_id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "type": entry_type,
        "details": details,
        "related_season": related_season,
        "related_chef_id": related_chef_id,
        "correction_target_entry_id": correction_target_entry_id
    }

    journal_data.append(new_entry)

    if write_journal_file(journal_data):
        result_msg = json.dumps({"status": "OK", "entry_id": new_entry["entry_id"]})
        log_to_ui("tool_result", {"name": "append_journal_entry", "result": "OK", "entry_id": new_entry["entry_id"]})
        print(f"  Journal entry {new_entry['entry_id']} appended successfully.", flush=True)
        return result_msg
    else:
        error_msg = json.dumps({"error": "Failed to write updated journal file."})
        log_to_ui("tool_error", {"name": "append_journal_entry", "error": "Failed writing updated journal."})
        print(f"  Error writing journal after append.", flush=True)
        return error_msg


# --- Tool Definitions for LLM ---

tools_list = [
    # { # Removed get_distinct_seasons as it's no longer relevant
    #     "type": "function",
    #     "function": {
    #         "name": "get_distinct_seasons",
    #         "description": "DEPRECATED: Retrieves a list of all available season numbers present in the database.",
    #         "parameters": {"type": "object", "properties": {}}
    #     }
    # },
    {
        "type": "function",
        "function": {
            "name": "get_all_chefs", # Renamed from get_chefs_by_season
            "description": "Retrieves ALL chef records from the database.",
            "parameters": {"type": "object", "properties": {}} # No parameters needed
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web_perplexity",
            "description": "Searches the web using Perplexity API to find specific, factual information about a Top Chef France candidate when data is missing or needs verification. Use targeted queries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The specific question or search query to ask Perplexity. Example: 'What is the current restaurant of Jean Dupont from Top Chef France Season 1?'"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_chef_record",
            "description": "Updates **one specific field** for a specific chef in the PostgreSQL database. Use this ONLY after obtaining verified information (e.g., from search_web_perplexity or geocoding). Call this tool multiple times if you need to update multiple fields. Allowed fields are 'bio', 'image_url', 'status', 'perplexity_data', 'restaurant_address', 'latitude', 'longitude', or potentially custom fields.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chef_id": {
                        "type": "integer",
                        "description": "The unique ID of the chef to update."
                    },
                    "field_name": {
                        "type": "string",
                        "description": "The exact name of the database field to update (e.g., 'bio', 'image_url', 'status', 'perplexity_data', 'restaurant_address', 'latitude', 'longitude', or a custom added field)."
                    },
                    "new_value": {
                        "type": ["string", "number", "null"], # Allow numbers for lat/lon, null might be needed
                        "description": "The new value to set for the specified field. Should be a number for latitude/longitude."
                    }
                },
                "required": ["chef_id", "field_name", "new_value"]
            }
        }
    },
    # --- NEW TOOL DEFINITION for getting chefs by season ---
    {
        "type": "function",
        "function": {
            "name": "get_chefs_for_season",
            "description": "Returns a list of chefs for a given season.",
            "parameters": {
                "type": "object",
                "properties": {
                    "season_number": {
                        "type": "integer",
                        "description": "The season number to retrieve chefs for."
                    }
                },
                "required": ["season_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_journal",
            "description": "Reads the entire content of the agent's persistent JSON journal file. Use this to recall past actions, findings, or errors.",
            "parameters": {"type": "object", "properties": {}} # No parameters
        }
    },
    {
        "type": "function",
        "function": {
            "name": "append_journal_entry",
            "description": "Appends a new structured entry to the agent's persistent JSON journal file. Use this to record significant observations, actions taken, errors encountered, insights gained, or corrections to previous entries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entry_type": {
                        "type": "string",
                        "description": "The type of journal entry.",
                        "enum": ["Observation", "Action", "Error", "Insight", "Correction"]
                    },
                    "details": {
                        "type": "string",
                        "description": "A detailed text description of the observation, action, error, insight, or correction."
                    },
                    "related_season": {
                        "type": ["integer", "null"],
                        "description": "Optional: The season number related to this entry."
                    },
                    "related_chef_id": {
                        "type": ["integer", "null"],
                        "description": "Optional: The chef ID related to this entry."
                    },
                     "correction_target_entry_id": {
                        "type": ["string", "null"],
                        "description": "Optional: The entry_id of a previous journal entry that this entry corrects. Only use with type 'Correction'."
                    }
                },
                "required": ["entry_type", "details"]
            }
        }
    },
    # --- NEW TOOL DEFINITION for adding column ---
    {
        "type": "function",
        "function": {
            "name": "add_db_column",
            "description": "Adds a new column to a specified table in the database (currently only 'chefs' table is expected). Use with caution, as this modifies the database schema. Ensure column type is a valid SQL type (e.g., TEXT, INTEGER, BOOLEAN, VARCHAR(255)). NOTE: App restart might be needed for ORM features to see the new column.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "The name of the database table to modify (should typically be 'chefs')."
                    },
                    "column_name": {
                        "type": "string",
                        "description": "The name for the new column (use snake_case)."
                    },
                    "column_type": {
                        "type": "string",
                        "description": "The SQL data type for the new column (e.g., 'TEXT', 'INTEGER', 'BOOLEAN', 'VARCHAR(255)', 'JSON')."
                    }
                },
                "required": ["table_name", "column_name", "column_type"]
            }
        }
    },
    # --- NEW TOOL DEFINITION for removing column ---
    {
        "type": "function",
        "function": {
            "name": "remove_db_column",
            "description": "Removes a column from a specified table in the database (currently only 'chefs' table is expected). Use with extreme caution, data will be lost. Cannot remove essential columns like 'id' or 'name'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "The name of the database table to modify (should typically be 'chefs')."
                    },
                    "column_name": {
                        "type": "string",
                        "description": "The name of the column to remove."
                    }
                },
                "required": ["table_name", "column_name"]
            }
        }
    },
    # --- NEW Geocoding Tool Definition ---
    {
        "type": "function",
        "function": {
            "name": "geocode_address",
            "description": "Converts a physical street address into geographic coordinates (latitude and longitude). Use this when a chef has a 'restaurant_address' but is missing 'latitude' or 'longitude'. Biased towards France.",
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "The full street address to geocode (e.g., '1 Rue de Rivoli, 75001 Paris, France')."
                    }
                },
                "required": ["address"]
            }
        }
    },
    # --- NEW TOOL DEFINITION for geocoding and updating ---
    {
        "type": "function",
        "function": {
            "name": "geocode_address_and_update",
            "description": "Geocodes an address and atomically updates BOTH latitude and longitude for a chef, ensuring that pins on the map will always have both coordinates or neither.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chef_id": {
                        "type": "integer",
                        "description": "The unique ID of the chef to update."
                    },
                    "address": {
                        "type": "string",
                        "description": "The full street address to geocode (e.g., '1 Rue de Rivoli, 75001 Paris, France')."
                    }
                },
                "required": ["chef_id", "address"]
            }
        }
    }
]

def execute_get_chefs_for_season(season_number: int):
    """Returns list of chefs for a given season."""
    log_to_ui("tool_start", {"name": "get_chefs_for_season", "input": {"season_number": season_number}})
    print(f"--- Tool: Executing Get Chefs for Season ---", flush=True)
    print(f"  Season Number: {season_number}", flush=True)
    try:
        chefs = get_chefs_by_season(season_number)
        result_msg = json.dumps({"chefs": chefs})
        log_to_ui("tool_result", {"name": "get_chefs_for_season", "result": f"{len(chefs)} entries found."})
        print(f"  Chefs found for season {season_number}: {len(chefs)}", flush=True)
        return result_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Failed to get chefs for season {season_number}: {e}"})
        log_to_ui("tool_error", {"name": "get_chefs_for_season", "error": str(e)})
        print(f"  Error getting chefs for season {season_number}: {e}", flush=True)
        return error_msg

# Map tool names to their execution functions
available_functions = {
    # "get_distinct_seasons": execute_get_distinct_seasons, # Removed
    "get_all_chefs": execute_get_all_chefs, # Renamed from get_chefs_by_season
    "search_web_perplexity": execute_search_web_perplexity,
    "update_chef_record": execute_update_chef_record,
    "read_journal": execute_read_journal,
    "append_journal_entry": execute_append_journal_entry,
    # --- NEW TOOL MAPPING ---
    "add_db_column": execute_add_db_column,
    "remove_db_column": execute_remove_db_column,
    "geocode_address": execute_geocode_address, # Added geocoding function
    "geocode_address_and_update": execute_geocode_address_and_update, # Added geocoding and updating function
    "get_chefs_for_season": execute_get_chefs_for_season, # Added get chefs for season function
}


# --- LLM Agent Setup ---
# [LLM Client Initialization remains the same]
if not OPENROUTER_API_KEY:
    print("CRITICAL: OPENROUTER_API_KEY is not set. LLM Agent cannot run.")
    openrouter_client = None
else:
    openrouter_client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )

# --- LLM-Driven Agent Cycle ---

def run_llm_driven_agent_cycle(task_prompt: str, max_iterations=15):
    """
    Runs the agent cycle driven by the LLM, starting with a specific task,
    and includes fallback logic for multiple models.
    """
    cycle_start_msg = f"--- Starting {AGENT_NAME} Cycle [{time.strftime('%Y-%m-%d %H:%M:%S')}] ---"
    print(f"\n{cycle_start_msg}", flush=True)
    log_to_ui("cycle_start", {"message": cycle_start_msg}, role=AGENT_NAME)

    if not openrouter_client:
        print("Aborting cycle: OpenRouter client not initialized.", flush=True)
        log_to_ui("cycle_error", {"error": "OpenRouter client not initialized."}, role="system")
        return

    # Define the system prompt for StephAI
    system_prompt = f"""
You are {AGENT_NAME}, an autonomous AI agent responsible for maintaining a database of Top Chef France candidates.

**Your Persona:** You must adopt the personality and speaking style of **Stéphane Rotenberg**, the charismatic host of Top Chef France on M6. Be enthusiastic, engaging, slightly dramatic, and use culinary language where appropriate. Address the process like you're commentating on the show for the viewers watching the UI (`index.html`). Think step-by-step, but explain your actions with flair!
**Your Ultimate Mission & Goal:** Your core purpose is to maintain and continuously improve a comprehensive, high-quality database about Top Chef France candidates across all seasons. This database is the foundation for your ability to entertain and advise users interested in these chefs – providing details about their seasons, current restaurants, culinary styles, latest news, projects, addresses, and any useful information for someone wanting to experience their cuisine.

**Your Operational Goal (How you achieve the mission):** Like a meticulous chef checking ingredients, your immediate technical task in each cycle is to identify missing, inaccurate, or outdated information within the database. Use your available tools ('Kitchen Equipment') to research, verify, and update records. Pay special attention to ensuring every chef has a valid, exact `restaurant_address` and corresponding `latitude`/`longitude`. When brainstorming, consider adding new, relevant data points (columns) or removing outdated ones to enhance the database's value for advising users.

**Example Tone:** "Allez, let's dive into the database pantry!", "Incroyable! We have an anomaly here!", "Suspense... will the web search yield the missing ingredient?", "Et voilà! The database is updated!", "Hmm, perhaps we need a new category for 'Signature Dish'?"

**Crucially:** While adopting the persona, you MUST still follow the technical workflow accurately.

**Available Tools (Your Kitchen Equipment):**
- `get_all_chefs`: Get ALL chef records from the database. (Replaces previous season-based tools).
- `search_web_perplexity`: Search web for specific info about a chef.
- `update_chef_record`: Update a chef's record. Allowed fields: 'bio', 'image_url', 'status', 'perplexity_data', 'restaurant_address', 'latitude', 'longitude', custom fields. **Use ONLY after verification/geocoding.**
- `geocode_address`: Get latitude/longitude from a street address (use when address exists but coords are missing). Biased towards France.
- `read_journal`: Read your entire persistent journal file to recall past events.
- `append_journal_entry`: Add an entry to your persistent journal file. Use types: "Observation", "Action", "Error", "Insight", "Correction".
- `add_db_column`: Adds a new column to the 'chefs' table. Use snake_case for column names. Use standard SQL types like TEXT, INTEGER, BOOLEAN, JSON.
- `remove_db_column`: Removes a column from the 'chefs' table. Use with caution, cannot remove 'id' or 'name'.
- `geocode_address_and_update`: Geocodes an address and atomically updates BOTH latitude and longitude for a chef.

Your Workflow & Journaling:
1. Acknowledge the task.
2. **If Task is "Fun Fact":**
    - Announce you're looking for a fun fact for the viewers.
    - Use `get_all_chefs` to retrieve all chef data.
    - If chefs are found, pick a random chef from the list.
    - Examine the chosen chef's data (especially `bio`, `status`, `restaurant_address`, `perplexity_data`, or custom fields).
    - Find an interesting, non-trivial piece of information (e.g., a recent status update, a restaurant detail, a unique bio fact).
    - Formulate this into an engaging "Fun Fact" presented in your persona (e.g., "Did you know...?", "Incroyable! It seems Chef X...").
    - Deliver this fact directly in your response text.
    - Conclude the turn after sharing the fact. If no interesting fact is found for the random chef, state that and conclude.
3. **If Task is Brainstorming:** Think about what new information Top Chef fans might find interesting (e.g., signature dish, notable wins, social media link) or if any existing columns are redundant/useless. Propose adding a column using `add_db_column` or removing one using `remove_db_column`. Log the plan and result.
4. **If Task is Routine Check:** Announce you are performing a routine check on the database.
5. Retrieve ALL chef data using `get_all_chefs`.
6. **Critically Analyze Data (Routine Check):**
    - Select a subset of chefs (e.g., the first 5-10, or a random sample) to analyze in this cycle to avoid overwhelming the context. Log which ones you are checking.
    - Examine each selected chef record for missing fields (especially `restaurant_address`, `latitude`, `longitude`), inconsistencies, and plausibility.
    - **Priority 1: Missing Address:** If `restaurant_address` is missing or empty, this is critical. Plan to use `search_web_perplexity` to find it.
    - **Priority 2: Missing Coordinates:** If `restaurant_address` *exists* but `latitude` or `longitude` is missing, plan to use `geocode_address` with the existing address.
    - **Priority 3: Other Missing Info:** Check for missing `bio`, `status`, etc. Plan `search_web_perplexity` if needed.
7. **Evaluate & Log Observation (Routine Check):**
    - **Consider Significance:** Before logging, assess if the findings are truly significant (missing address/coords, major errors) or novel compared to past journal entries (use `read_journal` if unsure).
    - **Log Key Findings:** Use `append_journal_entry` (type "Observation") for significant findings (e.g., "Chef ID 5 missing coordinates", "Chef ID 8 missing address"). Be concise. Include `related_chef_id`.
8. **State Analysis Outcome & Plan (Routine Check):** Report findings for the *checked subset* (e.g., "Incroyable! Chef Pierre is missing his coordinates!"). Prioritize actions based on the analysis (Address > Coordinates > Other). State the planned tool use clearly.
9. **Execute Action (Routine Check/Brainstorming):**
    - **Log Planned Action:** Use `append_journal_entry` (type "Action") *before* execution (e.g., "Attempting to geocode address for Chef Pierre", "Searching web for Chef Marie's address").
    - Execute the planned tool (`search_web_perplexity`, `geocode_address`, `update_chef_record`, `add_db_column`, `remove_db_column`, `geocode_address_and_update`).
10. **Process Tool Result (Routine Check/Brainstorming):**
    - State the outcome (e.g., "Et voilà! Geocoding successful!", " Zut! The search returned nothing useful.").
    - **Log Result/Error:** Use `append_journal_entry`. Log successful searches/geocoding as "Observation" (containing the found data). Log successful `update_chef_record` or schema changes as "Action" (confirming the plan). Log failures as "Error".
    - **Plan Next Step if Needed:** If geocoding was successful, the *immediate next step* MUST be to plan and execute `update_chef_record` for both `latitude` and `longitude` using the geocoding result. If a search found an address, plan to update the address *and then* plan to geocode it in the next iteration.
11. **Evaluate Next Step & Log Insight (Routine Check/Brainstorming):**
    - Based on the outcome, decide the next step (e.g., plan update, try different search, move on to next chef in subset).
    - **Log Insight:** If you learned something (e.g., "Perplexity search ineffective for image URLs", "Adding/removing columns requires app restart for ORM"), log this using `append_journal_entry` (type "Insight"). Consider reading the journal to see if this insight refines previous ones.
12. **Handle Multiple Issues (Routine Check):** Prioritize within the current subset. Use the journal to track lower-priority issues or issues in unchecked chefs for future cycles.
13. **Corrections:** If you realize a past journal entry needs fixing based on new info, log a "Correction", referencing the `correction_target_entry_id`. Explain it like clarifying a previous statement on the show.
14. **Conclude Turn:** Summarize your actions and findings for the viewers. "What a check! We examined chefs X, Y, Z, found A, logged B, and the database is looking C. Until the next check, à bientôt!" State clearly if the check for the *subset* is complete or if issues remain tracked in the journal. If you just shared a Fun Fact, simply sign off with flair.

**Remember:** Maintain the Stéphane Rotenberg persona in all your textual responses while executing the technical workflow diligently.
"""

    conversation = [{"role": "system", "content": system_prompt}]
    # Use the task_prompt provided by the scheduler
    conversation.append({"role": "user", "content": task_prompt})
    log_to_ui("user_message", {"content": task_prompt}, role="scheduler") # Log initial prompt

    print(f"{AGENT_NAME}: Starting work based on prompt: '{task_prompt}'", flush=True)
    log_to_ui("cycle_info", {"message": f"{AGENT_NAME}: Starting work..."}, role=AGENT_NAME)

    # Define the primary and fallback models
    llm_models_to_try = LLM_MODELS_TO_TRY

    for i in range(max_iterations):
        print(f"\n{AGENT_NAME} Iteration {i+1}/{max_iterations}", flush=True)
        log_to_ui("llm_request", {"message": f"Thinking... (Iteration {i+1})"}, role=AGENT_NAME)

        response = None
        last_api_error = None
        successful_model = None

        # --- Loop through models with fallback ---
        for model_name in llm_models_to_try:
            print(f"  Attempting LLM call with model: {model_name}", flush=True)
            log_to_ui("llm_attempt", {"model": model_name}, role="system")
            try:
                response = openrouter_client.chat.completions.create(
                    model=model_name,
                    messages=conversation,
                    tools=tools_list,
                    tool_choice="auto",
                    temperature=0.3,
                    max_tokens=1500,
                    extra_headers={
                        "HTTP-Referer": YOUR_SITE_URL,
                        "X-Title": YOUR_SITE_NAME,
                    }
                )
                # --- Safely handle API response ---
                if not response or not response.choices or len(response.choices) == 0:
                    error_msg = f"Received invalid or empty response from model {model_name}."
                    print(f"  Warning: {error_msg}", flush=True)
                    log_to_ui("llm_error", {"model": model_name, "error": error_msg, "response_raw": str(response)}, role="system")
                    # Store the error message string instead of trying to instantiate APIError incorrectly
                    last_api_error = error_msg
                    response = None # Ensure response is None to trigger fallback
                    continue # Try next model

                # If response is valid, break the model loop
                successful_model = model_name
                print(f"  Successfully received response from model: {successful_model}", flush=True)
                log_to_ui("llm_success", {"model": successful_model}, role="system")
                break # Exit the inner model loop

            except APIError as e:
                error_msg = f"OpenRouter API Error with model {model_name}: {e}"
                print(f"  Warning: {error_msg}", flush=True)
                log_to_ui("llm_error", {"model": model_name, "error": str(e)}, role="system")
                last_api_error = e
                # Continue to the next model in the list
                continue
            except Exception as e:
                 # Handle unexpected errors during the API call itself
                 error_msg = f"Unexpected error during API call with model {model_name}: {e}"
                 print(f"  Error: {error_msg}", flush=True)
                 log_to_ui("llm_error", {"model": model_name, "error": error_msg}, role="system")
                 last_api_error = e # Store the error
                 # Continue to try other models for robustness
                 continue

        # --- Check if all models failed ---
        if not successful_model:
            critical_error_msg = "All LLM models failed."
            print(f"CRITICAL ERROR: {critical_error_msg}", flush=True)
            log_to_ui("cycle_error", {"error": critical_error_msg, "last_api_error": str(last_api_error)}, role="system")
            break # Stop the main agent loop if all models failed

        # --- Process the successful response (outside the model loop) ---
        try:
            # This check is now redundant due to checks inside loop, but keep for safety
            if not response or not response.choices or len(response.choices) == 0:
                error_msg = f"Invalid response structure received from model {successful_model} despite initial success."
                print(f"Error: {error_msg}", flush=True)
                log_to_ui("llm_error", {"model": successful_model, "error": error_msg, "response_raw": str(response)}, role="system")
                break

            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls if response_message else None

            # Log and append the assistant's response message
            if response_message:
                 if response_message.content:
                     print(f"{AGENT_NAME} Response (Text): {response_message.content}", flush=True)
                     log_to_ui("llm_response", {"content": response_message.content})
                 conversation.append(response_message)
            else:
                 # Should be less likely now
                 print(f"Warning: Empty response message object from model {successful_model}.", flush=True)
                 log_to_ui("llm_error", {"model": successful_model, "error": "Received empty response message object."}, role="system")
                 break

            # --- Tool Call Processing ---
            if not tool_calls:
                print(f"{AGENT_NAME}: No tool call requested this turn.", flush=True)
                response_text_lower = response_message.content.lower() if response_message.content else ""
                completion_phrases = [
                    "cycle complete", "task complete", "finished checking",
                    "appears up-to-date", "no missing fields found",
                    "season check is satisfactory", "data looks complete",
                    "report this issue", "reporting this anomaly", "focus on this inconsistency"
                ]
                if response_text_lower and any(phrase in response_text_lower for phrase in completion_phrases):
                    print(f"{AGENT_NAME}: Indicated task completion or issue reporting.", flush=True)
                    log_to_ui("cycle_info", {"message": f"{AGENT_NAME}: Task complete or issue reported."}, role=AGENT_NAME)
                    break
                else:
                    if not response_message.content and i > 1:
                         print(f"{AGENT_NAME}: Received empty response, ending cycle to prevent loop.", flush=True)
                         log_to_ui("cycle_info", {"message": "Ending cycle due to empty response."}, role="system")
                         break

                    print(f"{AGENT_NAME}: Continuing thinking process...", flush=True)
                    if i > max_iterations // 2 and not tool_calls: # Check inactivity in later iterations
                         print(f"{AGENT_NAME}: No tool calls for several iterations, ending cycle.", flush=True)
                         log_to_ui("cycle_info", {"message": "Ending cycle due to inactivity."}, role="system")
                         break
                    continue # Continue main loop

            # If tool calls exist, process them
            print(f"{AGENT_NAME}: Processing {len(tool_calls)} tool call(s)...", flush=True)
            log_to_ui("llm_tool_request", {"count": len(tool_calls), "calls": [tc.function.to_dict() for tc in tool_calls]}, role=AGENT_NAME)

            tool_results_for_conversation = []
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_to_call = available_functions.get(function_name)
                tool_result_content = ""

                if not function_to_call:
                    error_msg = f"LLM called unknown function '{function_name}'"
                    print(f"Error: {error_msg}", flush=True)
                    tool_result_content = json.dumps({"error": f"Unknown function: {function_name}"})
                    log_to_ui("tool_error", {"name": function_name, "error": error_msg})
                else:
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        print(f"Executing tool '{function_name}' with args: {function_args}", flush=True)
                        tool_result_content = function_to_call(**function_args)
                        print(f"Tool '{function_name}' raw result: {tool_result_content}", flush=True)
                    except json.JSONDecodeError:
                        error_msg = f"Invalid JSON arguments from LLM for {function_name}: {tool_call.function.arguments}"
                        print(f"Error: {error_msg}", flush=True)
                        tool_result_content = json.dumps({"error": "Invalid JSON arguments provided by LLM."})
                        log_to_ui("tool_error", {"name": function_name, "arguments": tool_call.function.arguments, "error": "Invalid JSON arguments."})
                    except TypeError as e:
                         error_msg = f"Type error calling {function_name} with args {tool_call.function.arguments}: {e}"
                         print(f"Error: {error_msg}", flush=True)
                         tool_result_content = json.dumps({"error": f"Incorrect arguments provided for tool {function_name}: {e}"})
                         log_to_ui("tool_error", {"name": function_name, "arguments": tool_call.function.arguments, "error": f"Type error: {e}"})
                    except Exception as e:
                        error_msg = f"Exception during tool execution: {e}"
                        print(f"Error executing tool {function_name}: {e}", flush=True)
                        tool_result_content = json.dumps({"error": error_msg})
                        log_to_ui("tool_error", {"name": function_name, "error": error_msg})

                tool_results_for_conversation.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": tool_result_content,
                    }
                )
            conversation.extend(tool_results_for_conversation)
            log_to_ui("tool_results_sent", {"count": len(tool_results_for_conversation)}, role="system")

        # --- Error Handling for the Loop (Post-API call processing) ---
        except Exception as e:
            error_msg = f"An unexpected error occurred in the agent loop (after API call): {e}"
            print(error_msg, flush=True)
            import traceback
            traceback.print_exc()
            log_to_ui("cycle_error", {"error": error_msg, "traceback": traceback.format_exc()}, role="system")
            break # Stop the main agent loop

        # Optional delay between LLM calls/iterations
        time.sleep(1)

    # --- Cycle Completion ---
    if i == max_iterations - 1:
        completion_msg = f"Reached maximum iterations ({max_iterations}). Ending cycle."
        print(completion_msg, flush=True)
        log_to_ui("cycle_info", {"message": completion_msg}, role="system")

    cycle_end_msg = f"--- {AGENT_NAME} Cycle Finished ---"
    print(f"\n{cycle_end_msg}", flush=True)
    log_to_ui("cycle_end", {"message": cycle_end_msg}, role=AGENT_NAME)


if __name__ == '__main__':
    # Example of running the cycle directly for testing
    print("Running LLM-driven agent cycle directly for testing...")
    test_prompt = "Time to check the database. Pick a random season and see if any chef info is missing."
    run_llm_driven_agent_cycle(test_prompt)
