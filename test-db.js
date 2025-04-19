// Script to test database connection and query data
import { db, testConnection } from './server/db';
import { restaurants, chefs, seasons } from './shared/schema';

async function testDb() {
  try {
    // Test the database connection
    console.log('Testing database connection...');
    const connectionResult = await testConnection();
    console.log('Connection test result:', connectionResult);
    
    // Query restaurants
    console.log('\nFetching restaurants...');
    const restaurantsResult = await db.select().from(restaurants).limit(5);
    console.log(`Found ${restaurantsResult.length} restaurants:`);
    restaurantsResult.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.restaurantName}, Chef ID: ${r.chefId}, Address: ${r.address || 'No address'}`);
    });
    
    // Query chefs
    console.log('\nFetching chefs...');
    const chefsResult = await db.select().from(chefs).limit(5);
    console.log(`Found ${chefsResult.length} chefs:`);
    chefsResult.forEach(c => {
      console.log(`ID: ${c.id}, Name: ${c.name}`);
    });
    
    // Query seasons
    console.log('\nFetching seasons...');
    const seasonsResult = await db.select().from(seasons).limit(5);
    console.log(`Found ${seasonsResult.length} seasons:`);
    seasonsResult.forEach(s => {
      console.log(`ID: ${s.id}, Number: ${s.number}, Country: ${s.country}`);
    });

  } catch (error) {
    console.error('Error testing database:', error);
  }
}

testDb();