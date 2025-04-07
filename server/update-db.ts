import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { db } from './db';
import { restaurants, chefs, seasons } from '../shared/schema';
import { sql, isNull, eq, and } from 'drizzle-orm';
import OpenAI from 'openai';
import fetch from 'node-fetch'; // Use node-fetch as it's in package.json

// --- Configuration ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const DEEPSEEK_MODEL = "deepseek/deepseek-chat"; // Or specific version if needed
const PERPLEXITY_MODEL = "sonar-medium-online"; // Or other suitable model

if (!OPENROUTER_API_KEY || !PERPLEXITY_API_KEY) {
  console.error("Error: API keys for OpenRouter (Deepseek) and/or Perplexity are missing in .env file.");
  process.exit(1);
}

const openrouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

// --- Helper Functions ---

async function callDeepseek(prompt: string): Promise<string | null> {
  console.log(`---> Calling Deepseek...`);
  try {
    const completion = await openrouterClient.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5, // Adjust as needed
      max_tokens: 150, // Limit response length
    });
    const responseText = completion.choices[0]?.message?.content?.trim() ?? null;
    console.log(`---> Deepseek Response: ${responseText}`);
    return responseText;
  } catch (error) {
    console.error(`---> Error calling Deepseek: ${error}`);
    return null;
  }
}

async function callPerplexity(prompt: string): Promise<string | null> {
  console.log(`---> Calling Perplexity with prompt: ${prompt}`);
  const url = "https://api.perplexity.ai/chat/completions";
  const payload = {
    model: PERPLEXITY_MODEL,
    messages: [
      { role: "system", content: "Be precise and concise. Provide only the requested information." },
      { role: "user", content: prompt }
    ],
    max_tokens: 100, // Limit response length
    temperature: 0.2,
  };
  const headers = {
    "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
    "Content-Type": "application/json",
    "accept": "application/json"
  };

  try {
    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`---> Error calling Perplexity: ${response.status} ${response.statusText} - ${errorBody}`);
      return null;
    }

    const responseData = await response.json() as any; // Type assertion for simplicity
    const responseText = responseData?.choices?.[0]?.message?.content?.trim() ?? null;
    console.log(`---> Perplexity Response: ${responseText}`);
    return responseText;
  } catch (error) {
    console.error(`---> Error calling Perplexity: ${error}`);
    return null;
  }
}

// --- Main Update Logic ---

async function findAndUpdateMissingInfo() {
  console.log('Checking for restaurants with missing addresses...');

  // Find restaurants missing address
  const restaurantsToUpdate = await db
    .select({
      restaurantId: restaurants.id,
      restaurantName: restaurants.restaurantName,
      chefId: restaurants.chefId,
      chefName: chefs.name,
      seasonNumber: seasons.number,
      seasonYear: seasons.year,
    })
    .from(restaurants)
    .leftJoin(chefs, eq(restaurants.chefId, chefs.id))
    .leftJoin(seasons, eq(restaurants.seasonId, seasons.id))
    .where(isNull(restaurants.address)); // Find restaurants where address is null

  if (restaurantsToUpdate.length === 0) {
    console.log('No restaurants found with missing addresses.');
    return;
  }

  console.log(`Found ${restaurantsToUpdate.length} restaurants missing addresses.`);

  for (const restaurant of restaurantsToUpdate) {
    console.log(`\nProcessing restaurant ID: ${restaurant.restaurantId} (${restaurant.restaurantName})`);

    if (!restaurant.chefName || !restaurant.restaurantName) {
        console.warn(`Skipping restaurant ID ${restaurant.restaurantId}: Missing chef or restaurant name.`);
        continue;
    }

    // 1. Ask Deepseek to generate a good prompt for Perplexity
    const deepseekPrompt = `Generate a concise prompt for Perplexity API to find the full address of the restaurant "${restaurant.restaurantName}" run by chef ${restaurant.chefName} (Top Chef France Season ${restaurant.seasonNumber ?? 'unknown'}). The prompt should ask Perplexity to provide *only* the full address.`;

    const perplexityPrompt = await callDeepseek(deepseekPrompt);

    if (!perplexityPrompt) {
        console.warn(`---> Could not generate Perplexity prompt from Deepseek for restaurant ${restaurant.restaurantId}. Skipping.`);
        continue;
    }

    // 2. Call Perplexity with the generated prompt
    const addressResponse = await callPerplexity(perplexityPrompt);

    if (!addressResponse) {
        console.warn(`---> Perplexity did not return an address for restaurant ${restaurant.restaurantId}. Skipping.`);
        continue;
    }

    // 3. Basic Parsing & Update DB (Needs improvement for robustness)
    //    This assumes Perplexity returns *only* the address as requested.
    const extractedAddress = addressResponse.trim();

    if (extractedAddress && extractedAddress.length > 5) { // Basic sanity check
      console.log(`---> Updating restaurant ${restaurant.restaurantId} with address: ${extractedAddress}`);
      try {
          await db.update(restaurants)
            .set({ address: extractedAddress, lastUpdated: new Date() })
            .where(eq(restaurants.id, restaurant.restaurantId));
          console.log(`---> Successfully updated address for restaurant ${restaurant.restaurantId}`);
      } catch (error) {
          console.error(`---> Failed to update address for restaurant ${restaurant.restaurantId}:`, error);
      }
    } else {
        console.warn(`---> Could not extract a valid address ("${extractedAddress}") from Perplexity response for restaurant ${restaurant.restaurantId}`);
    }

    // Add a delay between requests to be respectful to APIs
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }

  console.log('\nFinished checking for missing addresses.');
}


async function main() {
  try {
    await findAndUpdateMissingInfo();
    // Add calls to other update functions here (e.g., find missing restaurant names, chef bios, etc.)
    console.log('\nDatabase update check completed.');
    process.exit(0);
  } catch (error) {
    console.error('\nError during database update process:', error);
    process.exit(1);
  }
}

main();
