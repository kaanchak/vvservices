import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * VVServices platform accounts — custom email/password auth for buyers,
 * jewellers, and admins (separate from Manus OAuth users table above).
 */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["buyer", "jeweller", "admin"]).notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  /** scrypt hash in the form `salt:hash` */
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  /** WhatsApp number for OTP login and notifications (e.g. +919111130655) */
  whatsappNumber: varchar("whatsappNumber", { length: 32 }),
  /** Jewellers only: business name shown on quotes */
  businessName: varchar("businessName", { length: 191 }),
  /** Jewellers only: comma-separated category slugs, e.g. "gold,diamond-gold" */
  categories: varchar("categories", { length: 255 }),
  /** Jewellers only: city / location string */
  city: varchar("city", { length: 191 }),
  /** Jewellers only: display rating 0.0 - 5.0 */
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.5"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/** Buyer jewellery requests (leads for jewellers). */
export const requests = mysqlTable("requests", {
  id: int("id").autoincrement().primaryKey(),
  buyerId: int("buyerId").notNull(),
  category: mysqlEnum("category", ["gold", "diamond-gold", "stone-studded"]).notNull(),
  /** Uploaded image URL (S3) or pasted external URL */
  imageUrl: text("imageUrl"),
  title: varchar("title", { length: 191 }).notNull(),
  budgetMin: int("budgetMin"),
  budgetMax: int("budgetMax"),
  timeline: varchar("timeline", { length: 100 }),
  notes: text("notes"),
  /** JSON array of product image URLs (up to 5; first entry mirrors imageUrl) */
  imageUrls: text("imageUrls"),
  /** Original scraped price in its source currency (e.g. "45600" for $45,600) */
  originalPrice: varchar("originalPrice", { length: 64 }),
  /** ISO 4217 currency code of the original scraped price, e.g. "USD", "INR" */
  originalCurrency: varchar("originalCurrency", { length: 8 }),
  /** JSON blob of ScrapedProduct data extracted from imageUrl when it is a web URL */
  scrapedDetails: text("scrapedDetails"),
  /**
   * open     = accepting quotes (slots < 5)
   * paused   = all 5 quote slots filled (hidden from jeweller feed)
   * closed   = buyer has finalised (order placed or all quotes dismissed)
   */
  status: mysqlEnum("status", ["open", "quoted", "paused", "closed"]).default("open").notNull(),
  /**
   * Number of currently active (non-dismissed) quotes.
   * Request is hidden from feed when this reaches 5.
   */
  activeQuoteCount: int("activeQuoteCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

/** Jeweller quotes against buyer requests. */
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  jewellerId: int("jewellerId").notNull(),
  goldWeightGrams: decimal("goldWeightGrams", { precision: 8, scale: 2 }),
  diamondWeightCarats: decimal("diamondWeightCarats", { precision: 8, scale: 2 }),
  makingCharges: int("makingCharges"),
  totalPrice: int("totalPrice").notNull(),
  message: text("message"),
  /**
   * One pre-acceptance message the jeweller can send with their quote.
   * Visible to buyer before they accept/dismiss. Cannot be changed after submission.
   */
  preMessage: text("preMessage"),
  /** Gold purity used for this quote: 9kt = 9/24, 14kt = 14/24, 18kt = 18/24 */
  goldPurity: mysqlEnum("goldPurity", ["9kt", "14kt", "18kt"]).default("18kt"),
  /** Gold price per gram (INR) at the time of quoting, purity-adjusted */
  goldPricePerGram: decimal("goldPricePerGram", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", ["pending", "accepted", "dismissed"])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

/**
 * Chat threads between a buyer and a jeweller, opened when buyer accepts a quote.
 * Each accepted quote can have at most one thread.
 */
export const chatThreads = mysqlTable("chatThreads", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  buyerId: int("buyerId").notNull(),
  jewellerId: int("jewellerId").notNull(),
  quoteId: int("quoteId").notNull(),
  /**
   * open               = active conversation
   * buyer_declined     = buyer closed the chat (counts as declining the quote)
   * jeweller_withdrawn = jeweller closed the chat (withdrawing their quote)
   */
  status: mysqlEnum("status", ["open", "buyer_declined", "jeweller_withdrawn"])
    .default("open")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
});

export type ChatThread = typeof chatThreads.$inferSelect;
export type InsertChatThread = typeof chatThreads.$inferInsert;

/**
 * Messages inside a chat thread.
 * type = "text"    → plain message
 * type = "requote" → structured requote card (references requotes table)
 * type = "system"  → system events (thread opened, closed, requote accepted, etc.)
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  senderId: int("senderId").notNull(),
  senderRole: mysqlEnum("senderRole", ["buyer", "jeweller", "system"]).notNull(),
  content: text("content").notNull(),
  /** For requote messages, stores the requote id as a string */
  requoteId: int("requoteId"),
  type: mysqlEnum("type", ["text", "requote", "system"]).default("text").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Official requotes sent by jewellers inside a chat thread.
 * Buyer must accept for the requote to become the new official quote.
 * Jeweller cannot change the original quote without going through this flow.
 */
export const requotes = mysqlTable("requotes", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  jewellerId: int("jewellerId").notNull(),
  /** New total price being proposed */
  newPrice: int("newPrice").notNull(),
  /** New gold purity (if changed) */
  newGoldPurity: mysqlEnum("newGoldPurity", ["9kt", "14kt", "18kt"]),
  /** New gold weight in grams (if changed) */
  newGoldWeightGrams: decimal("newGoldWeightGrams", { precision: 8, scale: 2 }),
  /** New diamond weight in carats (if changed) */
  newDiamondWeightCarats: decimal("newDiamondWeightCarats", { precision: 8, scale: 2 }),
  /** New making charges (if changed) */
  newMakingCharges: int("newMakingCharges"),
  /** Jeweller's reason for the requote */
  reason: text("reason").notNull(),
  /**
   * pending  = waiting for buyer response
   * accepted = buyer accepted → becomes new official quote
   * rejected = buyer rejected → original quote still stands
   */
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type Requote = typeof requotes.$inferSelect;
export type InsertRequote = typeof requotes.$inferInsert;

/**
 * Orders created when buyer clicks "Add to Cart" / "Place Order" on an official quote.
 * Payment gateway to be wired in a future session.
 * Platform takes an escrow commission (platformFeePercent) on each transaction.
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  quoteId: int("quoteId").notNull(),
  buyerId: int("buyerId").notNull(),
  jewellerId: int("jewellerId").notNull(),
  /** Final agreed price (from original quote or accepted requote) */
  amount: int("amount").notNull(),
  /** Platform commission percentage (e.g. 5 = 5%) */
  platformFeePercent: decimal("platformFeePercent", { precision: 5, scale: 2 }).default("5.00").notNull(),
  /**
   * pending_payment = order created, awaiting payment
   * paid            = payment received (escrow held)
   * fulfilled       = jeweller shipped, buyer confirmed
   * cancelled       = order cancelled
   */
  status: mysqlEnum("status", ["pending_payment", "paid", "fulfilled", "cancelled"])
    .default("pending_payment")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Reports filed by buyers against jewellers for misconduct
 * (e.g. changing quote without buyer's request, unprofessional behaviour).
 * Admin reviews and acts as tribunal based on incident count.
 */
export const jewelleryReports = mysqlTable("jewelleryReports", {
  id: int("id").autoincrement().primaryKey(),
  /** Buyer who filed the report */
  reporterId: int("reporterId").notNull(),
  /** Jeweller being reported */
  reportedJewellerId: int("reportedJewellerId").notNull(),
  /** Chat thread where the incident occurred */
  threadId: int("threadId").notNull(),
  /** Reason for the report */
  reason: text("reason").notNull(),
  /**
   * pending  = awaiting admin review
   * reviewed = admin has reviewed and taken action
   */
  status: mysqlEnum("status", ["pending", "reviewed"]).default("pending").notNull(),
  /** Admin notes after review */
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export type JewelleryReport = typeof jewelleryReports.$inferSelect;
export type InsertJewelleryReport = typeof jewelleryReports.$inferInsert;

/**
 * Daily exchange rate snapshots (foreign currency → INR).
 * Fetched once per day and cached here so all price conversions use a consistent rate.
 */
export const exchangeRates = mysqlTable("exchangeRates", {
  id: int("id").autoincrement().primaryKey(),
  /** ISO 4217 source currency code, e.g. "USD", "EUR", "GBP", "AED" */
  fromCurrency: varchar("fromCurrency", { length: 8 }).notNull(),
  /** Rate: 1 unit of fromCurrency = rateToInr INR */
  rateToInr: decimal("rateToInr", { precision: 16, scale: 6 }).notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = typeof exchangeRates.$inferInsert;

/** Landing page waitlist signups. */
export const waitlist = mysqlTable("waitlist", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["buyer", "jeweller"]).default("buyer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WaitlistEntry = typeof waitlist.$inferSelect;

/**
 * Gold price snapshots fetched from the gold-api.com API.
 * Prices are stored per gram in INR. Updated daily at 12 AM IST (18:30 UTC).
 */
export const goldPrices = mysqlTable("goldPrices", {
  id: int("id").autoincrement().primaryKey(),
  /** Raw price per gram in INR (24kt / pure gold) */
  pricePerGram24kt: decimal("pricePerGram24kt", { precision: 12, scale: 2 }).notNull(),
  /** Derived: 9kt = 9/24 of 24kt price */
  pricePerGram9kt: decimal("pricePerGram9kt", { precision: 12, scale: 2 }).notNull(),
  /** Derived: 14kt = 14/24 of 24kt price */
  pricePerGram14kt: decimal("pricePerGram14kt", { precision: 12, scale: 2 }).notNull(),
  /** Derived: 18kt = 18/24 of 24kt price */
  pricePerGram18kt: decimal("pricePerGram18kt", { precision: 12, scale: 2 }).notNull(),
  /** Raw price per ounce from API (for reference) */
  rawPricePerOunce: decimal("rawPricePerOunce", { precision: 14, scale: 2 }),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

export type GoldPrice = typeof goldPrices.$inferSelect;
export type InsertGoldPrice = typeof goldPrices.$inferInsert;

/**
 * WhatsApp OTP sessions for buyer login/registration.
 * OTPs expire after 10 minutes and are single-use.
 */
export const whatsappOtps = mysqlTable("whatsappOtps", {
  id: int("id").autoincrement().primaryKey(),
  /** WhatsApp number in E.164 format, e.g. +919111130655 */
  whatsappNumber: varchar("whatsappNumber", { length: 32 }).notNull(),
  /** 6-digit OTP code */
  otp: varchar("otp", { length: 6 }).notNull(),
  /** Whether this OTP has been used */
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WhatsappOtp = typeof whatsappOtps.$inferSelect;
export type InsertWhatsappOtp = typeof whatsappOtps.$inferInsert;

/**
 * Phase 2 (SKELETON — credentials blank):
 * Links a buyer's Instagram username to their WhatsApp number.
 * Populated when user opts in to Instagram DM → WhatsApp notification flow.
 */
export const instagramWhatsappLinks = mysqlTable("instagramWhatsappLinks", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  /** Instagram username (without @) */
  instagramUsername: varchar("instagramUsername", { length: 64 }).notNull(),
  /** WhatsApp number in E.164 format */
  whatsappNumber: varchar("whatsappNumber", { length: 32 }).notNull(),
  /** Whether the link has been verified */
  verified: boolean("verified").default(false).notNull(),
  /** Verification code sent via Instagram DM */
  verificationCode: varchar("verificationCode", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InstagramWhatsappLink = typeof instagramWhatsappLinks.$inferSelect;
export type InsertInstagramWhatsappLink = typeof instagramWhatsappLinks.$inferInsert;
