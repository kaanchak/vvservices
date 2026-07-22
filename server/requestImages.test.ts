import { describe, expect, it } from "vitest";
import * as db from "./db";

/**
 * Tests for Fix 2 — multiple images per request + background scrape fallback.
 * Uses the db helpers directly (same layer the router calls).
 */

const uniquePhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

async function makeBuyer() {
  const phone = uniquePhone();
  const id = await db.createAccount({
    phone,
    email: `img-test-${phone}@test.local`,
    passwordHash: "x",
    name: "Img Test Buyer",
    role: "buyer",
  } as Parameters<typeof db.createAccount>[0]);
  return id;
}

describe("request imageUrls column", () => {
  it("persists imageUrls JSON on createRequest and reads it back", async () => {
    const buyerId = await makeBuyer();
    const urls = [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ];
    const id = await db.createRequest({
      buyerId,
      title: "Gallery test request",
      category: "gold",
      imageUrl: urls[0],
      imageUrls: JSON.stringify(urls),
    });
    const row = await db.getRequestById(id);
    expect(row).toBeTruthy();
    expect(row!.imageUrl).toBe(urls[0]);
    expect(row!.imageUrls).toBeTruthy();
    const parsed = JSON.parse(row!.imageUrls!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toBe(urls[1]);
  });

  it("updateRequestImages patches images + scrapedDetails after background scrape", async () => {
    const buyerId = await makeBuyer();
    // Simulate race: request created with a page URL and no images yet
    const pageUrl = "https://shop.example.com/products/gold-necklace";
    const id = await db.createRequest({
      buyerId,
      title: "Race condition request",
      category: "gold",
      imageUrl: pageUrl,
    });

    // Simulate the background scrape completing
    const scrapedUrls = [
      "https://cdn.example.com/necklace-1.jpg",
      "https://cdn.example.com/necklace-2.jpg",
    ];
    const details = JSON.stringify({ title: "Gold Necklace", sourceUrl: pageUrl });
    await db.updateRequestImages(id, scrapedUrls[0]!, scrapedUrls, details);

    const row = await db.getRequestById(id);
    expect(row!.imageUrl).toBe(scrapedUrls[0]);
    const parsed = JSON.parse(row!.imageUrls!);
    expect(parsed).toHaveLength(2);
    expect(row!.scrapedDetails).toBe(details);
  });

  it("updateRequestImages with empty array clears imageUrls but keeps imageUrl when null passed", async () => {
    const buyerId = await makeBuyer();
    const id = await db.createRequest({
      buyerId,
      title: "No image scrape result",
      category: "gold",
      imageUrl: "https://cdn.example.com/existing.jpg",
      imageUrls: JSON.stringify(["https://cdn.example.com/existing.jpg"]),
    });
    await db.updateRequestImages(id, null, []);
    const row = await db.getRequestById(id);
    expect(row!.imageUrls).toBeNull();
    expect(row!.imageUrl).toBe("https://cdn.example.com/existing.jpg");
  });
});
