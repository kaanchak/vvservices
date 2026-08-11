import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { AccountSession } from "./accountAuth";
import { allocateMonthlyCredits } from "./credits";

/**
 * Integration-style tests running against the real database through
 * tRPC callers. Each run creates uniquely-named rows and cleans up
 * relying on unique emails to avoid clashing with demo data.
 */

const suffix = Date.now().toString(36);

type SetCookieCall = { name: string; value: string; options: Record<string, unknown> };

function createCtx(account: AccountSession | null): {
  ctx: TrpcContext;
  cookies: SetCookieCall[];
} {
  const cookies: SetCookieCall[] = [];
  const ctx = {
    user: null,
    account,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  } as TrpcContext;
  return { ctx, cookies };
}

describe("account auth", () => {
  it("registers a buyer with phone, then logs in with same credentials", async () => {
    const { ctx, cookies } = createCtx(null);
    const caller = appRouter.createCaller(ctx);

    const email = `buyer-${suffix}@test.com`;
    const reg = await caller.account.register({
      name: "Test Buyer",
      email,
      phone: "+91 90000 11111",
      password: "secret123",
      role: "buyer",
    });
    expect(reg.email).toBe(email);
    expect(reg.phone).toBe("+91 90000 11111");
    expect(reg.role).toBe("buyer");
    expect(cookies.length).toBeGreaterThan(0);

    const { ctx: loginCtx } = createCtx(null);
    const loginCaller = appRouter.createCaller(loginCtx);
    const login = await loginCaller.account.login({ email, password: "secret123" });
    expect(login.role).toBe("buyer");
  });

  it("rejects wrong password", async () => {
    const { ctx } = createCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.account.login({ email: "user@demo.com", password: "wrong-pass" })
    ).rejects.toThrow();
  });

  it("logs in seeded demo accounts with exact credentials", async () => {
    for (const [email, password, role] of [
      ["user@demo.com", "demo123", "buyer"],
      ["jeweller@demo.com", "demo123", "jeweller"],
      ["admin@vvservices.com", "admin123", "admin"],
    ] as const) {
      const { ctx } = createCtx(null);
      const caller = appRouter.createCaller(ctx);
      const res = await caller.account.login({ email, password });
      expect(res.role).toBe(role);
    }
  });
});

describe("requests and quotes flow", () => {
  it("buyer creates request, jeweller sees lead and quotes it, buyer accepts", { timeout: 30000 }, async () => {
    // Register a fresh buyer and jeweller for isolation.
    const { ctx: bCtx } = createCtx(null);
    const bReg = await appRouter.createCaller(bCtx).account.register({
      name: "Flow Buyer",
      email: `flow-buyer-${suffix}@test.com`,
      phone: "+91 90000 22222",
      password: "secret123",
      role: "buyer",
    });
    const buyer: AccountSession = { accountId: bReg.id, role: "buyer" };

    const { ctx: jCtx } = createCtx(null);
    const jReg = await appRouter.createCaller(jCtx).account.register({
      name: "Flow Jeweller",
      email: `flow-jeweller-${suffix}@test.com`,
      phone: "+91 90000 33333",
      password: "secret123",
      role: "jeweller",
      businessName: "Flow Jewels",
      city: "Jaipur",
      categories: ["gold"],
    });
    const jeweller: AccountSession = { accountId: jReg.id, role: "jeweller" };
    await allocateMonthlyCredits(jReg.id, `test:marketplace-activation:${jReg.id}`, "Activate isolated marketplace test jeweller");

    // Buyer creates a request (image URL path).
    const buyerCaller = appRouter.createCaller(createCtx(buyer).ctx);
    const created = await buyerCaller.requests.create({
      title: `Vitest Gold Chain ${suffix}`,
      category: "gold",
      imageUrl: "https://example.com/chain.jpg",
      budgetMin: 20000,
      budgetMax: 40000,
      timeline: "2-4 weeks",
      notes: "vitest flow",
    });
    expect(created.id).toBeGreaterThan(0);

    // Jeweller sees it in leads (category matches).
    const jewellerCaller = appRouter.createCaller(createCtx(jeweller).ctx);
    const leads = await jewellerCaller.requests.leads();
    expect(leads.some(l => l.id === created.id)).toBe(true);

    // Jeweller quotes with itemised fields.
    const quote = await jewellerCaller.quotes.create({
      requestId: created.id,
      goldWeightGrams: 10.5,
      diamondWeightCarats: 0,
      makingCharges: 3000,
      totalPrice: 32000,
      message: "vitest quote",
    });
    expect(quote.id).toBeGreaterThan(0);

    // Buyer sees the quote for the request.
    const quotes = await buyerCaller.quotes.forRequest({ requestId: created.id });
    expect(quotes.length).toBe(1);
    expect(Number(quotes[0].quote.totalPrice)).toBe(32000);
    expect(quotes[0].quote.status).toBe("pending");

    // Buyer accepts; status updates for the jeweller's list too.
    await buyerCaller.quotes.setStatus({ quoteId: quote.id, status: "accepted" });
    const mine = await jewellerCaller.quotes.mine();
    const mineQuote = mine.find(q => q.quote.id === quote.id);
    expect(mineQuote?.quote.status).toBe("accepted");
  });

  it("jeweller does not see leads outside their categories", async () => {
    const { ctx: jCtx } = createCtx(null);
    const jReg = await appRouter.createCaller(jCtx).account.register({
      name: "Stone Only",
      email: `stone-only-${suffix}@test.com`,
      phone: "+91 90000 44444",
      password: "secret123",
      role: "jeweller",
      businessName: "Stone Only Works",
      city: "Surat",
      categories: ["stone-studded"],
    });
    const jeweller: AccountSession = { accountId: jReg.id, role: "jeweller" };
    const leads = await appRouter.createCaller(createCtx(jeweller).ctx).requests.leads();
    expect(leads.every(l => l.category === "stone-studded")).toBe(true);
  });

  it("buyer cannot access jeweller leads or admin stats", async () => {
    const { ctx } = createCtx(null);
    const login = await appRouter.createCaller(ctx).account.login({
      email: "user@demo.com",
      password: "demo123",
    });
    const buyer: AccountSession = { accountId: login.id, role: "buyer" };
    const caller = appRouter.createCaller(createCtx(buyer).ctx);
    await expect(caller.requests.leads()).rejects.toThrow();
    await expect(caller.admin.stats()).rejects.toThrow();
  });
});

describe("admin", () => {
  it("returns stats and full tables for admin", async () => {
    const { ctx } = createCtx(null);
    const login = await appRouter.createCaller(ctx).account.login({
      email: "admin@vvservices.com",
      password: "admin123",
    });
    const admin: AccountSession = { accountId: login.id, role: "admin" };
    const caller = appRouter.createCaller(createCtx(admin).ctx);

    const stats = await caller.admin.stats();
    expect(stats.buyers).toBeGreaterThan(0);
    expect(stats.jewellers).toBeGreaterThan(0);
    expect(stats.requests).toBeGreaterThan(0);
    expect(stats.quotes).toBeGreaterThan(0);

    const accounts = await caller.admin.accounts();
    expect(accounts.length).toBeGreaterThan(2);
    const requests = await caller.admin.requests();
    expect(requests.length).toBeGreaterThan(0);
    const quotes = await caller.admin.quotes();
    expect(quotes.length).toBeGreaterThan(0);
  });
});
