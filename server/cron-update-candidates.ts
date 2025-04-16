import dotenv from 'dotenv';
dotenv.config();

import { db } from './db';
import { seasons } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { updateSeasonCandidatesIfIncomplete } from './update-db';
import cron from 'node-cron';

// Run every day at 03:00 AM server time
cron.schedule('0 3 * * *', async () => {
  console.log('[CRON] Starting candidate update check for incomplete seasons...');
  try {
    // Find all seasons
    const allSeasons = await db.select().from(seasons).execute();
    for (const season of allSeasons) {
      await updateSeasonCandidatesIfIncomplete(season.id);
    }
    console.log('[CRON] Candidate update check completed.');
  } catch (error) {
    console.error('[CRON] Error during candidate update check:', error);
  }
});

console.log('Cron job scheduled: Will check and update season candidates daily at 03:00.');
