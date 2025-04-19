// Script to check all restaurant IDs
import { db } from './server/db';
import { restaurants } from './shared/schema';

async function checkRestaurantIds() {
  try {
    console.log('Retrieving all restaurant IDs from database...');
    
    // Query to get all restaurant IDs in ascending order
    const restaurantIds = await db
      .select({ id: restaurants.id, name: restaurants.restaurantName })
      .from(restaurants)
      .orderBy(restaurants.id);
    
    console.log(`Found ${restaurantIds.length} restaurants in database`);
    console.log('Restaurant IDs and names:');
    restaurantIds.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.name}`);
    });
    
    // Find minimum and maximum IDs
    if (restaurantIds.length > 0) {
      const minId = Math.min(...restaurantIds.map(r => r.id));
      const maxId = Math.max(...restaurantIds.map(r => r.id));
      console.log(`\nID Range: ${minId} to ${maxId}`);
    }
    
  } catch (error) {
    console.error('Error checking restaurant IDs:', error);
  }
}

checkRestaurantIds();