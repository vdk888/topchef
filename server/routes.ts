import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

// Sample restaurant data - in a real app, this would come from a database
const restaurantData = {
  "USA": [
    { id: 1, chefName: "Harold Dieterle", restaurantName: "Perilla", lat: 40.7308, lng: -74.0021, season: 1, city: "New York", country: "USA" },
    { id: 2, chefName: "Stephanie Izard", restaurantName: "Girl & the Goat", lat: 41.8847, lng: -87.6506, season: 4, city: "Chicago", country: "USA" },
    { id: 3, chefName: "Richard Blais", restaurantName: "Juniper & Ivy", lat: 32.7266, lng: -117.1692, season: 4, city: "San Diego", country: "USA" },
    { id: 4, chefName: "Michael Voltaggio", restaurantName: "ink.well", lat: 34.0522, lng: -118.2437, season: 6, city: "Los Angeles", country: "USA" },
    { id: 5, chefName: "Paul Qui", restaurantName: "Qui", lat: 30.2672, lng: -97.7431, season: 9, city: "Austin", country: "USA" },
    { id: 6, chefName: "Brooke Williamson", restaurantName: "Playa Provisions", lat: 33.9626, lng: -118.4301, season: 10, city: "Los Angeles", country: "USA" },
    { id: 7, chefName: "Joe Flamm", restaurantName: "Rose Mary", lat: 41.8855, lng: -87.6545, season: 15, city: "Chicago", country: "USA" },
    { id: 8, chefName: "Buddha Lo", restaurantName: "Huso", lat: 40.7645, lng: -73.9722, season: 19, city: "New York", country: "USA" }
  ],
  "France": [
    { id: 15, chefName: "Jean-Philippe Doux", restaurantName: "Le Jardin des Sens", lat: 48.8566, lng: 2.3522, season: 3, city: "Paris", country: "France" },
    { id: 16, chefName: "Stéphanie Le Quellec", restaurantName: "La Scène", lat: 43.5298, lng: 5.4474, season: 2, city: "Aix-en-Provence", country: "France" },
    { id: 17, chefName: "Xavier Pincemin", restaurantName: "Signature", lat: 45.7640, lng: 4.8357, season: 7, city: "Lyon", country: "France" },
    { id: 18, chefName: "Coline Faulquier", restaurantName: "Signature", lat: 43.2965, lng: 5.3698, season: 7, city: "Marseille", country: "France" }
  ],
  "Canada": [
    { id: 9, chefName: "Dale MacKay", restaurantName: "Ayden Kitchen & Bar", lat: 52.1332, lng: -106.6700, season: 1, city: "Saskatoon", country: "Canada" },
    { id: 10, chefName: "Carl Heinrich", restaurantName: "Richmond Station", lat: 43.6515, lng: -79.3793, season: 2, city: "Toronto", country: "Canada" }
  ],
  "UK": [
    { id: 11, chefName: "Neven Maguire", restaurantName: "MacNean House", lat: 54.2057, lng: -7.8754, season: 2, city: "Blacklion", country: "UK" },
    { id: 12, chefName: "Tom Kerridge", restaurantName: "The Hand and Flowers", lat: 51.5762, lng: -0.7777, season: 5, city: "Marlow", country: "UK" }
  ],
  "Australia": [
    { id: 13, chefName: "Adam Liaw", restaurantName: "Kuro", lat: -33.8688, lng: 151.2093, season: 2, city: "Sydney", country: "Australia" },
    { id: 14, chefName: "Emelia Jackson", restaurantName: "Emelia Jackson Cake Co", lat: -37.8136, lng: 144.9631, season: 6, city: "Melbourne", country: "Australia" }
  ]
};

// Initialize the storage with restaurant data
const initializeStorage = async () => {
  // Flatten the restaurant data into a single array
  const allRestaurants = Object.values(restaurantData).flat();
  
  // Add each restaurant to storage
  for (const restaurant of allRestaurants) {
    await storage.createRestaurant(restaurant);
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage
  await initializeStorage();
  
  // Get all countries
  app.get('/api/countries', async (req, res) => {
    try {
      const countries = await storage.getCountries();
      res.json(countries);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch countries' });
    }
  });
  
  // Get restaurants by country
  app.get('/api/restaurants', async (req, res) => {
    try {
      const country = req.query.country as string || 'USA';
      const restaurants = await storage.getRestaurantsByCountry(country);
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
  });
  
  // Get a specific restaurant by ID
  app.get('/api/restaurants/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const restaurant = await storage.getRestaurant(id);
      
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      
      res.json(restaurant);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch restaurant' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
