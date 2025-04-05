import { pgTable, text, serial, integer, numeric } from "drizzle-orm/pg-core";
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

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  chefName: text("chef_name").notNull(),
  restaurantName: text("restaurant_name").notNull(),
  lat: numeric("lat").notNull(),
  lng: numeric("lng").notNull(),
  season: integer("season").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
});

export const insertRestaurantSchema = createInsertSchema(restaurants);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
