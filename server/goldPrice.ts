/**
 * Gold Price Service
 *
 * Fetches gold price from https://api.gold-api.com/price/XAU/INR (free, no auth required).
 * The API returns price per OUNCE. We convert to grams (1 oz = 31.1035 g).
 * Purity-adjusted prices:
 *   9KT  = 9/24  of 24KT price
 *   14KT = 14/24 of 24KT price
 *   18KT = 18/24 of 24KT price
 *
 * Updated daily at 12 AM IST (18:30 UTC) via Heartbeat cron.
 */

import { getDb } from "./db";
import { goldPrices } from "../drizzle/schema";
import { desc } from "drizzle-orm";

const GOLD_API_URL = "https://api.gold-api.com/price/XAU/INR";
const TROY_OUNCE_TO_GRAMS = 31.1035;

export interface GoldPriceData {
  pricePerGram24kt: number;
  pricePerGram9kt: number;
  pricePerGram14kt: number;
  pricePerGram18kt: number;
  rawPricePerOunce: number;
  fetchedAt: Date;
}

/**
 * Fetch the latest gold price from the API and compute purity-adjusted gram prices.
 */
export async function fetchAndStoreGoldPrice(): Promise<GoldPriceData> {
  console.log("[GoldPrice] Fetching latest gold price from API...");

  const response = await fetch(GOLD_API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`[GoldPrice] API responded with status ${response.status}`);
  }

  const data = await response.json() as { price?: number; price_gram_24k?: number; [key: string]: unknown };

  // The API may return price per ounce as `price` or price per gram as `price_gram_24k`
  let pricePerOunce: number;
  if (typeof data.price === "number" && data.price > 0) {
    pricePerOunce = data.price;
  } else if (typeof data.price_gram_24k === "number" && data.price_gram_24k > 0) {
    // Already per gram — convert back to ounce for storage consistency
    pricePerOunce = data.price_gram_24k * TROY_OUNCE_TO_GRAMS;
  } else {
    throw new Error(`[GoldPrice] Unexpected API response shape: ${JSON.stringify(data)}`);
  }

  const pricePerGram24kt = pricePerOunce / TROY_OUNCE_TO_GRAMS;
  const pricePerGram9kt = (pricePerGram24kt * 9) / 24;
  const pricePerGram14kt = (pricePerGram24kt * 14) / 24;
  const pricePerGram18kt = (pricePerGram24kt * 18) / 24;

  console.log(
    `[GoldPrice] 24KT: ₹${pricePerGram24kt.toFixed(2)}/g | ` +
    `18KT: ₹${pricePerGram18kt.toFixed(2)}/g | ` +
    `14KT: ₹${pricePerGram14kt.toFixed(2)}/g | ` +
    `9KT: ₹${pricePerGram9kt.toFixed(2)}/g`
  );

  const db = await getDb();
  if (db) {
    await db.insert(goldPrices).values({
      pricePerGram24kt: pricePerGram24kt.toFixed(2),
      pricePerGram9kt: pricePerGram9kt.toFixed(2),
      pricePerGram14kt: pricePerGram14kt.toFixed(2),
      pricePerGram18kt: pricePerGram18kt.toFixed(2),
      rawPricePerOunce: pricePerOunce.toFixed(2),
    });
    console.log("[GoldPrice] Stored in database.");
  }

  return {
    pricePerGram24kt,
    pricePerGram9kt,
    pricePerGram14kt,
    pricePerGram18kt,
    rawPricePerOunce: pricePerOunce,
    fetchedAt: new Date(),
  };
}

/**
 * Get the most recent gold price from the database.
 * Returns null if no price has been fetched yet.
 */
export async function getLatestGoldPrice(): Promise<GoldPriceData | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(goldPrices)
    .orderBy(desc(goldPrices.fetchedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    pricePerGram24kt: Number(row.pricePerGram24kt),
    pricePerGram9kt: Number(row.pricePerGram9kt),
    pricePerGram14kt: Number(row.pricePerGram14kt),
    pricePerGram18kt: Number(row.pricePerGram18kt),
    rawPricePerOunce: Number(row.rawPricePerOunce ?? 0),
    fetchedAt: row.fetchedAt,
  };
}

/**
 * Get the last N gold price records (for history/chart).
 */
export async function getGoldPriceHistory(limit = 30) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(goldPrices)
    .orderBy(desc(goldPrices.fetchedAt))
    .limit(limit);
}

/**
 * Calculate purity-adjusted price per gram given a 24KT base price.
 */
export function calcPurityPrice(
  pricePerGram24kt: number,
  purity: "9kt" | "14kt" | "18kt"
): number {
  const numerator = purity === "9kt" ? 9 : purity === "14kt" ? 14 : 18;
  return Math.round((pricePerGram24kt * numerator) / 24);
}
