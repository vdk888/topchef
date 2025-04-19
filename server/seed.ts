import { db } from './db';
import {
  chefs,
  seasons,
  participations,
  restaurants
} from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

async function clearTables() {
  console.log('Clearing existing data...');

  // Delete in reverse order of dependency
  await db.delete(restaurants);
  await db.delete(participations);
  await db.delete(seasons);
  await db.delete(chefs);

  console.log('All tables cleared.');
}

async function seedSeasons() {
  console.log('Seeding seasons data (France)...');

  const seasonsData = [
    { number: 1, year: 2010, title: "Top Chef France - Saison 1", country: "France", numberOfEpisodes: 8, winner: "Romain Tischenko" },
    { number: 2, year: 2011, title: "Top Chef France - Saison 2", country: "France", numberOfEpisodes: 10, winner: "Stéphanie Le Quellec" },
    { number: 15, year: 2024, title: "Top Chef France - Saison 15", country: "France", numberOfEpisodes: 15, winner: "Jorick Dorignac" },
  ];

  for (const season of seasonsData) {
    await db.insert(seasons).values(season);
  }

  console.log(`Inserted ${seasonsData.length} seasons`);
}

async function seedChefs() {
  console.log('Seeding chefs data (France)...');

  const chefsData = [
    { name: "Romain Tischenko", status: "active", bio: "Vainqueur de la Saison 1 de Top Chef France.", imageUrl: null },
    { name: "Pierre Sang Boyer", status: "active", bio: "Finaliste de la Saison 1, connu pour sa cuisine franco-coréenne.", imageUrl: null },
    { name: "Brice Morvent", status: "active", bio: "Candidat de la Saison 1.", imageUrl: null },
    { name: "Stéphanie Le Quellec", status: "active", bio: "Vainqueur de la Saison 2, cheffe étoilée.", imageUrl: null },
    { name: "Jorick Dorignac", status: "active", bio: "Vainqueur de la Saison 15.", imageUrl: null },
    { name: "Clotaire Poirier", status: "active", bio: "Finaliste de la Saison 15.", imageUrl: null },
  ];

  for (const chef of chefsData) {
    await db.insert(chefs).values(chef);
  }

  console.log(`Inserted ${chefsData.length} chefs`);
}

async function seedParticipations() {
  console.log('Seeding participations data (France)...');

  // Helper function to get chef by name
  async function getChefId(name: string): Promise<number | null> {
    const result = await db.select({ id: chefs.id }).from(chefs).where(eq(chefs.name, name)).limit(1);
    return result.length ? result[0].id : null;
  }

  // Helper function to get season by number
  async function getSeasonId(number: number): Promise<number | null> {
    const result = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.number, number)).limit(1);
    return result.length ? result[0].id : null;
  }

  try {
    // Season 1 participations
    const season1Id = await getSeasonId(1);
    if (season1Id) {
      const romainTischenkoId = await getChefId("Romain Tischenko");
      const pierreSangBoyerId = await getChefId("Pierre Sang Boyer");
      const briceMorventId = await getChefId("Brice Morvent");

      if (romainTischenkoId) {
        await db.insert(participations).values({
          chefId: romainTischenkoId,
          seasonId: season1Id,
          placement: 1,
          isWinner: true,
          eliminated: false,
          notes: "Vainqueur Saison 1"
        });
      }
      if (pierreSangBoyerId) {
        await db.insert(participations).values({
          chefId: pierreSangBoyerId,
          seasonId: season1Id,
          placement: 2, // Assuming finalist
          isWinner: false,
          eliminated: false, // Finalist
          notes: "Finaliste Saison 1"
        });
      }
       if (briceMorventId) {
        await db.insert(participations).values({
          chefId: briceMorventId,
          seasonId: season1Id,
          placement: 3, // Example placement
          isWinner: false,
          eliminated: true,
          eliminatedEpisode: 7 // Example episode
        });
      }
    }

    // Season 15 participations
    const season15Id = await getSeasonId(15);
     if (season15Id) {
      const jorickDorignacId = await getChefId("Jorick Dorignac");
      const clotairePoirierId = await getChefId("Clotaire Poirier");

       if (jorickDorignacId) {
        await db.insert(participations).values({
          chefId: jorickDorignacId,
          seasonId: season15Id,
          placement: 1,
          isWinner: true,
          eliminated: false,
          notes: "Vainqueur Saison 15"
        });
      }
       if (clotairePoirierId) {
        await db.insert(participations).values({
          chefId: clotairePoirierId,
          seasonId: season15Id,
          placement: 2, // Assuming finalist
          isWinner: false,
          eliminated: false, // Finalist
          notes: "Finaliste Saison 15"
        });
      }
    }

    const count = await db.select({ count: sql<number>`count(*)` }).from(participations);
    console.log(`Inserted ${count[0].count} participations total`);

  } catch (error) {
    console.error('Error seeding participations:', error);
  }
}

async function seedRestaurants() {
  console.log('Seeding restaurants data (France)...');

  // Helper function to get chef by name
  async function getChefId(name: string): Promise<number | null> {
    const result = await db.select({ id: chefs.id }).from(chefs).where(eq(chefs.name, name)).limit(1);
    return result.length ? result[0].id : null;
  }

  // Helper function to get season by number
  async function getSeasonId(number: number): Promise<number | null> {
    const result = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.number, number)).limit(1);
    return result.length ? result[0].id : null;
  }

  try {
    const romainTischenkoId = await getChefId("Romain Tischenko");
    const pierreSangBoyerId = await getChefId("Pierre Sang Boyer");
    const stephanieLeQuellecId = await getChefId("Stéphanie Le Quellec");
    const season1Id = await getSeasonId(1);
    const season2Id = await getSeasonId(2);


    if (romainTischenkoId && season1Id) {
      await db.insert(restaurants).values({
        chefId: romainTischenkoId,
        restaurantName: "Le Galopin",
        description: "Bistrot moderne à Paris",
        // Coordinates for Place Sainte-Marthe, Paris (approximate)
        lat: "48.8701",
        lng: "2.3745",
        address: "34 Rue Sainte-Marthe, 75010 Paris",
        seasonId: season1Id,
        city: "Paris",
        country: "France",
        isCurrent: true, // Assuming it's still current
        lastUpdated: new Date(),
      });
    }

    if (pierreSangBoyerId && season1Id) {
       await db.insert(restaurants).values([
        {
          chefId: pierreSangBoyerId,
          restaurantName: "Pierre Sang in Oberkampf",
          description: "Restaurant signature à Paris",
          // Coordinates for Rue Oberkampf (approximate)
          lat: "48.8650",
          lng: "2.3770",
          address: "55 Rue Oberkampf, 75011 Paris",
          seasonId: season1Id,
          city: "Paris",
          country: "France",
          isCurrent: true,
          lastUpdated: new Date(),
        },
        {
          chefId: pierreSangBoyerId,
          restaurantName: "Pierre Sang on Gambey",
          description: "Autre restaurant à Paris",
          // Coordinates for Rue Gambey (approximate)
          lat: "48.8655",
          lng: "2.3765",
          address: "6 Rue Gambey, 75011 Paris",
          seasonId: season1Id, // Still associated with his initial season appearance
          city: "Paris",
          country: "France",
          isCurrent: true,
          lastUpdated: new Date(),
        }
      ]);
    }

     if (stephanieLeQuellecId && season2Id) {
      await db.insert(restaurants).values({
        chefId: stephanieLeQuellecId,
        restaurantName: "La Scène",
        description: "Restaurant 2 étoiles Michelin à Paris",
        // Coordinates for Avenue Matignon (approximate)
        lat: "48.8708",
        lng: "2.3130",
        address: "32 Avenue Matignon, 75008 Paris",
        seasonId: season2Id,
        city: "Paris",
        country: "France",
        isCurrent: true,
        lastUpdated: new Date(),
      });
    }

    const count = await db.select({ count: sql<number>`count(*)` }).from(restaurants);
    console.log(`Inserted ${count[0].count} restaurants total`);

  } catch (error) {
    console.error('Error seeding restaurants:', error);
  }
}

async function main() {
  try {
    // Test database connection
    const connectionResult = await db.execute(sql`SELECT NOW()`);
    console.log('Database connection successful!', connectionResult.rows[0]);

    // Clear existing data
    await clearTables();

    // Seed data in order of dependency
    await seedSeasons();
    await seedChefs();
    await seedParticipations();
    await seedRestaurants();

    console.log('Database seeding completed successfully');
    process.exit(0); // Exit script after successful seeding
  } catch (error) {
    console.error('Error during database seeding:', error);
    process.exit(1); // Exit with error code
  } finally {
     // Ensure the pool is closed even if main throws an error before process.exit
     // This might require accessing the pool instance from db.ts if not exported directly
     console.log('Closing database pool (if possible)...');
     // Example: await db.pool.end(); // If pool is accessible
  }
}

// Run the main function
main();
