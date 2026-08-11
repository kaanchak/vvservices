import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  jewellerSubscriptions,
  paymentRecords,
  paymentWebhookEvents,
  type InsertPaymentRecord,
} from "../drizzle/schema";
import {
  addTopupCredits,
  allocateMonthlyCredits,
  setSubscriptionStatusFromProvider,
  VV_MONTHLY_CREDITS,
  VV_PLAN_PRICE_INR,
} from "./credits";
import { getDb } from "./db";

export type PaymentKind = "subscription" | "topup";
export type PaymentProviderName = "razorpay" | "manual";

export type CheckoutOrder = {
  provider: PaymentProviderName;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  receipt: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  isConfigured(): boolean;
  createCheckoutOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<CheckoutOrder>;
  verifyWebhook(rawBody: Buffer, signature?: string): boolean;
}

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

/** Razorpay REST adapter. It is dormant until server-only credentials are configured. */
class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  private get keyId() {
    return process.env.RAZORPAY_KEY_ID ?? "";
  }
  private get keySecret() {
    return process.env.RAZORPAY_KEY_SECRET ?? "";
  }
  private get webhookSecret() {
    return process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  }

  isConfigured() {
    return Boolean(this.keyId && this.keySecret && this.webhookSecret);
  }

  async createCheckoutOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    if (!this.keyId || !this.keySecret) {
      throw new PaymentConfigurationError("Razorpay checkout is not configured yet.");
    }
    const authorization = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
    if (!response.ok) {
      throw new Error(`Razorpay order creation failed (${response.status}): ${await response.text()}`);
    }
    const data = (await response.json()) as { id: string; amount: number; currency: "INR"; receipt: string };
    return {
      provider: this.name,
      orderId: data.id,
      amountPaise: data.amount,
      currency: data.currency,
      receipt: data.receipt,
    };
  }

  verifyWebhook(rawBody: Buffer, signature?: string) {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

export const razorpayProvider = new RazorpayProvider();

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  if (name === "razorpay") return razorpayProvider;
  throw new PaymentConfigurationError(`No checkout provider is available for ${name}.`);
}

/**
 * Creates a pending record before calling an external gateway. The record is
 * deliberately gateway-neutral: another provider only needs to attach its own
 * order/payment IDs and submit a normalized confirmation event.
 */
export async function createPendingPayment(args: {
  jewellerId: number;
  provider: PaymentProviderName;
  kind: PaymentKind;
  amountPaise: number;
  creditsToIssue: number;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) throw new Error("Payment amount must be positive.");
  if (!Number.isInteger(args.creditsToIssue) || args.creditsToIssue <= 0) throw new Error("Credits to issue must be positive.");
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.insert(paymentRecords).values({
    jewellerId: args.jewellerId,
    provider: args.provider,
    kind: args.kind,
    status: "created",
    amountPaise: args.amountPaise,
    creditsToIssue: args.creditsToIssue,
    metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
  } satisfies InsertPaymentRecord);
  return Number(result[0].insertId);
}

/** Create an external checkout order only when that provider has been configured. */
export async function createRazorpayCheckoutForPayment(paymentRecordId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const [record] = await database.select().from(paymentRecords).where(eq(paymentRecords.id, paymentRecordId)).limit(1);
  if (!record) throw new Error("Payment record not found.");
  if (record.provider !== "razorpay") throw new Error("This payment record does not use Razorpay.");
  const receipt = `vv_${record.kind}_${record.id}`;
  const order = await razorpayProvider.createCheckoutOrder({
    amountPaise: record.amountPaise,
    receipt,
    notes: { paymentRecordId: String(record.id), jewellerId: String(record.jewellerId), kind: record.kind },
  });
  await database
    .update(paymentRecords)
    .set({ status: "pending", providerOrderId: order.orderId })
    .where(eq(paymentRecords.id, record.id));
  return order;
}

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; subscription_id?: string; amount?: number; currency?: string; status?: string } };
    subscription?: { entity?: { id?: string; status?: string; current_start?: number; current_end?: number } };
  };
};

function normalizedEventKey(rawBody: Buffer, payload: RazorpayWebhookPayload) {
  const paymentId = payload.payload?.payment?.entity?.id;
  const subscriptionId = payload.payload?.subscription?.entity?.id ?? payload.payload?.payment?.entity?.subscription_id;
  const event = payload.event ?? "unknown";
  return `razorpay:${event}:${paymentId ?? subscriptionId ?? createHash("sha256").update(rawBody).digest("hex")}`;
}

function toDateFromEpoch(seconds?: number) {
  return seconds ? new Date(seconds * 1000) : undefined;
}

async function upsertWebhookEvent(args: { eventKey: string; eventType: string; rawPayload: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const existing = await database
    .select()
    .from(paymentWebhookEvents)
    .where(eq(paymentWebhookEvents.eventKey, args.eventKey))
    .limit(1);
  if (existing[0]) return existing[0];
  await database.insert(paymentWebhookEvents).values({
    provider: "razorpay",
    eventKey: args.eventKey,
    eventType: args.eventType,
    signatureValid: true,
    status: "received",
    payload: args.rawPayload,
  });
  const [created] = await database
    .select()
    .from(paymentWebhookEvents)
    .where(eq(paymentWebhookEvents.eventKey, args.eventKey))
    .limit(1);
  if (!created) throw new Error("Unable to persist webhook event.");
  return created;
}

async function markWebhookEvent(eventId: number, status: "processed" | "ignored" | "failed", processingError?: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database
    .update(paymentWebhookEvents)
    .set({ status, processingError: processingError?.slice(0, 1000), processedAt: status === "processed" || status === "ignored" ? new Date() : null })
    .where(eq(paymentWebhookEvents.id, eventId));
}

/**
 * Process only a verified Razorpay webhook. This method is idempotent across
 * provider retries: payment records and the V◈ ledger each carry stable IDs.
 */
export async function processVerifiedRazorpayWebhook(rawBody: Buffer, signature?: string) {
  if (!razorpayProvider.verifyWebhook(rawBody, signature)) {
    throw new PaymentConfigurationError("Invalid or unconfigured Razorpay webhook signature.");
  }
  const rawPayload = rawBody.toString("utf8");
  const payload = JSON.parse(rawPayload) as RazorpayWebhookPayload;
  const eventType = payload.event ?? "unknown";
  const eventKey = normalizedEventKey(rawBody, payload);
  const storedEvent = await upsertWebhookEvent({ eventKey, eventType, rawPayload });
  if (storedEvent.status === "processed" || storedEvent.status === "ignored") {
    return { eventKey, outcome: "duplicate" as const };
  }

  const payment = payload.payload?.payment?.entity;
  const subscriptionEntity = payload.payload?.subscription?.entity;
  try {
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const [record] = payment?.order_id
        ? await (await getDb())!.select().from(paymentRecords).where(eq(paymentRecords.providerOrderId, payment.order_id)).limit(1)
        : [];
      if (!record || !payment?.id || payment.amount !== record.amountPaise || payment.currency !== record.currency) {
        await markWebhookEvent(storedEvent.id, "ignored", "No matching payment record or amount mismatch");
        return { eventKey, outcome: "ignored" as const };
      }
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      await database
        .update(paymentRecords)
        .set({ status: "paid", providerPaymentId: payment.id, confirmedAt: new Date() })
        .where(eq(paymentRecords.id, record.id));
      if (record.kind === "subscription") {
        await allocateMonthlyCredits(
          record.jewellerId,
          `provider:razorpay:payment:${payment.id}:subscription`,
          "₹9,999 V◈ subscription payment confirmed by Razorpay",
          { paymentRecordId: record.id }
        );
      } else {
        await addTopupCredits(
          record.jewellerId,
          record.creditsToIssue,
          `provider:razorpay:payment:${payment.id}:topup`,
          "V◈ top-up payment confirmed by Razorpay",
          record.id
        );
      }
      await markWebhookEvent(storedEvent.id, "processed");
      return { eventKey, outcome: "credited" as const };
    }

    if (eventType === "subscription.charged" && subscriptionEntity?.id) {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const [subscription] = await database
        .select()
        .from(jewellerSubscriptions)
        .where(and(eq(jewellerSubscriptions.provider, "razorpay"), eq(jewellerSubscriptions.providerSubscriptionId, subscriptionEntity.id)))
        .limit(1);
      if (!subscription) {
        await markWebhookEvent(storedEvent.id, "ignored", "No matching V◈ subscription");
        return { eventKey, outcome: "ignored" as const };
      }
      await allocateMonthlyCredits(
        subscription.jewellerId,
        `provider:razorpay:subscription:${subscriptionEntity.id}:${payment?.id ?? eventKey}`,
        "Monthly V◈ allocation confirmed by Razorpay subscription webhook",
        { periodStart: toDateFromEpoch(subscriptionEntity.current_start), periodEnd: toDateFromEpoch(subscriptionEntity.current_end) }
      );
      await markWebhookEvent(storedEvent.id, "processed");
      return { eventKey, outcome: "credited" as const };
    }

    if ((eventType === "subscription.cancelled" || eventType === "subscription.halted") && subscriptionEntity?.id) {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const [subscription] = await database
        .select()
        .from(jewellerSubscriptions)
        .where(and(eq(jewellerSubscriptions.provider, "razorpay"), eq(jewellerSubscriptions.providerSubscriptionId, subscriptionEntity.id)))
        .limit(1);
      if (!subscription) {
        await markWebhookEvent(storedEvent.id, "ignored", "No matching V◈ subscription");
        return { eventKey, outcome: "ignored" as const };
      }
      await setSubscriptionStatusFromProvider({
        jewellerId: subscription.jewellerId,
        status: eventType === "subscription.halted" ? "past_due" : "cancelled",
        reason: `Razorpay ${eventType} webhook`,
        idempotencyKey: `provider:razorpay:subscription-status:${eventKey}`,
      });
      await markWebhookEvent(storedEvent.id, "processed");
      return { eventKey, outcome: "subscription-updated" as const };
    }

    await markWebhookEvent(storedEvent.id, "ignored", `Unhandled Razorpay event: ${eventType}`);
    return { eventKey, outcome: "ignored" as const };
  } catch (error) {
    await markWebhookEvent(storedEvent.id, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Canonical paid-plan parameters, exported for checkout UI and admin display. */
export const VV_SUBSCRIPTION_PRODUCT = {
  code: "vv-pro-9999",
  priceInr: VV_PLAN_PRICE_INR,
  pricePaise: VV_PLAN_PRICE_INR * 100,
  monthlyCredits: VV_MONTHLY_CREDITS,
} as const;
