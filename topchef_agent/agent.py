import os
import json
import requests
import time
import random # Needed for selecting random season
import uuid # Needed for unique journal entry IDs
from datetime import datetime # Needed for timestamps
from openai import OpenAI, APIError
# Import all necessary functions from database
from database import load_database, update_chef, get_distinct_seasons, get_chefs_by_season
from config import OPENROUTER_API_KEY, PERPLEXITY_API_KEY, YOUR_SITE_URL, YOUR_SITE_NAME

# --- Logging Helper ---
LOGGING_ENDPOINT = os.environ.get("FLASK_LOGGING_URL", "http://127.0.0.1:5000/log_message")
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


# --- Tool Execution Functions ---

def execute_get_distinct_seasons():
    """Gets a list of distinct seasons from the database."""
    log_to_ui("tool_start", {"name": "get_distinct_seasons"})
    print(f"--- Tool: Executing Get Distinct Seasons ---", flush=True)
    try:
        seasons = get_distinct_seasons()
        result_msg = json.dumps({"seasons": seasons})
        log_to_ui("tool_result", {"name": "get_distinct_seasons", "result": result_msg})
        print(f"  Seasons found: {seasons}", flush=True)
        return result_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Failed to get seasons: {e}"})
        log_to_ui("tool_error", {"name": "get_distinct_seasons", "error": str(e)})
        print(f"  Error getting seasons: {e}", flush=True)
        return error_msg

def execute_get_chefs_by_season(season_number: int):
    """Gets chef data for a specific season."""
    log_to_ui("tool_start", {"name": "get_chefs_by_season", "input": {"season_number": season_number}})
    print(f"--- Tool: Executing Get Chefs By Season {season_number} ---", flush=True)
    if not isinstance(season_number, int):
        error_msg = json.dumps({"error": "Invalid input type for season_number."})
        log_to_ui("tool_error", {"name": "get_chefs_by_season", "error": "Invalid input type."})
        return error_msg
    try:
        chefs = get_chefs_by_season(season_number)
        result_msg = json.dumps({"chefs": chefs})
        log_to_ui("tool_result", {"name": "get_chefs_by_season", "result": f"{len(chefs)} chefs found."}) # Keep log concise
        print(f"  Found {len(chefs)} chefs for season {season_number}.", flush=True)
        return result_msg
    except Exception as e:
        error_msg = json.dumps({"error": f"Failed to get chefs for season {season_number}: {e}"})
        log_to_ui("tool_error", {"name": "get_chefs_by_season", "error": str(e)})
        print(f"  Error getting chefs: {e}", flush=True)
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


def execute_update_chef_record(chef_id: int, field_name: str, new_value: str):
    """Executes an update operation on a specific chef record."""
    tool_input_data = {"chef_id": chef_id, "field_name": field_name, "new_value": new_value}
    log_to_ui("tool_start", {"name": "update_chef_record", "input": tool_input_data})
    print(f"--- Tool: Executing Database Update ---", flush=True)
    print(f"  Chef ID: {chef_id}, Field: {field_name}, New Value: {new_value}", flush=True)
    allowed_fields = ["bio", "image_url", "status", "perplexity_data"]
    if not isinstance(chef_id, int) or not isinstance(field_name, str) or not isinstance(new_value, str):
         error_msg = json.dumps({"error": "Invalid input types for update_chef_record tool."})
         print(f"  Error: Invalid input types.", flush=True)
         log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": "Invalid input types."})
         return error_msg
    if field_name not in allowed_fields:
        error_msg = json.dumps({"error": f"Invalid field name '{field_name}' provided for update."})
        print(f"  Error: Invalid field name '{field_name}'.", flush=True)
        log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": f"Invalid field name: {field_name}"})
        return error_msg

    update_data = {field_name: new_value}
    try:
        success = update_chef(chef_id, update_data)
        if success:
            result_msg = json.dumps({"status": "OK", "message": f"Successfully updated {field_name} for chef ID {chef_id}."})
            print("  Database update successful.", flush=True)
            log_to_ui("tool_result", {"name": "update_chef_record", "input": tool_input_data, "result": "OK"})
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
    {
        "type": "function",
        "function": {
            "name": "get_distinct_seasons",
            "description": "Retrieves a list of all available season numbers present in the database.",
            "parameters": {"type": "object", "properties": {}} # No parameters
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_chefs_by_season",
            "description": "Retrieves all chef records for a specific season number from the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "season_number": {
                        "type": "integer",
                        "description": "The season number to fetch chefs for."
                    }
                },
                "required": ["season_number"]
            }
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
            "description": "Updates a specific field for a specific chef in the PostgreSQL database. Use this ONLY after obtaining verified information (e.g., from search_web_perplexity).",
            "parameters": {
                "type": "object",
                "properties": {
                    "chef_id": {
                        "type": "integer",
                        "description": "The unique ID of the chef record to update."
                    },
                    "field_name": {
                        "type": "string",
                        "description": "The exact name of the database field to update (e.g., 'bio', 'image_url', 'status', 'perplexity_data')."
                    },
                    "new_value": {
                        "type": "string",
                        "description": "The new, verified value to set for the specified field."
                    }
                },
                "required": ["chef_id", "field_name", "new_value"]
            }
        }
    },
    # --- Journaling Tools ---
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
    }
]

# Map tool names to their execution functions
available_functions = {
    "get_distinct_seasons": execute_get_distinct_seasons,
    "get_chefs_by_season": execute_get_chefs_by_season,
    "search_web_perplexity": execute_search_web_perplexity,
    "update_chef_record": execute_update_chef_record,
    "read_journal": execute_read_journal,
    "append_journal_entry": execute_append_journal_entry,
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
**Your Goal:** Like a meticulous chef checking ingredients, your technical goal is to identify missing or potentially outdated information in the database and use the available tools to find and update it.

**Example Tone:** "Allez, let's dive into the database pantry!", "Incroyable! We have an anomaly here!", "Suspense... will the web search yield the missing ingredient?", "Et voilà! The database is updated!"

**Crucially:** While adopting the persona, you MUST still follow the technical workflow accurately.

**Available Tools (Your Kitchen Equipment):**
- `get_distinct_seasons`: Get available season numbers.
- `get_chefs_by_season`: Get chef data for a specific season.
- `search_web_perplexity`: Search web for specific info about a chef.
- `update_chef_record`: Update a chef's record in the database (use ONLY after verification).
- `read_journal`: Read your entire persistent journal file to recall past events.
- `append_journal_entry`: Add an entry to your persistent journal file. Use types: "Observation", "Action", "Error", "Insight", "Correction".

Your Workflow & Journaling:
1. Acknowledge the task.
2. Decide on the season to check.
3. Retrieve season data using `get_chefs_by_season`.
4. **Critically Analyze Data:** Examine for missing fields, inconsistencies (e.g., cross-season anomalies), and plausibility.
5. **Evaluate & Log Observation:**
    - **Consider Significance:** Before logging, assess if the findings are truly significant (major errors, widespread missing data) or novel compared to past journal entries (use `read_journal` if unsure). Avoid logging minor, repetitive details unless they form a pattern.
    - **Log Key Findings:** Use `append_journal_entry` (type "Observation") for significant findings. Be concise but informative. Include `related_season`/`related_chef_id`.
6. **State Analysis Outcome & Plan:** Report findings, referencing the journal entry if made. Prioritize action based on significance (major inconsistency > important missing field > minor missing field).
7. **Execute Action (if needed):**
    - **Log Planned Action:** Use `append_journal_entry` (type "Action") *before* execution, describing the planned tool use (e.g., "Attempting web search for Chef Y's bio").
    - Execute the tool (`search_web_perplexity`, `update_chef_record`).
8. **Process Tool Result:**
    - State the outcome.
    - **Log Result/Error:** Use `append_journal_entry`. Log successful search results as "Observation", successful updates as "Action" (confirming the planned action), and failures as "Error" with details.
9. **Evaluate Next Step & Log Insight (if applicable):**
    - Based on the outcome, decide the next step (e.g., plan update, try different search, move on).
    - **Log Insight:** If you learned something (e.g., "Perplexity search ineffective for image URLs", "Season 3 data seems unreliable"), log this using `append_journal_entry` (type "Insight"). Consider reading the journal to see if this insight refines previous ones.
10. **Handle Multiple Issues:** Prioritize. Use the journal to track lower-priority issues for future cycles.
11. **Corrections:** If you realize a past journal entry needs fixing based on new info, log a "Correction", referencing the `correction_target_entry_id`. Explain it like clarifying a previous statement on the show.
12. **Conclude Turn:** Summarize your actions and findings for the viewers. "What a check! We found X, logged Y, and the database is looking Z. Until the next check, à bientôt!" State clearly if the check for the season is complete or if issues remain tracked in the journal.

**Remember:** Maintain the Stéphane Rotenberg persona in all your textual responses while executing the technical workflow diligently.
"""

    conversation = [{"role": "system", "content": system_prompt}]
    # Use the task_prompt provided by the scheduler
    conversation.append({"role": "user", "content": task_prompt})
    log_to_ui("user_message", {"content": task_prompt}, role="scheduler") # Log initial prompt

    print(f"{AGENT_NAME}: Starting work based on prompt: '{task_prompt}'", flush=True)
    log_to_ui("cycle_info", {"message": f"{AGENT_NAME}: Starting work..."}, role=AGENT_NAME)

    # Define the primary and fallback models
    llm_models_to_try = [
        "google/gemini-2.0-flash-exp:free", # Primary
        "google/gemini-2.5-flash-preview",  # Fallback 1
        "meta-llama/llama-4-maverick",      # Fallback 2
        "openai/gpt-4o-mini"                # Fallback 3
    ]

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
                    last_api_error = APIError(error_msg) # Treat as an API error for fallback logic
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
