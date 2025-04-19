// Script to check specific restaurant details
import { db } from './server/db';
import { restaurants, chefs, seasons } from './shared/schema';
import { sql } from 'drizzle-orm';

async function checkRestaurant(id) {
  try {
    console.log(`Checking restaurant with ID: ${id}`);
    
    // Query the specific restaurant
    const restaurant = await db.select().from(restaurants).where(sql`${restaurants.id} = ${id}`).then(res => res[0]);
    
    if (!restaurant) {
      console.log(`Restaurant with ID ${id} not found in database`);
      return;
    }
    
    console.log('Restaurant details from database:');
    console.log(JSON.stringify(restaurant, null, 2));
    
    // Get chef details
    const chef = await db.select().from(chefs).where(sql`${chefs.id} = ${restaurant.chefId}`).then(res => res[0]);
    console.log('\nChef details:');
    console.log(JSON.stringify(chef, null, 2));
    
    // Get season details if applicable
    if (restaurant.seasonId) {
      const season = await db.select().from(seasons).where(sql`${seasons.id} = ${restaurant.seasonId}`).then(res => res[0]);
      console.log('\nSeason details:');
      console.log(JSON.stringify(season, null, 2));
    }
    
  } catch (error) {
    console.error('Error checking restaurant:', error);
  }
}

// Check restaurant with ID 5210 (Blackbelly)
checkRestaurant(5210);