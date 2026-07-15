import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accounts,
  InsertAccount,
  InsertQuote,
  InsertRequest,
  InsertUser,
  quotes,
  requests,
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

/** Leads for a jeweller filtered by their categories, newest first. */
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
    .where(inArray(requests.category, categories))
    .orderBy(desc(requests.createdAt));
}

export async function updateRequestStatus(
  id: number,
  status: "open" | "quoted" | "closed"
) {
  const db = await getDb();
  if (!db) return;
  await db.update(requests).set({ status }).where(eq(requests.id, id));
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

export async function updateQuoteStatus(
  id: number,
  status: "pending" | "accepted" | "dismissed"
) {
  const db = await getDb();
  if (!db) return;
  await db.update(quotes).set({ status }).where(eq(quotes.id, id));
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
    return { buyers: 0, jewellers: 0, requests: 0, quotes: 0, accepted: 0, waitlist: 0 };
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
  return {
    buyers: Number(buyerRows?.count ?? 0),
    jewellers: Number(jewellerRows?.count ?? 0),
    requests: Number(requestRows?.count ?? 0),
    quotes: Number(quoteRows?.count ?? 0),
    accepted: Number(acceptedRows?.count ?? 0),
    waitlist: Number(waitlistRows?.count ?? 0),
  };
}
