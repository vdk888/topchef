import { pgTable, text, serial, integer, numeric, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Chefs/Participants table
export const chefs = pgTable("chefs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  imageUrl: text("image_url"),
  status: text("status"), // active, retired, etc.
  lastUpdated: timestamp("last_updated").defaultNow(),
  perplexityData: json("perplexity_data"), // Store raw data from Perplexity API
});

// Seasons table
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  year: integer("year").notNull(),
  title: text("title").notNull(),
  country: text("country").notNull(),
  numberOfEpisodes: integer("number_of_episodes"),
  winner: text("winner"),
});

// Participation table (relates chefs to seasons)
export const participations = pgTable("participations", {
  id: serial("id").primaryKey(),
  chefId: integer("chef_id").notNull(),
  seasonId: integer("season_id").notNull(),
  placement: integer("placement"), // final position
  isWinner: boolean("is_winner").default(false),
  eliminated: boolean("eliminated").default(true),
  eliminatedEpisode: integer("eliminated_episode"),
  winCount: integer("win_count").default(0),
  notes: text("notes"),
});

// Restaurants table 
export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  chefId: integer("chef_id").notNull(), // Foreign key to chefs table
  restaurantName: text("restaurant_name").notNull(),
  description: text("description"),
  lat: numeric("lat").notNull(),
  lng: numeric("lng").notNull(),
  address: text("address"), // Added address field
  seasonId: integer("season_id"), // Can be nullable (may not be directly tied to a season)
  city: text("city").notNull(),
  country: text("country").notNull(),
  isCurrent: boolean("is_current").default(true), // Whether this is a current restaurant
  dateOpened: timestamp("date_opened"),
  dateClosed: timestamp("date_closed"),
  lastUpdated: timestamp("last_updated").defaultNow(), // General record update time
  // Granular timestamps for key fields - made nullable with defaultNow()
  chefAssociationLastUpdated: timestamp("chef_association_last_updated").defaultNow(),
  addressLastUpdated: timestamp("address_last_updated").defaultNow(),
  restaurantNameLastUpdated: timestamp("restaurant_name_last_updated").defaultNow(),
});

// Create insert schemas
export const insertChefSchema = createInsertSchema(chefs);
export const insertSeasonSchema = createInsertSchema(seasons);
export const insertParticipationSchema = createInsertSchema(participations);
export const insertRestaurantSchema = createInsertSchema(restaurants);

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type Chef = typeof chefs.$inferSelect;
export type InsertChef = z.infer<typeof insertChefSchema>;

export type Season = typeof seasons.$inferSelect;
export type InsertSeason = z.infer<typeof insertSeasonSchema>;

export type Participation = typeof participations.$inferSelect;
export type InsertParticipation = z.infer<typeof insertParticipationSchema>;

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;

// New type combining Restaurant with seasonNumber and chefName for frontend use
export type RestaurantWithDetails = Restaurant & {
  seasonNumber: number | null;
  chefName: string | null;
};
