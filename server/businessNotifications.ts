/**
 * ============================================================
 * PHASE 2: Unified Business Notification Dispatcher
 * ============================================================
 *
 * PURPOSE:
 *   Single entry point for sending notifications to end-users
 *   across WhatsApp and Instagram when they receive quotes or updates.
 *
 * HOW IT WORKS:
 *   1. Check if buyer has a WhatsApp number → send WhatsApp notification
 *   2. Check if buyer has linked Instagram → send Instagram DM
 *   3. Log all notifications for audit trail
 *
 * HOW TO ACTIVATE:
 *   1. Fill in WhatsApp + Instagram credentials in environment variables
 *   2. Uncomment the notifyBuyerQuoteReceived call in server/routers.ts
 *      (search for "PHASE 2: Uncomment" in routers.ts)
 *
 * ============================================================
 */

import { sendInstagramQuoteNotification } from "./instagramBot";
import { sendQuoteNotification, sendQuoteStatusNotification } from "./whatsappBot";

export interface BuyerNotificationData {
  accountId: number;
  buyerName: string;
  buyerWhatsappNumber?: string | null;
  buyerInstagramUserId?: string | null;
  jewellerName: string;
  jewellerId: number;
  requestTitle: string;
  requestId: number;
  totalPrice: number;
  goldPurity?: string;
  message?: string;
}

export interface JewellerNotificationData {
  accountId: number;
  jewellerName: string;
  jewellerId: number;
  jewellerWhatsappNumber?: string | null;
  requestTitle: string;
  status: "accepted" | "dismissed";
}

/**
 * Notify a buyer that they received a new quote.
 * Sends via WhatsApp and/or Instagram depending on what the buyer has linked.
 *
 * PHASE 2: Call this from server/routers.ts quotes.create procedure.
 * Currently logs to console only.
 */
export async function notifyBuyerQuoteReceived(data: BuyerNotificationData): Promise<void> {
  const promises: Promise<void>[] = [];

  // WhatsApp notification
  if (data.buyerWhatsappNumber) {
    promises.push(
      sendQuoteNotification({
        buyerName: data.buyerName,
        buyerWhatsappNumber: data.buyerWhatsappNumber,
        jewellerId: data.jewellerId,
        jewellerName: data.jewellerName,
        requestTitle: data.requestTitle,
        totalPrice: data.totalPrice,
        goldPurity: data.goldPurity,
        message: data.message,
        requestId: data.requestId,
      }).catch(err => {
        console.error("[Notification] WhatsApp notification failed:", err);
      })
    );
  }

  // Instagram DM notification
  if (data.buyerInstagramUserId) {
    promises.push(
      sendInstagramQuoteNotification(
        data.buyerInstagramUserId,
        data.buyerName,
        data.requestTitle,
        data.jewellerName,
        data.totalPrice,
        data.goldPurity
      ).catch(err => {
        console.error("[Notification] Instagram notification failed:", err);
      })
    );
  }

  if (promises.length === 0) {
    // No notification channels available — log for visibility
    console.log(
      `[Notification] No channels for buyer ${data.accountId} (${data.buyerName}) — no WhatsApp or Instagram linked`
    );
    return;
  }

  await Promise.allSettled(promises);
}

/**
 * Notify a jeweller when their quote status changes (accepted/dismissed).
 *
 * PHASE 2: Call this from server/routers.ts quotes.respond procedure.
 */
export async function notifyJewellerQuoteStatus(data: JewellerNotificationData): Promise<void> {
  if (!data.jewellerWhatsappNumber) {
    console.log(
      `[Notification] No WhatsApp for jeweller ${data.jewellerId} (${data.jewellerName}) — cannot notify`
    );
    return;
  }

  try {
    await sendQuoteStatusNotification(
      data.jewellerId,
      data.jewellerWhatsappNumber,
      data.jewellerName,
      data.requestTitle,
      data.status
    );
  } catch (err) {
    console.error("[Notification] Jeweller WhatsApp notification failed:", err);
  }
}
