import { and, desc, eq, sql } from "drizzle-orm";
import {
  creditLedger,
  creditWallets,
  jewellerSubscriptions,
  quotes,
  type CreditWallet,
  type InsertQuote,
  type JewellerSubscription,
} from "../drizzle/schema";
import { getDb } from "./db";

/** Product-facing representation. `V◈` is intentionally only presentation, not a currency. */
export const VV_CREDIT_SYMBOL = "V◈";
export const VV_MONTHLY_CREDITS = 500;
export const VV_ROLLOVER_CAP = 1500;
export const VV_QUOTE_COST = 1;
export const VV_PLAN_PRICE_INR = 9999;

type LedgerType =
  | "subscription_allocation"
  | "topup"
  | "quote_debit"
  | "quote_refund"
  | "admin_grant"
  | "admin_deduct"
  | "topup_expiry"
  | "wallet_freeze"
  | "wallet_unfreeze"
  | "subscription_status_change";

export type CreditBucket = "subscription" | "topup" | "adjustment";
export type SubscriptionStatus = "inactive" | "active" | "past_due" | "cancelled" | "suspended";

export class CreditSystemError extends Error {
  constructor(
    public readonly code:
      | "NO_ACTIVE_SUBSCRIPTION"
      | "WALLET_FROZEN"
      | "INSUFFICIENT_CREDITS"
      | "INVALID_AMOUNT"
      | "QUOTE_NOT_PENDING",
    message: string
  ) {
    super(message);
    this.name = "CreditSystemError";
  }
}

export function getWalletTotal(wallet: Pick<CreditWallet, "subscriptionCredits" | "topupCredits" | "adjustmentCredits">) {
  return wallet.subscriptionCredits + wallet.topupCredits + wallet.adjustmentCredits;
}

function now() {
  return new Date();
}

/**
 * Creates the durable records lazily so legacy jewellers are not inadvertently
 * activated. Every new subscription starts inactive until a verified payment or
 * an explicit admin activation changes it.
 */
async function lockWalletAndSubscription(tx: any, jewellerId: number) {
  await tx
    .insert(creditWallets)
    .values({ jewellerId })
    .onDuplicateKeyUpdate({ set: { jewellerId: sql`${creditWallets.jewellerId}` } });
  await tx
    .insert(jewellerSubscriptions)
    .values({
      jewellerId,
      planCode: "vv-pro-9999",
      status: "inactive",
      monthlyCreditAllowance: VV_MONTHLY_CREDITS,
      rolloverCap: VV_ROLLOVER_CAP,
    })
    .onDuplicateKeyUpdate({ set: { jewellerId: sql`${jewellerSubscriptions.jewellerId}` } });

  const [wallet] = await tx
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.jewellerId, jewellerId))
    .for("update");
  const [subscription] = await tx
    .select()
    .from(jewellerSubscriptions)
    .where(eq(jewellerSubscriptions.jewellerId, jewellerId))
    .for("update");
  if (!wallet || !subscription) throw new Error("Unable to initialise V◈ wallet");
  return { wallet, subscription } as { wallet: CreditWallet; subscription: JewellerSubscription };
}

async function writeLedger(
  tx: any,
  args: {
    jewellerId: number;
    type: LedgerType;
    wallet: CreditWallet;
    subscriptionDelta?: number;
    topupDelta?: number;
    adjustmentDelta?: number;
    quoteId?: number;
    paymentRecordId?: number;
    adminId?: number;
    idempotencyKey: string;
    reason: string;
    metadata?: string;
  }
) {
  await tx.insert(creditLedger).values({
    jewellerId: args.jewellerId,
    type: args.type,
    subscriptionDelta: args.subscriptionDelta ?? 0,
    topupDelta: args.topupDelta ?? 0,
    adjustmentDelta: args.adjustmentDelta ?? 0,
    subscriptionBalanceAfter: args.wallet.subscriptionCredits,
    topupBalanceAfter: args.wallet.topupCredits,
    adjustmentBalanceAfter: args.wallet.adjustmentCredits,
    quoteId: args.quoteId,
    paymentRecordId: args.paymentRecordId,
    adminId: args.adminId,
    idempotencyKey: args.idempotencyKey,
    reason: args.reason,
    metadata: args.metadata,
  });
}

async function persistWallet(tx: any, wallet: CreditWallet) {
  await tx
    .update(creditWallets)
    .set({
      subscriptionCredits: wallet.subscriptionCredits,
      topupCredits: wallet.topupCredits,
      adjustmentCredits: wallet.adjustmentCredits,
      isFrozen: wallet.isFrozen,
    })
    .where(eq(creditWallets.id, wallet.id));
}

function assertActiveAndUnfrozen(wallet: CreditWallet, subscription: JewellerSubscription) {
  if (subscription.status !== "active") {
    throw new CreditSystemError(
      "NO_ACTIVE_SUBSCRIPTION",
      "An active V◈ subscription is required to send quotes or use top-up credits."
    );
  }
  if (wallet.isFrozen) {
    throw new CreditSystemError("WALLET_FROZEN", "Your V◈ wallet is temporarily frozen. Please contact support.");
  }
}

function debitOneCredit(wallet: CreditWallet) {
  if (wallet.subscriptionCredits > 0) {
    wallet.subscriptionCredits -= VV_QUOTE_COST;
    return { subscriptionDelta: -VV_QUOTE_COST, topupDelta: 0, adjustmentDelta: 0 };
  }
  if (wallet.topupCredits > 0) {
    wallet.topupCredits -= VV_QUOTE_COST;
    return { subscriptionDelta: 0, topupDelta: -VV_QUOTE_COST, adjustmentDelta: 0 };
  }
  if (wallet.adjustmentCredits > 0) {
    wallet.adjustmentCredits -= VV_QUOTE_COST;
    return { subscriptionDelta: 0, topupDelta: 0, adjustmentDelta: -VV_QUOTE_COST };
  }
  throw new CreditSystemError("INSUFFICIENT_CREDITS", "You need at least 1 V◈ credit to send this quote.");
}

/** Creates the quote and debits exactly one V◈ inside one database transaction. */
export async function createQuoteWithCredit(quote: InsertQuote) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const { wallet, subscription } = await lockWalletAndSubscription(tx, quote.jewellerId);
    assertActiveAndUnfrozen(wallet, subscription);
    const debit = debitOneCredit(wallet);

    const result = await tx.insert(quotes).values(quote);
    const quoteId = Number(result[0].insertId);
    await persistWallet(tx, wallet);
    await writeLedger(tx, {
      jewellerId: quote.jewellerId,
      type: "quote_debit",
      wallet,
      ...debit,
      quoteId,
      idempotencyKey: `quote-debit:${quoteId}`,
      reason: "1 V◈ credit used to submit a quote",
    });
    return quoteId;
  });
}

/**
 * Marks a buyer-denied quote as dismissed and restores the exact bucket that
 * paid for it. Requotes never call this function and therefore remain free.
 */
export async function dismissQuoteWithCreditRefund(quoteId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!quote || quote.status !== "pending") {
      throw new CreditSystemError("QUOTE_NOT_PENDING", "This quote has already been actioned.");
    }
    await tx.update(quotes).set({ status: "dismissed" }).where(eq(quotes.id, quoteId));

    const [debit] = await tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.quoteId, quoteId), eq(creditLedger.type, "quote_debit")))
      .orderBy(desc(creditLedger.id))
      .limit(1)
      .for("update");

    if (!debit) return { quote, refunded: false } as const;
    const { wallet } = await lockWalletAndSubscription(tx, quote.jewellerId);
    wallet.subscriptionCredits += Math.abs(debit.subscriptionDelta);
    wallet.topupCredits += Math.abs(debit.topupDelta);
    wallet.adjustmentCredits += Math.abs(debit.adjustmentDelta);
    await persistWallet(tx, wallet);
    await writeLedger(tx, {
      jewellerId: quote.jewellerId,
      type: "quote_refund",
      wallet,
      subscriptionDelta: Math.abs(debit.subscriptionDelta),
      topupDelta: Math.abs(debit.topupDelta),
      adjustmentDelta: Math.abs(debit.adjustmentDelta),
      quoteId,
      idempotencyKey: `quote-refund:${quoteId}`,
      reason: "1 V◈ credit automatically refunded after buyer dismissed the quote",
    });
    return { quote, refunded: true } as const;
  });
}

export async function getCreditOverview(jewellerId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const { wallet, subscription } = await lockWalletAndSubscription(tx, jewellerId);
    return {
      wallet,
      subscription,
      totalCredits: getWalletTotal(wallet),
      canQuote: subscription.status === "active" && !wallet.isFrozen && getWalletTotal(wallet) >= VV_QUOTE_COST,
    };
  });
}

/**
 * Read-only overview for administrative lists. It intentionally does not
 * initialise a wallet/subscription merely because an admin views the list.
 */
export async function getCreditOverviewReadOnly(jewellerId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const [wallet] = await database.select().from(creditWallets).where(eq(creditWallets.jewellerId, jewellerId)).limit(1);
  const [subscription] = await database
    .select()
    .from(jewellerSubscriptions)
    .where(eq(jewellerSubscriptions.jewellerId, jewellerId))
    .limit(1);
  const createdAt = now();
  const safeWallet: CreditWallet = wallet ?? {
    id: 0,
    jewellerId,
    subscriptionCredits: 0,
    topupCredits: 0,
    adjustmentCredits: 0,
    isFrozen: false,
    updatedAt: createdAt,
  };
  const safeSubscription: JewellerSubscription = subscription ?? {
    id: 0,
    jewellerId,
    planCode: "vv-pro-9999",
    status: "inactive",
    monthlyCreditAllowance: VV_MONTHLY_CREDITS,
    rolloverCap: VV_ROLLOVER_CAP,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
    provider: null,
    providerSubscriptionId: null,
    createdAt,
    updatedAt: createdAt,
  };
  return {
    wallet: safeWallet,
    subscription: safeSubscription,
    totalCredits: getWalletTotal(safeWallet),
    canQuote: safeSubscription.status === "active" && !safeWallet.isFrozen && getWalletTotal(safeWallet) >= VV_QUOTE_COST,
  };
}

export async function getCreditLedger(jewellerId: number, limit = 100) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.jewellerId, jewellerId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(Math.min(Math.max(limit, 1), 250));
}

/** Allocate monthly plan credits, capping only the rolled-over subscription bucket at 1,500 V◈. */
export async function allocateMonthlyCredits(
  jewellerId: number,
  idempotencyKey: string,
  reason: string,
  options?: { paymentRecordId?: number; periodStart?: Date; periodEnd?: Date }
) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing.length > 0) return { allocated: 0, alreadyProcessed: true } as const;

    const { wallet, subscription } = await lockWalletAndSubscription(tx, jewellerId);
    const cap = subscription.rolloverCap || VV_ROLLOVER_CAP;
    const allowance = subscription.monthlyCreditAllowance || VV_MONTHLY_CREDITS;
    const allocated = Math.max(0, Math.min(allowance, cap - wallet.subscriptionCredits));
    wallet.subscriptionCredits += allocated;
    await persistWallet(tx, wallet);
    await tx
      .update(jewellerSubscriptions)
      .set({
        status: "active",
        cancelledAt: null,
        currentPeriodStart: options?.periodStart ?? subscription.currentPeriodStart,
        currentPeriodEnd: options?.periodEnd ?? subscription.currentPeriodEnd,
      })
      .where(eq(jewellerSubscriptions.id, subscription.id));
    await writeLedger(tx, {
      jewellerId,
      type: "subscription_allocation",
      wallet,
      subscriptionDelta: allocated,
      paymentRecordId: options?.paymentRecordId,
      idempotencyKey,
      reason,
      metadata: JSON.stringify({ allowance, cap }),
    });
    return { allocated, alreadyProcessed: false } as const;
  });
}

/** Add paid top-up credits, permitted only while the plan is active. */
export async function addTopupCredits(
  jewellerId: number,
  credits: number,
  idempotencyKey: string,
  reason: string,
  paymentRecordId?: number
) {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new CreditSystemError("INVALID_AMOUNT", "Top-up credits must be a positive whole number.");
  }
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing.length > 0) return { credited: 0, alreadyProcessed: true } as const;
    const { wallet, subscription } = await lockWalletAndSubscription(tx, jewellerId);
    assertActiveAndUnfrozen(wallet, subscription);
    wallet.topupCredits += credits;
    await persistWallet(tx, wallet);
    await writeLedger(tx, {
      jewellerId,
      type: "topup",
      wallet,
      topupDelta: credits,
      paymentRecordId,
      idempotencyKey,
      reason,
    });
    return { credited: credits, alreadyProcessed: false } as const;
  });
}

/** Admin grant/deduct, with a mandatory human-readable reason and audit actor. */
export async function adjustCreditsByAdmin(args: {
  jewellerId: number;
  adminId: number;
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  if (!Number.isInteger(args.amount) || args.amount === 0) {
    throw new CreditSystemError("INVALID_AMOUNT", "Adjustment must be a non-zero whole number of V◈ credits.");
  }
  if (!args.reason.trim()) throw new CreditSystemError("INVALID_AMOUNT", "An admin adjustment reason is required.");
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (existing.length > 0) return { adjusted: 0, alreadyProcessed: true } as const;
    const { wallet } = await lockWalletAndSubscription(tx, args.jewellerId);
    if (args.amount < 0 && wallet.adjustmentCredits < Math.abs(args.amount)) {
      throw new CreditSystemError("INSUFFICIENT_CREDITS", "Cannot deduct more admin-issued V◈ credits than are available.");
    }
    wallet.adjustmentCredits += args.amount;
    await persistWallet(tx, wallet);
    await writeLedger(tx, {
      jewellerId: args.jewellerId,
      type: args.amount > 0 ? "admin_grant" : "admin_deduct",
      wallet,
      adjustmentDelta: args.amount,
      adminId: args.adminId,
      idempotencyKey: args.idempotencyKey,
      reason: args.reason.trim(),
    });
    return { adjusted: args.amount, alreadyProcessed: false } as const;
  });
}

export async function setWalletFrozen(args: {
  jewellerId: number;
  adminId: number;
  frozen: boolean;
  reason: string;
  idempotencyKey: string;
}) {
  if (!args.reason.trim()) throw new CreditSystemError("INVALID_AMOUNT", "A freeze reason is required.");
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const { wallet } = await lockWalletAndSubscription(tx, args.jewellerId);
    wallet.isFrozen = args.frozen;
    await persistWallet(tx, wallet);
    await writeLedger(tx, {
      jewellerId: args.jewellerId,
      type: args.frozen ? "wallet_freeze" : "wallet_unfreeze",
      wallet,
      adminId: args.adminId,
      idempotencyKey: args.idempotencyKey,
      reason: args.reason.trim(),
    });
    return wallet;
  });
}

/**
 * Cancelling immediately removes paid top-up credits. Subscription and manual
 * balances stay recorded but cannot be spent until an active plan returns.
 */
async function setSubscriptionStatus(args: {
  jewellerId: number;
  adminId?: number;
  status: SubscriptionStatus;
  reason: string;
  idempotencyKey: string;
}) {
  if (!args.reason.trim()) throw new CreditSystemError("INVALID_AMOUNT", "A subscription status reason is required.");
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async tx => {
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (existing.length > 0) return { alreadyProcessed: true } as const;
    const { wallet, subscription } = await lockWalletAndSubscription(tx, args.jewellerId);
    const cancelledAt = args.status === "cancelled" ? now() : null;
    await tx
      .update(jewellerSubscriptions)
      .set({ status: args.status, cancelledAt })
      .where(eq(jewellerSubscriptions.id, subscription.id));
    await writeLedger(tx, {
      jewellerId: args.jewellerId,
      type: "subscription_status_change",
      wallet,
      adminId: args.adminId,
      idempotencyKey: args.idempotencyKey,
      reason: args.reason.trim(),
      metadata: JSON.stringify({ from: subscription.status, to: args.status }),
    });
    if (args.status === "cancelled" && wallet.topupCredits > 0) {
      const expired = wallet.topupCredits;
      wallet.topupCredits = 0;
      await persistWallet(tx, wallet);
      await writeLedger(tx, {
        jewellerId: args.jewellerId,
        type: "topup_expiry",
        wallet,
        topupDelta: -expired,
        adminId: args.adminId,
        idempotencyKey: `${args.idempotencyKey}:topup-expiry`,
        reason: "Paid V◈ top-up credits expired because the subscription was cancelled",
      });
    }
    return { ...subscription, status: args.status, cancelledAt, alreadyProcessed: false };
  });
}

export async function setSubscriptionStatusByAdmin(args: {
  jewellerId: number;
  adminId: number;
  status: SubscriptionStatus;
  reason: string;
  idempotencyKey: string;
}) {
  return setSubscriptionStatus(args);
}

/** Used only after a verified provider webhook has been persisted and validated. */
export async function setSubscriptionStatusFromProvider(args: {
  jewellerId: number;
  status: SubscriptionStatus;
  reason: string;
  idempotencyKey: string;
}) {
  return setSubscriptionStatus(args);
}
