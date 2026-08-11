import { afterAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  creditLedger,
  creditWallets,
  jewellerSubscriptions,
  paymentRecords,
  paymentWebhookEvents,
} from "../drizzle/schema";
import * as db from "./db";
import { allocateMonthlyCredits, getCreditOverview } from "./credits";
import { createPendingPayment, processVerifiedRazorpayWebhook, razorpayProvider } from "./payments";

const createdAccounts: number[] = [];
const createdPaymentIds: number[] = [];
const createdEventKeys: string[] = [];
const previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

async function makeJeweller() {
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const id = await db.createAccount({
    phone,
    email: `payment-${phone}@test.local`,
    passwordHash: "x",
    name: "Payment Test Jeweller",
    role: "jeweller",
    categories: "gold",
  } as Parameters<typeof db.createAccount>[0]);
  createdAccounts.push(id);
  return id;
}

afterAll(async () => {
  if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;

  const database = await db.getDb();
  if (!database) return;
  if (createdPaymentIds.length) await database.delete(paymentRecords).where(inArray(paymentRecords.id, createdPaymentIds));
  if (createdAccounts.length) {
    await database.delete(creditLedger).where(inArray(creditLedger.jewellerId, createdAccounts));
    await database.delete(creditWallets).where(inArray(creditWallets.jewellerId, createdAccounts));
    await database.delete(jewellerSubscriptions).where(inArray(jewellerSubscriptions.jewellerId, createdAccounts));
  }
  if (createdEventKeys.length) {
    await database.delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.eventKey, createdEventKeys));
  }
  for (const id of createdAccounts) await db.deleteAccountById(id);
});

describe("Razorpay-ready V◈ webhook processor", () => {
  it("only credits a matching, signed payment once even if Razorpay retries it", { timeout: 30000 }, async () => {
    const jewellerId = await makeJeweller();
    await allocateMonthlyCredits(jewellerId, `test:payment-activation:${jewellerId}`, "Test subscription activation");
    const paymentRecordId = await createPendingPayment({
      jewellerId,
      provider: "razorpay",
      kind: "topup",
      amountPaise: 299900,
      creditsToIssue: 50,
      metadata: { test: true },
    });
    createdPaymentIds.push(paymentRecordId);
    const database = await db.getDb();
    if (!database) throw new Error("Database unavailable");
    await database
      .update(paymentRecords)
      .set({ status: "pending", providerOrderId: `order_test_${paymentRecordId}` })
      .where(eq(paymentRecords.id, paymentRecordId));

    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
    const body = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_test_${paymentRecordId}`,
              order_id: `order_test_${paymentRecordId}`,
              amount: 299900,
              currency: "INR",
              status: "captured",
            },
          },
        },
      })
    );
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
    expect(razorpayProvider.verifyWebhook(body, signature)).toBe(true);

    const first = await processVerifiedRazorpayWebhook(body, signature);
    const second = await processVerifiedRazorpayWebhook(body, signature);
    createdEventKeys.push(first.eventKey);
    expect(first.outcome).toBe("credited");
    expect(second.outcome).toBe("duplicate");
    expect((await getCreditOverview(jewellerId)).wallet.topupCredits).toBe(50);
  });

  it("rejects a webhook with a tampered signature", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
    expect(razorpayProvider.verifyWebhook(Buffer.from("{}"), "tampered")).toBe(false);
  });
});
