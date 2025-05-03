"""
Autonomous Agent Module for TopChef
This module runs independently of the web interface, continuously improving
the database with chef information.
"""
import time
import os
import sys
import random
import schedule
from datetime import datetime

# Import the necessary functions from our agent module
from topchef_agent.agent import run_llm_driven_agent_cycle, log_to_ui, signal_database_update
from topchef_agent.config import OPENROUTER_API_KEY

# --- Global Counter ---
job_counter = 0

# --- Configuration ---
# How often to run the check (in seconds) - default is 30 minutes
CHECK_INTERVAL_SECONDS = int(os.environ.get("AGENT_CHECK_INTERVAL", 7200))

def job():
    """The job to be scheduled: run the LLM-driven agent cycle with the initial thought prompt."""
    global job_counter
    job_counter += 1
    
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[AUTONOMOUS AGENT] Job #{job_counter} triggered at {current_time}", flush=True)
    log_to_ui("autonomous_job_start", {
        "job_id": job_counter,
        "timestamp": current_time
    }, role="autonomous_agent")

    # Define the initial prompt based on the counter
    if job_counter % 5 == 0:  # Trigger fun fact every 5 cycles
        initial_prompt = "Allez StephAI Botenberg! It's time to share a little something with our viewers! Dig into the database, find an interesting tidbit about a random chef or season, and present it with your signature flair! Make it fun, make it engaging!"
        print("  [AUTONOMOUS AGENT] Using special 'Fun Fact' prompt this time.", flush=True)
    # Add more specialized prompts here if needed
    elif job_counter % 3 == 0:  # Every 3rd cycle, focus on geocoding
        initial_prompt = "Bonjour StephAI Botenberg! Time to put chefs on the map! Find chefs with missing latitude/longitude data but who have restaurant addresses. Use geocoding to add their coordinates to make them appear on our beautiful map!"
        print("  [AUTONOMOUS AGENT] Using special 'Geocoding' prompt this time.", flush=True)
    else:  # Default routine check
        initial_prompt = "Okay StephAI Botenberg, time for your routine check. Ask yourself: did you check the Top Chef database recently? You should check a random season for missing data."

    try:
        # Pass the selected initial prompt to the agent cycle
        run_llm_driven_agent_cycle(initial_prompt)
        
        # Signal that the database was updated
        signal_database_update()
        
        log_to_ui("autonomous_job_complete", {
            "job_id": job_counter,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }, role="autonomous_agent")
    except Exception as e:
        error_msg = f"Error during scheduled run_llm_driven_agent_cycle: {e}"
        print(f"[AUTONOMOUS AGENT] {error_msg}", file=sys.stderr, flush=True)
        # Log the full traceback for better debugging
        import traceback
        traceback_text = traceback.format_exc()
        traceback.print_exc(file=sys.stderr)
        
        log_to_ui("autonomous_job_error", {
            "job_id": job_counter,
            "error": error_msg,
            "traceback": traceback_text,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }, role="autonomous_agent")

def run_autonomous_agent():
    """Starts the autonomous agent with scheduled tasks."""
    if not OPENROUTER_API_KEY:
        print("CRITICAL: OPENROUTER_API_KEY is not set. Autonomous agent cannot run.", file=sys.stderr, flush=True)
        return
    
    print(f"[AUTONOMOUS AGENT] Starting autonomous agent...", flush=True)
    print(f"[AUTONOMOUS AGENT] Scheduling jobs to run every {CHECK_INTERVAL_SECONDS} seconds.", flush=True)
    
    # Schedule the job
    schedule.every(CHECK_INTERVAL_SECONDS).seconds.do(job)
    
    # Log the start of the autonomous agent
    log_to_ui("autonomous_agent_start", {
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "interval": CHECK_INTERVAL_SECONDS
    }, role="system")
    
    print("[AUTONOMOUS AGENT] Running first job immediately to test...", flush=True)
    # Run the first job immediately
    job()
    
    print("[AUTONOMOUS AGENT] Entering scheduling loop...", flush=True)
    while True:
        try:
            schedule.run_pending()
            time.sleep(1)  # Check every second if a job is due
        except KeyboardInterrupt:
            print("\n[AUTONOMOUS AGENT] Stopped by user.", flush=True)
            break
        except Exception as e:
            print(f"[AUTONOMOUS AGENT] Error in scheduler loop: {e}", file=sys.stderr, flush=True)
            time.sleep(10)  # Wait a bit before retrying loop

if __name__ == "__main__":
    run_autonomous_agent()