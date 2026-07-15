/**
 * URL scraper — no AI/LLM used.
 * Extraction priority order per field:
 *   image      : og:image → twitter:image → first <img> with large dimensions
 *   title      : og:title → twitter:title → <title> → h1
 *   description: og:description → twitter:description → meta[name=description] → first <p>
 *   price      : JSON-LD offers.price → meta[property=product:price:amount] → regex on text
 *   goldWeight : JSON-LD additionalProperty → regex on visible text
 *   diamondWeight: same
 *   metalType  : JSON-LD material → regex on text
 *   stoneType  : regex on text
 *
 * Anti-bot handling:
 *   - Full browser-like headers (Chrome UA, Accept, Accept-Language, Sec-Fetch-*, etc.)
 *   - Exponential backoff retry (up to 3 attempts: 0 ms, 1 s, 3 s)
 *   - On 429 / 403 / repeated failure: returns a ScrapedProduct with blocked=true
 *     so the caller can show a graceful "manual entry" fallback to the user
 */

import * as cheerio from "cheerio";

export interface ScrapedProduct {
  imageUrl?: string;
  title?: string;
  description?: string;
  price?: string;
  currency?: string;
  goldWeight?: string;
  diamondWeight?: string;
  metalType?: string;
  stoneType?: string;
  sourceUrl: string;
  /** true when the site blocked the scraper — UI should show manual-entry fallback */
  blocked?: boolean;
  /** human-readable reason for the block, shown to the user */
  blockedReason?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function abs(base: string, href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return href.startsWith("http") ? href : undefined;
  }
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1]?.trim();
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── browser-like request headers ───────────────────────────────────────────

function buildHeaders(url: string): Record<string, string> {
  const parsed = new URL(url);
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: `${parsed.protocol}//${parsed.hostname}/`,
    "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Connection: "keep-alive",
  };
}

// ─── JSON-LD extraction ──────────────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  description?: string;
  image?: string | string[] | { url?: string };
  offers?: { price?: number | string; priceCurrency?: string } | Array<{ price?: number | string; priceCurrency?: string }>;
  material?: string;
  additionalProperty?: Array<{ name?: string; value?: string | number }>;
}

function extractFromJsonLd(scripts: string[]): Partial<ScrapedProduct> {
  const result: Partial<ScrapedProduct> = {};
  for (const raw of scripts) {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { continue; }

    const nodes: unknown[] = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const ld = node as JsonLdProduct;
      if (!ld || typeof ld !== "object") continue;
      const type = (ld["@type"] || "").toString().toLowerCase();
      if (!type.includes("product") && !type.includes("jewel")) continue;

      if (!result.title && ld.name) result.title = ld.name;
      if (!result.description && ld.description) result.description = ld.description;

      // image
      if (!result.imageUrl) {
        if (typeof ld.image === "string") result.imageUrl = ld.image;
        else if (Array.isArray(ld.image) && ld.image.length > 0) result.imageUrl = ld.image[0];
        else if (ld.image && typeof ld.image === "object" && !Array.isArray(ld.image)) {
          result.imageUrl = (ld.image as { url?: string }).url;
        }
      }

      // price
      if (!result.price) {
        const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
        if (offer?.price != null) {
          result.price = String(offer.price);
          result.currency = offer.priceCurrency;
        }
      }

      // material / metalType
      if (!result.metalType && ld.material) result.metalType = ld.material;

      // additionalProperty (gold weight, diamond weight, stone type, etc.)
      if (Array.isArray(ld.additionalProperty)) {
        for (const prop of ld.additionalProperty) {
          const name = (prop.name || "").toLowerCase();
          const value = String(prop.value || "").trim();
          if (!value) continue;
          if (!result.goldWeight && /gold.*(weight|wt)|weight.*gold/i.test(name)) result.goldWeight = value;
          if (!result.diamondWeight && /diamond.*(weight|wt|carat)|carat.*diamond/i.test(name)) result.diamondWeight = value;
          if (!result.metalType && /metal|karat|carat.*gold/i.test(name)) result.metalType = value;
          if (!result.stoneType && /stone|gem|gemstone/i.test(name)) result.stoneType = value;
        }
      }
    }
  }
  return result;
}

// ─── regex extraction from visible text ─────────────────────────────────────

function extractFromText(text: string): Partial<ScrapedProduct> {
  const result: Partial<ScrapedProduct> = {};

  // Gold weight: "18.5 g", "18.5g gold", "gold weight: 18.5 grams"
  if (!result.goldWeight) {
    result.goldWeight = firstMatch(text, [
      /gold\s*weight[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:grams?|g(?:m)?)\b/i,
      /([0-9]+(?:\.[0-9]+)?)\s*(?:grams?|gm)\s*(?:of\s+)?gold/i,
      /net\s*gold[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:grams?|gm?)/i,
    ]);
    if (result.goldWeight) result.goldWeight += " g";
  }

  // Diamond weight: "0.52 ct", "0.52 carats", "diamond: 0.52ct"
  if (!result.diamondWeight) {
    result.diamondWeight = firstMatch(text, [
      /diamond\s*(?:weight|wt)?[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:carats?|cts?)\b/i,
      /([0-9]+(?:\.[0-9]+)?)\s*(?:carats?|cts?)\s*(?:diamond|solitaire|brilliant)/i,
      /([0-9]+(?:\.[0-9]+)?)\s*ct\s*(?:tw|tdw|diamond)/i,
    ]);
    if (result.diamondWeight) result.diamondWeight += " ct";
  }

  // Price: ₹1,20,000 / Rs. 1,20,000 / $1200
  if (!result.price) {
    result.price = firstMatch(text, [
      /(?:₹|Rs\.?\s*|INR\s*)([0-9,]+(?:\.[0-9]+)?)/i,
      /(?:\$|USD\s*)([0-9,]+(?:\.[0-9]+)?)/i,
      /price[:\s]+([0-9,]+(?:\.[0-9]+)?)/i,
    ]);
  }

  // Metal type: "18K gold", "22 karat gold", "platinum", "silver"
  if (!result.metalType) {
    result.metalType = firstMatch(text, [
      /\b((?:18|22|24|14|9)\s*(?:K|kt|karat|carat)\s*(?:yellow\s+|white\s+|rose\s+)?gold)\b/i,
      /\b((?:yellow|white|rose)\s+gold)\b/i,
      /\b(platinum)\b/i,
      /\b(sterling\s+silver)\b/i,
    ]);
  }

  // Stone type: "diamond", "emerald", "ruby", "sapphire", "moissanite", etc.
  if (!result.stoneType) {
    result.stoneType = firstMatch(text, [
      /\b(diamond(?:s)?)\b/i,
      /\b(emerald(?:s)?)\b/i,
      /\b(ruby|rubies)\b/i,
      /\b(sapphire(?:s)?)\b/i,
      /\b(moissanite)\b/i,
      /\b(pearl(?:s)?)\b/i,
      /\b(amethyst)\b/i,
      /\b(topaz)\b/i,
    ]);
  }

  return result;
}

// ─── fetch with retry + exponential backoff ──────────────────────────────────

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000; // 2 MB cap
const RETRY_DELAYS_MS = [0, 1_000, 3_000]; // 3 attempts total

/** Status codes that are worth retrying */
const RETRYABLE_CODES = new Set([429, 503, 502, 504]);
/** Status codes that mean "blocked" — no point retrying */
const BLOCKED_CODES = new Set([403, 401, 407]);

interface FetchResult {
  html: string;
  blocked: false;
}
interface BlockedResult {
  html: null;
  blocked: true;
  reason: string;
}

async function fetchWithRetry(url: string): Promise<FetchResult | BlockedResult> {
  const headers = buildHeaders(url);
  let lastStatus = 0;
  let lastError = "";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timer);
      lastStatus = res.status;

      // Immediately blocked — no retry
      if (BLOCKED_CODES.has(res.status)) {
        return {
          html: null,
          blocked: true,
          reason: `The website returned HTTP ${res.status} (access denied). Auto-extraction is not possible for this site.`,
        };
      }

      // Rate-limited — retry after delay
      if (RETRYABLE_CODES.has(res.status)) {
        // Check Retry-After header
        const retryAfter = res.headers.get("retry-after");
        if (retryAfter && attempt < RETRY_DELAYS_MS.length - 1) {
          const wait = Math.min(parseInt(retryAfter, 10) * 1000 || RETRY_DELAYS_MS[attempt + 1]!, 8_000);
          await sleep(wait);
        }
        lastError = `HTTP ${res.status}`;
        continue;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // Non-retryable non-ok status
        if (attempt === RETRY_DELAYS_MS.length - 1) break;
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("html")) {
        return {
          html: null,
          blocked: true,
          reason: "URL does not return an HTML page — it may be a direct file link or API endpoint.",
        };
      }

      // Stream with size cap
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          chunks.push(value);
          if (total > MAX_BYTES) { reader.cancel(); break; }
        }
      }
      const html = new TextDecoder().decode(Buffer.concat(chunks));
      return { html, blocked: false };

    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg.includes("abort") ? "Request timed out" : msg;
      if (attempt < RETRY_DELAYS_MS.length - 1) continue;
    }
  }

  // All retries exhausted
  const isRateLimit = lastStatus === 429;
  return {
    html: null,
    blocked: true,
    reason: isRateLimit
      ? "This website is rate-limiting automated requests (HTTP 429). You can still submit your request manually — paste the URL in the notes field so the jeweller can view it."
      : `Could not load the page after ${RETRY_DELAYS_MS.length} attempts (${lastError}). Please check the URL or submit your request manually.`,
  };
}

// ─── main scrape function ────────────────────────────────────────────────────

export async function scrapeProductUrl(url: string): Promise<ScrapedProduct> {
  const result: ScrapedProduct = { sourceUrl: url };

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http/https URLs are supported");
    }
  } catch {
    throw new Error("Invalid URL");
  }
  // suppress unused-variable warning — parsed is used in buildHeaders
  void parsed;

  const fetched = await fetchWithRetry(url);

  // Graceful blocked fallback — return partial result with blocked flag
  if (fetched.blocked) {
    result.blocked = true;
    result.blockedReason = fetched.reason;
    return result;
  }

  const { html } = fetched;
  const $ = cheerio.load(html);

  // ── JSON-LD ──
  const jsonLdScripts: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdScripts.push($(el).html() || "");
  });
  const fromLd = extractFromJsonLd(jsonLdScripts);
  Object.assign(result, fromLd);

  // ── Open Graph / Twitter meta ──
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content");
  if (!result.imageUrl && ogImage) result.imageUrl = abs(url, ogImage);

  if (!result.title) {
    result.title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").text().trim() ||
      $("h1").first().text().trim();
  }

  if (!result.description) {
    result.description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      $('meta[name="description"]').attr("content");
  }

  // ── Product-specific meta tags (used by Shopify, WooCommerce, etc.) ──
  if (!result.price) {
    const metaPrice =
      $('meta[property="product:price:amount"]').attr("content") ||
      $('meta[property="og:price:amount"]').attr("content");
    if (metaPrice) {
      result.price = metaPrice;
      result.currency =
        $('meta[property="product:price:currency"]').attr("content") ||
        $('meta[property="og:price:currency"]').attr("content");
    }
  }

  // ── Fallback image: first large <img> in the page body ──
  if (!result.imageUrl) {
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      const w = parseInt($(el).attr("width") || "0", 10);
      const h = parseInt($(el).attr("height") || "0", 10);
      if (src && (w > 300 || h > 300)) {
        result.imageUrl = abs(url, src);
        return false; // break
      }
    });
  }

  // ── Regex extraction from visible text ──
  // Remove scripts, styles, nav, footer to reduce noise
  $("script, style, nav, footer, header").remove();
  const visibleText = $.text().replace(/\s+/g, " ").slice(0, 10_000);
  const fromText = extractFromText(visibleText);
  // Only fill fields not already found
  for (const [k, v] of Object.entries(fromText)) {
    if (v && !(result as unknown as Record<string, unknown>)[k]) {
      (result as unknown as Record<string, unknown>)[k] = v;
    }
  }

  // Clean up description
  if (result.description) {
    result.description = result.description.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  return result;
}
