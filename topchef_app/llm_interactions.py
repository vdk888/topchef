import requests
import os
from openai import OpenAI
from dotenv import load_dotenv
import logging
import json

load_dotenv()

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost") # Default if not set
OPENROUTER_SITE_NAME = os.getenv("OPENROUTER_SITE_NAME", "TopChefDB") # Default if not set

# Configure OpenRouter client
openrouter_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

# --- Deepseek (OpenRouter) Functions ---

def _call_deepseek(prompt, system_message="You are a helpful assistant."):
    """Helper function to call the Deepseek model via OpenRouter."""
    if not OPENROUTER_API_KEY:
        logging.error("OpenRouter API Key not found in environment variables.")
        return None
    try:
        completion = openrouter_client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": OPENROUTER_SITE_URL,
                "X-Title": OPENROUTER_SITE_NAME,
            },
            model="deepseek/deepseek-chat-v3-0324:free", # Using the general chat model
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ]
        )
        response_content = completion.choices[0].message.content
        logging.info(f"Deepseek response received for prompt: '{prompt[:50]}...'")
        return response_content
    except Exception as e:
        logging.error(f"Error calling Deepseek API: {e}")
        return None

def generate_perplexity_prompt(topic, fields_requested="all"):
    """Uses Deepseek to generate a precise prompt for Perplexity."""
    system_message = "You are an expert at crafting concise search prompts for AI assistants. Generate a prompt to find specific information about a Top Chef France candidate or season. Be specific about the information needed."
    if fields_requested == "major":
        prompt = f"Generate a Perplexity prompt to find the *current* restaurant name, restaurant address, and the Top Chef season number for the French Top Chef candidate: {topic}. Focus only on these major details."
    elif fields_requested == "minor":
         prompt = f"Generate a Perplexity prompt to find detailed minor information (like culinary style, career highlights, signature dish, etc.) for the French Top Chef candidate: {topic}. Assume major details like name and season are known."
    elif fields_requested == "season_candidates":
         prompt = f"Generate a Perplexity prompt to list all known candidates who participated in Top Chef France season {topic}."
    else: # Default to all fields
        prompt = f"Generate a Perplexity prompt to find comprehensive information (restaurant name, address, season, culinary style, career highlights, signature dish, etc.) for the French Top Chef candidate: {topic}."

    perplexity_prompt = _call_deepseek(prompt, system_message)
    if perplexity_prompt:
        # Basic cleaning, remove potential quotes Deepseek might add
        return perplexity_prompt.strip().strip('"')
    return f"Provide comprehensive information about Top Chef France candidate: {topic}" # Fallback prompt

def parse_perplexity_response(response_text, chef_name_or_season):
    """Uses Deepseek to parse the Perplexity response into structured JSON."""
    system_message = """You are an expert data extraction assistant. Parse the provided text, which is a response from an AI about a Top Chef France candidate or season, and extract the relevant information into a structured JSON format.

The JSON object should contain keys like:
- chef_name (string, required)
- restaurant_name (string, optional)
- restaurant_address (string, optional)
- top_chef_season (integer, optional)
- culinary_style (string, optional)
- career_highlights (string, optional)
- signature_dish (string, optional)
- candidates (list of strings, optional, only for season queries)

If the input text is about a specific chef, ensure 'chef_name' is present.
If the input text is about a season, populate the 'candidates' list with chef names found. Include the 'top_chef_season' number if found.
If a piece of information is not found in the text, omit the key from the JSON.
Output *only* the JSON object, nothing else."""

    prompt = f"Parse the following text about '{chef_name_or_season}' and extract the information into the specified JSON format:\n\n---\n{response_text}\n---"

    parsed_json_str = _call_deepseek(prompt, system_message)

    if not parsed_json_str:
        logging.error("Failed to get parsing result from Deepseek.")
        return None

    try:
        # Clean potential markdown code block fences
        if parsed_json_str.startswith("```json"):
            parsed_json_str = parsed_json_str[7:]
        if parsed_json_str.endswith("```"):
            parsed_json_str = parsed_json_str[:-3]
        parsed_json_str = parsed_json_str.strip()

        parsed_data = json.loads(parsed_json_str)
        logging.info(f"Successfully parsed Perplexity response for '{chef_name_or_season}'.")
        return parsed_data
    except json.JSONDecodeError as e:
        logging.error(f"Error decoding JSON from Deepseek response: {e}\nRaw response: {parsed_json_str}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error parsing Deepseek response: {e}")
        return None


# --- Perplexity Functions ---

def call_perplexity(prompt):
    """Calls the Perplexity API with the given prompt."""
    if not PERPLEXITY_API_KEY:
        logging.error("Perplexity API Key not found in environment variables.")
        return None

    url = "https://api.perplexity.ai/chat/completions"
    payload = {
        "model": "sonar", # Using a capable online model
        "messages": [
            {"role": "system", "content": "You are a helpful assistant providing information about Top Chef France candidates. Be precise and factual."},
            {"role": "user", "content": prompt}
        ],
        "stream": False
    }
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json"
    }
    # Add detailed logging for debugging
    logging.debug(f"Perplexity API request URL: {url}")
    logging.debug(f"Perplexity API request headers: {headers}")
    logging.debug(f"Perplexity API request payload: {payload}")
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        logging.debug(f"Perplexity API response status: {response.status_code}")
        logging.debug(f"Perplexity API response body: {response.text}")
        response.raise_for_status()
        response_data = response.json()
        content = response_data.get("choices", [{}])[0].get("message", {}).get("content", None)
        if content:
            logging.info(f"Perplexity response received for prompt: '{prompt[:50]}...'")
            return content
        else:
            logging.warning(f"Empty content received from Perplexity for prompt: '{prompt[:50]}...' Full response: {response_data}")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Error calling Perplexity API: {e}")
        logging.error(f"Perplexity API request payload: {payload}")
        logging.error(f"Perplexity API response (if any): {getattr(e.response, 'text', None)}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error during Perplexity call: {e}")
        return None

# --- Combined Workflow Function ---

def fetch_and_parse_candidate_info(topic, fields_requested="all"):
    """
    Fetches information about a candidate or season using Perplexity,
    prompt generated by Deepseek, and parses the response using Deepseek.
    'topic' can be a chef's name or a season number.
    'fields_requested' can be 'major', 'minor', 'season_candidates', or 'all'.
    """
    logging.info(f"Starting fetch and parse for topic: '{topic}', fields: {fields_requested}")

    # 1. Generate Perplexity Prompt using Deepseek
    perplexity_prompt = generate_perplexity_prompt(topic, fields_requested)
    if not perplexity_prompt:
        logging.error(f"Failed to generate Perplexity prompt for '{topic}'.")
        return None
    logging.info(f"Generated Perplexity prompt: {perplexity_prompt}")

    # 2. Call Perplexity
    perplexity_response = call_perplexity(perplexity_prompt)
    if not perplexity_response:
        logging.error(f"Failed to get response from Perplexity for '{topic}'.")
        return None
    logging.info(f"Received Perplexity response (length: {len(perplexity_response)}).")

    # 3. Parse Perplexity Response using Deepseek
    parsed_data = parse_perplexity_response(perplexity_response, topic)
    if not parsed_data:
        logging.error(f"Failed to parse Perplexity response for '{topic}'.")
        return None
    logging.info(f"Parsed data for '{topic}': {parsed_data}")

    # If querying for season candidates, return a list of candidate dicts
    if fields_requested == "season_candidates" and 'candidates' in parsed_data:
        season_num = int(topic) if str(topic).isdigit() else None
        candidate_list = []
        for name in parsed_data.get('candidates', []):
            candidate_list.append({'chef_name': name, 'top_chef_season': season_num})
        return candidate_list # Return list of basic candidate dicts

    # Ensure chef_name is present if it was the topic
    if fields_requested != "season_candidates" and 'chef_name' not in parsed_data:
         # Attempt to inject the original topic if it looks like a name
         if isinstance(topic, str) and not topic.isdigit():
             parsed_data['chef_name'] = topic
             logging.warning(f"Injected chef_name '{topic}' as it was missing from parsed data.")
         else:
             logging.warning(f"Chef name missing in parsed data for topic '{topic}'.")
             # Depending on strictness, you might return None here

    return parsed_data # Return single candidate data dict


if __name__ == "__main__":
    # Example Usage (requires API keys in .env)
    logging.basicConfig(level=logging.INFO)
    print("Testing LLM Interactions (ensure API keys are in .env)")

    # Test Case 1: Fetch major info for a known chef
    # chef_name = "Hélène Darroze"
    # print(f"\n--- Fetching MAJOR info for {chef_name} ---")
    # major_info = fetch_and_parse_candidate_info(chef_name, fields_requested="major")
    # print(json.dumps(major_info, indent=2))

    # Test Case 2: Fetch all info for a known chef
    # chef_name_all = "Philippe Etchebest"
    # print(f"\n--- Fetching ALL info for {chef_name_all} ---")
    # all_info = fetch_and_parse_candidate_info(chef_name_all, fields_requested="all")
    # print(json.dumps(all_info, indent=2))

    # Test Case 3: Fetch candidates for a season
    # season = 15
    # print(f"\n--- Fetching candidates for Season {season} ---")
    # season_candidates = fetch_and_parse_candidate_info(season, fields_requested="season_candidates")
    # print(json.dumps(season_candidates, indent=2))

    # Test Case 4: Generate a prompt only
    # topic = "Jean Imbert"
    # print(f"\n--- Generating prompt for {topic} (all fields) ---")
    # prompt_only = generate_perplexity_prompt(topic, "all")
    # print(prompt_only)

    pass # Add more specific tests if needed
