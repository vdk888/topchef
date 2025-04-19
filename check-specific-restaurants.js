// Script to check specific restaurant details to verify data is preserved
import { db } from './server/db';
import { restaurants } from './shared/schema';
import { eq, sql } from 'drizzle-orm';

async function checkSpecificRestaurants() {
  try {
    // Check the most recently created restaurants 
    console.log('Checking specific restaurants to verify data is preserved...\n');
    
    // Get first 5 restaurants 
    const firstRestaurants = await db
      .select()
      .from(restaurants)
      .orderBy(restaurants.id)
      .limit(5);
    
    console.log('First 5 restaurants by ID:');
    firstRestaurants.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.restaurantName}, Address: ${r.address || 'No address'}`);
    });
    
    // Get total count first
    const countResult = await db.select({ count: sql`count(*)` }).from(restaurants);
    const count = Number(countResult[0].count);
    
    // Get last 5 restaurants
    const lastRestaurants = await db
      .select()
      .from(restaurants)
      .orderBy(restaurants.id)
      .limit(5)
      .offset(Math.max(0, count - 5));
    
    console.log('\nLast 5 restaurants by ID:');
    lastRestaurants.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.restaurantName}, Address: ${r.address || 'No address'}`);
    });
    
    console.log('\nData check complete. Restart the server and run this script again to verify data persistence.');
    
  } catch (error) {
    console.error('Error checking restaurants:', error);
  }
}

checkSpecificRestaurants();