import schedule
import time
import sys
# Import the new LLM-driven agent cycle function
from agent import run_llm_driven_agent_cycle

import random # Needed for the prompt

# --- Global Counter ---
job_counter = 0

# --- Configuration ---
# How often to run the check (in seconds)
CHECK_INTERVAL_SECONDS = 200 # 10 minutes

def job():
    """The job to be scheduled: run the LLM-driven agent cycle with the initial thought prompt."""
    global job_counter
    job_counter += 1
    print(f"Scheduler triggered job #{job_counter} for StephAI Botenberg at {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)

    # Define the initial prompt based on the counter
    if job_counter % 5 == 0: # Trigger fun fact every 5 cycles
        initial_prompt = "Allez StephAI Botenberg! It's time to share a little something with our viewers! Dig into the database, find an interesting tidbit about a random chef or season, and present it with your signature flair! Make it fun, make it engaging!"
        print("  Using special 'Fun Fact' prompt this time.", flush=True)
    # Optional: Add back brainstorming or other prompts with different modulo checks if needed, e.g., elif job_counter % 15 == 0: ...
    else: # Default routine check
        initial_prompt = "Okay StephAI Botenberg, time for your routine check. Ask yourself: did you check the Top Chef database recently? You should check a random season for missing data."

    try:
        # Pass the selected initial prompt to the agent cycle
        run_llm_driven_agent_cycle(initial_prompt)
    except Exception as e:
        print(f"Error during scheduled run_llm_driven_agent_cycle: {e}", file=sys.stderr)
        # Log the full traceback for better debugging
        import traceback
        traceback.print_exc(file=sys.stderr)

# --- Schedule the Job ---
print(f"Scheduling StephAI Botenberg's check to run every {CHECK_INTERVAL_SECONDS} seconds.", flush=True)
schedule.every(CHECK_INTERVAL_SECONDS).seconds.do(job)


# --- Run the Scheduler ---
print("Scheduler started. StephAI Botenberg will perform its first check shortly...", flush=True)
# Don't run immediately, let the schedule trigger the first run naturally after the interval.

print("Entering scheduling loop (press Ctrl+C to stop)...", flush=True)
while True:
    try:
        schedule.run_pending()
        time.sleep(1) # Check every second if a job is due
    except KeyboardInterrupt:
        print("\nScheduler stopped by user.")
        break
    except Exception as e:
        print(f"Error in scheduler loop: {e}", file=sys.stderr)
        # Avoid crashing the scheduler loop on unexpected errors within the loop itself
        time.sleep(10) # Wait a bit before retrying loop
