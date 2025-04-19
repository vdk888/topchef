import logging
import os
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import uvicorn

# Import functions from our modules
from database import initialize_database, get_all_candidates, upsert_candidate
from llm_interactions import fetch_and_parse_candidate_info
from scheduler import start_scheduler_thread

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize FastAPI app
app = FastAPI(title="Top Chef DB")

# Setup Jinja2 templates
templates = Jinja2Templates(directory="topchef_app/templates")

# --- Pydantic Models ---
class UpdateRequest(BaseModel):
    chef_name: str

class SeasonUpdateRequest(BaseModel):
    season_number: int

# --- Event Handlers ---
@app.on_event("startup")
async def startup_event():
    """Tasks to run when the application starts."""
    logging.info("Application starting up...")
    # Initialize the database schema
    logging.info("Initializing database...")
    initialize_database()
    logging.info("Database initialization complete.")
    # Start the background scheduler thread
    logging.info("Starting background scheduler...")
    start_scheduler_thread()
    logging.info("Background scheduler started.")
    logging.info("Application startup complete.")

# --- API Routes ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Serves the main HTML page displaying candidate data."""
    logging.info("Request received for root path ('/')")
    try:
        candidates = get_all_candidates()
        logging.info(f"Rendering index.html with {len(candidates)} candidates.")
        return templates.TemplateResponse("index.html", {"request": request, "candidates": candidates})
    except Exception as e:
        logging.error(f"Error fetching candidates for root path: {e}", exc_info=True)
        # Render template with error message or empty list
        return templates.TemplateResponse("index.html", {"request": request, "candidates": [], "error": "Could not load candidate data."})


@app.post("/update-candidate", response_class=JSONResponse)
async def update_candidate_manual(update_request: UpdateRequest):
    """Handles manual update requests for a specific chef."""
    chef_name = update_request.chef_name
    logging.info(f"Manual update request received for chef: {chef_name}")

    if not chef_name:
        logging.warning("Manual update request received with empty chef name.")
        raise HTTPException(status_code=400, detail="Chef name cannot be empty.")

    try:
        # Fetch all available info (major and minor)
        logging.info(f"Fetching all info for {chef_name}...")
        candidate_data = fetch_and_parse_candidate_info(chef_name, fields_requested="all")

        if not candidate_data:
            logging.error(f"Failed to fetch or parse info for {chef_name}.")
            return JSONResponse(status_code=500, content={"success": False, "message": f"Could not retrieve or parse information for {chef_name}."})

        # Ensure chef_name is in the data before upserting
        if 'chef_name' not in candidate_data or not candidate_data['chef_name']:
             # Use the name from the request if parsing missed it
             candidate_data['chef_name'] = chef_name
             logging.warning(f"Chef name was missing from parsed data, using request name: {chef_name}")

        logging.info(f"Upserting data for {chef_name}...")
        success = upsert_candidate(candidate_data)

        if success:
            logging.info(f"Successfully updated candidate: {chef_name}")
            return JSONResponse(content={"success": True, "message": f"Successfully updated {chef_name}."})
        else:
            logging.error(f"Database upsert failed for {chef_name}.")
            return JSONResponse(status_code=500, content={"success": False, "message": f"Database update failed for {chef_name}."})

    except Exception as e:
        logging.error(f"Error during manual update for {chef_name}: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "message": f"An unexpected server error occurred: {e}"})


@app.post("/update-season", response_class=JSONResponse)
async def update_season_manual(update_request: SeasonUpdateRequest):
    """Handles manual update requests for a full season."""
    season_number = update_request.season_number
    logging.info(f"Manual update request received for season: {season_number}")

    if not season_number:
        logging.warning("Manual update request received with empty season number.")
        raise HTTPException(status_code=400, detail="Season number cannot be empty.")

    try:
        # Fetch all candidates for the given season
        logging.info(f"Fetching all candidates for season {season_number}...")
        candidate_list = fetch_and_parse_candidate_info(season_number, fields_requested="season_candidates")
        if not candidate_list or not isinstance(candidate_list, list):
            logging.error(f"Failed to fetch or parse candidate list for season {season_number}.")
            return JSONResponse(status_code=500, content={"success": False, "message": f"Could not retrieve or parse candidate list for season {season_number}."})

        upserted = 0
        failed = 0
        for candidate_data in candidate_list:
            if not isinstance(candidate_data, dict):
                logging.warning(f"Skipping invalid candidate data for season {season_number}: {candidate_data}")
                failed += 1
                continue
            # Ensure season is set
            candidate_data['top_chef_season'] = season_number
            success = upsert_candidate(candidate_data)
            if success:
                upserted += 1
            else:
                failed += 1
        logging.info(f"Season update finished for season {season_number}. Upserted: {upserted}, Failed: {failed}")
        return JSONResponse(content={"success": True, "message": f"Successfully updated season {season_number}. Upserted: {upserted}, Failed: {failed}"})
    except Exception as e:
        logging.error(f"Error during manual update for season {season_number}: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "message": f"An unexpected server error occurred: {e}"})

# --- Main Execution ---
if __name__ == "__main__":
    # Get port from environment variable or default to 5000 (Replit expecting this port)
    port = int(os.getenv("PORT", 5000))
    logging.info(f"Starting Uvicorn server on http://0.0.0.0:{port}")
    # Note: `reload=True` is useful for development but should be False in production
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
