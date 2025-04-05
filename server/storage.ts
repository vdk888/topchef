import { users, type User, type InsertUser, type Restaurant, type InsertRestaurant } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Restaurant related methods
  getRestaurant(id: number): Promise<Restaurant | undefined>;
  getRestaurantsByCountry(country: string): Promise<Restaurant[]>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  getCountries(): Promise<string[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private restaurants: Map<number, Restaurant>;
  private userCurrentId: number;
  private restaurantCurrentId: number;

  constructor() {
    this.users = new Map();
    this.restaurants = new Map();
    this.userCurrentId = 1;
    this.restaurantCurrentId = 1;
  }

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

  // Restaurant methods implementation
  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    return this.restaurants.get(id);
  }

  async getRestaurantsByCountry(country: string): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values()).filter(
      (restaurant) => restaurant.country === country
    );
  }

  async createRestaurant(insertRestaurant: InsertRestaurant): Promise<Restaurant> {
    const id = this.restaurantCurrentId++;
    const restaurant: Restaurant = { ...insertRestaurant, id };
    this.restaurants.set(id, restaurant);
    return restaurant;
  }

  async getCountries(): Promise<string[]> {
    const uniqueCountries = new Set<string>();
    
    // Get unique countries from restaurants
    Array.from(this.restaurants.values()).forEach(restaurant => {
      uniqueCountries.add(restaurant.country);
    });
    
    return Array.from(uniqueCountries).sort();
  }
}

export const storage = new MemStorage();
