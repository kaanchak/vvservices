import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  creditLedger,
  creditWallets,
  jewellerSubscriptions,
  quotes,
  requests,
} from "../drizzle/schema";
import * as db from "./db";
import {
  addTopupCredits,
  adjustCreditsByAdmin,
  allocateMonthlyCredits,
  createQuoteWithCredit,
  CreditSystemError,
  dismissQuoteWithCreditRefund,
  getCreditOverview,
  setSubscriptionStatusByAdmin,
  VV_ROLLOVER_CAP,
} from "./credits";

const createdAccounts: number[] = [];
const createdRequests: number[] = [];
const createdQuotes: number[] = [];
const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

async function makeAccount(role: "buyer" | "jeweller" | "admin") {
  const uniquePhone = phone();
  const id = await db.createAccount({
    phone: uniquePhone,
    email: `credits-${uniquePhone}@test.local`,
    passwordHash: "x",
    name: `Credit ${role}`,
    role,
    categories: role === "jeweller" ? "gold" : undefined,
  } as Parameters<typeof db.createAccount>[0]);
  createdAccounts.push(id);
  return id;
}

async function makeRequest(buyerId: number) {
  const id = await db.createRequest({
    buyerId,
    title: "Credit lifecycle test request",
    category: "gold",
    budgetMin: 100000,
    budgetMax: 100000,
  });
  createdRequests.push(id);
  return id;
}

afterAll(async () => {
  const database = await db.getDb();
  if (!database) return;
  if (createdQuotes.length) await database.delete(quotes).where(inArray(quotes.id, createdQuotes));
  if (createdRequests.length) await database.delete(requests).where(inArray(requests.id, createdRequests));
  if (createdAccounts.length) {
    await database.delete(creditLedger).where(inArray(creditLedger.jewellerId, createdAccounts));
    await database.delete(creditWallets).where(inArray(creditWallets.jewellerId, createdAccounts));
    await database.delete(jewellerSubscriptions).where(inArray(jewellerSubscriptions.jewellerId, createdAccounts));
  }
  for (const id of createdAccounts) await db.deleteAccountById(id);
});

describe("V◈ credit lifecycle", () => {
  it("allocates 500 monthly V◈ credits with a 1,500 V◈ rollover cap", { timeout: 30000 }, async () => {
    const jewellerId = await makeAccount("jeweller");
    for (let month = 1; month <= 4; month += 1) {
      await allocateMonthlyCredits(jewellerId, `test:allocation:${jewellerId}:${month}`, "Test monthly allocation");
    }
    const overview = await getCreditOverview(jewellerId);
    expect(overview.wallet.subscriptionCredits).toBe(VV_ROLLOVER_CAP);
    expect(overview.totalCredits).toBe(VV_ROLLOVER_CAP);
    expect(overview.subscription.status).toBe("active");
  });

  it("atomically charges one V◈ for an original quote and restores it when buyer dismisses", { timeout: 30000 }, async () => {
    const buyerId = await makeAccount("buyer");
    const jewellerId = await makeAccount("jeweller");
    const requestId = await makeRequest(buyerId);
    await allocateMonthlyCredits(jewellerId, `test:quote-allocation:${jewellerId}`, "Test activation");

    const quoteId = await createQuoteWithCredit({
      requestId,
      jewellerId,
      totalPrice: 105000,
      goldPurity: "18kt",
    });
    createdQuotes.push(quoteId);
    expect((await getCreditOverview(jewellerId)).totalCredits).toBe(499);

    const dismissed = await dismissQuoteWithCreditRefund(quoteId);
    expect(dismissed.refunded).toBe(true);
    expect((await getCreditOverview(jewellerId)).totalCredits).toBe(500);
    await expect(dismissQuoteWithCreditRefund(quoteId)).rejects.toMatchObject({ code: "QUOTE_NOT_PENDING" });
  });

  it("blocks paid top-ups and quote spending while a subscription is inactive", { timeout: 30000 }, async () => {
    const buyerId = await makeAccount("buyer");
    const jewellerId = await makeAccount("jeweller");
    const requestId = await makeRequest(buyerId);
    await expect(addTopupCredits(jewellerId, 50, `test:inactive-topup:${jewellerId}`, "Test top-up")).rejects.toBeInstanceOf(CreditSystemError);
    await expect(
      createQuoteWithCredit({ requestId, jewellerId, totalPrice: 50000, goldPurity: "18kt" })
    ).rejects.toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
  });

  it("expires paid top-ups on cancellation while retaining audited subscription balance", { timeout: 30000 }, async () => {
    const jewellerId = await makeAccount("jeweller");
    const adminId = await makeAccount("admin");
    await allocateMonthlyCredits(jewellerId, `test:cancel-allocation:${jewellerId}`, "Test activation");
    await addTopupCredits(jewellerId, 75, `test:topup:${jewellerId}`, "Test paid top-up");
    await adjustCreditsByAdmin({
      jewellerId,
      adminId,
      amount: 10,
      reason: "Test goodwill credit",
      idempotencyKey: `test:admin-grant:${jewellerId}`,
    });

    await setSubscriptionStatusByAdmin({
      jewellerId,
      adminId,
      status: "cancelled",
      reason: "Test cancellation",
      idempotencyKey: `test:cancel:${jewellerId}`,
    });
    const overview = await getCreditOverview(jewellerId);
    expect(overview.subscription.status).toBe("cancelled");
    expect(overview.wallet.topupCredits).toBe(0);
    expect(overview.wallet.subscriptionCredits).toBe(500);
    expect(overview.wallet.adjustmentCredits).toBe(10);
    expect(overview.canQuote).toBe(false);
  });
});
