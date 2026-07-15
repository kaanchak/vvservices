import { describe, expect, it } from "vitest";

// Test the internal helpers by importing the scraper module
// We test the regex/extraction logic without making real HTTP calls.

import { scrapeProductUrl } from "./scraper";

// ─── mock HTML fixtures ──────────────────────────────────────────────────────

const mockHtmlProduct = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="18K Rose Gold Diamond Ring" />
  <meta property="og:image" content="https://example.com/ring.jpg" />
  <meta property="og:description" content="Elegant 18K rose gold ring with 0.5ct diamond solitaire." />
  <meta property="product:price:amount" content="85000" />
  <meta property="product:price:currency" content="INR" />
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "18K Rose Gold Diamond Ring",
    "material": "18K Rose Gold",
    "additionalProperty": [
      { "name": "Gold Weight", "value": "4.5 grams" },
      { "name": "Diamond Weight", "value": "0.5 carats" },
      { "name": "Stone Type", "value": "Diamond" }
    ]
  }
  </script>
</head>
<body>
  <h1>18K Rose Gold Diamond Ring</h1>
  <p>Beautiful 18K rose gold ring with 0.5ct brilliant cut diamond.</p>
</body>
</html>`;

const mockHtmlTextOnly = `<!DOCTYPE html>
<html>
<head><title>Gold Necklace</title></head>
<body>
  <h1>22K Gold Bridal Necklace</h1>
  <p>Gold weight: 45.5 grams. Price: ₹2,20,000. 22K yellow gold.</p>
  <p>Includes 1.25 carats diamond studding.</p>
</body>
</html>`;

const mockHtmlNoDetails = `<!DOCTYPE html>
<html><head><title>Jewellery Store</title></head>
<body><p>Welcome to our store.</p></body>
</html>`;

// ─── mock fetch helpers ──────────────────────────────────────────────────────

function makeMockFetch(html: string, contentType = "text/html; charset=utf-8", status = 200) {
  return async (_url: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(html);
    let done = false;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h: string) => {
          if (h === "content-type") return contentType;
          return null;
        },
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: data };
          },
          cancel: async () => {},
        }),
      },
    } as unknown as Response;
  };
}

/** Simulates a server that always returns a given HTTP status (no body needed) */
function makeMockFetchStatus(status: number) {
  return async (_url: string) => ({
    ok: false,
    status,
    headers: { get: (_h: string) => null },
    body: null,
  }) as unknown as Response;
}

/** Simulates N failures followed by a success */
function makeMockFetchRetry(failCount: number, failStatus: number, successHtml: string) {
  let calls = 0;
  return async (_url: string): Promise<Response> => {
    calls++;
    if (calls <= failCount) {
      return {
        ok: false,
        status: failStatus,
        headers: { get: (_h: string) => null },
        body: null,
      } as unknown as Response;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(successHtml);
    let done = false;
    return {
      ok: true,
      status: 200,
      headers: { get: (h: string) => h === "content-type" ? "text/html" : null },
      body: {
        getReader: () => ({
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: data };
          },
          cancel: async () => {},
        }),
      },
    } as unknown as Response;
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("scrapeProductUrl", () => {
  it("extracts OG meta + JSON-LD product data", async () => {
    global.fetch = makeMockFetch(mockHtmlProduct) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/ring");
    expect(result.blocked).toBeFalsy();
    expect(result.title).toBe("18K Rose Gold Diamond Ring");
    expect(result.imageUrl).toBe("https://example.com/ring.jpg");
    expect(result.description).toContain("diamond");
    expect(result.price).toBe("85000");
    expect(result.currency).toBe("INR");
    expect(result.metalType).toBe("18K Rose Gold");
    expect(result.goldWeight).toBe("4.5 grams");
    expect(result.diamondWeight).toBe("0.5 carats");
  });

  it("falls back to regex extraction from visible text", async () => {
    global.fetch = makeMockFetch(mockHtmlTextOnly) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/necklace");
    expect(result.blocked).toBeFalsy();
    expect(result.title).toBeTruthy();
    // Price regex should find ₹2,20,000
    expect(result.price).toBeTruthy();
    // Gold weight regex
    expect(result.goldWeight).toBeTruthy();
    // Metal type regex
    expect(result.metalType).toBeTruthy();
  });

  it("returns sourceUrl even when page has no product details", async () => {
    global.fetch = makeMockFetch(mockHtmlNoDetails) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/store");
    expect(result.blocked).toBeFalsy();
    expect(result.sourceUrl).toBe("https://example.com/store");
    expect(result.title).toBeTruthy(); // falls back to <title>
  });

  it("returns blocked=true with reason for non-HTML content type", async () => {
    global.fetch = makeMockFetch("{}", "application/json") as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/api");
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBeTruthy();
  });

  it("throws on invalid URL", async () => {
    await expect(scrapeProductUrl("not-a-url")).rejects.toThrow();
  });

  it("returns blocked=true with 429 reason when site rate-limits all retries", async () => {
    // All 3 attempts return 429
    global.fetch = makeMockFetchStatus(429) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/blocked");
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toMatch(/429|rate.limit/i);
  });

  it("returns blocked=true immediately for 403 (access denied, no retry)", async () => {
    global.fetch = makeMockFetchStatus(403) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/forbidden");
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toMatch(/403|access denied/i);
  });

  it("succeeds after 1 retry when first attempt returns 503", async () => {
    // First call: 503, second call: 200 with product HTML
    global.fetch = makeMockFetchRetry(1, 503, mockHtmlProduct) as typeof fetch;
    const result = await scrapeProductUrl("https://example.com/ring");
    expect(result.blocked).toBeFalsy();
    expect(result.title).toBe("18K Rose Gold Diamond Ring");
  });
});
