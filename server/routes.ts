import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

// Sample restaurant data - in a real app, this would come from a database
const restaurantData = {
  "USA": [
    // Season 1
    { id: 1, chefName: "Harold Dieterle", restaurantName: "Perilla", lat: 40.7308, lng: -74.0021, season: 1, city: "New York", country: "USA" },
    { id: 2, chefName: "Tiffani Faison", restaurantName: "Sweet Cheeks Q", lat: 42.3467, lng: -71.0972, season: 1, city: "Boston", country: "USA" },
    { id: 3, chefName: "Dave Martin", restaurantName: "The Meatball Factory", lat: 40.7314, lng: -73.9846, season: 1, city: "New York", country: "USA" },
    // Season 2
    { id: 4, chefName: "Ilan Hall", restaurantName: "The Gorbals", lat: 40.7128, lng: -73.9554, season: 2, city: "Brooklyn", country: "USA" },
    { id: 5, chefName: "Sam Talbot", restaurantName: "Pretty Southern", lat: 40.7223, lng: -73.9503, season: 2, city: "Brooklyn", country: "USA" },
    // Season 3
    { id: 6, chefName: "Hung Huynh", restaurantName: "Warrior", lat: 25.7617, lng: -80.1918, season: 3, city: "Miami", country: "USA" },
    { id: 7, chefName: "Dale Levitski", restaurantName: "Frog N Snail", lat: 41.9296, lng: -87.6438, season: 3, city: "Chicago", country: "USA" },
    // Season 4
    { id: 8, chefName: "Stephanie Izard", restaurantName: "Girl & the Goat", lat: 41.8847, lng: -87.6506, season: 4, city: "Chicago", country: "USA" },
    { id: 9, chefName: "Richard Blais", restaurantName: "Juniper & Ivy", lat: 32.7266, lng: -117.1692, season: 4, city: "San Diego", country: "USA" },
    { id: 10, chefName: "Antonia Lofaso", restaurantName: "DAMA", lat: 34.0464, lng: -118.2403, season: 4, city: "Los Angeles", country: "USA" },
    // Season 5
    { id: 11, chefName: "Hosea Rosenberg", restaurantName: "Blackbelly", lat: 40.0149, lng: -105.2474, season: 5, city: "Boulder", country: "USA" },
    { id: 12, chefName: "Carla Hall", restaurantName: "Carla Hall's Southern Kitchen", lat: 40.7286, lng: -73.9557, season: 5, city: "Brooklyn", country: "USA" },
    // Season 6
    { id: 13, chefName: "Michael Voltaggio", restaurantName: "ink.well", lat: 34.0522, lng: -118.2437, season: 6, city: "Los Angeles", country: "USA" },
    { id: 14, chefName: "Bryan Voltaggio", restaurantName: "Volt", lat: 39.4143, lng: -77.4105, season: 6, city: "Frederick", country: "USA" },
    { id: 15, chefName: "Kevin Gillespie", restaurantName: "Gunshow", lat: 33.7490, lng: -84.3880, season: 6, city: "Atlanta", country: "USA" },
    // Season 7
    { id: 16, chefName: "Kevin Sbraga", restaurantName: "Sbraga", lat: 39.9526, lng: -75.1652, season: 7, city: "Philadelphia", country: "USA" },
    { id: 17, chefName: "Ed Cotton", restaurantName: "Sotto 13", lat: 40.7359, lng: -74.0041, season: 7, city: "New York", country: "USA" },
    // Season 8
    { id: 18, chefName: "Richard Blais", restaurantName: "The Spence", lat: 33.7756, lng: -84.3885, season: 8, city: "Atlanta", country: "USA" },
    { id: 19, chefName: "Mike Isabella", restaurantName: "Graffiato", lat: 38.8951, lng: -77.0364, season: 8, city: "Washington DC", country: "USA" },
    // Season 9
    { id: 20, chefName: "Paul Qui", restaurantName: "Qui", lat: 30.2672, lng: -97.7431, season: 9, city: "Austin", country: "USA" },
    { id: 21, chefName: "Sarah Grueneberg", restaurantName: "Monteverde", lat: 41.8881, lng: -87.6594, season: 9, city: "Chicago", country: "USA" },
    // Season 10
    { id: 22, chefName: "Kristen Kish", restaurantName: "Arlo Grey", lat: 30.2631, lng: -97.7417, season: 10, city: "Austin", country: "USA" },
    { id: 23, chefName: "Brooke Williamson", restaurantName: "Playa Provisions", lat: 33.9626, lng: -118.4301, season: 10, city: "Los Angeles", country: "USA" },
    // Season 11
    { id: 24, chefName: "Nicholas Elmi", restaurantName: "Laurel", lat: 39.9340, lng: -75.1748, season: 11, city: "Philadelphia", country: "USA" },
    { id: 25, chefName: "Nina Compton", restaurantName: "Compère Lapin", lat: 29.9427, lng: -90.0679, season: 11, city: "New Orleans", country: "USA" },
    // Season 12
    { id: 26, chefName: "Mei Lin", restaurantName: "Nightshade", lat: 34.0403, lng: -118.2352, season: 12, city: "Los Angeles", country: "USA" },
    { id: 27, chefName: "Gregory Gourdet", restaurantName: "Kann", lat: 45.5231, lng: -122.6765, season: 12, city: "Portland", country: "USA" },
    // Season 13
    { id: 28, chefName: "Jeremy Ford", restaurantName: "Stubborn Seed", lat: 25.7779, lng: -80.1323, season: 13, city: "Miami", country: "USA" },
    { id: 29, chefName: "Amar Santana", restaurantName: "Broadway by Amar Santana", lat: 33.5427, lng: -117.7854, season: 13, city: "Laguna Beach", country: "USA" },
    // Season 14
    { id: 30, chefName: "Brooke Williamson", restaurantName: "The Tripel", lat: 33.9801, lng: -118.4200, season: 14, city: "Los Angeles", country: "USA" },
    { id: 31, chefName: "Shirley Chung", restaurantName: "Ms Chi Cafe", lat: 34.0516, lng: -118.3992, season: 14, city: "Los Angeles", country: "USA" },
    // Season 15
    { id: 32, chefName: "Joe Flamm", restaurantName: "Rose Mary", lat: 41.8855, lng: -87.6545, season: 15, city: "Chicago", country: "USA" },
    { id: 33, chefName: "Adrienne Cheatham", restaurantName: "Sunday Best", lat: 40.8115, lng: -73.9464, season: 15, city: "New York", country: "USA" },
    // Season 16
    { id: 34, chefName: "Kelsey Barnard Clark", restaurantName: "KBC", lat: 31.3230, lng: -85.3938, season: 16, city: "Dothan", country: "USA" },
    { id: 35, chefName: "Sara Bradley", restaurantName: "Freight House", lat: 37.0834, lng: -88.6351, season: 16, city: "Paducah", country: "USA" },
    // Season 17
    { id: 36, chefName: "Melissa King", restaurantName: "King's Kitchen", lat: 37.7749, lng: -122.4194, season: 17, city: "San Francisco", country: "USA" },
    { id: 37, chefName: "Bryan Voltaggio", restaurantName: "Thacher & Rye", lat: 39.4143, lng: -77.4105, season: 17, city: "Frederick", country: "USA" },
    // Season 18
    { id: 38, chefName: "Gabe Erales", restaurantName: "Bacalar", lat: 30.2650, lng: -97.7469, season: 18, city: "Austin", country: "USA" },
    { id: 39, chefName: "Dawn Burrell", restaurantName: "Late August", lat: 29.7604, lng: -95.3698, season: 18, city: "Houston", country: "USA" },
    // Season 19
    { id: 40, chefName: "Buddha Lo", restaurantName: "Huso", lat: 40.7645, lng: -73.9722, season: 19, city: "New York", country: "USA" },
    { id: 41, chefName: "Evelyn Garcia", restaurantName: "Jūn", lat: 29.7530, lng: -95.3512, season: 19, city: "Houston", country: "USA" },
    // Season 20
    { id: 42, chefName: "Buddha Lo", restaurantName: "Marky's Caviar", lat: 40.7736, lng: -73.9566, season: 20, city: "New York", country: "USA" },
    { id: 43, chefName: "Sara Bradley", restaurantName: "Freight House", lat: 37.0834, lng: -88.6351, season: 20, city: "Paducah", country: "USA" }
  ],
  "France": [
    // Top Chef France Seasons
    { id: 50, chefName: "Jean-François Piège", restaurantName: "Le Grand Restaurant", lat: 48.8707, lng: 2.3072, season: 1, city: "Paris", country: "France" },
    { id: 51, chefName: "Ghislaine Arabian", restaurantName: "Les Petites Sorcières", lat: 48.8367, lng: 2.3403, season: 1, city: "Paris", country: "France" },
    { id: 52, chefName: "Stéphanie Le Quellec", restaurantName: "La Scène", lat: 48.8704, lng: 2.3073, season: 2, city: "Paris", country: "France" },
    { id: 53, chefName: "Ronan Kernen", restaurantName: "La Villa Madie", lat: 43.2047, lng: 5.5385, season: 2, city: "Cassis", country: "France" },
    { id: 54, chefName: "Jean-Philippe Doux", restaurantName: "Le Jardin des Sens", lat: 43.6109, lng: 3.8772, season: 3, city: "Montpellier", country: "France" },
    { id: 55, chefName: "Naoëlle D'Hainaut", restaurantName: "L'Or Q'idée", lat: 49.0586, lng: 2.1005, season: 4, city: "L'Isle-Adam", country: "France" },
    { id: 56, chefName: "Pierre Augé", restaurantName: "La Maison de Petit Pierre", lat: 43.3409, lng: 3.2164, season: 5, city: "Béziers", country: "France" },
    { id: 57, chefName: "Xavier Koenig", restaurantName: "Restaurant Xavier Koenig", lat: 47.9432, lng: 7.2660, season: 6, city: "Colmar", country: "France" },
    { id: 58, chefName: "Xavier Pincemin", restaurantName: "Le Trianon Palace", lat: 48.8048, lng: 2.1118, season: 7, city: "Versailles", country: "France" },
    { id: 59, chefName: "Coline Faulquier", restaurantName: "Signature", lat: 43.2965, lng: 5.3698, season: 7, city: "Marseille", country: "France" },
    { id: 60, chefName: "Jérémie Izarn", restaurantName: "La Tour d'Argent", lat: 48.8512, lng: 2.3541, season: 8, city: "Paris", country: "France" },
    { id: 61, chefName: "Camille Delcroix", restaurantName: "Le Bacchus", lat: 50.9308, lng: 1.6966, season: 9, city: "Calais", country: "France" },
    { id: 62, chefName: "Samuel Albert", restaurantName: "Les Petits Prés", lat: 47.4745, lng: -0.5512, season: 10, city: "Angers", country: "France" },
    { id: 63, chefName: "David Gallienne", restaurantName: "Le Jardin des Plumes", lat: 49.0778, lng: 1.5805, season: 11, city: "Giverny", country: "France" },
    { id: 64, chefName: "Mohamed Cheikh", restaurantName: "Manzili", lat: 48.8566, lng: 2.3522, season: 12, city: "Paris", country: "France" },
    { id: 65, chefName: "Louise Bourrat", restaurantName: "Bourrache", lat: 38.7223, lng: -9.1393, season: 13, city: "Lisbon", country: "France" },
    { id: 66, chefName: "Hugo Riboulet", restaurantName: "Table du Chef", lat: 48.8566, lng: 2.3522, season: 14, city: "Paris", country: "France" }
  ],
  "Canada": [
    { id: 80, chefName: "Dale MacKay", restaurantName: "Ayden Kitchen & Bar", lat: 52.1332, lng: -106.6700, season: 1, city: "Saskatoon", country: "Canada" },
    { id: 81, chefName: "Connie DeSousa", restaurantName: "CHARCUT Roast House", lat: 51.0447, lng: -114.0719, season: 1, city: "Calgary", country: "Canada" },
    { id: 82, chefName: "Carl Heinrich", restaurantName: "Richmond Station", lat: 43.6515, lng: -79.3793, season: 2, city: "Toronto", country: "Canada" },
    { id: 83, chefName: "Jonathan Goodyear", restaurantName: "Magna Golf Club", lat: 43.9474, lng: -79.4837, season: 2, city: "Aurora", country: "Canada" },
    { id: 84, chefName: "Matthew Stowe", restaurantName: "Bench Kitchen + Bar", lat: 49.2827, lng: -123.1207, season: 3, city: "Vancouver", country: "Canada" },
    { id: 85, chefName: "René Rodriguez", restaurantName: "Navarra", lat: 45.4231, lng: -75.6931, season: 4, city: "Ottawa", country: "Canada" },
    { id: 86, chefName: "Nicole Gomes", restaurantName: "Nicole Gourmet", lat: 51.0447, lng: -114.0719, season: 5, city: "Calgary", country: "Canada" },
    { id: 87, chefName: "Ross Larkin", restaurantName: "Raymonds", lat: 47.5615, lng: -52.7126, season: 6, city: "St. John's", country: "Canada" },
    { id: 88, chefName: "Paul Moran", restaurantName: "1909 Kitchen", lat: 49.1530, lng: -125.9130, season: 7, city: "Tofino", country: "Canada" },
    { id: 89, chefName: "Francis Blais", restaurantName: "Menu Extra", lat: 45.5017, lng: -73.5673, season: 8, city: "Montreal", country: "Canada" }
  ],
  "UK": [
    { id: 100, chefName: "Neven Maguire", restaurantName: "MacNean House", lat: 54.2057, lng: -7.8754, season: 2, city: "Blacklion", country: "UK" },
    { id: 101, chefName: "Steven Wallis", restaurantName: "Chez Bruce", lat: 51.4454, lng: -0.1687, season: 2, city: "London", country: "UK" },
    { id: 102, chefName: "Tom Kerridge", restaurantName: "The Hand and Flowers", lat: 51.5762, lng: -0.7777, season: 5, city: "Marlow", country: "UK" },
    { id: 103, chefName: "Kenny Atkinson", restaurantName: "House of Tides", lat: 54.9683, lng: -1.6078, season: 5, city: "Newcastle", country: "UK" },
    { id: 104, chefName: "Adam Handling", restaurantName: "Frog by Adam Handling", lat: 51.5074, lng: -0.1278, season: 8, city: "London", country: "UK" },
    { id: 105, chefName: "Mark Birchall", restaurantName: "Moor Hall", lat: 53.5420, lng: -2.8880, season: 8, city: "Lancashire", country: "UK" },
    { id: 106, chefName: "Simon Rogan", restaurantName: "L'Enclume", lat: 54.2000, lng: -2.9500, season: 10, city: "Cumbria", country: "UK" },
    { id: 107, chefName: "Lisa Goodwin-Allen", restaurantName: "Northcote", lat: 53.8150, lng: -2.4420, season: 10, city: "Lancashire", country: "UK" },
    { id: 108, chefName: "Aktar Islam", restaurantName: "Opheem", lat: 52.4862, lng: -1.9093, season: 11, city: "Birmingham", country: "UK" },
    { id: 109, chefName: "Tom Barnes", restaurantName: "Skof", lat: 54.5780, lng: -2.7970, season: 12, city: "Lake District", country: "UK" }
  ],
  "Australia": [
    { id: 120, chefName: "Julie Goodwin", restaurantName: "Julie's Place", lat: -33.4272, lng: 151.3431, season: 1, city: "Central Coast", country: "Australia" },
    { id: 121, chefName: "Poh Ling Yeow", restaurantName: "Jamface", lat: -34.9285, lng: 138.6007, season: 1, city: "Adelaide", country: "Australia" },
    { id: 122, chefName: "Adam Liaw", restaurantName: "Kuro", lat: -33.8688, lng: 151.2093, season: 2, city: "Sydney", country: "Australia" },
    { id: 123, chefName: "Callum Hann", restaurantName: "Sprout", lat: -34.9285, lng: 138.6007, season: 2, city: "Adelaide", country: "Australia" },
    { id: 124, chefName: "Kate Bracks", restaurantName: "The Sweet Lioness", lat: -33.2835, lng: 149.1012, season: 3, city: "Orange", country: "Australia" },
    { id: 125, chefName: "Michael Weldon", restaurantName: "Little Wolf", lat: -34.9285, lng: 138.6007, season: 3, city: "Adelaide", country: "Australia" },
    { id: 126, chefName: "Andy Allen", restaurantName: "Three Blue Ducks", lat: -33.8688, lng: 151.2093, season: 4, city: "Sydney", country: "Australia" },
    { id: 127, chefName: "Julia Taylor", restaurantName: "Julia Taylor Food", lat: -37.8136, lng: 144.9631, season: 4, city: "Melbourne", country: "Australia" },
    { id: 128, chefName: "Emma Dean", restaurantName: "Spade & Spoon", lat: -37.8136, lng: 144.9631, season: 5, city: "Melbourne", country: "Australia" },
    { id: 129, chefName: "Lynton Tapp", restaurantName: "The Honey Badger Dessert Cafe", lat: -12.4634, lng: 130.8456, season: 5, city: "Darwin", country: "Australia" },
    { id: 130, chefName: "Brent Owens", restaurantName: "Healthy Everyday", lat: -37.8136, lng: 144.9631, season: 6, city: "Melbourne", country: "Australia" },
    { id: 131, chefName: "Emelia Jackson", restaurantName: "Emelia Jackson Cake Co", lat: -37.8136, lng: 144.9631, season: 6, city: "Melbourne", country: "Australia" },
    { id: 132, chefName: "Billie McKay", restaurantName: "The Fat Rabbit", lat: -30.2962, lng: 153.1185, season: 7, city: "Bowraville", country: "Australia" },
    { id: 133, chefName: "Georgia Barnes", restaurantName: "G's Wellness", lat: -27.4698, lng: 153.0251, season: 7, city: "Brisbane", country: "Australia" },
    { id: 134, chefName: "Elena Duggan", restaurantName: "Elena Duggan Catering", lat: -33.8688, lng: 151.2093, season: 8, city: "Sydney", country: "Australia" },
    { id: 135, chefName: "Matt Sinclair", restaurantName: "Sum Yung Guys", lat: -26.3980, lng: 153.0937, season: 8, city: "Sunshine Coast", country: "Australia" }
  ],
  "Spain": [
    { id: 140, chefName: "Rakel Cernicharo", restaurantName: "La Salita", lat: 39.4699, lng: -0.3763, season: 1, city: "Valencia", country: "Spain" },
    { id: 141, chefName: "Begoña Rodrigo", restaurantName: "La Salita", lat: 39.4699, lng: -0.3763, season: 1, city: "Valencia", country: "Spain" },
    { id: 142, chefName: "Antonio Arrabal", restaurantName: "Gastrobar KaButo", lat: 40.4168, lng: -3.7038, season: 2, city: "Madrid", country: "Spain" },
    { id: 143, chefName: "Jorge Brazalez", restaurantName: "El Circo", lat: 40.4168, lng: -3.7038, season: 5, city: "Madrid", country: "Spain" },
    { id: 144, chefName: "Marta Verona", restaurantName: "ElBulli", lat: 42.2506, lng: 3.2273, season: 6, city: "Roses", country: "Spain" },
    { id: 145, chefName: "Ana Iglesias", restaurantName: "Zallo", lat: 40.4290, lng: -3.7024, season: 8, city: "Madrid", country: "Spain" }
  ],
  "Mexico": [
    { id: 160, chefName: "Israel Gaytán", restaurantName: "Guzina Oaxaca", lat: 19.4326, lng: -99.1332, season: 1, city: "Mexico City", country: "Mexico" },
    { id: 161, chefName: "Zahie Téllez", restaurantName: "Jose Guadalupe", lat: 25.6866, lng: -100.3161, season: 2, city: "Monterrey", country: "Mexico" },
    { id: 162, chefName: "Ignacio Ovalle", restaurantName: "Meriquio", lat: 20.9674, lng: -89.5926, season: 3, city: "Mérida", country: "Mexico" },
    { id: 163, chefName: "Fanny Carrillo", restaurantName: "Mesa Franca", lat: 19.4326, lng: -99.1332, season: 4, city: "Mexico City", country: "Mexico" }
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
