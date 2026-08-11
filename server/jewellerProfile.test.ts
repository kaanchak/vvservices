import { afterAll, describe, expect, it } from "vitest";
import * as db from "./db";

/**
 * Phase 5 — jeweller public profiles.
 *
 * Covers the three rules that matter most:
 *  1. A profile is invisible publicly until an admin approves it.
 *  2. Approving assigns a URL slug, and slugs are unique per account.
 *  3. Quoted work (which comes from someone else's buyer request) is only
 *     visible to logged-in viewers, and only once the jeweller promotes it.
 */

const uniquePhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

/**
 * Accounts created here are torn down afterwards. Without this, approved test
 * profiles leak into the real public directory at /jewellers.
 */
const createdIds: number[] = [];

async function makeJeweller(businessName = "Test Jewellers") {
  const phone = uniquePhone();
  const id = await db.createAccount({
    phone,
    email: `prof-test-${phone}@test.local`,
    passwordHash: "x",
    name: "Profile Test Jeweller",
    role: "jeweller",
    businessName,
    categories: "gold",
  } as Parameters<typeof db.createAccount>[0]);
  createdIds.push(id);
  return id;
}

afterAll(async () => {
  for (const id of createdIds) {
    const items = await db.getPortfolioForJeweller(id);
    for (const item of items) await db.deletePortfolioItem(item.id);
    await db.deleteAccountById(id);
  }
});

describe("slugifyBusinessName", () => {
  it("produces a URL-safe slug suffixed with the account id", () => {
    expect(db.slugifyBusinessName("VV Jewellers", 12)).toBe("vv-jewellers-12");
  });

  it("collapses punctuation and trims stray separators", () => {
    expect(db.slugifyBusinessName("  Gupta & Sons — Jaipur!  ", 7)).toBe(
      "gupta-sons-jaipur-7"
    );
  });

  it("falls back to the id when the name has no Latin characters", () => {
    expect(db.slugifyBusinessName("वी वी ज्वैलर्स", 99)).toBe("jeweller-99");
  });

  it("never returns a slug that could collide with a dashboard route", () => {
    // Slugs always carry the id suffix, so "quotes" can never shadow /jeweller/quotes.
    expect(db.slugifyBusinessName("quotes", 5)).toBe("quotes-5");
  });
});

describe("profile moderation state machine", () => {
  it("starts as draft and is not publicly reachable", async () => {
    const id = await makeJeweller();
    const acct = await db.getAccountById(id);
    expect(acct!.profileStatus).toBe("draft");
    expect(acct!.profileSlug).toBeFalsy();
  });

  it("stays invisible while pending review", async () => {
    const id = await makeJeweller("Pending Jewellers");
    await db.setProfileStatus(id, "pending");

    const pendingList = await db.listJewellersByProfileStatus("pending");
    expect(pendingList.some(j => j.id === id)).toBe(true);

    // Not in the public directory yet.
    const publicList = await db.listApprovedJewellers();
    expect(publicList.some(j => j.id === id)).toBe(false);
  });

  it("becomes publicly reachable by slug only after approval", async () => {
    const id = await makeJeweller("Approved Jewellers");
    const slug = await db.ensureProfileSlug(id, "Approved Jewellers");
    expect(slug).toContain(String(id));

    // Still not approved — the public lookup must miss.
    expect(await db.getApprovedJewellerBySlug(slug)).toBeFalsy();

    await db.setProfileStatus(id, "approved");
    const found = await db.getApprovedJewellerBySlug(slug);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(id);

    const publicList = await db.listApprovedJewellers();
    expect(publicList.some(j => j.id === id)).toBe(true);
  });

  it("suspending removes the profile from public view again", async () => {
    const id = await makeJeweller("Suspended Jewellers");
    const slug = await db.ensureProfileSlug(id, "Suspended Jewellers");
    await db.setProfileStatus(id, "approved");
    expect(await db.getApprovedJewellerBySlug(slug)).toBeTruthy();

    await db.setProfileStatus(id, "suspended", "Address could not be verified");
    expect(await db.getApprovedJewellerBySlug(slug)).toBeFalsy();

    const acct = await db.getAccountById(id);
    expect(acct!.profileStatus).toBe("suspended");
    expect(acct!.profileReviewNote).toBe("Address could not be verified");
  });

  it("keeps the same slug across an approve → suspend → approve cycle", async () => {
    const id = await makeJeweller("Stable Slug Jewellers");
    const first = await db.ensureProfileSlug(id, "Stable Slug Jewellers");
    await db.setProfileStatus(id, "approved");
    await db.setProfileStatus(id, "suspended");
    const second = await db.ensureProfileSlug(id, "Stable Slug Jewellers");
    expect(second).toBe(first);
  });

  it("stores a review note when changes are requested", async () => {
    const id = await makeJeweller("Rejected Jewellers");
    await db.setProfileStatus(id, "rejected", "Please share a GST certificate");
    const acct = await db.getAccountById(id);
    expect(acct!.profileStatus).toBe("rejected");
    expect(acct!.profileReviewNote).toBe("Please share a GST certificate");
  });
});

describe("profile field updates", () => {
  it("persists the public contact fields buyers rely on", async () => {
    const id = await makeJeweller();
    await db.updateJewellerProfile(id, {
      businessName: "VV Jewellers",
      city: "Jaipur",
      address: "12 Johari Bazaar, Jaipur 302003",
      website: "https://vvjewellers.example",
      instagramUrl: "https://instagram.com/vvjewellers",
      about: "Three generations of kundan work.",
      whatsappNumber: "+919111130655",
    });
    const acct = await db.getAccountById(id);
    expect(acct!.businessName).toBe("VV Jewellers");
    expect(acct!.city).toBe("Jaipur");
    expect(acct!.address).toContain("Johari Bazaar");
    expect(acct!.website).toBe("https://vvjewellers.example");
    expect(acct!.instagramUrl).toContain("instagram.com");
    expect(acct!.about).toContain("kundan");
    expect(acct!.whatsappNumber).toBe("+919111130655");
  });

  it("leaves untouched fields alone when the patch is partial", async () => {
    const id = await makeJeweller();
    await db.updateJewellerProfile(id, { city: "Surat" });
    await db.updateJewellerProfile(id, { about: "Diamond specialists." });
    const acct = await db.getAccountById(id);
    expect(acct!.city).toBe("Surat");
    expect(acct!.about).toBe("Diamond specialists.");
  });
});

describe("portfolio visibility rules", () => {
  it("shows uploaded photos to everyone, signed in or not", async () => {
    const id = await makeJeweller();
    await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/uploaded-1.jpg",
      source: "uploaded",
    } as Parameters<typeof db.createPortfolioItem>[0]);

    const guestView = await db.getVisiblePortfolio(id, false);
    const memberView = await db.getVisiblePortfolio(id, true);
    expect(guestView).toHaveLength(1);
    expect(memberView).toHaveLength(1);
  });

  it("hides quoted work from guests entirely", async () => {
    const id = await makeJeweller();
    await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/quoted-1.jpg",
      source: "quoted",
      isPromoted: true,
    } as Parameters<typeof db.createPortfolioItem>[0]);

    const guestView = await db.getVisiblePortfolio(id, false);
    expect(guestView).toHaveLength(0);
  });

  it("hides quoted work from members until the jeweller promotes it", async () => {
    const id = await makeJeweller();
    const itemId = await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/quoted-2.jpg",
      source: "quoted",
      isPromoted: false,
    } as Parameters<typeof db.createPortfolioItem>[0]);

    expect(await db.getVisiblePortfolio(id, true)).toHaveLength(0);

    await db.updatePortfolioItem(itemId, { isPromoted: true });
    const promoted = await db.getVisiblePortfolio(id, true);
    expect(promoted).toHaveLength(1);
    expect(promoted[0].source).toBe("quoted");
  });

  it("separates uploaded and quoted work correctly in a mixed portfolio", async () => {
    const id = await makeJeweller();
    await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/mix-up.jpg",
      source: "uploaded",
    } as Parameters<typeof db.createPortfolioItem>[0]);
    await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/mix-quoted-promoted.jpg",
      source: "quoted",
      isPromoted: true,
    } as Parameters<typeof db.createPortfolioItem>[0]);
    await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/mix-quoted-private.jpg",
      source: "quoted",
      isPromoted: false,
    } as Parameters<typeof db.createPortfolioItem>[0]);

    const guestView = await db.getVisiblePortfolio(id, false);
    expect(guestView).toHaveLength(1);
    expect(guestView.every(i => i.source === "uploaded")).toBe(true);

    const memberView = await db.getVisiblePortfolio(id, true);
    expect(memberView).toHaveLength(2);
  });

  it("deleting a photo removes it from every view", async () => {
    const id = await makeJeweller();
    const itemId = await db.createPortfolioItem({
      jewellerId: id,
      imageUrl: "https://cdn.example.com/to-delete.jpg",
      source: "uploaded",
    } as Parameters<typeof db.createPortfolioItem>[0]);

    expect(await db.getVisiblePortfolio(id, false)).toHaveLength(1);
    await db.deletePortfolioItem(itemId);
    expect(await db.getVisiblePortfolio(id, false)).toHaveLength(0);
    expect(await db.getPortfolioItemById(itemId)).toBeFalsy();
  });
});
