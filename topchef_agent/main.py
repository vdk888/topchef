import os
import json
import time
import queue # For handling log messages between agent and SSE stream
import threading # To manage the queue safely
from flask import Flask, render_template, request, Response, jsonify
from markupsafe import escape # Import escape from markupsafe
from topchef_agent.database import load_database, get_chefs_by_season # No need for save_database here anymore
from topchef_agent.config import DATABASE_URL # Use database URL for validation maybe
import datetime
from topchef_agent.interactive_agent import get_interactive_agent
from topchef_agent.agent import read_journal_file, execute_read_journal # For retrieving agent activity
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

AGENT_NAME = os.getenv("AGENT_NAME", "StephAI Botenberg")

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("FLASK_SECRET_KEY", "default_secret_key") # Needed for session management
app.json.compact = False # Pretty print JSON responses

# --- Logging Queue Setup ---
log_queue = queue.Queue()
# Optional: Add a lock if queue access becomes complex, but Queue is thread-safe
# log_lock = threading.Lock()

# --- Database Update Queue Setup ---
db_update_queue = queue.Queue()

# --- Flask Routes ---

@app.route('/')
def index():
    """Displays the main page with the map and log viewer."""
    try:
        chefs_data = load_database()
        # Filter out chefs without valid coordinates for the map display itself,
        # but we'll pass all data for potential popups or future use.
        # Ensure latitude and longitude are floats if they exist
        valid_chefs_for_map = []
        for chef in chefs_data:
            try:
                lat = float(chef.get('latitude')) if chef.get('latitude') is not None else None
                lon = float(chef.get('longitude')) if chef.get('longitude') is not None else None
                if lat is not None and lon is not None:
                     # Basic validation for France coordinates
                     if 41.0 < lat < 51.5 and -5.5 < lon < 10.0:
                         chef['latitude'] = lat
                         chef['longitude'] = lon
                         valid_chefs_for_map.append(chef)
                     else:
                         print(f"Warning: Chef ID {chef.get('id')} has coordinates outside France: ({lat}, {lon}). Skipping for map marker.")
                # Keep the original chef data in chefs_data for potential full list display or other features
            except (ValueError, TypeError) as coord_err:
                 print(f"Warning: Invalid coordinate format for Chef ID {chef.get('id')}: {coord_err}. Skipping for map marker.")


        # Convert the list of chef dictionaries to a JSON string safely
        # Use json.dumps for proper JSON formatting, pass this to the template
        chefs_json = json.dumps(chefs_data, default=lambda o: o.isoformat() if isinstance(o, datetime.datetime) else str(o))

        # Pass the JSON string to the template
        return render_template('index.html', chefs_json=chefs_json, AGENT_NAME=AGENT_NAME)

    except Exception as e:
        print(f"Error in index route: {e}")
        import traceback
        traceback.print_exc()
        # Return a basic error page
        # Use escape to prevent potential XSS if error message contains HTML/JS
        return f"<html><body><h1>Top Chef Agent</h1><p>Error loading data: {escape(str(e))}</p><p><a href='/'>Retry</a></p></body></html>"

@app.route('/log_message', methods=['POST'])
def receive_log():
    """Receives log messages from the agent script."""
    try:
        log_entry = request.get_json()
        if not log_entry or 'type' not in log_entry or 'data' not in log_entry:
             return jsonify({"status": "error", "message": "Invalid log format"}), 400

        # Basic validation/sanitization could go here if needed
        # print(f"Received log: {log_entry['type']}") # Debug print
        log_queue.put(log_entry) # Put the log into the queue
        return jsonify({"status": "success"}), 200
    except Exception as e:
        print(f"Error receiving log message: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

def generate_log_stream():
    """Generator function for the SSE stream."""
    print("SSE client connected.")
    try:
        while True:
            # Wait for a message from the queue
            # Use a timeout to periodically check if the client is still connected
            # (Flask/Werkzeug might handle broken pipes, but this adds robustness)
            try:
                log_entry = log_queue.get(timeout=60) # Wait up to 60 seconds
                # Format as SSE message: data: <json_string>\n\n
                sse_data = f"data: {json.dumps(log_entry)}\n\n"
                yield sse_data
                log_queue.task_done() # Mark task as done after yielding
            except queue.Empty:
                # No message received in timeout period, send a comment to keep connection alive
                yield ": keepalive\n\n"
            except SystemExit:
                print("SystemExit caught in SSE generator loop, likely server shutdown. Breaking loop.")
                break # Exit the loop gracefully on shutdown signal
            except Exception as e:
                print(f"Error in SSE generator loop: {e}")
                # Optionally yield an error message to the client
                error_data = {"type": "stream_error", "data": {"error": str(e)}}
                yield f"data: {json.dumps(error_data)}\n\n"
                time.sleep(5) # Avoid tight loop on persistent error

    except GeneratorExit:
        print("SSE client disconnected.")
    finally:
         print("SSE stream generator finished.")


@app.route('/stream_logs')
def stream_logs():
    """Endpoint for Server-Sent Events (SSE) log stream."""
    # 'text/event-stream' mimetype is crucial for SSE
    return Response(generate_log_stream(), mimetype='text/event-stream')

# --- NEW Endpoint for Agent to Signal DB Updates ---
@app.route('/signal_db_update', methods=['POST'])
def signal_db_update():
    """Receives a signal from the agent that the database was updated."""
    # We don't strictly need data, just the signal, but can check for payload
    print("Received signal: Database updated.")
    db_update_queue.put({"event": "update"}) # Put a simple message on the queue
    return jsonify({"status": "success"}), 200

# --- NEW SSE Stream for Database Updates ---
def generate_db_update_stream():
    """Generator function for the database update SSE stream."""
    print("DB Update SSE client connected.")
    try:
        while True:
            # Wait for an update signal from the queue
            try:
                update_signal = db_update_queue.get(timeout=60) # Wait up to 60 seconds
                sse_data = f"data: {json.dumps(update_signal)}\n\n"
                yield sse_data
                db_update_queue.task_done()
            except queue.Empty:
                # Send a comment to keep connection alive if no update signal
                yield ": keepalive-db\n\n"
            except SystemExit:
                print("SystemExit caught in DB Update SSE generator loop. Breaking.")
                break
            except Exception as e:
                print(f"Error in DB Update SSE generator loop: {e}")
                error_data = {"type": "db_stream_error", "data": {"error": str(e)}}
                yield f"data: {json.dumps(error_data)}\n\n"
                time.sleep(5)
    except GeneratorExit:
        print("DB Update SSE client disconnected.")
    finally:
        print("DB Update SSE stream generator finished.")

@app.route('/stream_db_updates')
def stream_db_updates():
    """Endpoint for Server-Sent Events (SSE) database update stream."""
    return Response(generate_db_update_stream(), mimetype='text/event-stream')


# --- NEW API Endpoint for Chef Data ---
@app.route('/api/chefs')
def get_chefs_data():
    """Returns all chef data from the database as JSON, optionally filtered by season."""
    season = request.args.get('season', default=None, type=int)
    if season is not None:
        chefs_data = get_chefs_by_season(season)
    else:
        chefs_data = load_database()
    return jsonify(chefs_data)

@app.route('/interactive_chat', methods=['POST'])
def interactive_chat():
    """Endpoint for user to interact with StephAI Botenberg (interactive chat)."""
    try:
        data = request.get_json()
        user_message = data.get('message')
        session_id = request.cookies.get('session_id') or request.remote_addr or str(time.time())
        agent = get_interactive_agent(session_id)
        if agent.is_busy():
            return jsonify({"status": "busy", "message": "StephAI Botenberg is busy. Please wait."}), 429
        agent.ask(user_message)
        # Poll for response (short wait, frontend can poll if needed)
        for _ in range(20):
            response = agent.get_response(timeout=0.25)
            if response:
                return jsonify(response)
            time.sleep(0.05)
        return jsonify({"status": "processing"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# --- NEW API Endpoint for Agent Journal ---
@app.route('/api/agent/journal')
def get_agent_journal():
    """Returns the agent's journal entries as JSON, allowing users to see the agent's work history."""
    try:
        # Get journal entries directly from the file
        journal_entries = read_journal_file()
        
        # Handle the case where the journal file doesn't exist or is empty
        if journal_entries is None or (isinstance(journal_entries, list) and len(journal_entries) == 0):
            return jsonify([])  # Return empty array if no entries
        
        # Ensure we have a list
        if not isinstance(journal_entries, list):
            journal_entries = [journal_entries]
        
        # Optionally filter by entry type, chef ID, or season
        entry_type = request.args.get('type', default=None, type=str)
        chef_id = request.args.get('chef_id', default=None, type=int)
        season = request.args.get('season', default=None, type=int)
        limit = request.args.get('limit', default=100, type=int)  # Default to last 100 entries
        
        # Filter the journal entries based on query parameters
        filtered_entries = journal_entries
        
        if entry_type:
            filtered_entries = [entry for entry in filtered_entries 
                              if isinstance(entry, dict) and entry.get('type') == entry_type]
        
        if chef_id is not None:
            filtered_entries = [entry for entry in filtered_entries 
                              if isinstance(entry, dict) and entry.get('related_chef_id') == chef_id]
            
        if season is not None:
            filtered_entries = [entry for entry in filtered_entries 
                              if isinstance(entry, dict) and entry.get('related_season') == season]
        
        # Sort entries by timestamp (newest first) and limit the number
        try:
            filtered_entries = sorted(filtered_entries, 
                                    key=lambda x: x.get('timestamp', '') if isinstance(x, dict) else '', 
                                    reverse=True)[:limit]
        except Exception as sort_error:
            print(f"Error sorting journal entries: {sort_error}")
            return jsonify({"status": "error", "message": f"Error sorting entries: {str(sort_error)}"}), 500
        
        return jsonify(filtered_entries)
    except Exception as e:
        print(f"Error retrieving agent journal: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/agent/history')
def agent_history_page():
    """Displays a page showing the autonomous agent's work history."""
    try:
        # Get the agent's journal entries directly from the file
        # This avoids the extra JSON wrapping that execute_read_journal does
        journal_entries = read_journal_file()
        
        # Handle the case where the journal file doesn't exist or is empty
        if journal_entries is None or (isinstance(journal_entries, list) and len(journal_entries) == 0):
            # Create a placeholder entry for empty journals
            journal_entries = [{
                "entry_id": "placeholder",
                "timestamp": datetime.datetime.now().isoformat(),
                "type": "Info",
                "details": "No journal entries found. The autonomous agent may not have run yet or has not recorded any actions.",
                "related_season": None,
                "related_chef_id": None
            }]
        
        # Ensure journal_entries is a list
        if not isinstance(journal_entries, list):
            # If it's not a list, wrap in a list
            journal_entries = [journal_entries]
            
        # Sort entries by timestamp (newest first)
        try:
            journal_entries = sorted(journal_entries, 
                                   key=lambda x: x.get('timestamp', '') if isinstance(x, dict) else '', 
                                   reverse=True)
        except Exception as sort_error:
            print(f"Error sorting journal entries: {sort_error}")
            # Add an entry about the sorting error
            journal_entries.append({
                "entry_id": "error",
                "timestamp": datetime.datetime.now().isoformat(),
                "type": "Error",
                "details": f"Error sorting journal entries: {sort_error}",
                "related_season": None,
                "related_chef_id": None
            })
        
        # Convert the journal entries to a JSON string for the template
        journal_json = json.dumps(journal_entries, default=lambda o: o.isoformat() if isinstance(o, datetime.datetime) else str(o))
        
        # Render a template that displays the agent's history
        return render_template('agent_history.html', journal_json=journal_json)
    except Exception as e:
        print(f"Error in agent history page: {e}")
        import traceback
        traceback.print_exc()
        return f"<html><body><h1>Agent History</h1><p>Error loading data: {escape(str(e))}</p><p><a href='/'>Return to Home</a></p></body></html>"

# Removed the __main__ block. Gunicorn or Flask CLI will run the app object.
# Initial database check is handled when database.py is imported by agent/scheduler.
