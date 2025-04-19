import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { db } from './db';
import { restaurants, chefs, seasons, participations } from '../shared/schema';
import { sql, isNull, eq, and } from 'drizzle-orm';
import OpenAI from 'openai';
import fetch from 'node-fetch'; // Use node-fetch as it's in package.json

// --- Configuration ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const DEEPSEEK_MODEL = "deepseek/deepseek-chat"; // Or specific version if needed
const PERPLEXITY_MODEL = "sonar"; // Or other suitable model

if (!OPENROUTER_API_KEY || !PERPLEXITY_API_KEY) {
  console.error("Error: API keys for OpenRouter (Deepseek) and/or Perplexity are missing in .env file.");
  process.exit(1);
}

const openrouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

// --- Helper Functions ---

/**
 * Extracts the first valid JSON array or object from a string.
 * Handles markdown code blocks and extra text from LLMs.
 */
function extractJsonBlock(text: string): string | null {
  if (!text) return null;
  // Try to match a JSON array or object inside triple backticks
  const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1];
  }
  // Now try to extract a JSON array or object
  const arrayMatch = text.match(/\[([\s\S]*?)\]/m);
  if (arrayMatch) {
    return '[' + arrayMatch[1] + ']';
  }
  const objectMatch = text.match(/\{([\s\S]*?)\}/m);
  if (objectMatch) {
    return '{' + objectMatch[1] + '}';
  }
  // As fallback, if text itself looks like JSON, return as is
  if ((text.trim().startsWith('[') && text.trim().endsWith(']')) ||
      (text.trim().startsWith('{') && text.trim().endsWith('}'))) {
    return text.trim();
  }
  return null;
}

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

// --- New: Update Season Candidates If Incomplete ---
export async function updateSeasonCandidatesIfIncomplete(seasonId: number) {
  // 1. Count candidates for this season
  const candidateCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(participations)
    .where(eq(participations.seasonId, seasonId));

  if ((candidateCount[0]?.count ?? 0) >= 15) {
    console.log(`Season ${seasonId} already has 15 or more candidates.`);
    return;
  }

  // 2. Fetch season info
  const season = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  if (!season[0]) {
    console.warn(`Season ${seasonId} not found.`);
    return;
  }

  // 3. Craft prompt for Perplexity
  const prompt = `List all candidates for Top Chef ${season[0].country} season ${season[0].number} (${season[0].year}). For each candidate, provide: full name, short biography, status (active/retired), image URL (if available), and their final placement in the season. Format as JSON array: [{name, bio, status, imageUrl, placement}].`;

  // 4. Call Perplexity
  const perplexityResponse = await callPerplexity(prompt);
  if (!perplexityResponse) {
    console.warn("Perplexity did not return candidate data.");
    return;
  }

  // 5. Use DeepSeek to parse Perplexity's response into structured JSON
  const deepseekPrompt = `Parse the following text and output a JSON array as described: ${perplexityResponse}`;
  const parsedJsonRaw = await callDeepseek(deepseekPrompt);

  let candidates: any[] = [];
  const potentialJson = extractJsonBlock(parsedJsonRaw ?? '');
  try {
    candidates = JSON.parse(potentialJson ?? '[]');
  } catch (e) {
    console.error("Failed to parse DeepSeek output as JSON:", parsedJsonRaw);
    return;
  }

  // 6. Upsert candidates and participations
  for (const c of candidates) {
    let chef = await db.select().from(chefs).where(eq(chefs.name, c.name)).limit(1);
    let chefId: number;
    if (chef.length === 0) {
      // Insert new chef
      const inserted = await db.insert(chefs).values({
        name: c.name,
        bio: c.bio,
        status: c.status,
        imageUrl: c.imageUrl,
        perplexityData: c, // store raw
      }).returning({ id: chefs.id });
      chefId = inserted[0].id;
    } else {
      chefId = chef[0].id;
      // Optionally update fields if missing
      await db.update(chefs).set({
        bio: chef[0].bio ?? c.bio,
        status: chef[0].status ?? c.status,
        imageUrl: chef[0].imageUrl ?? c.imageUrl,
        perplexityData: c,
      }).where(eq(chefs.id, chefId));
    }
    // Upsert participation
    const existing = await db.select().from(participations)
      .where(and(eq(participations.chefId, chefId), eq(participations.seasonId, seasonId)));
    if (existing.length === 0) {
      await db.insert(participations).values({
        chefId,
        seasonId,
        placement: c.placement,
        isWinner: c.placement === 1,
        eliminated: c.placement !== 1,
        notes: "",
      });
    }
  }
  console.log(`Updated candidates for season ${seasonId}.`);
}

// --- New: Fill Missing Restaurant Fields ---
export async function fillMissingRestaurantFields(restaurantId: number) {
  const restaurant = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!restaurant[0]) {
    console.warn(`Restaurant ${restaurantId} not found.`);
    return;
  }
  const r = restaurant[0];

  // Determine missing fields
  const missingFields: string[] = [];
  if (!r.address) missingFields.push("address");
  if (!r.description) missingFields.push("description");
  if (!r.lat || !r.lng) missingFields.push("latitude/longitude");
  if (!r.city) missingFields.push("city");
  if (!r.country) missingFields.push("country");

  if (missingFields.length === 0) {
    console.log(`No missing fields for restaurant ${restaurantId}.`);
    return;
  }

  // Craft prompt for Perplexity
  const prompt = `For the restaurant \"${r.restaurantName}\" (chef: ${r.chefId}), please provide the following missing information: ${missingFields.join(", ")}. Respond in JSON: {${missingFields.map(f => `\"${f}\": ...`).join(", ")}}`;

  // Call Perplexity
  const perplexityResponse = await callPerplexity(prompt);
  if (!perplexityResponse) {
    console.warn("Perplexity did not return restaurant data.");
    return;
  }

  // Use DeepSeek to parse Perplexity's response into structured JSON
  const deepseekPrompt = `Parse the following and output a JSON object with the requested fields: ${perplexityResponse}`;
  const parsedJson = await callDeepseek(deepseekPrompt);

  let data: any = {};
  try {
    data = JSON.parse(parsedJson ?? "{}");
  } catch (e) {
    console.error("Failed to parse DeepSeek output as JSON:", parsedJson);
    return;
  }

  // Update restaurant with any newly found fields
  await db.update(restaurants).set({
    address: r.address ?? data.address,
    description: r.description ?? data.description,
    lat: r.lat ?? data.lat,
    lng: r.lng ?? data.lng,
    city: r.city ?? data.city,
    country: r.country ?? data.country,
    lastUpdated: new Date(),
  }).where(eq(restaurants.id, restaurantId));

  console.log(`Updated restaurant ${restaurantId} with missing fields.`);
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
    // Don't exit - allow the server to continue running
    // process.exit(0); - Removed this to keep server alive
  } catch (error) {
    console.error('\nError during database update process:', error);
    // Don't exit on error - just log it and continue
    // process.exit(1); - Removed this to keep server alive
  }
}

main();
