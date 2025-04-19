import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type RestaurantWithDetails } from "./storage"; // Use the updated type name
import { db } from "./db";
import { restaurants, chefs, participations, seasons, Restaurant } from "../shared/schema";
import fetch from "node-fetch";
import { OpenAI } from "openai";
import { sql, desc, max, or, isNull, lt, and, eq } from "drizzle-orm"; // Import and, eq
// Removed duplicate: import { db } from "./db"; 
import { fillMissingRestaurantFields, updateSeasonCandidatesIfIncomplete } from "./update-db";

// Helper function to call Perplexity API
async function callPerplexity(prompt: string, systemPrompt?: string): Promise<string | null> {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    console.error("Perplexity API key not configured");
    return null; // Or throw an error
  }

  const url = "https://api.perplexity.ai/chat/completions";
  const payload = {
    model: "sonar", // Or another suitable model
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
    console.log("Using OpenRouter API key:", openrouterApiKey.substring(0, 5) + "..." + openrouterApiKey.substring(openrouterApiKey.length - 5));
    
    // Create a standalone fetch-based call to avoid authentication issues with the client
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": "https://replit.com",
        "X-Title": "Top Chef Restaurant Map"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324:free", // Use a more reliable model
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
        temperature: 0.3,
        max_tokens: 1024
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json() as any;
    console.log("OpenRouter response:", JSON.stringify(data).substring(0, 200) + "...");
    return data.choices[0]?.message?.content || null;
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
  
  // Only create France seasons
  console.log('Creating seasons...');
  const seasonsMap = new Map();
  for (let i = 1; i <= 14; i++) {
    const season = await storage.createSeason({
      number: i,
      year: 2010 + i,
      title: `Top Chef France Season ${i}`,
      country: "France",
      numberOfEpisodes: 10 + Math.floor(Math.random() * 5),
      winner: null
    });
    seasonsMap.set(`France-${i}`, season.id);
  }
  
  console.log('Creating restaurants and chefs...');
  // Flatten the restaurant data into a single array
  const allRestaurants = restaurantData["France"];
  for (const restaurant of allRestaurants) {
    // First ensure the chef exists
    let chef = await storage.getChefByName(restaurant.chefName);
    if (!chef) {
      chef = await storage.createChef({
        name: restaurant.chefName,
        status: "active",
        lastUpdated: new Date()
      });
    }
    // Map the season number to the season ID using the country and season
    const seasonKey = `France-${restaurant.season}`;
    const seasonId = seasonsMap.get(seasonKey);
    if (!seasonId) {
      console.warn(`No season found for key: ${seasonKey}`);
    }
    // Add restaurant to storage
    await storage.createRestaurant({
      chefId: chef.id,
      restaurantName: restaurant.restaurantName,
      description: restaurant.description || null,
      lat: restaurant.lat,
      lng: restaurant.lng,
      address: restaurant.address || null,
      seasonId: seasonId || null,
      city: restaurant.city,
      country: restaurant.country,
      isCurrent: true,
      lastUpdated: new Date(),
      dateOpened: null,
      dateClosed: null
    });
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
  
  // Get restaurants by country (and optionally by season)
  app.get('/api/restaurants', async (req, res) => {
    try {
      const country = req.query.country as string || 'France';
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
      const restaurants: RestaurantWithDetails[] = await storage.getRestaurantsByCountry(country, validSeasonId); // Use updated type
      res.json(restaurants);
    } catch (error) {
      console.error('Error fetching restaurants:', error); // Log the specific error
      res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
  });
  
  // Get restaurants with chef information
  app.get('/api/restaurants-with-chefs', async (req, res) => {
    try {
      const country = req.query.country as string || 'France';
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
        model: "sonar",
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

  // Interface for the expected structure of fresh data from Perplexity
  interface FreshRestaurantData {
    restaurantName?: string | null;
    address?: string | null;
    currentChefName?: string | null;
    bio?: string | null;
    // Add other potential fields if needed
  }

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
              // TODO: Step 3c: Parse response - Add cleaning step and type
              let freshData: FreshRestaurantData = {}; // Apply the interface type
              const jsonStr = perplexityResponse;
              const firstBrace = jsonStr.indexOf('{');
              const lastBrace = jsonStr.lastIndexOf('}');

              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                // Extract the potential JSON substring
                const potentialJson = jsonStr.substring(firstBrace, lastBrace + 1);
                try {
                  // Attempt to parse this substring to validate it's JSON
                  freshData = JSON.parse(potentialJson);
                  console.log(`Parsed fresh data for Restaurant ID ${id}:`, freshData);
                } catch (parseError) {
                  console.error(`Failed to parse extracted JSON substring for Restaurant ID ${id}:`, parseError);
                  console.log("Potential JSON substring:", potentialJson);
                  // Keep freshData as {} and proceed, or throw error? For now, proceed.
                }
              } else {
                 console.warn(`Could not find valid JSON structure in Perplexity response for Restaurant ID ${id}. Response: ${jsonStr}`);
                 // Keep freshData as {}
              }
              
              // Check if freshData is empty after potential parsing failure
              if (Object.keys(freshData).length === 0) {
                 console.error(`Proceeding with empty freshData for Restaurant ID ${id} after parsing attempt.`);
                 // Decide if we should skip the comparison/update or handle differently
                 // For now, the logic will proceed but likely won't update anything
              }

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
                    // Use explicit checks and update DB for each field, handling nulls
                    if (key === 'restaurantName' && freshData.restaurantName !== undefined && responseData.restaurantName !== freshData.restaurantName) {
                       // Only update if freshData.restaurantName is a non-null string (DB requires it)
                       if (freshData.restaurantName) { 
                          responseData.restaurantName = freshData.restaurantName;
                          responseData.metadata.restaurantName = { origin: 'live', lastUpdated: now };
                          // Update DB field restaurantName and restaurantNameLastUpdated
                          await db.update(restaurants)
                            .set({ restaurantName: freshData.restaurantName, restaurantNameLastUpdated: now })
                            .where(eq(restaurants.id, id));
                          console.log(`Updated DB field ${key} for Restaurant ID ${id}`);
                       } else {
                          console.warn(`Skipping update for ${key} for Restaurant ID ${id} because fetched value was null/empty.`);
                       }
                    } else if (key === 'address' && freshData.address !== undefined && responseData.address !== freshData.address) {
                       // Allow null for address
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
                       let newChef = null;
                       // Only search if currentChefName is a non-null string
                       if (freshData.currentChefName) {
                          newChef = await storage.getChefByName(freshData.currentChefName);
                       }
                       
                       if (newChef) {
                          newChefId = newChef.id;
                       } else if (freshData.currentChefName) { // Only warn if we had a name to search for
                          // Optionally create the new chef if not found? For now, log warning.
                          console.warn(`Chef "${freshData.currentChefName}" not found in DB. Cannot update association for restaurant ${id}.`);
                       } else {
                          // freshData.currentChefName was null or empty, cannot update association
                          console.warn(`Skipping chef association update for Restaurant ID ${id} because fetched chef name was null/empty.`);
                       }
                       
                       // Only update if chef was found/exists and ID is different
                       if (newChefId && newChefId !== responseData.chef?.id && freshData.currentChefName) { 
                          if (responseData.chef) responseData.chef.name = freshData.currentChefName; // Update name in response object
                          responseData.metadata.chefAssociation = { origin: 'live', lastUpdated: now };
                          // Update DB field chefId and chefAssociationLastUpdated
                          await db.update(restaurants)
                            .set({ chefId: newChefId, chefAssociationLastUpdated: now })
                            .where(eq(restaurants.id, id));
                          console.log(`Updated DB field chefId/chefAssociationLastUpdated for Restaurant ID ${id} to ${newChefId}`);
                       } else if (newChefId && newChefId === responseData.chef?.id && freshData.currentChefName) {
                          // If chef name from AI matches existing chef, just update timestamp
                           await db.update(restaurants)
                            .set({ chefAssociationLastUpdated: now })
                            .where(eq(restaurants.id, id));
                           console.log(`Refreshed chefAssociationLastUpdated timestamp for Restaurant ID ${id}`);
                       }
                    } else if (key === 'bio' && freshData.bio !== undefined && responseData.chef?.bio !== freshData.bio) {
                       if (responseData.chef) { // Ensure chef exists before updating bio
                          // Allow null for bio
                          responseData.chef.bio = freshData.bio; // Update bio in response object
                          responseData.metadata.bio = { origin: 'live', lastUpdated: now };
                          // Update the chefs table
                          await db.update(chefs)
                            .set({ bio: freshData.bio, lastUpdated: now }) // Pass null directly if that's the value
                            .where(eq(chefs.id, responseData.chef.id));
                          console.log(`Updated DB field bio for Chef ID ${responseData.chef.id}`);
                       } else {
                          console.warn(`Cannot update bio for Restaurant ID ${id} because chef data is missing.`);
                       }
                    }
                    // Add checks for other fields if necessary, handling nulls appropriately
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

      // --- 1. Check and update seasons with few candidates ---
      const seasonsForCountry = await db.select().from(seasons).where(eq(seasons.country, country));
      for (const s of seasonsForCountry) {
        await updateSeasonCandidatesIfIncomplete(s.id);
      }

      // --- 2. Check for outdated key fields ---
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
               try {
                 // Avoid duplicate participations
                 // Split the query into steps to avoid TypeScript errors
                 const query = db.select()
                   .from(participations);
                   
                 const whereChef = eq(participations.chefId, chef.id);
                 const whereSeason = eq(participations.seasonId, currentSeasonId);
                 
                 const existingParticipation = await query
                   .where(and(whereChef, whereSeason))
                   .limit(1)
                   .execute();
                 if (!existingParticipation[0]) {
                   await storage.createParticipation({
                     chefId: chef.id,
                     seasonId: currentSeasonId,
                     // Other participation details unknown initially
                   });
                   console.log(`Created participation record for Chef ${chef.id} in Season ${currentSeasonId}`);
                 }
               } catch (participationError) {
                 console.error(`Error creating participation for chef ${chef.id}:`, participationError);
                 // Continue with other operations even if participation creation fails
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
              // Simple parse first
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
      res.status(200).json({ 
        message: `Update process completed for ${country}. Updated seasons with low candidate counts. Found ${outdatedRestaurants.length} outdated restaurant records. Checked for season ${nextSeasonNumber}.` 
      });

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

  // --- New: Fill missing fields for a restaurant by ID ---
  app.post('/api/restaurants/:id/fill-missing-fields', async (req, res) => {
    const restaurantId = Number(req.params.id);
    if (!restaurantId || isNaN(restaurantId)) {
      return res.status(400).json({ error: "Invalid or missing restaurant ID" });
    }
    try {
      await fillMissingRestaurantFields(restaurantId);
      res.status(200).json({ message: `Missing fields for restaurant ${restaurantId} have been filled (if any were missing).` });
    } catch (error) {
      console.error(`Error filling missing fields for restaurant ${restaurantId}:`, error);
      res.status(500).json({ error: 'Failed to fill missing restaurant fields' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
