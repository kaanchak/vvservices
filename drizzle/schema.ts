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
  /** JSON blob of ScrapedProduct data extracted from imageUrl when it is a web URL */
  scrapedDetails: text("scrapedDetails"),
  status: mysqlEnum("status", ["open", "quoted", "closed"]).default("open").notNull(),
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
