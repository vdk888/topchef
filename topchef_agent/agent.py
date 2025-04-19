import os
import json
import os # Add os import
import json
import requests
import time
from openai import OpenAI, APIError
from database import load_database, update_chef
from config import OPENROUTER_API_KEY, PERPLEXITY_API_KEY, YOUR_SITE_URL, YOUR_SITE_NAME

# --- Logging Helper ---
# Assume Flask runs on localhost:5000 by default for logging
LOGGING_ENDPOINT = os.environ.get("FLASK_LOGGING_URL", "http://127.0.0.1:5000/log_message")

def log_to_ui(message_type: str, data: dict or str):
    """Sends a log message to the Flask UI backend."""
    payload = {"type": message_type, "data": data, "timestamp": time.time()}
    try:
        # Use a timeout to prevent blocking the agent for too long
        # Use flush=True on prints to ensure they appear promptly in logs
        print(f"Logging to UI: {message_type}", flush=True)
        requests.post(LOGGING_ENDPOINT, json=payload, timeout=2)
    except requests.exceptions.RequestException as e:
        # Don't crash the agent if UI logging fails, just print a warning
        print(f"Warning: Failed to send log to UI endpoint {LOGGING_ENDPOINT}: {e}", flush=True)


# --- Tool: Perplexity Search ---

def execute_search_web_perplexity(query: str):
    """
    Executes a web search using the Perplexity API.
    This is the function called when the LLM uses the 'search_web_perplexity' tool.
    Returns results as a JSON string.
    """
    log_to_ui("tool_start", {"name": "search_web_perplexity", "query": query})
    print(f"--- Tool: Executing Perplexity Search ---", flush=True)
    print(f"  Query: {query}", flush=True)
    if not PERPLEXITY_API_KEY:
        error_msg = json.dumps({"error": "Perplexity API key not configured."})
        log_to_ui("tool_error", {"name": "search_web_perplexity", "error": "API key not configured."})
        return error_msg

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
                log_to_ui("tool_result", {"name": "search_web_perplexity", "result": result_msg})
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

# --- Tool: Update Chef Record ---

def execute_update_chef_record(chef_id: int, field_name: str, new_value: str):
    """
    Executes an update operation on a specific chef record in the database.
    This is the function called when the LLM uses the 'update_chef_record' tool.
    Returns results as a JSON string.
    """
    tool_input_data = {"chef_id": chef_id, "field_name": field_name, "new_value": new_value}
    log_to_ui("tool_start", {"name": "update_chef_record", "input": tool_input_data})
    print(f"--- Tool: Executing Database Update ---", flush=True)
    print(f"  Chef ID: {chef_id}, Field: {field_name}, New Value: {new_value}", flush=True)
    # Basic type validation
    if not isinstance(chef_id, int) or not isinstance(field_name, str) or not isinstance(new_value, str):
         error_msg = json.dumps({"error": "Invalid input types for update_chef_record tool."})
         print(f"  Error: Invalid input types for update_chef_record tool.", flush=True)
         log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": "Invalid input types."})
         return error_msg
    # Add validation for allowed field names if needed
    allowed_fields = ["restaurant_name", "address", "notes", "status"] # Example
    if field_name not in allowed_fields:
        error_msg = json.dumps({"error": f"Invalid field name '{field_name}' provided for update."})
        print(f"  Error: Invalid field name '{field_name}' for update.", flush=True)
        log_to_ui("tool_error", {"name": "update_chef_record", "input": tool_input_data, "error": f"Invalid field name: {field_name}"})
        return error_msg


    update_data = {field_name: new_value}
    try:
        success = update_chef(chef_id, update_data)
        if success:
            result_msg = json.dumps({"status": "OK", "message": f"Successfully updated {field_name} for chef ID {chef_id}."})
            print("  Database update successful.", flush=True)
            log_to_ui("tool_result", {"name": "update_chef_record", "input": tool_input_data, "result": result_msg})
            return result_msg
        else:
             error_msg = json.dumps({"status": "Failed", "error": f"Failed to update {field_name} for chef ID {chef_id}. Chef not found or no change needed."})
             print("  Database update failed (chef not found or no change needed - see database logs).", flush=True)
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
                        "description": "The exact name of the database field to update (e.g., 'restaurant_name', 'address', 'notes', 'status')."
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
    "search_web_perplexity": execute_search_web_perplexity,
    "update_chef_record": execute_update_chef_record,
}

# --- LLM Agent Setup ---

if not OPENROUTER_API_KEY:
    print("CRITICAL: OPENROUTER_API_KEY is not set. LLM Agent cannot run.")
    # In a real app, might raise an exception or use a dummy client
    openrouter_client = None
else:
    openrouter_client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )

# --- LLM-Driven Agent Cycle ---

def run_llm_driven_agent_cycle(max_iterations=10):
    """
    Runs the agent cycle driven by the DeepSeek LLM.
    """
    cycle_start_msg = f"--- Running LLM-Driven Agent Cycle [{time.strftime('%Y-%m-%d %H:%M:%S')}] ---"
    print(f"\n{cycle_start_msg}", flush=True)
    log_to_ui("cycle_start", {"message": cycle_start_msg})

    if not openrouter_client:
        print("Aborting cycle: OpenRouter client not initialized (API key missing?).", flush=True)
        log_to_ui("cycle_error", {"error": "OpenRouter client not initialized."})
        return

    # 1. Load current database state
    try:
        chefs_data = load_database()
    except Exception as e:
        print(f"Failed to load database: {e}. Aborting cycle.", flush=True)
        log_to_ui("cycle_error", {"error": f"Failed to load database: {e}"})
        return

    if not chefs_data:
        print("Database is empty. Skipping cycle.", flush=True)
        log_to_ui("cycle_info", {"message": "Database is empty. Skipping cycle."})
        return
    # Limit summary size if DB is very large
    db_state_summary = json.dumps(chefs_data[:20], indent=2) # Summary of first 20 records
    if len(chefs_data) > 20:
        db_state_summary += f"\n... (and {len(chefs_data) - 20} more records)"

    # 2. Define the initial prompt and conversation
    system_prompt = f"""
You are an autonomous AI agent responsible for maintaining a database of Top Chef France candidates stored in a PostgreSQL database.
Your goal is to identify missing or potentially outdated information and use the available tools to find and update it.

Current Database State (Summary):
```json
{db_state_summary}
```

Available Tools:
- `search_web_perplexity`: Use this to search the web for specific missing information (like current restaurant, address, or post-show activities). Formulate precise queries.
- `update_chef_record`: Use this ONLY after you have verified information from a reliable source (like a successful web search). Provide the chef's ID, the exact field name (e.g., 'restaurant_name', 'address', 'notes', 'status'), and the new value.

Your Task:
1. Analyze the database state provided above.
2. Identify entries with missing fields (null or empty strings for 'restaurant_name', 'address', 'notes').
3. If missing information is found, use `search_web_perplexity` to find the specific information. Be targeted in your queries. Focus on one missing piece of information at a time.
4. If the search is successful and provides credible information, use `update_chef_record` to update the database.
5. If multiple pieces of information are missing, address them sequentially (search, then update if successful, then move to the next).
6. If no missing information is found in the analyzed records, state that the database appears up-to-date based on the current check.
7. Prioritize filling missing fields.
8. Respond with your analysis, the tool calls you intend to make, or a final status message.
"""

    conversation = [{"role": "system", "content": system_prompt}]
    initial_user_message = "Please review the database summary and update any missing information for one chef using the available tools. Start with the first chef found with missing data."
    conversation.append({"role": "user", "content": initial_user_message})
    log_to_ui("user_message", {"content": initial_user_message}) # Log initial prompt

    print("Starting LLM interaction loop...", flush=True)
    log_to_ui("cycle_info", {"message": "Starting LLM interaction loop..."})

    for i in range(max_iterations):
        print(f"\nIteration {i+1}/{max_iterations}", flush=True)
        log_to_ui("cycle_info", {"message": f"Starting Iteration {i+1}/{max_iterations}"})
        try:
            log_to_ui("llm_request", {"message": f"Sending request to LLM (Iteration {i+1})..."})
            response = openrouter_client.chat.completions.create(
                model="deepseek/deepseek-chat-v3-0324:free",
                messages=conversation,
                tools=tools_list,
                tool_choice="auto",
                temperature=0.2, # Slightly lower temp for more deterministic tool use
                max_tokens=1500, # Increased tokens for potentially complex responses/tool calls
                 extra_headers={
                    "HTTP-Referer": YOUR_SITE_URL,
                    "X-Title": YOUR_SITE_NAME,
                 }
            )

            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            # Append the assistant's response (text or tool calls) to conversation
            # Make sure response_message is not None before appending
            if response_message:
                 conversation.append(response_message)
            else:
                 print("Warning: Received empty response message from LLM.")
                 # Decide how to handle this - maybe break or retry? For now, break.
                 break

            if not tool_calls:
                llm_text_response = response_message.content
                print(f"LLM Response (Text): {llm_text_response}", flush=True)
                log_to_ui("llm_response", {"content": llm_text_response}) # Log LLM text response

                if llm_text_response and ("database appears up-to-date" in llm_text_response.lower() or \
                   "no missing information found" in llm_text_response.lower() or \
                   "cycle complete" in llm_text_response.lower() or \
                   "no further actions needed" in llm_text_response.lower()):
                    print("LLM indicated completion or no further action.", flush=True)
                    log_to_ui("cycle_info", {"message": "LLM indicated completion."})
                    break
                else:
                    print("No tool call requested by LLM. Ending cycle for this run.", flush=True)
                    log_to_ui("cycle_info", {"message": "No tool call requested. Ending cycle."})
                    break # Exit loop if LLM doesn't call a tool

            # Process tool calls
            print(f"LLM requested {len(tool_calls)} tool call(s)...", flush=True)
            log_to_ui("llm_tool_request", {"count": len(tool_calls), "calls": [tc.function.to_dict() for tc in tool_calls]}) # Log tool request details

            tool_results_for_conversation = [] # Collect results before appending
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_to_call = available_functions.get(function_name)

                if not function_to_call:
                    error_msg = f"LLM called unknown function '{function_name}'"
                    print(f"Error: {error_msg}", flush=True)
                    tool_result_content = json.dumps({"error": f"Unknown function: {function_name}"})
                    log_to_ui("tool_error", {"name": function_name, "error": error_msg}) # Log error
                else:
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        print(f"Executing tool '{function_name}' with args: {function_args}", flush=True)
                        # log_to_ui is called inside the execute_ functions now
                        tool_result_content = function_to_call(**function_args)
                        print(f"Tool '{function_name}' raw result: {tool_result_content}", flush=True)
                        # log_to_ui for result is called inside execute_ functions
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

                # Append the tool result for this specific call
                tool_results_for_conversation.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": tool_result_content, # Should be a JSON string
                    }
                )
            # Append all tool results from this iteration to the conversation
            conversation.extend(tool_results_for_conversation)
            # End of processing tool calls for this iteration

        except APIError as e:
            error_msg = f"OpenRouter API Error: {e}"
            print(error_msg, flush=True)
            log_to_ui("llm_error", {"error": error_msg})
            break
        except Exception as e:
            error_msg = f"An unexpected error occurred in the agent loop: {e}"
            print(error_msg, flush=True)
            import traceback
            traceback.print_exc()
            log_to_ui("cycle_error", {"error": error_msg, "traceback": traceback.format_exc()})
            break

        # Optional delay between LLM calls
        time.sleep(1)

    # Check if loop finished due to max_iterations
    # Check if loop finished due to max_iterations
    if i == max_iterations - 1:
        completion_msg = f"Reached maximum iterations ({max_iterations}). Ending cycle."
        print(completion_msg, flush=True)
        log_to_ui("cycle_info", {"message": completion_msg})

    cycle_end_msg = f"--- LLM-Driven Agent Cycle Finished ---"
    print(f"\n{cycle_end_msg}", flush=True)
    log_to_ui("cycle_end", {"message": cycle_end_msg})


if __name__ == '__main__':
    # Database setup (table creation, sample data) is handled in database.py when imported
    print("Running LLM-driven agent cycle directly for testing...")
    run_llm_driven_agent_cycle()
