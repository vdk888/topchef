import os
import json
import time
import queue # For handling log messages between agent and SSE stream
import threading # To manage the queue safely
from flask import Flask, render_template, request, Response, jsonify
from markupsafe import escape # Import escape from markupsafe
from topchef_agent.database import load_database # No need for save_database here anymore
from topchef_agent.config import DATABASE_URL # Use database URL for validation maybe
import datetime
from topchef_agent.interactive_agent import get_interactive_agent

app = Flask(__name__)

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
        return render_template('index.html', chefs_json=chefs_json)

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
    """Returns all chef data from the database as JSON."""
    try:
        chefs_data = load_database()
        # Convert datetime objects for JSON compatibility if necessary
        # The Chef.to_dict() method in database.py already handles this
        return jsonify(chefs_data)
    except Exception as e:
        print(f"Error in /api/chefs route: {e}")
        return jsonify({"error": "Failed to load chef data", "details": str(e)}), 500

@app.route('/interactive_chat', methods=['POST'])
def interactive_chat():
    """Endpoint for user to interact with StephAI (interactive chat)."""
    try:
        data = request.get_json()
        user_message = data.get('message')
        session_id = request.cookies.get('session_id') or request.remote_addr or str(time.time())
        agent = get_interactive_agent(session_id)
        if agent.is_busy():
            return jsonify({"status": "busy", "message": "StephAI is busy. Please wait."}), 429
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

# Removed the __main__ block. Gunicorn or Flask CLI will run the app object.
# Initial database check is handled when database.py is imported by agent/scheduler.
