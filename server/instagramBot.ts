/**
 * ============================================================
 * PHASE 2: Instagram Business Bot
 * ============================================================
 *
 * PURPOSE:
 *   1. Send notifications to end-users via Instagram DM when they receive a quote
 *   2. Receive incoming DMs from users on your company Instagram handle
 *   3. Allow users to create new enquiries by DMing your company Instagram
 *   4. Link Instagram usernames to WhatsApp numbers for cross-platform notifications
 *
 * CREDENTIALS NEEDED (fill these in environment variables when ready):
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID = "" (blank — fill when Meta Business Account is active)
 *   INSTAGRAM_ACCESS_TOKEN        = "" (blank — same token as WhatsApp)
 *   INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "" (blank — create a secret string)
 *
 * WEBHOOK SETUP (after credentials are ready):
 *   1. Go to developers.facebook.com → Your App → Instagram → Webhooks
 *   2. Set Webhook URL to: https://your-domain.com/api/webhooks/instagram
 *   3. Set Verify Token to: INSTAGRAM_WEBHOOK_VERIFY_TOKEN (add to env)
 *   4. Subscribe to: messages, messaging_postbacks
 *
 * HOW TO ACTIVATE:
 *   1. Fill in INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN
 *   2. Set up webhook in Meta Developer Console
 *   3. Register the webhook GET handler in server/_core/index.ts
 *   4. Uncomment the sendInstagramNotification calls in server/routers.ts
 *
 * ============================================================
 */

// ─── CREDENTIALS (blank until Meta Business Account is active) ───────────────

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? "";
const INSTAGRAM_WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface IncomingInstagramMessage {
  senderId: string;       // Instagram user ID (not username)
  senderUsername?: string;
  messageId: string;
  text?: string;
  timestamp: number;
  type: "text" | "image" | "share" | "unknown";
  imageUrl?: string;
  sharedUrl?: string;
}

export interface InstagramUserLink {
  instagramUserId: string;
  instagramUsername: string;
  whatsappNumber?: string;
  accountId?: number;
}

// ─── SEND NOTIFICATIONS ──────────────────────────────────────────────────────

/**
 * Send an Instagram DM notification to a user when they receive a quote.
 *
 * PHASE 2: Call this from server/routers.ts after quotes.create mutation
 * if the buyer has linked their Instagram account.
 */
export async function sendInstagramQuoteNotification(
  instagramUserId: string,
  buyerName: string,
  requestTitle: string,
  jewellerName: string,
  totalPrice: number,
  goldPurity?: string
): Promise<void> {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    console.log(`[Instagram Bot MOCK] Quote notification to Instagram user ${instagramUserId}`);
    console.log(`  Request: ${requestTitle}`);
    console.log(`  Jeweller: ${jewellerName}`);
    console.log(`  Total: ₹${totalPrice.toLocaleString("en-IN")}`);
    return;
  }

  const formattedPrice = `₹${totalPrice.toLocaleString("en-IN")}`;
  const purityText = goldPurity ? ` (${goldPurity.toUpperCase()})` : "";

  const messageText = [
    `🔔 New Quote Received!`,
    ``,
    `Hi ${buyerName}! You have a new quote for "${requestTitle}"`,
    `💰 Total: ${formattedPrice}${purityText}`,
    `👨‍💼 From: ${jewellerName}`,
    ``,
    `Log in to VVServices to view and respond.`,
  ].join("\n");

  await sendInstagramDM(instagramUserId, messageText);
}

// ─── RECEIVE MESSAGES (Webhook Handler) ──────────────────────────────────────

/**
 * Verify the Instagram webhook (GET request from Meta).
 * Register this in server/_core/index.ts:
 *   app.get("/api/webhooks/instagram", handleInstagramWebhookVerification);
 */
export function handleInstagramWebhookVerification(
  mode: string,
  token: string,
  challenge: string
): { valid: boolean; challenge?: string } {
  if (!INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.warn("[Instagram Bot] INSTAGRAM_WEBHOOK_VERIFY_TOKEN not configured");
    return { valid: false };
  }
  if (mode === "subscribe" && token === INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

/**
 * Parse an incoming Instagram webhook payload into a structured message.
 */
export function parseIncomingInstagramMessage(body: unknown): IncomingInstagramMessage | null {
  try {
    const b = body as any;
    const entry = b?.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging) return null;

    const result: IncomingInstagramMessage = {
      senderId: messaging.sender?.id,
      messageId: messaging.message?.mid,
      timestamp: messaging.timestamp,
      type: "unknown",
    };

    if (messaging.message?.text) {
      result.type = "text";
      result.text = messaging.message.text;
    } else if (messaging.message?.attachments?.[0]?.type === "image") {
      result.type = "image";
      result.imageUrl = messaging.message.attachments[0].payload?.url;
    } else if (messaging.message?.attachments?.[0]?.type === "share") {
      result.type = "share";
      result.sharedUrl = messaging.message.attachments[0].payload?.url;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Process an incoming Instagram DM and create an enquiry if applicable.
 *
 * PHASE 2: This is the AI processing layer for Instagram DMs.
 * When a user DMs your company Instagram handle:
 *   1. Look up the user by their Instagram user ID (linked to their account)
 *   2. If they send an image → create a new request with that image
 *   3. If they share a product URL → scrape and create a request
 *   4. If they send text → use AI to extract product details
 *   5. Send a confirmation DM back
 *
 * TODO (Phase 2):
 *   - Integrate with LLM to extract jewellery details from text/image
 *   - Resolve Instagram user ID to account using instagramWhatsappLinks table
 *   - Auto-categorize the request
 *   - Send confirmation DM with request ID
 */
export async function processIncomingInstagramMessage(
  message: IncomingInstagramMessage
): Promise<void> {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    console.log(`[Instagram Bot MOCK] Incoming DM from ${message.senderId}: ${message.text ?? "[media]"}`);
    return;
  }

  // PHASE 2 IMPLEMENTATION:
  // 1. Look up account by Instagram user ID
  // const link = await db.getInstagramLink(message.senderId);
  // if (!link) {
  //   await sendInstagramDM(message.senderId, "Hi! Please link your Instagram on VVServices first.");
  //   return;
  // }

  // 2. Process message type
  // if (message.type === "share" && message.sharedUrl) {
  //   const scraped = await scrapeProductUrl(message.sharedUrl);
  //   const requestId = await db.createRequest({ ... });
  //   await sendInstagramDM(message.senderId, `✅ Request #${requestId} created! Jewellers will respond soon.`);
  // } else if (message.type === "image" && message.imageUrl) {
  //   const requestId = await db.createRequest({ imageUrl: message.imageUrl, ... });
  //   await sendInstagramDM(message.senderId, `✅ Request #${requestId} created with your image!`);
  // } else if (message.type === "text" && message.text) {
  //   const details = await extractJewelleryDetails(message.text);
  //   // ... create request
  // }

  console.log(`[Instagram Bot] Processing message from ${message.senderId} — PHASE 2 not yet implemented`);
}

/**
 * Get Instagram username from user ID using the Graph API.
 * Used when linking Instagram accounts.
 */
export async function getInstagramUsername(userId: string): Promise<string | null> {
  if (!INSTAGRAM_ACCESS_TOKEN) return null;

  try {
    const url = `https://graph.instagram.com/${userId}?fields=username&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const data = await response.json() as { username?: string };
    return data.username ?? null;
  } catch {
    return null;
  }
}

// ─── CORE SEND FUNCTION ──────────────────────────────────────────────────────

/**
 * Low-level function to send an Instagram DM.
 */
async function sendInstagramDM(recipientId: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Instagram DM failed (${response.status}): ${detail}`);
  }
}
