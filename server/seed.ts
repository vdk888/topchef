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
  console.log('Seeding seasons data...');
  
  const seasonsData = [
    { number: 1, year: 2006, title: "Top Chef Season 1", country: "USA", numberOfEpisodes: 12, winner: "Harold Dieterle" },
    { number: 2, year: 2006, title: "Top Chef Season 2: Los Angeles", country: "USA", numberOfEpisodes: 13, winner: "Ilan Hall" },
    { number: 3, year: 2007, title: "Top Chef Season 3: Miami", country: "USA", numberOfEpisodes: 15, winner: "Hung Huynh" },
    { number: 4, year: 2008, title: "Top Chef Season 4: Chicago", country: "USA", numberOfEpisodes: 14, winner: "Stephanie Izard" },
    { number: 5, year: 2008, title: "Top Chef Season 5: New York", country: "USA", numberOfEpisodes: 14, winner: "Hosea Rosenberg" },
    { number: 6, year: 2009, title: "Top Chef Season 6: Las Vegas", country: "USA", numberOfEpisodes: 15, winner: "Michael Voltaggio" },
    { number: 7, year: 2010, title: "Top Chef Season 7: Washington D.C.", country: "USA", numberOfEpisodes: 14, winner: "Kevin Sbraga" },
    { number: 8, year: 2010, title: "Top Chef Season 8: All-Stars", country: "USA", numberOfEpisodes: 17, winner: "Richard Blais" },
    { number: 9, year: 2011, title: "Top Chef Season 9: Texas", country: "USA", numberOfEpisodes: 17, winner: "Paul Qui" },
    { number: 10, year: 2012, title: "Top Chef Season 10: Seattle", country: "USA", numberOfEpisodes: 17, winner: "Kristen Kish" },
    { number: 11, year: 2013, title: "Top Chef Season 11: New Orleans", country: "USA", numberOfEpisodes: 17, winner: "Nicholas Elmi" },
    { number: 12, year: 2014, title: "Top Chef Season 12: Boston", country: "USA", numberOfEpisodes: 17, winner: "Mei Lin" },
    { number: 13, year: 2015, title: "Top Chef Season 13: California", country: "USA", numberOfEpisodes: 15, winner: "Jeremy Ford" },
    { number: 14, year: 2016, title: "Top Chef Season 14: Charleston", country: "USA", numberOfEpisodes: 14, winner: "Brooke Williamson" },
    { number: 15, year: 2017, title: "Top Chef Season 15: Colorado", country: "USA", numberOfEpisodes: 15, winner: "Joe Flamm" },
    { number: 16, year: 2018, title: "Top Chef Season 16: Kentucky", country: "USA", numberOfEpisodes: 15, winner: "Kelsey Barnard Clark" },
    { number: 17, year: 2020, title: "Top Chef Season 17: All-Stars L.A.", country: "USA", numberOfEpisodes: 14, winner: "Melissa King" },
    { number: 18, year: 2021, title: "Top Chef Season 18: Portland", country: "USA", numberOfEpisodes: 14, winner: "Gabe Erales" },
    { number: 19, year: 2022, title: "Top Chef Season 19: Houston", country: "USA", numberOfEpisodes: 14, winner: "Buddha Lo" },
    { number: 20, year: 2023, title: "Top Chef Season 20: World All-Stars", country: "UK", numberOfEpisodes: 14, winner: "Buddha Lo" },
    { number: 21, year: 2024, title: "Top Chef Season 21: Wisconsin", country: "USA", numberOfEpisodes: 14, winner: "Danny Garcia" }
  ];
  
  for (const season of seasonsData) {
    await db.insert(seasons).values(season);
  }
  
  console.log(`Inserted ${seasonsData.length} seasons`);
}

async function seedChefs() {
  console.log('Seeding chefs data...');
  
  const chefsData = [
    // Season 1
    { name: "Harold Dieterle", status: "active", bio: "Winner of Top Chef Season 1, opened Perilla in NYC", imageUrl: null },
    { name: "Tiffani Faison", status: "active", bio: "Runner-up of Top Chef Season 1, owns multiple restaurants in Boston", imageUrl: null },
    { name: "Dave Martin", status: "active", bio: "Known for his 'I'm not your bitch, bitch!' quote from Season 1", imageUrl: null },
    
    // Season 2
    { name: "Ilan Hall", status: "active", bio: "Winner of Top Chef Season 2, opened The Gorbals", imageUrl: null },
    { name: "Marcel Vigneron", status: "active", bio: "Runner-up of Top Chef Season 2, known for molecular gastronomy", imageUrl: null },
    { name: "Sam Talbot", status: "active", bio: "Top Chef Season 2 contestant, focuses on sustainable seafood", imageUrl: null },
    
    // Season 3
    { name: "Hung Huynh", status: "active", bio: "Winner of Top Chef Season 3, opened Catch restaurants", imageUrl: null },
    { name: "Dale Levitski", status: "active", bio: "Runner-up of Top Chef Season 3", imageUrl: null },
    { name: "Casey Thompson", status: "active", bio: "Fan favorite from Top Chef Season 3", imageUrl: null },
    
    // Season 4
    { name: "Stephanie Izard", status: "active", bio: "First female winner of Top Chef (Season 4), owns Girl & the Goat", imageUrl: null },
    { name: "Richard Blais", status: "active", bio: "Runner-up in Season 4, later won All-Stars Season 8", imageUrl: null },
    { name: "Antonia Lofaso", status: "active", bio: "Top Chef Season 4 contestant, owns multiple restaurants in LA", imageUrl: null },
    
    // Season 5
    { name: "Hosea Rosenberg", status: "active", bio: "Winner of Top Chef Season 5, owns Blackbelly in Boulder", imageUrl: null },
    { name: "Carla Hall", status: "active", bio: "Fan favorite from Season 5, former co-host of The Chew", imageUrl: null },
    { name: "Fabio Viviani", status: "active", bio: "Fan favorite from Season 5, owns multiple restaurants", imageUrl: null },
    
    // Season 6
    { name: "Michael Voltaggio", status: "active", bio: "Winner of Top Chef Season 6, owns ink.well in LA", imageUrl: null },
    { name: "Bryan Voltaggio", status: "active", bio: "Runner-up of Top Chef Season 6, Michael's brother", imageUrl: null },
    { name: "Kevin Gillespie", status: "active", bio: "Fan favorite from Season 6, owns Gunshow in Atlanta", imageUrl: null },
    
    // Season 7
    { name: "Kevin Sbraga", status: "active", bio: "Winner of Top Chef Season 7", imageUrl: null },
    { name: "Ed Cotton", status: "active", bio: "Runner-up of Top Chef Season 7", imageUrl: null },
    
    // Season 8 (All-Stars)
    { name: "Mike Isabella", status: "inactive", bio: "Runner-up of Top Chef All-Stars (Season 8)", imageUrl: null },
    
    // Season 9
    { name: "Paul Qui", status: "active", bio: "Winner of Top Chef Season 9, opened Qui in Austin", imageUrl: null },
    { name: "Sarah Grueneberg", status: "active", bio: "Runner-up of Top Chef Season 9, owns Monteverde in Chicago", imageUrl: null },
    
    // Season 10
    { name: "Kristen Kish", status: "active", bio: "Winner of Top Chef Season 10, hosts Restaurants at the End of the World", imageUrl: null },
    { name: "Brooke Williamson", status: "active", bio: "Runner-up in Season 10, later won Season 14", imageUrl: null },
    
    // More recent winners
    { name: "Nicholas Elmi", status: "active", bio: "Winner of Top Chef Season 11 (New Orleans)", imageUrl: null },
    { name: "Mei Lin", status: "active", bio: "Winner of Top Chef Season 12 (Boston)", imageUrl: null },
    { name: "Jeremy Ford", status: "active", bio: "Winner of Top Chef Season 13 (California)", imageUrl: null },
    { name: "Joe Flamm", status: "active", bio: "Winner of Top Chef Season 15 (Colorado)", imageUrl: null },
    { name: "Kelsey Barnard Clark", status: "active", bio: "Winner of Top Chef Season 16 (Kentucky)", imageUrl: null },
    { name: "Melissa King", status: "active", bio: "Winner of Top Chef All-Stars L.A. (Season 17)", imageUrl: null },
    { name: "Gabe Erales", status: "active", bio: "Winner of Top Chef Season 18 (Portland)", imageUrl: null },
    { name: "Buddha Lo", status: "active", bio: "Winner of Top Chef Season 19 (Houston) and Season 20 (World All-Stars)", imageUrl: null },
    { name: "Danny Garcia", status: "active", bio: "Winner of Top Chef Season 21 (Wisconsin)", imageUrl: null }
  ];
  
  for (const chef of chefsData) {
    await db.insert(chefs).values(chef);
  }
  
  console.log(`Inserted ${chefsData.length} chefs`);
}

async function seedParticipations() {
  console.log('Seeding participations data...');
  
  // Helper function to get chef by name
  async function getChefId(name: string): Promise<number | null> {
    const result = await db.select().from(chefs).where(eq(chefs.name, name)).limit(1);
    return result.length ? result[0].id : null;
  }
  
  // Helper function to get season by number
  async function getSeasonId(number: number): Promise<number | null> {
    const result = await db.select().from(seasons).where(eq(seasons.number, number)).limit(1);
    return result.length ? result[0].id : null;
  }
  
  try {
    // Season 1 participations
    const season1Id = await getSeasonId(1);
    if (season1Id) {
      const haroldDieterleId = await getChefId("Harold Dieterle");
      const tiffaniFaisonId = await getChefId("Tiffani Faison");
      const daveMartin = await getChefId("Dave Martin");
      
      if (haroldDieterleId && tiffaniFaisonId && daveMartin) {
        await db.insert(participations).values([
          { 
            chefId: haroldDieterleId, 
            seasonId: season1Id, 
            placement: 1, 
            isWinner: true, 
            eliminatedEpisode: null,
            notes: "Winner of Season 1" 
          },
          { 
            chefId: tiffaniFaisonId, 
            seasonId: season1Id, 
            placement: 2, 
            isWinner: false, 
            eliminatedEpisode: 12,
            notes: "Runner-up of Season 1" 
          },
          { 
            chefId: daveMartin, 
            seasonId: season1Id, 
            placement: 3, 
            isWinner: false, 
            eliminatedEpisode: 11,
            notes: "Third place in Season 1" 
          }
        ]);
      }
    }
    
    // Season 4 participations (Chicago)
    const season4Id = await getSeasonId(4);
    if (season4Id) {
      const stephanieIzardId = await getChefId("Stephanie Izard");
      const richardBlaisId = await getChefId("Richard Blais");
      const antoniaLofasoId = await getChefId("Antonia Lofaso");
      
      if (stephanieIzardId && richardBlaisId && antoniaLofasoId) {
        await db.insert(participations).values([
          { 
            chefId: stephanieIzardId, 
            seasonId: season4Id, 
            placement: 1, 
            isWinner: true, 
            eliminatedEpisode: null,
            notes: "First female winner of Top Chef" 
          },
          { 
            chefId: richardBlaisId, 
            seasonId: season4Id, 
            placement: 2, 
            isWinner: false, 
            eliminatedEpisode: 14,
            notes: "Runner-up of Season 4" 
          },
          { 
            chefId: antoniaLofasoId, 
            seasonId: season4Id, 
            placement: 4, 
            isWinner: false, 
            eliminatedEpisode: 13,
            notes: "Fourth place in Season 4, later returned for All-Stars" 
          }
        ]);
      }
    }
    
    // Season 6 participations (Las Vegas)
    const season6Id = await getSeasonId(6);
    if (season6Id) {
      const michaelVoltaggioId = await getChefId("Michael Voltaggio");
      const bryanVoltaggioId = await getChefId("Bryan Voltaggio");
      const kevinGillespieId = await getChefId("Kevin Gillespie");
      
      if (michaelVoltaggioId && bryanVoltaggioId && kevinGillespieId) {
        await db.insert(participations).values([
          { 
            chefId: michaelVoltaggioId, 
            seasonId: season6Id, 
            placement: 1, 
            isWinner: true, 
            eliminatedEpisode: null,
            notes: "Winner of Season 6, competed against his brother Bryan" 
          },
          { 
            chefId: bryanVoltaggioId, 
            seasonId: season6Id, 
            placement: 2, 
            isWinner: false, 
            eliminatedEpisode: 15,
            notes: "Runner-up of Season 6, lost to his brother Michael" 
          },
          { 
            chefId: kevinGillespieId, 
            seasonId: season6Id, 
            placement: 3, 
            isWinner: false, 
            eliminatedEpisode: 14,
            notes: "Third place in Season 6, fan favorite" 
          }
        ]);
      }
    }
    
    // Season 8 participations (All-Stars)
    const season8Id = await getSeasonId(8);
    if (season8Id) {
      const richardBlaisId = await getChefId("Richard Blais");
      const mikeIsabellaId = await getChefId("Mike Isabella");
      const antoniaLofasoId = await getChefId("Antonia Lofaso");
      
      if (richardBlaisId && mikeIsabellaId && antoniaLofasoId) {
        await db.insert(participations).values([
          { 
            chefId: richardBlaisId, 
            seasonId: season8Id, 
            placement: 1, 
            isWinner: true, 
            eliminatedEpisode: null,
            notes: "Winner of All-Stars after being runner-up in Season 4" 
          },
          { 
            chefId: mikeIsabellaId, 
            seasonId: season8Id, 
            placement: 2, 
            isWinner: false, 
            eliminatedEpisode: 17,
            notes: "Runner-up of All-Stars" 
          },
          { 
            chefId: antoniaLofasoId, 
            seasonId: season8Id, 
            placement: 4, 
            isWinner: false, 
            eliminatedEpisode: 16,
            notes: "Fourth place in All-Stars" 
          }
        ]);
      }
    }
    
    // Season 10 participations (Seattle)
    const season10Id = await getSeasonId(10);
    if (season10Id) {
      const kristenKishId = await getChefId("Kristen Kish");
      const brookeWilliamsonId = await getChefId("Brooke Williamson");
      
      if (kristenKishId && brookeWilliamsonId) {
        await db.insert(participations).values([
          { 
            chefId: kristenKishId, 
            seasonId: season10Id, 
            placement: 1, 
            isWinner: true, 
            eliminatedEpisode: null,
            notes: "Winner of Season 10 after returning from Last Chance Kitchen" 
          },
          { 
            chefId: brookeWilliamsonId, 
            seasonId: season10Id, 
            placement: 2, 
            isWinner: false, 
            eliminatedEpisode: 17,
            notes: "Runner-up of Season 10, later won Season 14" 
          }
        ]);
      }
    }
    
    // Season 17 participations (All-Stars L.A.)
    const season17Id = await getSeasonId(17);
    if (season17Id) {
      const melissaKingId = await getChefId("Melissa King");
      
      if (melissaKingId) {
        await db.insert(participations).values({
          chefId: melissaKingId, 
          seasonId: season17Id, 
          placement: 1, 
          isWinner: true, 
          eliminatedEpisode: null,
          notes: "Winner of All-Stars L.A., set record for most challenge wins" 
        });
      }
    }
    
    // Season 20 participations (World All-Stars)
    const season20Id = await getSeasonId(20);
    if (season20Id) {
      const buddhaLoId = await getChefId("Buddha Lo");
      
      if (buddhaLoId) {
        await db.insert(participations).values({
          chefId: buddhaLoId, 
          seasonId: season20Id, 
          placement: 1, 
          isWinner: true, 
          eliminatedEpisode: null,
          notes: "First chef to win two consecutive seasons (19 and 20)" 
        });
      }
    }
    
    // Get total count of participations
    const count = await db.select({ count: sql`count(*)` }).from(participations);
    console.log(`Inserted ${count[0].count} participations total`);
    
  } catch (error) {
    console.error('Error seeding participations:', error);
  }
}

async function seedRestaurants() {
  console.log('Seeding restaurants data...');
  
  // Helper function to get chef by name
  async function getChefId(name: string): Promise<number | null> {
    const result = await db.select().from(chefs).where(eq(chefs.name, name)).limit(1);
    return result.length ? result[0].id : null;
  }
  
  // Helper function to get season by number
  async function getSeasonId(number: number): Promise<number | null> {
    const result = await db.select().from(seasons).where(eq(seasons.number, number)).limit(1);
    return result.length ? result[0].id : null;
  }
  
  try {
    // Season 1 restaurants
    const haroldDieterleId = await getChefId("Harold Dieterle");
    const tiffaniFaisonId = await getChefId("Tiffani Faison");
    const season1Id = await getSeasonId(1);
    
    if (haroldDieterleId && tiffaniFaisonId && season1Id) {
      await db.insert(restaurants).values([
        { 
          chefId: haroldDieterleId,
          restaurantName: "Perilla",
          description: "New American restaurant in West Village, closed in 2014",
          lat: "40.7308",
          lng: "-74.0021",
          seasonId: season1Id,
          city: "New York",
          country: "USA",
          isCurrent: false,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        },
        { 
          chefId: tiffaniFaisonId,
          restaurantName: "Sweet Cheeks Q",
          description: "BBQ restaurant in Boston's Fenway neighborhood",
          lat: "42.3467",
          lng: "-71.0972",
          seasonId: season1Id,
          city: "Boston",
          country: "USA",
          isCurrent: true,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        }
      ]);
    }
    
    // Season 4 restaurants
    const stephanieIzardId = await getChefId("Stephanie Izard");
    const richardBlaisId = await getChefId("Richard Blais");
    const antoniaLofasoId = await getChefId("Antonia Lofaso");
    const season4Id = await getSeasonId(4);
    
    if (stephanieIzardId && richardBlaisId && antoniaLofasoId && season4Id) {
      await db.insert(restaurants).values([
        { 
          chefId: stephanieIzardId,
          restaurantName: "Girl & the Goat",
          description: "Award-winning restaurant in Chicago's West Loop",
          lat: "41.8847",
          lng: "-87.6506",
          seasonId: season4Id,
          city: "Chicago",
          country: "USA",
          isCurrent: true,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        },
        { 
          chefId: richardBlaisId,
          restaurantName: "Juniper & Ivy",
          description: "Progressive American restaurant in San Diego",
          lat: "32.7266",
          lng: "-117.1692",
          seasonId: season4Id,
          city: "San Diego",
          country: "USA",
          isCurrent: true,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        },
        { 
          chefId: antoniaLofasoId,
          restaurantName: "DAMA",
          description: "Latin-inspired restaurant in Downtown LA",
          lat: "34.0464",
          lng: "-118.2403",
          seasonId: season4Id,
          city: "Los Angeles",
          country: "USA",
          isCurrent: true,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        }
      ]);
    }
    
    // Season 6 restaurants (Voltaggio brothers)
    const michaelVoltaggioId = await getChefId("Michael Voltaggio");
    const bryanVoltaggioId = await getChefId("Bryan Voltaggio");
    const season6Id = await getSeasonId(6);
    
    if (michaelVoltaggioId && bryanVoltaggioId && season6Id) {
      await db.insert(restaurants).values([
        { 
          chefId: michaelVoltaggioId,
          restaurantName: "ink.well",
          description: "Modern Los Angeles restaurant, now closed",
          lat: "34.0522",
          lng: "-118.2437",
          seasonId: season6Id,
          city: "Los Angeles",
          country: "USA",
          isCurrent: false,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        },
        { 
          chefId: bryanVoltaggioId,
          restaurantName: "Volt",
          description: "Farm-to-table restaurant in a historic mansion",
          lat: "39.4143",
          lng: "-77.4105",
          seasonId: season6Id,
          city: "Frederick",
          country: "USA",
          isCurrent: true,
          lastUpdated: new Date(),
          dateOpened: null,
          dateClosed: null
        }
      ]);
    }
    
    // Season 10 restaurant (Kristen Kish)
    const kristenKishId = await getChefId("Kristen Kish");
    const season10Id = await getSeasonId(10);
    
    if (kristenKishId && season10Id) {
      await db.insert(restaurants).values({
        chefId: kristenKishId,
        restaurantName: "Arlo Grey",
        description: "Restaurant at The Line Hotel in Austin",
        lat: "30.2631",
        lng: "-97.7417",
        seasonId: season10Id,
        city: "Austin",
        country: "USA",
        isCurrent: true,
        lastUpdated: new Date(),
        dateOpened: null,
        dateClosed: null
      });
    }
    
    // Season 17 restaurant (Melissa King)
    const melissaKingId = await getChefId("Melissa King");
    const season17Id = await getSeasonId(17);
    
    if (melissaKingId && season17Id) {
      await db.insert(restaurants).values({
        chefId: melissaKingId,
        restaurantName: "King-fy",
        description: "Asian-inspired pop-up concept",
        lat: "37.7749",
        lng: "-122.4194",
        seasonId: season17Id,
        city: "San Francisco",
        country: "USA",
        isCurrent: true,
        lastUpdated: new Date(),
        dateOpened: null,
        dateClosed: null
      });
    }
    
    // Season 19 & 20 restaurant (Buddha Lo)
    const buddhaLoId = await getChefId("Buddha Lo");
    const season20Id = await getSeasonId(20);
    
    if (buddhaLoId && season20Id) {
      await db.insert(restaurants).values({
        chefId: buddhaLoId,
        restaurantName: "Hŭso",
        description: "High-end tasting menu restaurant in NYC",
        lat: "40.7580",
        lng: "-73.9855",
        seasonId: season20Id,
        city: "New York",
        country: "USA",
        isCurrent: true,
        lastUpdated: new Date(),
        dateOpened: null,
        dateClosed: null
      });
    }
    
    // Get total count of restaurants
    const count = await db.select({ count: sql`count(*)` }).from(restaurants);
    console.log(`Inserted ${count[0].count} restaurants total`);
    
  } catch (error) {
    console.error('Error seeding restaurants:', error);
  }
}

async function main() {
  try {
    // Test database connection
    const testConnection = await db.execute(sql`SELECT NOW()`);
    console.log('Database connection successful!');
    
    // Clear existing data
    await clearTables();
    
    // Seed data in order of dependency
    await seedSeasons();
    await seedChefs();
    await seedParticipations();
    await seedRestaurants();
    
    console.log('Database seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during database seeding:', error);
    process.exit(1);
  }
}

// Run the main function
main();