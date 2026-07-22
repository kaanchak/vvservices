/**
 * Exchange Rate Service
 *
 * Fetches daily exchange rates for common foreign currencies → INR using the
 * free, no-key-required fawazahmed0/exchange-api (GitHub CDN-backed).
 * Rates are cached in the `exchangeRates` table so all price conversions
 * across the app use a consistent daily snapshot.
 *
 * Supported source currencies: USD, EUR, GBP, AED, SGD, JPY, AUD, CAD
 * Updated daily at 12 AM IST (18:30 UTC) alongside the gold price cron.
 */

import { getDb } from "./db";
import { exchangeRates } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";

/** Currencies we track (all → INR). */
export const TRACKED_CURRENCIES = ["USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"] as const;
export type TrackedCurrency = (typeof TRACKED_CURRENCIES)[number];

export interface ExchangeRateMap {
  /** Map of currency code → rate (1 unit = N INR) */
  rates: Record<string, number>;
  fetchedAt: Date;
}

// Primary and fallback CDN endpoints for fawazahmed0/exchange-api
const API_ENDPOINTS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/inr.json",
  "https://latest.currency-api.pages.dev/v1/currencies/inr.json",
];

/**
 * Fetch latest rates from the free exchange-api.
 * The API returns { inr: { usd: 0.01195, eur: 0.01098, ... } }
 * i.e. how many USD/EUR per 1 INR. We invert to get INR per 1 foreign unit.
 */
async function fetchRatesFromApi(): Promise<Record<string, number>> {
  let lastError: unknown;

  for (const url of API_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res.json() as { inr?: Record<string, number>; date?: string };
      const inrMap = data?.inr;
      if (!inrMap || typeof inrMap !== "object") {
        lastError = new Error("Unexpected API response shape");
        continue;
      }

      // inrMap[currency] = how many of that currency per 1 INR
      // Invert to get: 1 unit of currency = N INR
      const result: Record<string, number> = {};
      for (const currency of TRACKED_CURRENCIES) {
        const perInr = inrMap[currency.toLowerCase()];
        if (typeof perInr === "number" && perInr > 0) {
          result[currency] = 1 / perInr;
        }
      }

      if (Object.keys(result).length === 0) {
        lastError = new Error("No tracked currencies found in API response");
        continue;
      }

      console.log(
        "[ExchangeRate] Fetched rates:",
        Object.entries(result)
          .map(([c, r]) => `1 ${c} = ₹${r.toFixed(2)}`)
          .join(" | ")
      );
      return result;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("[ExchangeRate] All API endpoints failed");
}

/**
 * Fetch exchange rates from the API and store them in the database.
 * Replaces any existing rows for the same currencies.
 */
export async function fetchAndStoreExchangeRates(): Promise<ExchangeRateMap> {
  console.log("[ExchangeRate] Fetching latest exchange rates...");
  const rates = await fetchRatesFromApi();

  const db = await getDb();
  if (db) {
    // Upsert: delete existing rows for these currencies, then insert fresh ones
    for (const [currency, rate] of Object.entries(rates)) {
      await db.delete(exchangeRates).where(eq(exchangeRates.fromCurrency, currency));
      await db.insert(exchangeRates).values({
        fromCurrency: currency,
        rateToInr: rate.toFixed(6),
      });
    }
    console.log("[ExchangeRate] Stored in database.");
  }

  return { rates, fetchedAt: new Date() };
}

/**
 * Get the most recent exchange rates from the database.
 * Returns an empty map if no rates have been fetched yet.
 */
export async function getLatestExchangeRates(): Promise<ExchangeRateMap> {
  const db = await getDb();
  if (!db) return { rates: {}, fetchedAt: new Date() };

  const rows = await db
    .select()
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.fetchedAt));

  // Keep only the most recent row per currency
  const seen = new Set<string>();
  const rateMap: Record<string, number> = {};
  let fetchedAt = new Date(0);

  for (const row of rows) {
    if (!seen.has(row.fromCurrency)) {
      seen.add(row.fromCurrency);
      rateMap[row.fromCurrency] = Number(row.rateToInr);
      if (row.fetchedAt > fetchedAt) fetchedAt = row.fetchedAt;
    }
  }

  return { rates: rateMap, fetchedAt };
}

/**
 * Convert a foreign currency amount to INR using the cached exchange rate.
 * Returns null if the currency is not in the cache or the rate is unavailable.
 *
 * @param amount  Numeric amount in the source currency
 * @param currency  ISO 4217 currency code (e.g. "USD")
 * @param rateMap  Optional pre-fetched rate map to avoid a DB round-trip
 */
export function convertToInr(
  amount: number,
  currency: string,
  rateMap: Record<string, number>
): number | null {
  const upper = currency.toUpperCase();
  if (upper === "INR" || upper === "RS" || upper === "RS." || upper === "₹") return amount;
  const rate = rateMap[upper];
  if (!rate) return null;
  return Math.round(amount * rate);
}

/**
 * Parse a raw price string (e.g. "$45,600", "USD 45600", "₹1,20,000") and
 * return the numeric value and detected currency code.
 */
export function parsePriceString(raw: string): { amount: number; currency: string } | null {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Symbol/prefix map
  const symbolMap: Record<string, string> = {
    "$": "USD",
    "£": "GBP",
    "€": "EUR",
    "¥": "JPY",
    "₹": "INR",
    "rs.": "INR",
    "rs": "INR",
    "inr": "INR",
    "usd": "USD",
    "eur": "EUR",
    "gbp": "GBP",
    "aed": "AED",
    "sgd": "SGD",
    "jpy": "JPY",
    "aud": "AUD",
    "cad": "CAD",
  };

  // Try Rs./Rs prefix (with optional dot and space)
  const rsMatch = cleaned.match(/^Rs\.?\s+([0-9][0-9,. ]*)/i);
  if (rsMatch) {
    const amount = parseFloat(rsMatch[1]!.replace(/[, ]/g, ""));
    if (!isNaN(amount) && amount > 0) return { amount, currency: "INR" };
  }

  // Try "SYMBOL NUMBER" or "NUMBER SYMBOL" patterns
  const withSymbol = cleaned.match(/^([£€$¥₹])\s*([0-9][0-9,. ]*)/i);
  if (withSymbol) {
    const currency = symbolMap[withSymbol[1]!] ?? "INR";
    const amount = parseFloat(withSymbol[2]!.replace(/[, ]/g, ""));
    if (!isNaN(amount) && amount > 0) return { amount, currency };
  }

  // Try "CODE NUMBER" or "NUMBER CODE" patterns
  const withCode = cleaned.match(/^([A-Z]{2,4})\s+([0-9][0-9,. ]*)/i)
    ?? cleaned.match(/^([0-9][0-9,. ]*)\s+([A-Z]{2,4})$/i);
  if (withCode) {
    const codePart = (withCode[1]!.match(/[A-Z]/i) ? withCode[1] : withCode[2])!.toLowerCase();
    const numPart = (withCode[1]!.match(/[0-9]/) ? withCode[1] : withCode[2])!;
    const currency = symbolMap[codePart] ?? codePart.toUpperCase();
    const amount = parseFloat(numPart.replace(/[, ]/g, ""));
    if (!isNaN(amount) && amount > 0) return { amount, currency };
  }

  // Plain number — assume INR
  const plain = cleaned.match(/^([0-9][0-9,. ]*)$/);
  if (plain) {
    const amount = parseFloat(plain[1]!.replace(/[, ]/g, ""));
    if (!isNaN(amount) && amount > 0) return { amount, currency: "INR" };
  }

  return null;
}
