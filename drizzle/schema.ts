import {
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
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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
