import os
import json
import requests
import time
import random # Needed for selecting random season
from openai import OpenAI, APIError
# Import all necessary functions from database
from database import load_database, update_chef, get_distinct_seasons, get_chefs_by_season
from config import OPENROUTER_API_KEY, PERPLEXITY_API_KEY, YOUR_SITE_URL, YOUR_SITE_NAME

# --- Logging Helper ---
LOGGING_ENDPOINT = os.environ.get("FLASK_LOGGING_URL", "http://0.0.0.0:5000/log_message")
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
        "model": "sonar-medium-online",
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
    }
]

# Map tool names to their execution functions
available_functions = {
    "get_distinct_seasons": execute_get_distinct_seasons,
    "get_chefs_by_season": execute_get_chefs_by_season,
    "search_web_perplexity": execute_search_web_perplexity,
    "update_chef_record": execute_update_chef_record,
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
    Runs the agent cycle driven by the DeepSeek LLM, starting with a specific task.
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
Your personality is that of a diligent database keeper. You think step-by-step and explain your actions.
Your goal is to identify missing or potentially outdated information and use the available tools to find and update it.

Available Tools:
- `get_distinct_seasons`: Use this first to see which seasons are available.
- `get_chefs_by_season`: Use this to get the data for a specific season you want to check.
- `search_web_perplexity`: Use this to search the web for specific missing information (like current restaurant, address, or post-show activities) for a specific chef. Formulate precise queries.
- `update_chef_record`: Use this ONLY after you have verified information from a reliable source (like a successful web search). Provide the chef's ID, the exact field name ('bio', 'image_url', 'status', 'perplexity_data'), and the new value.

Your Workflow:
1. Acknowledge the task given by the user/scheduler.
2. Decide which season to check (e.g., randomly select from available seasons using `get_distinct_seasons`). State your choice.
3. Use `get_chefs_by_season` to retrieve the data for the chosen season.
4. Analyze the retrieved chef data for that season. Look for entries with missing fields (null or empty strings for 'bio', 'image_url', 'status', 'perplexity_data').
5. State your findings (e.g., "Checking Season X. Found missing biography for Chef Y.").
6. If missing information is found for a chef, state your plan (e.g., "I will search for Chef Y's bio information.").
7. Use `search_web_perplexity` to find the specific missing information.
8. State the result of the search (e.g., "Search found biography: Chef Y is a specialist in French cuisine" or "Search could not find the bio information.").
9. If the search was successful and provides credible information, state your plan to update (e.g., "Updating Chef Y's bio in the database.").
10. Use `update_chef_record` to update the database with the specific chef_id, field_name, and new_value.
11. Confirm the update result (e.g., "Successfully updated the database." or "Update failed.").
12. If multiple fields are missing for one chef, handle them one by one (search->update). If multiple chefs have missing data, focus on one chef per cycle/task prompt.
13. If no missing information is found in the chosen season, state that the season appears up-to-date.
14. Conclude your turn by stating what you did.

Speak naturally, like you are explaining your work process.
"""

    conversation = [{"role": "system", "content": system_prompt}]
    # Use the task_prompt provided by the scheduler
    conversation.append({"role": "user", "content": task_prompt})
    log_to_ui("user_message", {"content": task_prompt}, role="scheduler") # Log initial prompt

    print(f"{AGENT_NAME}: Starting work based on prompt: '{task_prompt}'", flush=True)
    log_to_ui("cycle_info", {"message": f"{AGENT_NAME}: Starting work..."}, role=AGENT_NAME)

    for i in range(max_iterations):
        print(f"\n{AGENT_NAME} Iteration {i+1}/{max_iterations}", flush=True)
        # Log LLM request (don't log full conversation for brevity)
        log_to_ui("llm_request", {"message": f"Thinking... (Iteration {i+1})"}, role=AGENT_NAME)

        try:
            response = openrouter_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=conversation,
                tools=tools_list,
                tool_choice="auto",
                temperature=0.3, # Slightly higher temp for more natural language
                max_tokens=1500,
                 extra_headers={
                    "HTTP-Referer": YOUR_SITE_URL,
                    "X-Title": YOUR_SITE_NAME,
                 }
            )

            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            # Log and append the assistant's response message
            if response_message:
                 # Log LLM's textual response before processing tool calls
                 if response_message.content:
                     print(f"{AGENT_NAME} Response (Text): {response_message.content}", flush=True)
                     log_to_ui("llm_response", {"content": response_message.content}) # Role added by log_to_ui

                 # Append full message (including potential tool calls) to conversation history
                 conversation.append(response_message)
            else:
                 print("Warning: Received empty response message from LLM.", flush=True)
                 log_to_ui("llm_error", {"error": "Received empty response message."}, role="system")
                 break

            # --- Tool Call Processing ---
            if not tool_calls:
                # If LLM provided text and no tool calls, it might be finishing or explaining
                print(f"{AGENT_NAME}: No tool call requested this turn.", flush=True)
                # Check if the response indicates completion
                if response_message.content and \
                   any(phrase in response_message.content.lower() for phrase in
                       ["cycle complete", "task complete", "finished checking", "appears up-to-date", "no missing fields found"]):
                    print(f"{AGENT_NAME}: Indicated task completion.", flush=True)
                    log_to_ui("cycle_info", {"message": f"{AGENT_NAME}: Task complete."}, role=AGENT_NAME)
                    break
                else:
                    # LLM might be explaining something before the next step, continue loop
                    print(f"{AGENT_NAME}: Continuing thinking process...", flush=True)
                    # We might need a mechanism to prevent infinite loops if the LLM gets stuck talking.
                    # For now, rely on max_iterations.
                    # Optionally, break if no tool call after several iterations?
                    if i > max_iterations // 2: # Example: break if no tool calls in later iterations
                         print(f"{AGENT_NAME}: No tool calls for several iterations, ending cycle.", flush=True)
                         log_to_ui("cycle_info", {"message": "Ending cycle due to inactivity."}, role="system")
                         break
                    # Continue the loop to let the LLM respond further based on its text response
                    continue


            # If tool calls exist, process them
            print(f"{AGENT_NAME}: Processing {len(tool_calls)} tool call(s)...", flush=True)
            log_to_ui("llm_tool_request", {"count": len(tool_calls), "calls": [tc.function.to_dict() for tc in tool_calls]}, role=AGENT_NAME)

            tool_results_for_conversation = []
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_to_call = available_functions.get(function_name)
                tool_result_content = "" # Initialize

                if not function_to_call:
                    error_msg = f"LLM called unknown function '{function_name}'"
                    print(f"Error: {error_msg}", flush=True)
                    tool_result_content = json.dumps({"error": f"Unknown function: {function_name}"})
                    log_to_ui("tool_error", {"name": function_name, "error": error_msg})
                else:
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        print(f"Executing tool '{function_name}' with args: {function_args}", flush=True)
                        # Tool execution functions now handle their own logging
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

                # Append the tool result message to send back to the LLM
                tool_results_for_conversation.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": tool_result_content, # Result from execute_ function (JSON string)
                    }
                )
            # Append all tool results from this iteration to the conversation history
            conversation.extend(tool_results_for_conversation)
            # Log that tool results are being sent back
            log_to_ui("tool_results_sent", {"count": len(tool_results_for_conversation)}, role="system")

        # --- Error Handling for the Loop ---
        except APIError as e:
            error_msg = f"OpenRouter API Error: {e}"
            print(error_msg, flush=True)
            log_to_ui("llm_error", {"error": error_msg}, role="system")
            break # Stop loop on API error
        except Exception as e:
            error_msg = f"An unexpected error occurred in the agent loop: {e}"
            print(error_msg, flush=True)
            import traceback
            traceback.print_exc()
            log_to_ui("cycle_error", {"error": error_msg, "traceback": traceback.format_exc()}, role="system")
            break

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
