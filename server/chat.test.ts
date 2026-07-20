/**
 * Tests for:
 *  - Quote slot system (5-slot cap, pause-on-5, free-on-dismiss)
 *  - Chat thread creation on quote accept
 *  - Requote send / accept / reject
 *  - Report jeweller
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Silence realtime emitters so tests don't need a live socket ──────────────
vi.mock("./realtime", () => ({
  emitNewRequest: vi.fn(),
  emitNewQuote: vi.fn(),
  emitQuoteStatus: vi.fn(),
  emitNewMessage: vi.fn(),
  emitRequoteEvent: vi.fn(),
  emitThreadStatusChange: vi.fn(),
}));

// ── Silence scraper / gold-price side-effects ─────────────────────────────────
vi.mock("./scraper", () => ({
  scrapeProductUrl: vi.fn().mockResolvedValue(null),
  reHostImageForRequest: vi.fn().mockResolvedValue(null),
}));

vi.mock("./goldPrice", () => ({
  getLatestGoldPrice: vi.fn().mockResolvedValue(null),
  fetchAndStoreGoldPrice: vi.fn().mockResolvedValue(null),
  getGoldPriceHistory: vi.fn().mockResolvedValue([]),
}));

// ── Context helpers ───────────────────────────────────────────────────────────

type VVAccount = NonNullable<TrpcContext["account"]>;

function makeCtx(account: VVAccount): TrpcContext {
  return {
    user: null,
    account,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function buyerCtx(id: number): TrpcContext {
  return makeCtx({
    accountId: id,
    role: "buyer",
    name: `Buyer ${id}`,
    email: `buyer${id}@test.com`,
  } as VVAccount);
}

function jewellerCtx(id: number): TrpcContext {
  return makeCtx({
    accountId: id,
    role: "jeweller",
    name: `Jeweller ${id}`,
    email: `jeweller${id}@test.com`,
  } as VVAccount);
}

// ── DB helpers (mocked) ───────────────────────────────────────────────────────

vi.mock("./db", async () => {
  // Minimal in-memory store
  const requests = new Map<number, any>();
  const quotes = new Map<number, any>();
  const threads = new Map<number, any>();
  const messages = new Map<number, any>();
  const requotes = new Map<number, any>();
  const reports = new Map<number, any>();
  let nextId = 1;

  function nextInt() {
    return nextId++;
  }

  return {
    // ── requests ──
    getRequestById: vi.fn(async (id: number) => requests.get(id) ?? null),
    createRequest: vi.fn(async (data: any) => {
      const id = nextInt();
      requests.set(id, {
        id,
        status: "open",
        activeQuoteCount: 0,
        ...data,
      });
      return id;
    }),
    updateRequestStatus: vi.fn(async (id: number, status: string) => {
      const r = requests.get(id);
      if (r) r.status = status;
    }),
    adjustActiveQuoteCount: vi.fn(async (id: number, delta: number) => {
      const r = requests.get(id);
      if (!r) return;
      r.activeQuoteCount = Math.max(0, (r.activeQuoteCount ?? 0) + delta);
      // Pause if 5 slots filled
      if (r.activeQuoteCount >= 5 && r.status !== "paused") {
        r.status = "paused";
      }
      // Reopen if below 5 and was paused
      if (r.activeQuoteCount < 5 && r.status === "paused") {
        r.status = "quoted";
      }
    }),
    getRequestsByBuyer: vi.fn(async () => []),
    getOpenRequestsByCategories: vi.fn(async () => []),
    getQuoteCountForRequest: vi.fn(async () => 0),

    // ── quotes ──
    getQuoteById: vi.fn(async (id: number) => quotes.get(id) ?? null),
    createQuote: vi.fn(async (data: any) => {
      const id = nextInt();
      quotes.set(id, {
        id,
        status: "pending",
        requestId: data.requestId,
        jewellerId: data.jewellerId,
        totalPrice: data.totalPrice ?? 100000,
        preMessage: data.preMessage ?? null,
        message: data.message ?? null,
        goldWeightGrams: data.goldWeightGrams ?? null,
        diamondWeightCarats: data.diamondWeightCarats ?? null,
        makingCharges: data.makingCharges ?? null,
        goldPurity: data.goldPurity ?? "18kt",
        goldPricePerGram: data.goldPricePerGram ?? null,
        createdAt: new Date(),
      });
      return id;
    }),
    updateQuoteStatus: vi.fn(async (id: number, status: string) => {
      const q = quotes.get(id);
      if (q) q.status = status;
    }),
    hasJewellerQuoted: vi.fn(async (requestId: number, jewellerId: number) => {
      for (const q of quotes.values()) {
        if (q.requestId === requestId && q.jewellerId === jewellerId) return true;
      }
      return false;
    }),
    getQuotesForRequest: vi.fn(async () => []),
    getQuotesForBuyer: vi.fn(async () => []),
    getQuotesByJeweller: vi.fn(async () => []),

    // ── threads ──
    getChatThreadById: vi.fn(async (id: number) => threads.get(id) ?? null),
    createChatThread: vi.fn(async (data: any) => {
      const id = nextInt();
      threads.set(id, {
        id,
        status: "open",
        requestId: data.requestId,
        buyerId: data.buyerId,
        jewellerId: data.jewellerId,
        quoteId: data.quoteId,
        createdAt: new Date(),
        closedAt: null,
      });
      return id;
    }),
    updateChatThreadStatus: vi.fn(async (id: number, status: string) => {
      const t = threads.get(id);
      if (t) {
        t.status = status;
        t.closedAt = new Date();
      }
    }),
    getChatThreadsForBuyer: vi.fn(async () => []),
    getChatThreadsForJeweller: vi.fn(async () => []),
    getChatThreadByQuote: vi.fn(async (quoteId: number) => {
      for (const t of threads.values()) {
        if (t.quoteId === quoteId) return t;
      }
      return null;
    }),

    // ── messages ──
    getMessageById: vi.fn(async (id: number) => messages.get(id) ?? null),
    createMessage: vi.fn(async (data: any) => {
      const id = nextInt();
      messages.set(id, { id, ...data, createdAt: new Date() });
      return id;
    }),
    getMessagesByThread: vi.fn(async () => []),

    // ── requotes ──
    getRequoteById: vi.fn(async (id: number) => requotes.get(id) ?? null),
    createRequote: vi.fn(async (data: any) => {
      const id = nextInt();
      requotes.set(id, {
        id,
        status: "pending",
        threadId: data.threadId,
        jewellerId: data.jewellerId,
        newPrice: data.newPrice,
        reason: data.reason ?? null,
        goldWeightGrams: data.goldWeightGrams ?? null,
        diamondWeightCarats: data.diamondWeightCarats ?? null,
        makingCharges: data.makingCharges ?? null,
        goldPurity: data.goldPurity ?? null,
        createdAt: new Date(),
      });
      return id;
    }),
    updateRequoteStatus: vi.fn(async (id: number, status: string) => {
      const r = requotes.get(id);
      if (r) r.status = status;
    }),
    getRequotesByThread: vi.fn(async (threadId: number) =>
      [...requotes.values()].filter(r => r.threadId === threadId)
    ),
    getPendingRequoteForThread: vi.fn(async (threadId: number) => {
      for (const r of requotes.values()) {
        if (r.threadId === threadId && r.status === "pending") return r;
      }
      return null;
    }),

    // ── reports ──
    createReport: vi.fn(async (data: any) => {
      const id = nextInt();
      reports.set(id, { id, status: "pending", ...data, createdAt: new Date() });
      return id;
    }),
    getReportById: vi.fn(async (id: number) => reports.get(id) ?? null),
    updateReportStatus: vi.fn(async (id: number, status: string, notes?: string) => {
      const r = reports.get(id);
      if (r) {
        r.status = status;
        if (notes) r.adminNotes = notes;
      }
    }),
    getPendingReports: vi.fn(async () => []),
    getAllReports: vi.fn(async () => []),
    getJewellersIncidents: vi.fn(async () => []),
    getAdminChats: vi.fn(async () => []),

    // ── accounts (stub) ──
    getAccountById: vi.fn(async (id: number) => ({
      id,
      name: `User ${id}`,
      email: `user${id}@test.com`,
      role: "jeweller",
      businessName: `Shop ${id}`,
      city: "Mumbai",
      rating: "4.5",
      categories: "rings",
    })),
    getAccountByEmail: vi.fn(async () => null),
    createAccount: vi.fn(async () => 1),
    updateAccount: vi.fn(async () => {}),
    getAllAccounts: vi.fn(async () => []),

    // ── admin stubs ──
    getAdminStats: vi.fn(async () => ({
      buyers: 0,
      jewellers: 0,
      requests: 0,
      quotes: 0,
      accepted: 0,
      waitlist: 0,
      activeChats: 0,
      pendingReports: 0,
    })),
    getAdminRequests: vi.fn(async () => []),
    getAdminQuotes: vi.fn(async () => []),

    // ── waitlist stubs ──
    addToWaitlist: vi.fn(async () => 1),
    getWaitlistCount: vi.fn(async () => 0),
  };
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

import * as db from "./db";

async function seedRequest(buyerId: number) {
  const id = await db.createRequest({
    buyerId,
    title: "Test Ring",
    description: "A test ring",
    category: "rings",
    budgetMin: 50000,
    budgetMax: 100000,
    imageUrl: null,
    scrapedDetails: null,
  });
  return id;
}

async function seedQuote(requestId: number, jewellerId: number, price = 80000) {
  const id = await db.createQuote({
    requestId,
    jewellerId,
    totalPrice: price,
    goldPurity: "18kt",
  });
  await db.adjustActiveQuoteCount(requestId, 1);
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Quote slot system", () => {
  it("allows a jeweller to submit a quote when slots < 5", async () => {
    const requestId = await seedRequest(10);
    const caller = appRouter.createCaller(jewellerCtx(20));
    const result = await caller.quotes.create({
      requestId,
      totalPrice: 80000,
      goldPurity: "18kt",
    });
    expect(result).toBeDefined();
    expect(result!.status).toBe("pending");
  });

  it("pauses the request when activeQuoteCount reaches 5", async () => {
    const requestId = await seedRequest(11);
    // Seed 4 quotes from other jewellers
    for (let j = 30; j < 34; j++) {
      await seedQuote(requestId, j);
    }
    // 5th quote from jeweller 34
    const caller = appRouter.createCaller(jewellerCtx(34));
    await caller.quotes.create({ requestId, totalPrice: 90000, goldPurity: "18kt" });
    const req = await db.getRequestById(requestId);
    expect(req!.activeQuoteCount).toBe(5);
    expect(req!.status).toBe("paused");
  });

  it("rejects a 6th quote when request is paused", async () => {
    const requestId = await seedRequest(12);
    for (let j = 40; j < 45; j++) {
      await seedQuote(requestId, j);
    }
    // Manually mark as paused (adjustActiveQuoteCount already does this)
    const req = await db.getRequestById(requestId);
    expect(req!.status).toBe("paused");

    const caller = appRouter.createCaller(jewellerCtx(99));
    await expect(
      caller.quotes.create({ requestId, totalPrice: 75000, goldPurity: "18kt" })
    ).rejects.toThrow();
  });

  it("does NOT pause the request when buyer accepts a quote (slots < 5)", async () => {
    const requestId = await seedRequest(13);
    const quoteId = await seedQuote(requestId, 50);
    const buyerCaller = appRouter.createCaller(buyerCtx(13));
    const result = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    expect(result.success).toBe(true);
    expect(result.threadId).toBeDefined();
    const req = await db.getRequestById(requestId);
    // Should NOT be paused — only 1 quote was accepted, slots < 5
    expect(req!.status).not.toBe("paused");
  });

  it("frees a slot when buyer dismisses a quote", async () => {
    const requestId = await seedRequest(14);
    const quoteId = await seedQuote(requestId, 60);
    const req1 = await db.getRequestById(requestId);
    expect(req1!.activeQuoteCount).toBe(1);

    const buyerCaller = appRouter.createCaller(buyerCtx(14));
    await buyerCaller.quotes.setStatus({ quoteId, status: "dismissed" });
    const req2 = await db.getRequestById(requestId);
    expect(req2!.activeQuoteCount).toBe(0);
  });
});

describe("Chat thread", () => {
  it("opens a thread when buyer accepts a quote", async () => {
    const requestId = await seedRequest(15);
    const quoteId = await seedQuote(requestId, 70);
    const buyerCaller = appRouter.createCaller(buyerCtx(15));
    const result = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    expect(result.threadId).toBeTypeOf("number");
    const thread = await db.getChatThreadById(result.threadId!);
    expect(thread!.status).toBe("open");
    expect(thread!.buyerId).toBe(15);
    expect(thread!.jewellerId).toBe(70);
  });

  it("lets buyer send a message in an open thread", async () => {
    const requestId = await seedRequest(16);
    const quoteId = await seedQuote(requestId, 71);
    const buyerCaller = appRouter.createCaller(buyerCtx(16));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const msg = await buyerCaller.chat.sendMessage({
      threadId: threadId!,
      content: "Hello, can you confirm the delivery date?",
    });
    expect(msg).toBeDefined();
    expect(msg!.content).toBe("Hello, can you confirm the delivery date?");
  });

  it("closes thread as buyer_declined when buyer closes", async () => {
    const requestId = await seedRequest(17);
    const quoteId = await seedQuote(requestId, 72);
    const buyerCaller = appRouter.createCaller(buyerCtx(17));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const result = await buyerCaller.chat.closeThread({ threadId: threadId! });
    expect(result.status).toBe("buyer_declined");
    const thread = await db.getChatThreadById(threadId!);
    expect(thread!.status).toBe("buyer_declined");
  });

  it("closes thread as jeweller_withdrawn when jeweller closes", async () => {
    const requestId = await seedRequest(18);
    const quoteId = await seedQuote(requestId, 73);
    const buyerCaller = appRouter.createCaller(buyerCtx(18));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const jewellerCaller = appRouter.createCaller(jewellerCtx(73));
    const result = await jewellerCaller.chat.closeThread({ threadId: threadId! });
    expect(result.status).toBe("jeweller_withdrawn");
  });

  it("rejects messages in a closed thread", async () => {
    const requestId = await seedRequest(19);
    const quoteId = await seedQuote(requestId, 74);
    const buyerCaller = appRouter.createCaller(buyerCtx(19));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    await buyerCaller.chat.closeThread({ threadId: threadId! });
    await expect(
      buyerCaller.chat.sendMessage({ threadId: threadId!, content: "Still there?" })
    ).rejects.toThrow("closed");
  });
});

describe("Requote flow", () => {
  it("jeweller can send a requote in an open thread", async () => {
    const requestId = await seedRequest(20);
    const quoteId = await seedQuote(requestId, 80);
    const buyerCaller = appRouter.createCaller(buyerCtx(20));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const jewellerCaller = appRouter.createCaller(jewellerCtx(80));
    const result = await jewellerCaller.requotes.send({
      threadId: threadId!,
      newPrice: 95000,
      reason: "Gold price increased since original quote",
    });
    expect(result).toBeDefined();
    expect(result!.status).toBe("pending");
    expect(result!.newPrice).toBe(95000);
  });

  it("buyer can accept a requote", async () => {
    const requestId = await seedRequest(21);
    const quoteId = await seedQuote(requestId, 81);
    const buyerCaller = appRouter.createCaller(buyerCtx(21));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const jewellerCaller = appRouter.createCaller(jewellerCtx(81));
    const requote = await jewellerCaller.requotes.send({
      threadId: threadId!,
      newPrice: 88000,
      reason: "Revised making charges",
    });
    const result = await buyerCaller.requotes.accept({
      requoteId: requote!.id,
    });
    expect(result.success).toBe(true);
    const rq = await db.getRequoteById(requote!.id);
    expect(rq!.status).toBe("accepted");
  });

  it("buyer can reject a requote", async () => {
    const requestId = await seedRequest(22);
    const quoteId = await seedQuote(requestId, 82);
    const buyerCaller = appRouter.createCaller(buyerCtx(22));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const jewellerCaller = appRouter.createCaller(jewellerCtx(82));
    const requote = await jewellerCaller.requotes.send({
      threadId: threadId!,
      newPrice: 120000,
      reason: "Market rate adjustment",
    });
    const result = await buyerCaller.requotes.reject({
      requoteId: requote!.id,
    });
    expect(result.success).toBe(true);
    const rq = await db.getRequoteById(requote!.id);
    expect(rq!.status).toBe("rejected");
  });

  it("blocks a second pending requote while one is active", async () => {
    const requestId = await seedRequest(23);
    const quoteId = await seedQuote(requestId, 83);
    const buyerCaller = appRouter.createCaller(buyerCtx(23));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const jewellerCaller = appRouter.createCaller(jewellerCtx(83));
    await jewellerCaller.requotes.send({
      threadId: threadId!,
      newPrice: 90000,
      reason: "First requote",
    });
    await expect(
      jewellerCaller.requotes.send({
        threadId: threadId!,
        newPrice: 95000,
        reason: "Second requote",
      })
    ).rejects.toThrow();
  });
});

describe("Report jeweller", () => {
  it("buyer can file a report against a jeweller", async () => {
    const requestId = await seedRequest(24);
    const quoteId = await seedQuote(requestId, 90);
    const buyerCaller = appRouter.createCaller(buyerCtx(24));
    const { threadId } = await buyerCaller.quotes.setStatus({ quoteId, status: "accepted" });
    const result = await buyerCaller.reports.file({
      reportedJewellerId: 90,
      threadId: threadId!,
      reason: "Jeweller sent unsolicited requote and was rude.",
    });
    expect(result.success).toBe(true);
  });
});
