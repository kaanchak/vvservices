import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accounts,
  chatThreads,
  exchangeRates,
  InsertAccount,
  InsertChatThread,
  InsertJewelleryReport,
  InsertMessage,
  InsertOrder,
  InsertQuote,
  InsertRequest,
  InsertRequote,
  InsertUser,
  jewelleryReports,
  messages,
  orders,
  quotes,
  requests,
  requotes,
  users,
  waitlist,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// VVServices accounts (custom email/password auth)
// ---------------------------------------------------------------------------

export async function getAccountByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function getAccountByWhatsapp(whatsappNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.whatsappNumber, whatsappNumber))
    .limit(1);
  return rows[0];
}

export async function getAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return rows[0];
}

export async function createAccount(account: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(accounts)
    .values({ ...account, email: account.email.toLowerCase() });
  return Number(result[0].insertId);
}

// ---------------------------------------------------------------------------
// Requests (buyer leads)
// ---------------------------------------------------------------------------

export async function createRequest(request: InsertRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(requests).values(request);
  return Number(result[0].insertId);
}

export async function getRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
  return rows[0];
}

export async function getRequestsByBuyer(buyerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(requests)
    .where(eq(requests.buyerId, buyerId))
    .orderBy(desc(requests.createdAt));
}

/** Leads for a jeweller filtered by their categories, newest first.
 *  Only returns requests with status 'open' or 'quoted' (not paused/closed). */
export async function getOpenRequestsByCategories(
  categories: ("gold" | "diamond-gold" | "stone-studded")[]
) {
  const db = await getDb();
  if (!db || categories.length === 0) return [];
  return db
    .select({
      request: requests,
      buyerName: accounts.name,
    })
    .from(requests)
    .leftJoin(accounts, eq(requests.buyerId, accounts.id))
    .where(
      and(
        inArray(requests.category, categories),
        inArray(requests.status, ["open", "quoted"])
      )
    )
    .orderBy(desc(requests.createdAt));
}

/**
 * Update the images (and optionally scraped details) of a request after a
 * background server-side scrape completes. Used for the image race-condition
 * fallback: buyer submitted a page URL before the frontend scrape finished.
 */
export async function updateRequestImages(
  id: number,
  imageUrl: string | null,
  imageUrls: string[],
  scrapedDetails?: string | null,
  originalPrice?: string | null,
  originalCurrency?: string | null
) {
  const db = await getDb();
  if (!db) return;
  const set: Partial<InsertRequest> = {
    imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
  };
  if (imageUrl) set.imageUrl = imageUrl;
  if (scrapedDetails) set.scrapedDetails = scrapedDetails;
  if (originalPrice) set.originalPrice = originalPrice;
  if (originalCurrency) set.originalCurrency = originalCurrency;
  await db.update(requests).set(set).where(eq(requests.id, id));
}

export async function updateRequestStatus(
  id: number,
  status: "open" | "quoted" | "paused" | "closed"
) {
  const db = await getDb();
  if (!db) return;
  await db.update(requests).set({ status }).where(eq(requests.id, id));
}

/** Increment or decrement the active quote count and update status accordingly.
 *  Returns the new count. */
export async function adjustActiveQuoteCount(
  requestId: number,
  delta: 1 | -1
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Atomic increment/decrement
  await db
    .update(requests)
    .set({ activeQuoteCount: sql`GREATEST(0, activeQuoteCount + ${delta})` })
    .where(eq(requests.id, requestId));
  const rows = await db
    .select({ activeQuoteCount: requests.activeQuoteCount, status: requests.status })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  const row = rows[0];
  if (!row) return 0;
  const count = row.activeQuoteCount ?? 0;
  // Pause request when all 5 slots are filled; reopen when a slot frees up
  if (count >= 5 && row.status !== "paused" && row.status !== "closed") {
    await db.update(requests).set({ status: "paused" }).where(eq(requests.id, requestId));
  } else if (count < 5 && row.status === "paused") {
    await db.update(requests).set({ status: "quoted" }).where(eq(requests.id, requestId));
  }
  return count;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export async function createQuote(quote: InsertQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(quotes).values(quote);
  return Number(result[0].insertId);
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return rows[0];
}

/** Quotes for a request with jeweller info (buyer's comparison view). */
export async function getQuotesForRequest(requestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      quote: quotes,
      jewellerName: accounts.name,
      businessName: accounts.businessName,
      rating: accounts.rating,
      city: accounts.city,
    })
    .from(quotes)
    .leftJoin(accounts, eq(quotes.jewellerId, accounts.id))
    .where(eq(quotes.requestId, requestId))
    .orderBy(desc(quotes.createdAt));
}

/** All quotes across a buyer's requests (buyer overview). */
export async function getQuotesForBuyer(buyerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      quote: quotes,
      jewellerName: accounts.name,
      businessName: accounts.businessName,
      rating: accounts.rating,
      city: accounts.city,
      requestTitle: requests.title,
      requestCategory: requests.category,
      requestImageUrl: requests.imageUrl,
    })
    .from(quotes)
    .innerJoin(requests, eq(quotes.requestId, requests.id))
    .leftJoin(accounts, eq(quotes.jewellerId, accounts.id))
    .where(eq(requests.buyerId, buyerId))
    .orderBy(desc(quotes.createdAt));
}

export async function getQuotesByJeweller(jewellerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      quote: quotes,
      requestTitle: requests.title,
      requestCategory: requests.category,
      requestImageUrl: requests.imageUrl,
      buyerName: accounts.name,
    })
    .from(quotes)
    .innerJoin(requests, eq(quotes.requestId, requests.id))
    .leftJoin(accounts, eq(requests.buyerId, accounts.id))
    .where(eq(quotes.jewellerId, jewellerId))
    .orderBy(desc(quotes.createdAt));
}

export async function getQuoteCountForRequest(requestId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(quotes)
    .where(eq(quotes.requestId, requestId));
  return Number(rows[0]?.count ?? 0);
}

export async function hasJewellerQuoted(requestId: number, jewellerId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.requestId, requestId), eq(quotes.jewellerId, jewellerId)))
    .limit(1);
  return rows.length > 0;
}

export async function getJewellerQuoteForRequest(requestId: number, jewellerId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.requestId, requestId), eq(quotes.jewellerId, jewellerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateQuoteStatus(
  id: number,
  status: "pending" | "accepted" | "dismissed"
) {
  const db = await getDb();
  if (!db) return;
  await db.update(quotes).set({ status }).where(eq(quotes.id, id));
}

// ---------------------------------------------------------------------------
// Chat Threads
// ---------------------------------------------------------------------------

export async function createChatThread(thread: InsertChatThread) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(chatThreads).values(thread);
  return Number(result[0].insertId);
}

export async function getChatThreadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
  return rows[0];
}

/** Get thread for a specific quote (at most one thread per accepted quote). */
export async function getChatThreadByQuote(quoteId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.quoteId, quoteId))
    .limit(1);
  return rows[0];
}

/** All threads for a buyer (across all their requests). */
export async function getChatThreadsForBuyer(buyerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      thread: chatThreads,
      requestTitle: requests.title,
      requestCategory: requests.category,
      requestImageUrl: requests.imageUrl,
      jewellerName: accounts.name,
      businessName: accounts.businessName,
      city: accounts.city,
    })
    .from(chatThreads)
    .leftJoin(requests, eq(chatThreads.requestId, requests.id))
    .leftJoin(accounts, eq(chatThreads.jewellerId, accounts.id))
    .where(eq(chatThreads.buyerId, buyerId))
    .orderBy(desc(chatThreads.createdAt));
}

/** All threads for a jeweller. */
export async function getChatThreadsForJeweller(jewellerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      thread: chatThreads,
      requestTitle: requests.title,
      requestCategory: requests.category,
      requestImageUrl: requests.imageUrl,
      buyerName: accounts.name,
    })
    .from(chatThreads)
    .leftJoin(requests, eq(chatThreads.requestId, requests.id))
    .leftJoin(accounts, eq(chatThreads.buyerId, accounts.id))
    .where(eq(chatThreads.jewellerId, jewellerId))
    .orderBy(desc(chatThreads.createdAt));
}

export async function updateChatThreadStatus(
  id: number,
  status: "open" | "buyer_declined" | "jeweller_withdrawn"
) {
  const db = await getDb();
  if (!db) return;
  const closedAt = status !== "open" ? new Date() : null;
  await db.update(chatThreads).set({ status, closedAt }).where(eq(chatThreads.id, id));
}

/** All threads for admin view. */
export async function getAllChatThreadsAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      thread: chatThreads,
      requestTitle: requests.title,
      buyerName: sql<string>`buyer.name`,
      jewellerName: sql<string>`jeweller.name`,
      businessName: sql<string>`jeweller.businessName`,
    })
    .from(chatThreads)
    .leftJoin(requests, eq(chatThreads.requestId, requests.id))
    .leftJoin(sql`accounts AS buyer`, sql`chatThreads.buyerId = buyer.id`)
    .leftJoin(sql`accounts AS jeweller`, sql`chatThreads.jewellerId = jeweller.id`)
    .orderBy(desc(chatThreads.createdAt));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function createMessage(message: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(message);
  return Number(result[0].insertId);
}

export async function getMessagesByThread(threadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt);
}

export async function getMessageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Requotes
// ---------------------------------------------------------------------------

export async function createRequote(requote: InsertRequote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(requotes).values(requote);
  return Number(result[0].insertId);
}

export async function getRequoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(requotes).where(eq(requotes.id, id)).limit(1);
  return rows[0];
}

export async function getPendingRequoteForThread(threadId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(requotes)
    .where(and(eq(requotes.threadId, threadId), eq(requotes.status, "pending")))
    .orderBy(desc(requotes.createdAt))
    .limit(1);
  return rows[0];
}

export async function getRequotesByThread(threadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(requotes)
    .where(eq(requotes.threadId, threadId))
    .orderBy(desc(requotes.createdAt));
}

export async function updateRequoteStatus(
  id: number,
  status: "pending" | "accepted" | "rejected"
) {
  const db = await getDb();
  if (!db) return;
  const resolvedAt = status !== "pending" ? new Date() : null;
  await db.update(requotes).set({ status, resolvedAt }).where(eq(requotes.id, id));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function createOrder(order: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orders).values(order);
  return Number(result[0].insertId);
}

export async function getOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0];
}

export async function getOrderByThread(threadId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.threadId, threadId))
    .limit(1);
  return rows[0];
}

export async function getOrdersForBuyer(buyerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      order: orders,
      requestTitle: requests.title,
      jewellerName: accounts.name,
      businessName: accounts.businessName,
    })
    .from(orders)
    .leftJoin(chatThreads, eq(orders.threadId, chatThreads.id))
    .leftJoin(requests, eq(chatThreads.requestId, requests.id))
    .leftJoin(accounts, eq(orders.jewellerId, accounts.id))
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(orders.createdAt));
}

// ---------------------------------------------------------------------------
// Jewellery Reports
// ---------------------------------------------------------------------------

export async function createReport(report: InsertJewelleryReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jewelleryReports).values(report);
  return Number(result[0].insertId);
}

export async function getReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(jewelleryReports).where(eq(jewelleryReports.id, id)).limit(1);
  return rows[0];
}

export async function getAllReports() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      report: jewelleryReports,
      reporterName: sql<string>`reporter.name`,
      reportedName: sql<string>`reported.name`,
      reportedBusinessName: sql<string>`reported.businessName`,
    })
    .from(jewelleryReports)
    .leftJoin(sql`accounts AS reporter`, sql`jewelleryReports.reporterId = reporter.id`)
    .leftJoin(sql`accounts AS reported`, sql`jewelleryReports.reportedJewellerId = reported.id`)
    .orderBy(desc(jewelleryReports.createdAt));
}

export async function getPendingReports() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      report: jewelleryReports,
      reporterName: sql<string>`reporter.name`,
      reportedName: sql<string>`reported.name`,
      reportedBusinessName: sql<string>`reported.businessName`,
    })
    .from(jewelleryReports)
    .leftJoin(sql`accounts AS reporter`, sql`jewelleryReports.reporterId = reporter.id`)
    .leftJoin(sql`accounts AS reported`, sql`jewelleryReports.reportedJewellerId = reported.id`)
    .where(eq(jewelleryReports.status, "pending"))
    .orderBy(desc(jewelleryReports.createdAt));
}

export async function resolveReport(id: number, adminNotes: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(jewelleryReports)
    .set({ status: "reviewed", adminNotes, reviewedAt: new Date() })
    .where(eq(jewelleryReports.id, id));
}

/** Count of reports against a jeweller (for incidents tracker). */
export async function getJewellerIncidentCount(jewellerId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(jewelleryReports)
    .where(eq(jewelleryReports.reportedJewellerId, jewellerId));
  return Number(rows[0]?.count ?? 0);
}

/** All jewellers with their incident counts for admin incidents tracker. */
export async function getJewellerIncidents() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      jewellerId: accounts.id,
      name: accounts.name,
      businessName: accounts.businessName,
      city: accounts.city,
      email: accounts.email,
      incidentCount: sql<number>`count(jewelleryReports.id)`,
    })
    .from(accounts)
    .leftJoin(jewelleryReports, eq(accounts.id, jewelleryReports.reportedJewellerId))
    .where(eq(accounts.role, "jeweller"))
    .groupBy(accounts.id, accounts.name, accounts.businessName, accounts.city, accounts.email)
    .orderBy(desc(sql`count(jewelleryReports.id)`));
}

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

export async function addToWaitlist(email: string, role: "buyer" | "jeweller") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(waitlist).values({ email: email.toLowerCase(), role });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getAllAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts).orderBy(desc(accounts.createdAt));
}

export async function getAllRequestsAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ request: requests, buyerName: accounts.name, buyerEmail: accounts.email })
    .from(requests)
    .leftJoin(accounts, eq(requests.buyerId, accounts.id))
    .orderBy(desc(requests.createdAt));
}

export async function getAllQuotesAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      quote: quotes,
      jewellerName: accounts.name,
      requestTitle: requests.title,
    })
    .from(quotes)
    .leftJoin(accounts, eq(quotes.jewellerId, accounts.id))
    .leftJoin(requests, eq(quotes.requestId, requests.id))
    .orderBy(desc(quotes.createdAt));
}

export async function getAdminStats() {
  const db = await getDb();
  if (!db) {
    return { buyers: 0, jewellers: 0, requests: 0, quotes: 0, accepted: 0, waitlist: 0, activeChats: 0, pendingReports: 0 };
  }
  const [buyerRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accounts)
    .where(eq(accounts.role, "buyer"));
  const [jewellerRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accounts)
    .where(eq(accounts.role, "jeweller"));
  const [requestRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(requests);
  const [quoteRows] = await db.select({ count: sql<number>`count(*)` }).from(quotes);
  const [acceptedRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(quotes)
    .where(eq(quotes.status, "accepted"));
  const [waitlistRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(waitlist);
  const [activeChatRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatThreads)
    .where(eq(chatThreads.status, "open"));
  const [pendingReportRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jewelleryReports)
    .where(eq(jewelleryReports.status, "pending"));
  return {
    buyers: Number(buyerRows?.count ?? 0),
    jewellers: Number(jewellerRows?.count ?? 0),
    requests: Number(requestRows?.count ?? 0),
    quotes: Number(quoteRows?.count ?? 0),
    accepted: Number(acceptedRows?.count ?? 0),
    waitlist: Number(waitlistRows?.count ?? 0),
    activeChats: Number(activeChatRows?.count ?? 0),
    pendingReports: Number(pendingReportRows?.count ?? 0),
  };
}
