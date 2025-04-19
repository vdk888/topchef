import schedule
import time
import sys
# Import the new LLM-driven agent cycle function
from agent import run_llm_driven_agent_cycle

# --- Configuration ---
# How often to run the check (in minutes)
CHECK_INTERVAL_MINUTES = 60

def job():
    """The job to be scheduled: run the LLM-driven agent cycle."""
    print(f"Scheduler triggered LLM-driven agent cycle job at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    try:
        # Call the new function
        run_llm_driven_agent_cycle()
    except Exception as e:
        print(f"Error during scheduled run_llm_driven_agent_cycle: {e}", file=sys.stderr)
        # Log the full traceback for better debugging
        import traceback
        traceback.print_exc(file=sys.stderr)

# --- Schedule the Job ---
print(f"Scheduling autonomous update cycle to run every {CHECK_INTERVAL_MINUTES} minutes.")
# schedule.every(CHECK_INTERVAL_MINUTES).minutes.do(job)
# For testing, run more frequently (e.g., every 1 minute)
schedule.every(1).minute.do(job)
# Or run immediately once for testing:
# job()


# --- Run the Scheduler ---
print("Scheduler started. Running initial check now...")
job() # Run once immediately

print("Entering scheduling loop (press Ctrl+C to stop)...")
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
