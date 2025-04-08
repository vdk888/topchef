import { 
  users, 
  restaurants, 
  chefs, 
  seasons, 
  participations,
  type User, 
  type InsertUser, 
  type Restaurant, 
  type InsertRestaurant,
  type Chef,
  type InsertChef,
  type Season,
  type InsertSeason,
  type Participation,
  type InsertParticipation,
  type RestaurantWithDetails // Import the shared type
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, desc, asc, getTableColumns, SQL } from "drizzle-orm"; // Import getTableColumns and SQL type

// Re-export the type so it can be imported from this module
export type { RestaurantWithDetails };

// New interface with CRUD methods for all entities
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Restaurant methods
  getRestaurant(id: number): Promise<Restaurant | undefined>;
  // Use the new dedicated type in the interface
  getRestaurantsByCountry(country: string, seasonId?: number): Promise<RestaurantWithDetails[]>; // Use updated type
  getRestaurantsByChef(chefId: number): Promise<Restaurant[]>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  updateRestaurant(id: number, restaurant: Partial<InsertRestaurant>): Promise<Restaurant | undefined>;
  deleteRestaurant(id: number): Promise<boolean>;
  
  // Chef methods
  getChef(id: number): Promise<Chef | undefined>;
  getChefByName(name: string): Promise<Chef | undefined>;
  getAllChefs(): Promise<Chef[]>;
  createChef(chef: InsertChef): Promise<Chef>;
  updateChef(id: number, chef: Partial<InsertChef>): Promise<Chef | undefined>;
  deleteChef(id: number): Promise<boolean>;
  
  // Season methods
  getSeason(id: number): Promise<Season | undefined>;
  getAllSeasons(): Promise<Season[]>;
  getSeasonsByCountry(country: string): Promise<Season[]>;
  createSeason(season: InsertSeason): Promise<Season>;
  
  // Participation methods
  getParticipation(id: number): Promise<Participation | undefined>;
  getParticipationsByChef(chefId: number): Promise<Participation[]>;
  getParticipationsBySeason(seasonId: number): Promise<Participation[]>;
  createParticipation(participation: InsertParticipation): Promise<Participation>;
  
  // Other utility methods
  getCountries(): Promise<string[]>;
}

// PostgreSQL DB Storage implementation
export class DbStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // Restaurant methods
  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    const result = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
    return result[0];
  }

  // Modified to accept optional seasonId, join with chefs, and return details
  async getRestaurantsByCountry(country: string, seasonId?: number): Promise<RestaurantWithDetails[]> { // Use updated type
    // Explicitly type conditions array
    const conditions: (SQL | undefined)[] = [eq(restaurants.country, country)];
    if (seasonId !== undefined) {
      // seasonId is definitely a number here, satisfy TypeScript inside the eq call
      const id: number = seasonId;
      conditions.push(eq(restaurants.seasonId, id));
    }
    // Perform join to get season number and chef name
    // Explicitly type the results and select columns individually
    const results: RestaurantWithDetails[] = await db.select({ // Use updated type
        // Select all columns from restaurants explicitly
        id: restaurants.id,
        chefId: restaurants.chefId,
        restaurantName: restaurants.restaurantName,
        description: restaurants.description,
        lat: restaurants.lat,
        lng: restaurants.lng,
        address: restaurants.address,
        seasonId: restaurants.seasonId,
        city: restaurants.city,
        country: restaurants.country,
        isCurrent: restaurants.isCurrent,
        dateOpened: restaurants.dateOpened,
        dateClosed: restaurants.dateClosed,
        lastUpdated: restaurants.lastUpdated,
        chefAssociationLastUpdated: restaurants.chefAssociationLastUpdated,
        addressLastUpdated: restaurants.addressLastUpdated,
        restaurantNameLastUpdated: restaurants.restaurantNameLastUpdated,
        // Select the season number from the joined seasons table
        seasonNumber: seasons.number,
        // Select the chef name from the joined chefs table
        chefName: chefs.name
      })
      .from(restaurants)
      .leftJoin(seasons, eq(restaurants.seasonId, seasons.id)) // Join seasons
      .leftJoin(chefs, eq(restaurants.chefId, chefs.id)) // Join chefs
      .where(and(...conditions.filter((c): c is SQL => !!c))); // Filter out undefined before spreading into and()

    return results;
  }

  async getRestaurantsByChef(chefId: number): Promise<Restaurant[]> {
    return await db.select().from(restaurants).where(eq(restaurants.chefId, chefId));
  }

  async createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant> {
    const result = await db.insert(restaurants).values(restaurant).returning();
    return result[0];
  }

  async updateRestaurant(id: number, restaurant: Partial<InsertRestaurant>): Promise<Restaurant | undefined> {
    const result = await db.update(restaurants)
      .set(restaurant)
      .where(eq(restaurants.id, id))
      .returning();
    return result[0];
  }

  async deleteRestaurant(id: number): Promise<boolean> {
    const result = await db.delete(restaurants).where(eq(restaurants.id, id)).returning();
    return result.length > 0;
  }

  // Chef methods
  async getChef(id: number): Promise<Chef | undefined> {
    const result = await db.select().from(chefs).where(eq(chefs.id, id)).limit(1);
    return result[0];
  }

  async getChefByName(name: string): Promise<Chef | undefined> {
    const result = await db.select().from(chefs).where(eq(chefs.name, name)).limit(1);
    return result[0];
  }

  async getAllChefs(): Promise<Chef[]> {
    return await db.select().from(chefs).orderBy(asc(chefs.name));
  }

  async createChef(chef: InsertChef): Promise<Chef> {
    const result = await db.insert(chefs).values(chef).returning();
    return result[0];
  }

  async updateChef(id: number, chef: Partial<InsertChef>): Promise<Chef | undefined> {
    const result = await db.update(chefs)
      .set(chef)
      .where(eq(chefs.id, id))
      .returning();
    return result[0];
  }

  async deleteChef(id: number): Promise<boolean> {
    const result = await db.delete(chefs).where(eq(chefs.id, id)).returning();
    return result.length > 0;
  }

  // Season methods
  async getSeason(id: number): Promise<Season | undefined> {
    const result = await db.select().from(seasons).where(eq(seasons.id, id)).limit(1);
    return result[0];
  }

  async getAllSeasons(): Promise<Season[]> {
    return await db.select().from(seasons).orderBy(asc(seasons.number));
  }

  async getSeasonsByCountry(country: string): Promise<Season[]> {
    return await db.select().from(seasons).where(eq(seasons.country, country)).orderBy(asc(seasons.number));
  }

  async createSeason(season: InsertSeason): Promise<Season> {
    const result = await db.insert(seasons).values(season).returning();
    return result[0];
  }

  // Participation methods
  async getParticipation(id: number): Promise<Participation | undefined> {
    const result = await db.select().from(participations).where(eq(participations.id, id)).limit(1);
    return result[0];
  }

  async getParticipationsByChef(chefId: number): Promise<Participation[]> {
    return await db.select().from(participations).where(eq(participations.chefId, chefId));
  }

  async getParticipationsBySeason(seasonId: number): Promise<Participation[]> {
    return await db.select().from(participations).where(eq(participations.seasonId, seasonId));
  }

  async createParticipation(participation: InsertParticipation): Promise<Participation> {
    const result = await db.insert(participations).values(participation).returning();
    return result[0];
  }

  // Utility methods
  async getCountries(): Promise<string[]> {
    // Get unique countries from restaurants
    const result = await db.select({ country: restaurants.country }).from(restaurants)
      .groupBy(restaurants.country)
      .orderBy(asc(restaurants.country));
    
    return result.map(row => row.country);
  }
}

// For backward compatibility, we'll keep the MemStorage class but will use DbStorage as the default
export class MemStorage implements IStorage {
  // Just a fallback implementation - not used anymore
  private users: Map<number, User> = new Map();
  private restaurants: Map<number, Restaurant> = new Map();
  private userCurrentId = 1;
  private restaurantCurrentId = 1;
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Restaurant methods
  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    return this.restaurants.get(id);
  }

  // Updated MemStorage to match IStorage signature and type
  async getRestaurantsByCountry(country: string, seasonId?: number): Promise<RestaurantWithDetails[]> { // Use updated type
    let filtered = Array.from(this.restaurants.values()).filter(
      (restaurant) => restaurant.country === country
    );

    if (seasonId !== undefined) {
      filtered = filtered.filter(restaurant => restaurant.seasonId === seasonId);
    }

    // Add seasonNumber and chefName as null to match the return type
    return filtered.map(restaurant => ({
      ...restaurant,
      seasonNumber: null, // MemStorage doesn't store season details
      chefName: null // MemStorage doesn't store chef details
    }));
  }

  async getRestaurantsByChef(chefId: number): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values()).filter(
      (restaurant) => restaurant.chefId === chefId
    );
  }

  async createRestaurant(insertRestaurant: InsertRestaurant): Promise<Restaurant> {
    const id = this.restaurantCurrentId++;
    // Ensure all required fields have values
    const restaurant: Restaurant = {
      id,
      chefId: insertRestaurant.chefId,
      restaurantName: insertRestaurant.restaurantName,
      lat: insertRestaurant.lat,
      lng: insertRestaurant.lng,
      city: insertRestaurant.city,
      country: insertRestaurant.country,
      description: insertRestaurant.description ?? null,
      seasonId: insertRestaurant.seasonId ?? null,
      isCurrent: insertRestaurant.isCurrent ?? null,
      dateOpened: insertRestaurant.dateOpened ?? null,
      dateClosed: insertRestaurant.dateClosed ?? null,
      lastUpdated: insertRestaurant.lastUpdated ?? new Date(),
      // Add new fields required by updated schema, defaulting to null
      address: insertRestaurant.address ?? null, 
      chefAssociationLastUpdated: null, 
      addressLastUpdated: null, 
      restaurantNameLastUpdated: null
    };
    this.restaurants.set(id, restaurant);
    return restaurant;
  }

  async updateRestaurant(id: number, restaurant: Partial<InsertRestaurant>): Promise<Restaurant | undefined> {
    const existing = this.restaurants.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...restaurant };
    this.restaurants.set(id, updated);
    return updated;
  }

  async deleteRestaurant(id: number): Promise<boolean> {
    return this.restaurants.delete(id);
  }

  // Minimal implementation for the remaining methods to satisfy the interface
  async getChef(id: number): Promise<Chef | undefined> {
    return undefined;
  }

  async getChefByName(name: string): Promise<Chef | undefined> {
    return undefined;
  }

  async getAllChefs(): Promise<Chef[]> {
    return [];
  }

  async createChef(chef: InsertChef): Promise<Chef> {
    return { id: 0, name: "", lastUpdated: new Date() } as Chef;
  }

  async updateChef(id: number, chef: Partial<InsertChef>): Promise<Chef | undefined> {
    return undefined;
  }

  async deleteChef(id: number): Promise<boolean> {
    return false;
  }

  async getSeason(id: number): Promise<Season | undefined> {
    return undefined;
  }

  async getAllSeasons(): Promise<Season[]> {
    return [];
  }

  async getSeasonsByCountry(country: string): Promise<Season[]> {
    return [];
  }

  async createSeason(season: InsertSeason): Promise<Season> {
    return { id: 0, number: 0, year: 0, title: "", country: "" } as Season;
  }

  async getParticipation(id: number): Promise<Participation | undefined> {
    return undefined;
  }

  async getParticipationsByChef(chefId: number): Promise<Participation[]> {
    return [];
  }

  async getParticipationsBySeason(seasonId: number): Promise<Participation[]> {
    return [];
  }

  async createParticipation(participation: InsertParticipation): Promise<Participation> {
    return { id: 0, chefId: 0, seasonId: 0 } as Participation;
  }

  // Utility methods
  async getCountries(): Promise<string[]> {
    const uniqueCountries = new Set<string>();
    
    // Get unique countries from restaurants
    Array.from(this.restaurants.values()).forEach(restaurant => {
      uniqueCountries.add(restaurant.country);
    });
    
    return Array.from(uniqueCountries).sort();
  }
}

// Export an instance of the DbStorage
export const storage = new DbStorage();
