import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type RestaurantWithSeasonNumber } from "./storage"; // Import RestaurantWithSeasonNumber
import { db } from "./db";
import { restaurants, chefs, participations, seasons, Restaurant } from "../shared/schema";
import fetch from "node-fetch";
import { OpenAI } from "openai";
import { sql, desc, max, or, isNull, lt, and, eq } from "drizzle-orm"; // Import and, eq
// Removed duplicate: import { db } from "./db"; 

// Helper function to call Perplexity API
async function callPerplexity(prompt: string, systemPrompt?: string): Promise<string | null> {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    console.error("Perplexity API key not configured");
    return null; // Or throw an error
  }

  const url = "https://api.perplexity.ai/chat/completions";
  const payload = {
    model: "llama-3.1-sonar-small-128k-online", // Or another suitable model
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are an AI assistant providing information about Top Chef seasons and contestants. Respond accurately and concisely." 
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3, // Adjust as needed
    top_p: 0.9,
    return_images: false,
    stream: false,
    presence_penalty: 0,
    frequency_penalty: 1
  };

  try {
    console.log(`Calling Perplexity with prompt: ${prompt.substring(0, 100)}...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error('Perplexity API error:', data);
      return null; // Indicate failure
    }

    return data.choices?.[0]?.message?.content || null; // Return the content or null
  } catch (error) {
    console.error('Error calling Perplexity API:', error);
    return null; // Indicate failure
  }
}

// Helper function to call OpenRouter API
async function callOpenRouter(prompt: string, systemPrompt?: string): Promise<string | null> {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    console.error("OpenRouter API key not configured");
    return null;
  }

  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openrouterApiKey,
    });

    console.log(`Calling OpenRouter with prompt: ${prompt.substring(0, 100)}...`);
    const completion = await client.chat.completions.create({
      model: "deepseek/deepseek-v3-base:free", // Or another suitable model
      messages: [
        {
          role: "system",
          content: systemPrompt || "You are a helpful AI assistant."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3, // Adjust as needed
      max_tokens: 1024,
    });

    return completion.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error calling OpenRouter API:', error);
    return null;
  }
}


// Function to clear database tables
const clearDatabase = async () => {
  try {
    await db.delete(restaurants);
    await db.delete(chefs);
    await db.delete(participations);
    await db.delete(seasons);
    console.log("Database tables cleared successfully");
  } catch (error) {
    console.error("Error clearing database:", error);
  }
};

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
/**
 * This function initializes the database with sample data.
 * It's used only if the database is empty upon app startup.
 * For full seeding, use the seed.ts script.
 */
const initializeStorage = async () => {
  // Check if we have any data in the database before initializing
  const countries = await storage.getCountries();
  
  // Skip initialization if we already have data
  if (countries.length > 0) {
    // Force re-initialization for testing purposes - remove this in production
    await clearDatabase();
    console.log('Cleared existing data for re-initialization...');
  }
  
  console.log('Initializing database with sample data...');
  
  // Create seasons for each country
  console.log('Creating seasons...');
  const seasonsMap = new Map();
  
  // Create seasons for US
  for (let i = 1; i <= 20; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2005 + i,
      title: `Top Chef Season ${i}`,
      country: "USA",
      numberOfEpisodes: 12 + Math.floor(Math.random() * 4), // Random number of episodes between 12-15
      winner: null
    });
    seasonsMap.set(`USA-${i}`, season.id);
  }
  
  // Create seasons for France
  for (let i = 1; i <= 14; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2010 + i,
      title: `Top Chef France Season ${i}`,
      country: "France",
      numberOfEpisodes: 10 + Math.floor(Math.random() * 5), // Random number of episodes between 10-14
      winner: null
    });
    seasonsMap.set(`France-${i}`, season.id);
  }
  
  // Create seasons for Canada
  for (let i = 1; i <= 8; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2011 + i,
      title: `Top Chef Canada Season ${i}`,
      country: "Canada",
      numberOfEpisodes: 9 + Math.floor(Math.random() * 5), // Random number of episodes between 9-13
      winner: null
    });
    seasonsMap.set(`Canada-${i}`, season.id);
  }
  
  // Create seasons for UK
  for (let i = 1; i <= 12; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2008 + i,
      title: `MasterChef UK Season ${i}`,
      country: "UK",
      numberOfEpisodes: 10 + Math.floor(Math.random() * 6), // Random number of episodes between 10-15
      winner: null
    });
    seasonsMap.set(`UK-${i}`, season.id);
  }
  
  // Create seasons for Australia
  for (let i = 1; i <= 8; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2009 + i,
      title: `MasterChef Australia Season ${i}`,
      country: "Australia",
      numberOfEpisodes: 12 + Math.floor(Math.random() * 8), // Random number of episodes between 12-19
      winner: null
    });
    seasonsMap.set(`Australia-${i}`, season.id);
  }
  
  // Create seasons for Spain
  for (let i = 1; i <= 7; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2013 + i,
      title: `Top Chef Spain Season ${i}`,
      country: "Spain",
      numberOfEpisodes: 10 + Math.floor(Math.random() * 4), // Random number of episodes between 10-13
      winner: null
    });
    seasonsMap.set(`Spain-${i}`, season.id);
  }
  
  console.log('Creating restaurants and chefs...');
  // Flatten the restaurant data into a single array
  const allRestaurants = Object.values(restaurantData).flat();
  
  // Add each restaurant to storage with correct typing
  for (const restaurant of allRestaurants) {
    // First ensure the chef exists
    let chef = await storage.getChefByName(restaurant.chefName);
    
    if (!chef) {
      // Create chef if they don't exist
      chef = await storage.createChef({
        name: restaurant.chefName,
        status: "active",
        lastUpdated: new Date()
      });
    }
    
    // Map the season number to the season ID using the country and season
    const seasonKey = `${restaurant.country}-${restaurant.season}`;
    const seasonId = seasonsMap.get(seasonKey);
    
    if (!seasonId) {
      console.warn(`No season found for key: ${seasonKey}`);
    }
    
    // Create the restaurant linked to the chef
    await storage.createRestaurant({
      chefId: chef.id,
      restaurantName: restaurant.restaurantName,
      description: `Restaurant by ${restaurant.chefName}`,
      lat: restaurant.lat.toString(),
      lng: restaurant.lng.toString(),
      seasonId: seasonId || null,
      city: restaurant.city,
      country: restaurant.country,
      isCurrent: true,
      lastUpdated: new Date(),
      dateOpened: null,
      dateClosed: null
    });
    
    // Create participation record if we have a valid seasonId
    if (seasonId) {
      try {
        await storage.createParticipation({
          chefId: chef.id,
          seasonId: seasonId,
          placement: Math.floor(Math.random() * 10) + 1, // Random placement between 1-10
          eliminated: Math.random() > 0.2, // 80% chance of being eliminated
          winCount: Math.floor(Math.random() * 3) // 0-2 wins
        });
      } catch (error) {
        console.error(`Error creating participation for chef ${chef.id} and season ${seasonId}:`, error);
      }
    }
  }
  
  console.log('Database initialization complete.');
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
  
  // Get restaurants by country (and optionally by season)
  app.get('/api/restaurants', async (req, res) => {
    try {
      const country = req.query.country as string || 'USA';
      const seasonQuery = req.query.season as string | undefined;
      const parsedSeasonId = seasonQuery ? parseInt(seasonQuery) : undefined;

      // Validate seasonId if provided
      if (seasonQuery && (isNaN(Number(parsedSeasonId)) || (parsedSeasonId !== undefined && parsedSeasonId <= 0))) {
         return res.status(400).json({ error: 'Invalid season parameter' });
      }
      
      // Ensure we pass either a valid number or undefined
      const validSeasonId = (parsedSeasonId !== undefined && !isNaN(Number(parsedSeasonId)) && parsedSeasonId > 0) ? parsedSeasonId : undefined;

      console.log(`Fetching restaurants for country: ${country}` + (validSeasonId ? ` and season ID: ${validSeasonId}` : ''));
      // Explicitly type the result variable to match storage return type
      const restaurants: RestaurantWithSeasonNumber[] = await storage.getRestaurantsByCountry(country, validSeasonId); 
      res.json(restaurants);
    } catch (error) {
      console.error('Error fetching restaurants:', error); // Log the specific error
      res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
  });
  
  // Get restaurants with chef information
  app.get('/api/restaurants-with-chefs', async (req, res) => {
    try {
      const country = req.query.country as string || 'USA';
      const restaurants = await storage.getRestaurantsByCountry(country);
      
      // Get chef information for each restaurant
      const restaurantsWithChefs = await Promise.all(
        restaurants.map(async (restaurant) => {
          const chef = await storage.getChef(restaurant.chefId);
          return {
            ...restaurant,
            chef: chef || null
          };
        })
      );
      
      res.json(restaurantsWithChefs);
    } catch (error) {
      console.error('Error fetching restaurants with chefs:', error);
      res.status(500).json({ error: 'Failed to fetch restaurants with chefs' });
    }
  });
  
  // Get a specific restaurant by ID with chef information
  app.get('/api/restaurants/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const restaurant = await storage.getRestaurant(id);
      
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      
      // Get chef information
      const chef = await storage.getChef(restaurant.chefId);
      
      // Get season information
      const season = restaurant.seasonId ? await storage.getSeason(restaurant.seasonId) : null;
      
      res.json({
        ...restaurant,
        chef: chef || null,
        season: season || null
      });
    } catch (error) {
      console.error('Error fetching restaurant details:', error);
      res.status(500).json({ error: 'Failed to fetch restaurant details' });
    }
  });

  // Get all chefs
  app.get('/api/chefs', async (req, res) => {
    try {
      const chefs = await storage.getAllChefs();
      res.json(chefs);
    } catch (error) {
      console.error('Error fetching chefs:', error);
      res.status(500).json({ error: 'Failed to fetch chefs' });
    }
  });

  // Get chef by ID
  app.get('/api/chefs/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const chef = await storage.getChef(id);
      
      if (!chef) {
        return res.status(404).json({ error: 'Chef not found' });
      }
      
      // Get restaurants owned by this chef
      const restaurants = await storage.getRestaurantsByChef(id);
      
      // Get seasons participated in
      const participations = await storage.getParticipationsByChef(id);
      
      // Get seasons data
      const seasonPromises = participations.map(p => storage.getSeason(p.seasonId));
      const seasons = await Promise.all(seasonPromises);
      
      res.json({
        ...chef,
        restaurants,
        participations,
        seasons: seasons.filter(Boolean) // Filter out any null seasons
      });
    } catch (error) {
      console.error('Error fetching chef details:', error);
      res.status(500).json({ error: 'Failed to fetch chef details' });
    }
  });

  // Get all seasons
  app.get('/api/seasons', async (req, res) => {
    try {
      const seasons = await storage.getAllSeasons();
      res.json(seasons);
    } catch (error) {
      console.error('Error fetching seasons:', error);
      res.status(500).json({ error: 'Failed to fetch seasons' });
    }
  });

  // Get seasons by country
  app.get('/api/seasons/country/:country', async (req, res) => {
    try {
      const country = req.params.country;
      const seasons = await storage.getSeasonsByCountry(country);
      res.json(seasons);
    } catch (error) {
      console.error('Error fetching seasons by country:', error);
      res.status(500).json({ error: 'Failed to fetch seasons by country' });
    }
  });

  // Get season by ID with participants
  app.get('/api/seasons/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const season = await storage.getSeason(id);
      
      if (!season) {
        return res.status(404).json({ error: 'Season not found' });
      }
      
      // Get participations for this season
      const participations = await storage.getParticipationsBySeason(id);
      
      // Get chef details for each participation
      const chefPromises = participations.map(p => storage.getChef(p.chefId));
      const chefs = await Promise.all(chefPromises);
      
      res.json({
        ...season,
        participations,
        chefs: chefs.filter(Boolean) // Filter out any null chefs
      });
    } catch (error) {
      console.error('Error fetching season details:', error);
      res.status(500).json({ error: 'Failed to fetch season details' });
    }
  });

  // Endpoint for Perplexity API to get chef information
  app.get('/api/chef-info', async (req, res) => {
    try {
      const { chefName, restaurantName } = req.query;
      
      if (!chefName || typeof chefName !== 'string') {
        return res.status(400).json({ error: "Chef name is required" });
      }

      const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!perplexityApiKey) {
        return res.status(500).json({ error: "Perplexity API key not configured" });
      }

      const url = "https://api.perplexity.ai/chat/completions";
      const query = restaurantName && typeof restaurantName === 'string'
        ? `Tell me about Top Chef contestant ${chefName} and their restaurant ${restaurantName}. Include current status, career highlights, and any recent news or awards.`
        : `Tell me about Top Chef contestant ${chefName}. Include their Top Chef journey, current restaurants, career highlights, and any recent news or awards.`;

      const payload = {
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a knowledgeable assistant providing information about Top Chef contestants. Be accurate, engaging, and concise. Format your response in clear paragraphs with information about: 1) Their Top Chef journey, 2) Current restaurant(s), 3) Recent career updates, 4) Any interesting facts or awards."
          },
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.3,
        top_p: 0.9,
        return_images: false,
        stream: false,
        presence_penalty: 0,
        frequency_penalty: 1
      };

      console.log(`Fetching chef info for: ${chefName}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;
      
      if (!response.ok) {
        console.error('Perplexity API error:', data);
        return res.status(500).json({ error: "Failed to fetch chef information" });
      }
      
      const perplexityInfo = data.choices?.[0]?.message?.content || "Information not available";

      // Attempt to update the chef's bio in the database
      try {
        const chef = await storage.getChefByName(chefName);
        if (chef) {
          console.log(`Updating bio for chef ID: ${chef.id}`);
          await storage.updateChef(chef.id, {
            bio: perplexityInfo,
            lastUpdated: new Date()
          });
        } else {
          console.warn(`Chef not found in DB: ${chefName}. Cannot update bio.`);
        }
      } catch (dbError) {
        console.error(`Failed to update chef bio in DB for ${chefName}:`, dbError);
        // Don't fail the request, just log the error
      }

      return res.json({
        information: perplexityInfo,
        citations: data.citations || []
      });
    } catch (error) {
      console.error('Error fetching/updating chef information:', error);
      return res.status(500).json({ error: "Failed to fetch chef information" });
    }
  });
  
  // Get restaurant details using OpenRouter and deepseek model
  app.get('/api/restaurant-details', async (req, res) => {
    try {
      const { chefName, restaurantName, country, city } = req.query;
      
      if (!chefName || typeof chefName !== 'string' || !restaurantName || typeof restaurantName !== 'string') {
        return res.status(400).json({ error: "Chef name and restaurant name are required" });
      }

      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      
      if (!openrouterApiKey) {
        return res.status(500).json({ error: "OpenRouter API key not configured" });
      }

      // Initialize OpenAI client with OpenRouter base URL
      const client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterApiKey,
      });

      // First query to get information about the restaurant and chef
      const locationContext = `${city ? `in ${city}` : ''} ${country ? `in ${country}` : ''}`.trim();
      
      const initialQuery = `Tell me about the restaurant "${restaurantName}" by chef ${chefName} ${locationContext}. Include details about the chef's background, the restaurant concept, website URL, Top Chef season participation, and when they were eliminated if applicable.`;
      
      console.log(`Fetching restaurant details for: ${restaurantName} by ${chefName}`);
      
      const completion = await client.chat.completions.create({
        model: "deepseek/deepseek-v3-base:free",
        messages: [
          {
            role: "system",
            content: "You are an AI that provides detailed information about restaurants from the TV show Top Chef. Focus on accurate, recent information."
          },
          {
            role: "user",
            content: initialQuery
          }
        ],
        temperature: 0.5,
        max_tokens: 1024,
      });

      const restaurantInfo = completion.choices[0].message.content;
      
      // Second query to parse the information into a structured format
      const parseQuery = `
      I need to parse restaurant information into a structured JSON format.
      
      Analyze this text: 
      ${restaurantInfo}
      
      Your response must ONLY contain a valid JSON object with these fields:
      {
        "restaurantName": "restaurant name",
        "chefName": "chef name", 
        "bio": "short biography of chef",
        "websiteUrl": "restaurant website URL",
        "seasonNumber": season number as integer or null,
        "eliminationInfo": "information about when eliminated", 
        "cuisineType": "type of cuisine"
      }
      
      Do not write any text before or after the JSON object. 
      Do not include markdown formatting like \`\`\`json\`\`\`.
      Just return the raw JSON object by itself.
      `;
      
      console.log("Parsing restaurant information into structured format");
      
      const parseCompletion = await client.chat.completions.create({
        model: "deepseek/deepseek-v3-base:free",
        messages: [
          {
            role: "system",
            content: "You are an AI that parses restaurant information into structured JSON. Always return valid JSON only."
          },
          {
            role: "user",
            content: parseQuery
          }
        ],
        temperature: 0.1,
        max_tokens: 1024,
      });
      
      // Try to parse the response as JSON
      let parsedData;
      try {
        const jsonStr = parseCompletion.choices[0]?.message?.content || "{}";
        console.log("Raw JSON string:", jsonStr);

        // Improved JSON extraction: Find the first '{' and the last '}' that forms a valid JSON object
        let cleanedJson = "{}";
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          // Extract the potential JSON substring
          const potentialJson = jsonStr.substring(firstBrace, lastBrace + 1);
          try {
            // Attempt to parse this substring to validate it's JSON
            parsedData = JSON.parse(potentialJson);
            cleanedJson = potentialJson; // It's valid JSON
          } catch (parseError) {
            // If parsing fails, log the error but proceed with default empty object
            console.error("Failed to parse extracted JSON substring:", parseError);
            console.log("Potential JSON substring:", potentialJson);
            parsedData = {}; // Fallback to empty object
          }
        } else {
           console.warn("Could not find valid JSON structure in the response string.");
           parsedData = {}; // Fallback if no braces found
        }

        console.log("Cleaned JSON:", cleanedJson);
        // parsedData is already assigned within the try block if successful
        
        // Store the raw response and parsed data in the database if a chef exists
        if (typeof chefName === 'string') {
          const chef = await storage.getChefByName(chefName);
          if (chef) {
            await storage.updateChef(chef.id, {
              bio: parsedData.bio || null,
              perplexityData: {
                raw: restaurantInfo,
                parsed: parsedData
              }
            });
          }
        }
        
      } catch (error) {
        console.error("Error parsing JSON response:", error);
        console.log("Raw response:", parseCompletion.choices[0]?.message?.content || "No content");
        // Return the raw text if we can't parse it
        return res.json({
          rawInfo: restaurantInfo,
          error: "Could not parse structured data"
        });
      }
      
      return res.json({
        rawInfo: restaurantInfo,
        structuredInfo: parsedData
      });
    } catch (error) {
      console.error('Error fetching restaurant details:', error);
      return res.status(500).json({ error: "Failed to fetch restaurant details" });
    }
  });

  // NEW Endpoint for fetching detailed panel data with age checks and conditional AI calls
  app.get('/api/restaurant-panel-data/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid restaurant ID' });
      }

      // 1. Fetch core data from DB
      const restaurant = await storage.getRestaurant(id);
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      const chef = await storage.getChef(restaurant.chefId);
      const season = restaurant.seasonId ? await storage.getSeason(restaurant.seasonId) : null;

      const responseData = {
        ...restaurant,
        chef: chef || null,
        season: season || null,
        metadata: { // Add metadata object
          restaurantName: { origin: 'db', lastUpdated: restaurant.restaurantNameLastUpdated },
          address: { origin: 'db', lastUpdated: restaurant.addressLastUpdated },
          chefAssociation: { origin: 'db', lastUpdated: restaurant.chefAssociationLastUpdated },
          bio: { origin: 'db', lastUpdated: chef?.lastUpdated },
          // Add other fields as needed
        }
      };

      // 2. Check age of fields (e.g., 3 months)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const fieldsToRefresh: string[] = [];

      if (!responseData.metadata.restaurantName.lastUpdated || responseData.metadata.restaurantName.lastUpdated < threeMonthsAgo) fieldsToRefresh.push('restaurantName');
      if (!responseData.metadata.address.lastUpdated || responseData.metadata.address.lastUpdated < threeMonthsAgo) fieldsToRefresh.push('address');
      if (!responseData.metadata.chefAssociation.lastUpdated || responseData.metadata.chefAssociation.lastUpdated < threeMonthsAgo) fieldsToRefresh.push('currentChefName'); // Field name expected by AI
      if (!responseData.chef?.bio || !responseData.metadata.bio.lastUpdated || responseData.metadata.bio.lastUpdated < threeMonthsAgo) fieldsToRefresh.push('bio');
      // Add checks for other secondary fields if needed

      // 3. If fields are outdated, call AI to refresh
      if (fieldsToRefresh.length > 0) {
        console.log(`Restaurant ID ${id}: Fields older than 3 months: ${fieldsToRefresh.join(', ')}. Fetching updates...`);
        
        // TODO: Step 3a: Use OpenRouter to generate Perplexity prompt for specific fields
        const perplexityPromptGenQuery = `Generate a concise Perplexity prompt to fetch the current ${fieldsToRefresh.join(', ')} for the restaurant "${restaurant.restaurantName}" (ID: ${id}) in ${restaurant.city}, ${restaurant.country}. Instruct Perplexity to respond ONLY with a valid JSON object containing these fields: { "${fieldsToRefresh.join('": "...", "')}": "..." }. If a field cannot be found, use null for its value.`;
        const generatedPerplexityPrompt = await callOpenRouter(perplexityPromptGenQuery, "You are an AI assistant that generates prompts for other AI models.");

        if (generatedPerplexityPrompt) {
          // TODO: Step 3b: Call Perplexity
          const perplexityResponse = await callPerplexity(generatedPerplexityPrompt, "You are an AI assistant providing restaurant information. Respond ONLY with the requested JSON object.");

          if (perplexityResponse) {
            try {
              // TODO: Step 3c: Parse response
              const freshData = JSON.parse(perplexityResponse);
              console.log(`Fresh data for Restaurant ID ${id}:`, freshData);

              // TODO: Step 3d: Use OpenRouter to compare freshData with responseData
              const comparisonPrompt = `Compare the existing data with the newly fetched data for restaurant "${restaurant.restaurantName}". Existing: ${JSON.stringify(responseData)}. Fresh: ${JSON.stringify(freshData)}. Identify any significant contradictions or discrepancies. Respond with "CONFLICT" if contradictions exist, otherwise respond with "OK".`;
              const comparisonResult = await callOpenRouter(comparisonPrompt, "You are an AI assistant comparing data for contradictions. Respond only with CONFLICT or OK.");

              if (comparisonResult === "CONFLICT") {
                 console.log(`Conflict detected for Restaurant ID ${id}. Fetching full update...`);
                 // TODO: Step 3e: Call Perplexity again for *all* data
                 const fullUpdatePrompt = `Provide a full, updated profile for restaurant "${restaurant.restaurantName}" (ID: ${id}) in ${restaurant.city}, ${restaurant.country}, including chef, address, bio, status, etc. Respond in a structured JSON format.`;
                 const fullUpdateResponse = await callPerplexity(fullUpdatePrompt, "Respond ONLY with a structured JSON object containing full restaurant details.");
                 if (fullUpdateResponse) {
                    const fullParsedData = JSON.parse(fullUpdateResponse);
                    // TODO: Update responseData with fullParsedData and update metadata origin/timestamp
                    // TODO: Update DB with fullParsedData and timestamps
                    console.log(`TODO: Apply full update for Restaurant ID ${id}`);
                 }
              } else {
                 // No conflict, merge freshData into responseData and update metadata
                 console.log(`No conflict for Restaurant ID ${id}. Merging updates.`);
                 const now = new Date();
                 for (const key of fieldsToRefresh) {
                    // Use explicit checks and update DB for each field
                    if (key === 'restaurantName' && freshData.restaurantName !== undefined && responseData.restaurantName !== freshData.restaurantName) {
                       responseData.restaurantName = freshData.restaurantName;
                       responseData.metadata.restaurantName = { origin: 'live', lastUpdated: now };
                       // Update DB field restaurantName and restaurantNameLastUpdated
                       await db.update(restaurants)
                         .set({ restaurantName: freshData.restaurantName, restaurantNameLastUpdated: now })
                         .where(eq(restaurants.id, id));
                       console.log(`Updated DB field ${key} for Restaurant ID ${id}`);
                    } else if (key === 'address' && freshData.address !== undefined && responseData.address !== freshData.address) {
                       responseData.address = freshData.address;
                       responseData.metadata.address = { origin: 'live', lastUpdated: now };
                       // Update DB field address and addressLastUpdated
                       // TODO: Consider updating lat/lng if address changes significantly (requires geocoding)
                       await db.update(restaurants)
                         .set({ address: freshData.address, addressLastUpdated: now })
                         .where(eq(restaurants.id, id));
                       console.log(`Updated DB field ${key} for Restaurant ID ${id}`);
                    } else if (key === 'currentChefName' && freshData.currentChefName !== undefined && responseData.chef?.name !== freshData.currentChefName) {
                       let newChefId = responseData.chef?.id; // Keep old ID if new chef not found
                       const newChef = await storage.getChefByName(freshData.currentChefName);
                       if (newChef) {
                          newChefId = newChef.id;
                       } else {
                          // Optionally create the new chef if not found? For now, log warning.
                          console.warn(`Chef "${freshData.currentChefName}" not found in DB. Cannot update association for restaurant ${id}.`);
                       }
                       // Only update if chef was found and ID is different
                       if (newChefId && newChefId !== responseData.chef?.id) { 
                          if (responseData.chef) responseData.chef.name = freshData.currentChefName; // Update name in response object
                          responseData.metadata.chefAssociation = { origin: 'live', lastUpdated: now };
                          // Update DB field chefId and chefAssociationLastUpdated
                          await db.update(restaurants)
                            .set({ chefId: newChefId, chefAssociationLastUpdated: now })
                            .where(eq(restaurants.id, id));
                          console.log(`Updated DB field chefId/chefAssociationLastUpdated for Restaurant ID ${id} to ${newChefId}`);
                       } else if (newChefId && newChefId === responseData.chef?.id) {
                          // If chef name from AI matches existing chef, just update timestamp
                           await db.update(restaurants)
                            .set({ chefAssociationLastUpdated: now })
                            .where(eq(restaurants.id, id));
                           console.log(`Refreshed chefAssociationLastUpdated timestamp for Restaurant ID ${id}`);
                       }
                    } else if (key === 'bio' && freshData.bio !== undefined && responseData.chef?.bio !== freshData.bio) {
                       if (responseData.chef) { // Ensure chef exists before updating bio
                          responseData.chef.bio = freshData.bio; // Update bio in response object
                          responseData.metadata.bio = { origin: 'live', lastUpdated: now };
                          // Update the chefs table
                          await db.update(chefs)
                            .set({ bio: freshData.bio, lastUpdated: now })
                            .where(eq(chefs.id, responseData.chef.id));
                          console.log(`Updated DB field bio for Chef ID ${responseData.chef.id}`);
                       }
                    }
                    // Add checks for other fields if necessary
                 }
              }
            } catch (e) {
              console.error(`Error processing AI response for Restaurant ID ${id}:`, e);
            }
          }
        } else {
          console.error(`Failed to generate Perplexity prompt for Restaurant ID ${id} panel data.`);
        }
      } else {
         console.log(`Restaurant ID ${id}: All relevant fields are up-to-date.`);
      }

      // 4. Return the potentially updated data
      res.json(responseData);

    } catch (error) {
      console.error('Error fetching restaurant panel data:', error);
      res.status(500).json({ error: 'Failed to fetch restaurant panel data' });
    }
  });


  // Parse and update chef data from Perplexity API
  app.post('/api/update-chef', async (req, res) => {
    try {
      const { chefId, perplexityData } = req.body;
      
      if (!chefId || !perplexityData) {
        return res.status(400).json({ error: "Chef ID and Perplexity data are required" });
      }
      
      const chef = await storage.getChef(chefId);
      if (!chef) {
        return res.status(404).json({ error: "Chef not found" });
      }
      
      // Process the Perplexity data to update chef information
      // This would involve parsing the text to extract structured information
      // For now, we'll just update the lastUpdated timestamp
      
      const updatedChef = await storage.updateChef(chefId, {
        bio: perplexityData.information,
        lastUpdated: new Date()
      });
      
      res.json(updatedChef);
    } catch (error) {
      console.error('Error updating chef data:', error);
      res.status(500).json({ error: 'Failed to update chef data' });
    }
  });

  // NEW Endpoint for periodic/manual data update
  app.post('/api/update-data', async (req, res) => {
    try {
      const { country } = req.body; // Expect country in request body
      if (!country || typeof country !== 'string') {
        return res.status(400).json({ error: "Country parameter is required" });
      }
      
      console.log(`Starting data update process for country: ${country}...`);

      // --- 1. Check for outdated key fields ---
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const outdatedRestaurants = await db.select().from(restaurants).where(
        and( // Wrap conditions in and()
          eq(restaurants.country, country),
          or(
            isNull(restaurants.chefAssociationLastUpdated),
            lt(restaurants.chefAssociationLastUpdated, threeMonthsAgo),
            isNull(restaurants.addressLastUpdated),
            lt(restaurants.addressLastUpdated, threeMonthsAgo),
            isNull(restaurants.restaurantNameLastUpdated),
            lt(restaurants.restaurantNameLastUpdated, threeMonthsAgo)
          )
        ) // Close and()
      ).execute();

      console.log(`Found ${outdatedRestaurants.length} restaurants in ${country} with potentially outdated key fields.`);

      // --- 2. Find latest season number (n) for the country ---
      const latestSeasonResult = await db.select({ value: max(seasons.number) })
                                        .from(seasons)
                                        .where(sql`${seasons.country} = ${country}`)
                                        .execute();
      const latestSeasonNumber = latestSeasonResult[0]?.value ?? 0;
      const nextSeasonNumber = latestSeasonNumber + 1;
      console.log(`Latest season for ${country}: ${latestSeasonNumber}. Checking for season ${nextSeasonNumber}.`);

      // --- 3. Ask Perplexity for candidates of season n+1 ---
      const seasonPrompt = `List known candidates or participants for Top Chef ${country} Season ${nextSeasonNumber}. For each candidate, provide their full name, the name of their primary restaurant (if known), and the city of that restaurant. If the season or candidates are not yet announced or known, please state that clearly. Format the response as a simple list, e.g., - Chef Name, Restaurant Name, City.`;
      const seasonCandidatesResponse = await callPerplexity(seasonPrompt, "You are an AI assistant specialized in providing information about the TV show Top Chef, including upcoming seasons and participants.");

      if (seasonCandidatesResponse && !seasonCandidatesResponse.toLowerCase().includes("not yet announced")) {
        console.log(`Received response for Season ${nextSeasonNumber} candidates. Processing...`);
        
        // Simple Regex parsing for "- Chef Name, Restaurant Name, City" format
        const candidateRegex = /-\s*(.+?),\s*(.+?),\s*(.+)/g;
        let match;
        let createdSeasonId: number | null = null; // Store created season ID

        while ((match = candidateRegex.exec(seasonCandidatesResponse)) !== null) {
          const [, chefName, restaurantName, city] = match.map(s => s.trim());
          console.log(`Processing candidate: ${chefName}, ${restaurantName}, ${city}`);

          try {
            // Ensure chef exists
            let chef = await storage.getChefByName(chefName);
            if (!chef) {
              console.log(`Creating new chef: ${chefName}`);
              chef = await storage.createChef({ name: chefName, status: 'active' });
            }

            // Ensure season exists (create only once per update run)
            if (!createdSeasonId) {
               const existingSeason = await db.select().from(seasons)
                 .where(and(eq(seasons.country, country), eq(seasons.number, nextSeasonNumber)))
                 .limit(1).execute();
               if (!existingSeason[0]) {
                  console.log(`Creating new season: ${country} Season ${nextSeasonNumber}`);
                  // TODO: Get year/title more dynamically if possible
                  const newSeason = await storage.createSeason({ 
                     number: nextSeasonNumber, 
                     year: new Date().getFullYear(), // Placeholder year
                     title: `Top Chef ${country} Season ${nextSeasonNumber}`, 
                     country: country 
                  });
                  createdSeasonId = newSeason.id;
               } else {
                  createdSeasonId = existingSeason[0].id;
               }
            }
            const currentSeasonId = createdSeasonId; // Use the ID found/created in this run

            // Create restaurant (simplified: assumes new restaurant for candidate, needs better duplicate check)
            // Using placeholder lat/lng - ideally fetch these separately if needed
            const newRestaurant = await storage.createRestaurant({
              chefId: chef.id,
              restaurantName: restaurantName,
              lat: "0", // Placeholder
              lng: "0", // Placeholder
              city: city,
              country: country,
              isCurrent: true,
              seasonId: currentSeasonId, // Link to the new season
              // Set initial timestamps
              lastUpdated: new Date(),
              restaurantNameLastUpdated: new Date(),
              addressLastUpdated: new Date(), // Assuming address/location is new
              chefAssociationLastUpdated: new Date(),
            });
            console.log(`Created new restaurant: ${restaurantName} (ID: ${newRestaurant.id})`);

            // Create participation record
            if (currentSeasonId) {
               // Avoid duplicate participations
               const existingParticipation = await db.select().from(participations)
                  .where(and(eq(participations.chefId, chef.id), eq(participations.seasonId, currentSeasonId)))
                  .limit(1).execute();
               if (!existingParticipation[0]) {
                  await storage.createParticipation({
                     chefId: chef.id,
                     seasonId: currentSeasonId,
                     // Other participation details unknown initially
                  });
                  console.log(`Created participation record for Chef ${chef.id} in Season ${currentSeasonId}`);
               }
            }
          } catch (candidateError) {
             console.error(`Error processing candidate ${chefName}:`, candidateError);
          }
        }
      } else {
        console.log(`Could not fetch, or no information available/season not announced for Season ${nextSeasonNumber} candidates.`);
      }


      // --- 4. Process outdated restaurants ---
      if (outdatedRestaurants.length > 0) {
        console.log(`Processing ${outdatedRestaurants.length} outdated restaurants in ${country}...`);
        
        for (const restaurant of outdatedRestaurants) {
          const outdatedFields: string[] = [];
          
          // Check each key field's timestamp
          if (!restaurant.restaurantNameLastUpdated || restaurant.restaurantNameLastUpdated < threeMonthsAgo) {
            outdatedFields.push("restaurant name");
          }
          if (!restaurant.addressLastUpdated || restaurant.addressLastUpdated < threeMonthsAgo) {
            // Assuming 'address' field covers location/lat/lng update needs
            outdatedFields.push("address/location"); 
          }
          if (!restaurant.chefAssociationLastUpdated || restaurant.chefAssociationLastUpdated < threeMonthsAgo) {
            // This implies needing to verify the chef associated with the restaurant
            outdatedFields.push("chef association"); 
          }

          if (outdatedFields.length > 0) {
            console.log(`Restaurant ID ${restaurant.id} (${restaurant.restaurantName}) needs update for: ${outdatedFields.join(', ')}`);

            // TODO: Step 4a: Use OpenRouter to generate Perplexity prompt
            //   - Prompt for OpenRouter: "Generate a Perplexity prompt to fetch the current [list outdatedFields] for the restaurant '[restaurant.restaurantName]' in [restaurant.city], [restaurant.country]. Request the response in JSON format: { field1: value1, field2: value2, ... }."
            const perplexityPromptGenQuery = `Generate a concise Perplexity prompt to fetch the current ${outdatedFields.join(' and ')} for the restaurant "${restaurant.restaurantName}" (ID: ${restaurant.id}) possibly run by chef ID ${restaurant.chefId} located in ${restaurant.city}, ${restaurant.country}. Instruct Perplexity to respond ONLY with a valid JSON object containing the requested fields (e.g., { "restaurantName": "...", "address": "...", "currentChefName": "..." }). If a field cannot be found, use null for its value.`;
            const generatedPerplexityPrompt = await callOpenRouter(perplexityPromptGenQuery, "You are an AI assistant that generates prompts for other AI models.");

            if (!generatedPerplexityPrompt) {
              console.error(`Failed to generate Perplexity prompt for restaurant ID ${restaurant.id}`);
              continue; // Skip to next restaurant
            }

            // TODO: Step 4b: Call Perplexity with the generated prompt
            const perplexityResponse = await callPerplexity(generatedPerplexityPrompt, "You are an AI assistant providing restaurant information. Respond ONLY with the requested JSON object.");
            
            if (!perplexityResponse) {
               console.error(`Failed to get Perplexity response for restaurant ID ${restaurant.id}`);
               continue; // Skip to next restaurant
            }

            // TODO: Step 4c: Parse Perplexity response (using OpenRouter or simple JSON.parse)
            let parsedData: any = null;
            try {
              parsedData = JSON.parse(perplexityResponse); // Simple parse first
              console.log(`Parsed Perplexity data for restaurant ID ${restaurant.id}:`, parsedData);
              
              // Step 4d: Update DB with parsed data and timestamps
              const updatePayload: Partial<Restaurant & { 
                chefAssociationLastUpdated: Date | null, 
                addressLastUpdated: Date | null, 
                restaurantNameLastUpdated: Date | null 
              }> = {};
              const now = new Date();
              let chefIdToUpdate = restaurant.chefId; // Default to current chefId

              // Check and update restaurant name
              if (outdatedFields.includes("restaurant name") && parsedData.restaurantName && parsedData.restaurantName !== restaurant.restaurantName) {
                updatePayload.restaurantName = parsedData.restaurantName;
                updatePayload.restaurantNameLastUpdated = now;
                console.log(`Updating restaurant name for ID ${restaurant.id} to "${parsedData.restaurantName}"`);
              }

              // Check and update address/location (assuming address field exists and is primary)
              // TODO: Need logic to potentially update lat/lng if only address is returned, or vice-versa
              if (outdatedFields.includes("address/location") && parsedData.address && parsedData.address !== restaurant.address) {
                 updatePayload.address = parsedData.address;
                 updatePayload.addressLastUpdated = now;
                 console.log(`Updating address for ID ${restaurant.id}`);
                 // If lat/lng are also provided in parsedData, update them too
                 // if (parsedData.lat && parsedData.lng) {
                 //   updatePayload.lat = parsedData.lat.toString();
                 //   updatePayload.lng = parsedData.lng.toString();
                 // }
              }
              
              // Check and update chef association
              if (outdatedFields.includes("chef association") && parsedData.currentChefName) {
                 // Find the chef ID for the potentially new chef name
                 const currentChef = await storage.getChef(restaurant.chefId);
                 if (!currentChef || currentChef.name !== parsedData.currentChefName) {
                    let newChef = await storage.getChefByName(parsedData.currentChefName);
                    if (!newChef) {
                       // Create new chef if they don't exist
                       console.log(`Creating new chef: ${parsedData.currentChefName}`);
                       newChef = await storage.createChef({ name: parsedData.currentChefName, status: 'active' });
                    }
                    if (newChef) {
                       chefIdToUpdate = newChef.id;
                       updatePayload.chefId = chefIdToUpdate;
                       updatePayload.chefAssociationLastUpdated = now;
                       console.log(`Updating chef association for restaurant ID ${restaurant.id} to Chef ID ${chefIdToUpdate} (${parsedData.currentChefName})`);
                    }
                 } else {
                    // Chef name matches, just update the timestamp
                    updatePayload.chefAssociationLastUpdated = now;
                 }
              }

              // Only update if there's something in the payload
              if (Object.keys(updatePayload).length > 0) {
                 try {
                    await db.update(restaurants)
                      .set(updatePayload)
                      .where(eq(restaurants.id, restaurant.id))
                      .execute();
                    console.log(`Successfully updated DB for restaurant ID ${restaurant.id} with fields: ${Object.keys(updatePayload).join(', ')}`);
                 } catch (dbUpdateError) {
                    console.error(`Failed to update DB for restaurant ID ${restaurant.id}:`, dbUpdateError);
                    // Continue to the next restaurant even if one update fails
                 }
              } else {
                 console.log(`No updates needed for restaurant ID ${restaurant.id} based on fetched data.`);
                 // Optionally update timestamps even if data is the same, to show it was checked
                 // try {
                 //    const checkedUpdatePayload: Partial<Restaurant> = {};
                 //    if (outdatedFields.includes("restaurant name")) checkedUpdatePayload.restaurantNameLastUpdated = now;
                 //    if (outdatedFields.includes("address/location")) checkedUpdatePayload.addressLastUpdated = now;
                 //    if (outdatedFields.includes("chef association")) checkedUpdatePayload.chefAssociationLastUpdated = now;
                 //    if (Object.keys(checkedUpdatePayload).length > 0) {
                 //       await db.update(restaurants).set(checkedUpdatePayload).where(eq(restaurants.id, restaurant.id)).execute();
                 //       console.log(`Updated check timestamps for restaurant ID ${restaurant.id}`);
                 //    }
                 // } catch (timestampError) {
                 //    console.error(`Failed to update check timestamps for restaurant ID ${restaurant.id}:`, timestampError);
                 // }
              }

            } catch (parseError) {
               console.error(`Failed to parse or process Perplexity JSON response for restaurant ID ${restaurant.id}: ${parseError}`);
               // Optionally, try using OpenRouter to parse if simple JSON.parse fails
               // const parsingPrompt = `Parse the following text into a JSON object with fields ${outdatedFields.join(', ')}: ${perplexityResponse}`;
               // const parsedViaOpenRouter = await callOpenRouter(parsingPrompt, "You are an AI assistant that parses text into JSON.");
               // Handle parsedViaOpenRouter...
               continue; // Skip for now if parsing fails
            }
          }
        }
      }

      console.log(`Data update process for ${country} finished processing outdated records.`);
      res.status(200).json({ message: `Update process initiated for ${country}. Found ${outdatedRestaurants.length} outdated records. Checked for season ${nextSeasonNumber}.` });

    } catch (error) {
      console.error('Error during data update process:', error);
      res.status(500).json({ error: 'Failed to update data' });
    }
  });

  // Parse and update chef data from Perplexity API
  app.post('/api/update-chef', async (req, res) => {
    try {
      const { chefId, perplexityData } = req.body;
      
      if (!chefId || !perplexityData) {
        return res.status(400).json({ error: "Chef ID and Perplexity data are required" });
      }
      
      const chef = await storage.getChef(chefId);
      if (!chef) {
        return res.status(404).json({ error: "Chef not found" });
      }
      
      // Process the Perplexity data to update chef information
      // This would involve parsing the text to extract structured information
      // For now, we'll just update the lastUpdated timestamp
      
      const updatedChef = await storage.updateChef(chefId, {
        bio: perplexityData.information,
        lastUpdated: new Date()
      });
      
      res.json(updatedChef);
    } catch (error) {
      console.error('Error updating chef data:', error);
      res.status(500).json({ error: 'Failed to update chef data' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
