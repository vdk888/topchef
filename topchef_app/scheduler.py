import schedule
import time
import threading
import logging
from datetime import datetime

# Import functions from other modules
from database import (
    initialize_database,
    upsert_candidate,
    get_candidates_needing_major_update,
    get_seasons_needing_candidates,
    get_all_candidates
)
from llm_interactions import (
    fetch_and_parse_candidate_info,
    generate_perplexity_prompt,
    call_perplexity,
    parse_perplexity_response
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def update_major_fields_task():
    """Task to find and update major fields for outdated candidates."""
    logging.info("Starting scheduled task: Update Major Fields")
    candidates_to_update = get_candidates_needing_major_update(age_limit_months=3)
    if not candidates_to_update:
        logging.info("No candidates require major field updates.")
        return

    logging.info(f"Found {len(candidates_to_update)} candidates needing major field updates.")
    updated_count = 0
    failed_count = 0
    for chef_name, season in candidates_to_update:
        logging.info(f"Attempting major field update for: {chef_name}")
        # Fetch only major fields
        candidate_data = fetch_and_parse_candidate_info(chef_name, fields_requested="major")
        if candidate_data:
            # Ensure chef_name is present, as it's the key
            if 'chef_name' not in candidate_data:
                 candidate_data['chef_name'] = chef_name # Inject if missing
            # Ensure season is present if we know it
            if season and 'top_chef_season' not in candidate_data:
                candidate_data['top_chef_season'] = season

            if upsert_candidate(candidate_data):
                updated_count += 1
                logging.info(f"Successfully updated major fields for {chef_name}.")
            else:
                failed_count += 1
                logging.error(f"Failed to upsert major field update for {chef_name}.")
            # Optional: Add a small delay between API calls
            time.sleep(2)
        else:
            failed_count += 1
            logging.error(f"Failed to fetch/parse major field info for {chef_name}.")
            time.sleep(1) # Small delay even on failure

    logging.info(f"Major field update task finished. Updated: {updated_count}, Failed: {failed_count}")

def complete_seasons_task():
    """Task to find candidates for underrepresented seasons."""
    logging.info("Starting scheduled task: Complete Seasons")
    seasons_to_check = get_seasons_needing_candidates(min_candidates=15)
    if not seasons_to_check:
        logging.info("No seasons require additional candidates.")
        return

    logging.info(f"Found {len(seasons_to_check)} seasons needing candidates: {seasons_to_check}")
    added_count = 0
    failed_fetch_parse = 0
    failed_upsert = 0

    for season in seasons_to_check:
        logging.info(f"Attempting to find candidates for Season {season}")
        # Fetch list of candidates for the season
        candidate_list = fetch_and_parse_candidate_info(season, fields_requested="season_candidates")

        if candidate_list and isinstance(candidate_list, list):
            logging.info(f"Found {len(candidate_list)} potential candidates for Season {season}.")
            for candidate_data in candidate_list:
                 # Basic validation
                 if isinstance(candidate_data, dict) and 'chef_name' in candidate_data:
                     # Ensure season is correctly associated if missing from parse
                     if 'top_chef_season' not in candidate_data or not candidate_data['top_chef_season']:
                         candidate_data['top_chef_season'] = season

                     if upsert_candidate(candidate_data):
                         added_count += 1
                         logging.info(f"Successfully added/updated candidate '{candidate_data['chef_name']}' for Season {season}.")
                     else:
                         failed_upsert += 1
                         logging.warning(f"Failed to upsert candidate '{candidate_data.get('chef_name', 'N/A')}' for Season {season}.")
                     time.sleep(1) # Small delay between upserts
                 else:
                     logging.warning(f"Skipping invalid candidate data item for Season {season}: {candidate_data}")
            time.sleep(3) # Longer delay between seasons
        else:
            failed_fetch_parse += 1
            logging.error(f"Failed to fetch/parse candidate list for Season {season}.")
            time.sleep(1)

    logging.info(f"Complete seasons task finished. Added/Updated: {added_count}, Fetch/Parse Failed: {failed_fetch_parse}, Upsert Failed: {failed_upsert}")

def complete_all_candidate_fields_task():
    """Fills all missing fields for every candidate, grouping by (chef_name, season), looping until complete."""
    logging.info("Starting full candidate completeness task...")
    fields = [
        'chef_name', 'restaurant_name', 'restaurant_address', 'top_chef_season',
        'culinary_style', 'career_highlights', 'signature_dish'
    ]
    max_loops = 5
    for loop in range(max_loops):
        candidates = get_all_candidates()
        incomplete = []
        # Find all candidates with missing fields
        for c in candidates:
            missing = [f for f in fields if not c.get(f) or str(c.get(f)).strip().lower() in ("", "n/a", "none")]
            if missing:
                incomplete.append((c['chef_name'], c.get('top_chef_season'), missing))
        if not incomplete:
            logging.info("All candidate fields are complete.")
            break
        logging.info(f"Loop {loop+1}: {len(incomplete)} candidates with missing fields.")
        for chef_name, season, missing_fields in incomplete:
            # Group by (chef_name, season) for context
            topic = chef_name
            if season:
                topic = f"{chef_name}, Top Chef France season {season}"
            # Always request ALL fields for maximum info
            parsed = fetch_and_parse_candidate_info(topic, fields_requested="all")
            if not parsed:
                logging.warning(f"Failed to fetch/parse info for {topic}")
                continue
            # Only update fields that were missing
            update_data = {f: parsed.get(f) for f in missing_fields if parsed.get(f)}
            update_data['chef_name'] = chef_name
            if season:
                update_data['top_chef_season'] = season
            if upsert_candidate(update_data):
                logging.info(f"Updated {chef_name} (season {season}) with fields: {list(update_data.keys())}")
            else:
                logging.warning(f"Failed to upsert for {chef_name} (season {season})")
            time.sleep(2)
        time.sleep(5)
    logging.info("Full candidate completeness task finished.")

def run_scheduled_tasks():
    """Runs all scheduled tasks immediately."""
    logging.info("Manually triggering scheduled tasks...")
    update_major_fields_task()
    complete_seasons_task()
    complete_all_candidate_fields_task()
    logging.info("Manual trigger finished.")

def run_scheduler():
    """Sets up and runs the scheduler loop."""
    logging.info("Scheduler started.")

    # --- Schedule Definitions ---
    # Schedule to run at specific times daily (can change to specific days if needed)
    schedule.every().day.at("02:00").do(update_major_fields_task)
    schedule.every().day.at("02:15").do(complete_seasons_task) # Stagger tasks slightly
    schedule.every().day.at("02:30").do(complete_all_candidate_fields_task) # Add new task

    # --- Run Once on Startup ---
    logging.info("Running initial scheduled tasks on startup...")
    run_scheduled_tasks() # Run checks immediately when the app starts

    # --- Scheduler Loop ---
    while True:
        schedule.run_pending()
        time.sleep(60) # Check every minute

def start_scheduler_thread():
    """Starts the scheduler in a separate thread."""
    # Initialize DB schema first if needed (might be done in main app)
    # initialize_database()

    scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    logging.info("Scheduler thread started.")
    return scheduler_thread

if __name__ == "__main__":
    # For testing the scheduler functions directly
    logging.basicConfig(level=logging.INFO)
    print("Testing scheduler functions (ensure DB and API keys are set)...")
    # initialize_database() # Make sure DB is ready
    # run_scheduled_tasks() # Run tasks once for testing
    # Or start the full scheduler loop for longer testing:
    # start_scheduler_thread()
    # Keep main thread alive if needed for testing scheduler thread
    # while True:
    #     time.sleep(10)
    pass
