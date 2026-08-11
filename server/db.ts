import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
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
  InsertPortfolioItem,
  InsertQuote,
  InsertRequest,
  InsertRequote,
  InsertUser,
  jewelleryReports,
  messages,
  orders,
  portfolioItems,
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

/** Hard-delete a request. Used by isolated test teardown; never exposed to the API. */
export async function deleteRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(requests).where(eq(requests.id, id));
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

/**
 * Leads for a jeweller, newest first.
 *
 * Standard requests go only to their matching category. When the short buyer
 * form cannot infer a category, `autoRouteAll` deliberately broadens matching
 * so an otherwise valid request never disappears from every jeweller feed.
 */
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
          or(inArray(requests.category, categories), eq(requests.autoRouteAll, true)),
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
      jewellerId: accounts.id,
      jewellerWhatsapp: accounts.whatsappNumber,
      jewellerPhone: accounts.phone,
      jewellerSlug: accounts.profileSlug,
      jewellerProfileStatus: accounts.profileStatus,
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

// ─── Jeweller Profiles ───────────────────────────────────────────────────────

/** Profile fields a jeweller may edit themselves. */
export type JewellerProfilePatch = {
  businessName?: string | null;
  categories?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  instagramUrl?: string | null;
  about?: string | null;
  logoUrl?: string | null;
  whatsappNumber?: string | null;
};

export type ProfileStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";

/**
 * Turn a business name into a URL-safe slug. Falls back to the account id when
 * the name yields nothing usable (e.g. non-Latin script only).
 */
export function slugifyBusinessName(name: string, accountId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base ? `${base}-${accountId}` : `jeweller-${accountId}`;
}

/** Update editable profile fields. Does not touch moderation state. */
export async function updateJewellerProfile(
  jewellerId: number,
  patch: JewellerProfilePatch
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) set[key] = value;
  }
  if (Object.keys(set).length === 0) return;
  await db.update(accounts).set(set).where(eq(accounts.id, jewellerId));
}

/** Assign a profile slug if the account does not already have one. */
export async function ensureProfileSlug(jewellerId: number, businessName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getAccountById(jewellerId);
  if (existing?.profileSlug) return existing.profileSlug;
  const slug = slugifyBusinessName(businessName, jewellerId);
  await db.update(accounts).set({ profileSlug: slug }).where(eq(accounts.id, jewellerId));
  return slug;
}

/** Move a profile through its moderation lifecycle. */
export async function setProfileStatus(
  jewellerId: number,
  status: ProfileStatus,
  reviewNote?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = { profileStatus: status };
  if (reviewNote !== undefined) set.profileReviewNote = reviewNote;
  if (status === "approved") set.profileApprovedAt = new Date();
  await db.update(accounts).set(set).where(eq(accounts.id, jewellerId));
}

/** Public profile lookup by slug. Only ever returns an approved profile. */
export async function getApprovedJewellerBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.profileSlug, slug),
        eq(accounts.role, "jeweller"),
        eq(accounts.profileStatus, "approved")
      )
    )
    .limit(1);
  return rows[0];
}

/** Public directory listing: approved jewellers only, newest approvals first. */
export async function listApprovedJewellers(category?: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.role, "jeweller"), eq(accounts.profileStatus, "approved")))
    .orderBy(desc(accounts.profileApprovedAt));
  if (!category) return rows;
  return rows.filter(r => (r.categories ?? "").split(",").includes(category));
}

/** Admin view: jewellers filtered by moderation state. */
export async function listJewellersByProfileStatus(status?: ProfileStatus) {
  const db = await getDb();
  if (!db) return [];
  const where = status
    ? and(eq(accounts.role, "jeweller"), eq(accounts.profileStatus, status))
    : eq(accounts.role, "jeweller");
  return db.select().from(accounts).where(where).orderBy(desc(accounts.createdAt));
}

// ─── Portfolio Items ─────────────────────────────────────────────────────────

export async function createPortfolioItem(item: InsertPortfolioItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(portfolioItems).values(item);
  return Number(result[0].insertId);
}

/** Every portfolio item for a jeweller, for their own editor view. */
export async function getPortfolioForJeweller(jewellerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(portfolioItems)
    .where(eq(portfolioItems.jewellerId, jewellerId))
    .orderBy(portfolioItems.sortOrder, desc(portfolioItems.createdAt));
}

/**
 * Portfolio items for a public profile view.
 *
 * Uploaded work is public. Quoted work is only returned to logged-in viewers,
 * and only when the jeweller has promoted it, because it derives from a
 * specific buyer's commission.
 */
export async function getVisiblePortfolio(jewellerId: number, viewerIsLoggedIn: boolean) {
  const all = await getPortfolioForJeweller(jewellerId);
  return all.filter(item => {
    if (item.source === "uploaded") return true;
    return viewerIsLoggedIn && item.isPromoted;
  });
}

export async function getPortfolioItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(portfolioItems).where(eq(portfolioItems.id, id)).limit(1);
  return rows[0];
}

export async function updatePortfolioItem(
  id: number,
  patch: { caption?: string | null; sortOrder?: number; isPromoted?: boolean }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) set[key] = value;
  }
  if (Object.keys(set).length === 0) return;
  await db.update(portfolioItems).set(set).where(eq(portfolioItems.id, id));
}

export async function deletePortfolioItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(portfolioItems).where(eq(portfolioItems.id, id));
}

/** Count of uploaded portfolio images, used for directory previews. */
export async function getPortfolioCount(jewellerId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(portfolioItems)
    .where(and(eq(portfolioItems.jewellerId, jewellerId), eq(portfolioItems.source, "uploaded")));
  return Number(row?.count ?? 0);
}

/** Hard-delete an account. Used by test teardown; not exposed to any router. */
export async function deleteAccountById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(accounts).where(eq(accounts.id, id));
}
