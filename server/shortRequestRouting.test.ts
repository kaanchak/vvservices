import { afterAll, describe, expect, it } from "vitest";
import * as db from "./db";
import { appRouter, inferRequestCategory } from "./routers";
import type { AccountSession } from "./accountAuth";
import type { TrpcContext } from "./_core/context";

/** Tests for the short three-field buyer request flow's routing rules. */
const createdAccounts: number[] = [];
const createdRequests: number[] = [];
const uniquePhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

async function makeAccount(role: "buyer" | "jeweller", categories?: string) {
  const phone = uniquePhone();
  const id = await db.createAccount({
    phone,
    email: `short-form-${phone}@test.local`,
    passwordHash: "x",
    name: `Short Form ${role}`,
    role,
    categories,
  } as Parameters<typeof db.createAccount>[0]);
  createdAccounts.push(id);
  return id;
}

function createBuyerCaller(accountId: number) {
  const ctx = {
    user: null,
    account: { accountId, role: "buyer" } as AccountSession,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  } as TrpcContext;
  return appRouter.createCaller(ctx);
}

afterAll(async () => {
  for (const id of createdRequests) await db.deleteRequestById(id);
  for (const id of createdAccounts) await db.deleteAccountById(id);
});

describe("inferRequestCategory", () => {
  it.each([
    ["18KT yellow gold bracelet", "gold"],
    ["Lab-grown diamond engagement ring", "diamond-gold"],
    ["Natural diamond solitaire pendant", "diamond-gold"],
    ["Kundan and emerald bridal set", "stone-studded"],
  ] as const)("maps %s to %s", (specification, expected) => {
    expect(inferRequestCategory(specification)).toBe(expected);
  });

  it("does not guess when there is no meaningful material or stone clue", () => {
    expect(inferRequestCategory("Please make something like the attached photo")).toBeNull();
  });
});

describe("autoRouteAll lead visibility", () => {
  it("accepts URL, approximate budget and specifications with no buyer-supplied title or category", async () => {
    const buyerId = await makeAccount("buyer");
    const caller = createBuyerCaller(buyerId);
    const created = await caller.requests.create({
      // A direct image URL avoids the page-scrape fallback in this focused contract test.
      imageUrl: "https://example.invalid/reference.jpg",
      budgetMin: 75000,
      budgetMax: 75000,
      notes: "18KT yellow gold, lab-grown diamond, ring size 12",
    });
    createdRequests.push(created.id);

    expect(created.title).toContain("Custom jewellery request");
    expect(created.category).toBe("diamond-gold");
    expect(created.autoRouteAll).toBe(false);
    expect(created.budgetMin).toBe(75000);
    expect(created.budgetMax).toBe(75000);
  });

  it("shows an unclassified short-form request to every jeweller category", async () => {
    const buyerId = await makeAccount("buyer");
    const goldJewellerId = await makeAccount("jeweller", "gold");
    const stoneJewellerId = await makeAccount("jeweller", "stone-studded");

    const requestId = await db.createRequest({
      buyerId,
      title: "Custom jewellery request",
      category: "gold", // required legacy column fallback; autoRouteAll controls visibility.
      autoRouteAll: true,
      budgetMin: 75000,
      budgetMax: 75000,
      notes: "Similar to attached reference",
    });
    createdRequests.push(requestId);

    const goldLeads = await db.getOpenRequestsByCategories(["gold"]);
    const stoneLeads = await db.getOpenRequestsByCategories(["stone-studded"]);
    expect(goldLeads.some(row => row.request.id === requestId)).toBe(true);
    expect(stoneLeads.some(row => row.request.id === requestId)).toBe(true);

    // Prevent unused-id mistakes and make the test setup intent explicit.
    expect(goldJewellerId).toBeGreaterThan(0);
    expect(stoneJewellerId).toBeGreaterThan(0);
  });

  it("keeps inferred requests scoped to the matching category", async () => {
    const buyerId = await makeAccount("buyer");
    const requestId = await db.createRequest({
      buyerId,
      title: "Lab-grown diamond ring",
      category: "diamond-gold",
      autoRouteAll: false,
      budgetMin: 100000,
      budgetMax: 100000,
      notes: "Lab-grown diamond",
    });
    createdRequests.push(requestId);

    const goldLeads = await db.getOpenRequestsByCategories(["gold"]);
    const diamondLeads = await db.getOpenRequestsByCategories(["diamond-gold"]);
    expect(goldLeads.some(row => row.request.id === requestId)).toBe(false);
    expect(diamondLeads.some(row => row.request.id === requestId)).toBe(true);
  });
});
