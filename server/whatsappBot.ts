/**
 * ============================================================
 * PHASE 2: WhatsApp Business Bot
 * ============================================================
 *
 * PURPOSE:
 *   1. Send notifications to end-users on WhatsApp when they receive a quote
 *   2. Receive incoming messages from users on your company WhatsApp number
 *   3. Allow users to create new enquiries by messaging your company number
 *
 * CREDENTIALS NEEDED (fill these in server/_core/env.ts when ready):
 *   WHATSAPP_ACCESS_TOKEN        = "" (blank — fill when Meta Business Account is active)
 *   WHATSAPP_PHONE_NUMBER_ID     = "1203389936195605"
 *   WHATSAPP_BUSINESS_ACCOUNT_ID = "2237849483719013"
 *   WHATSAPP_BUSINESS_PHONE_NUMBER = "+91 9111130655"
 *
 * WEBHOOK SETUP (after credentials are ready):
 *   1. Go to developers.facebook.com → Your App → WhatsApp → Configuration
 *   2. Set Webhook URL to: https://your-domain.com/api/webhooks/whatsapp
 *   3. Set Verify Token to: WHATSAPP_WEBHOOK_VERIFY_TOKEN (add to env)
 *   4. Subscribe to: messages
 *
 * HOW TO ACTIVATE:
 *   1. Fill in WHATSAPP_ACCESS_TOKEN in environment variables
 *   2. Set up webhook in Meta Developer Console
 *   3. Uncomment the sendQuoteNotification call in server/routers.ts
 *   4. Register the webhook GET handler in server/_core/index.ts
 *
 * ============================================================
 */

// ─── CREDENTIALS (blank until Meta Business Account is active) ───────────────

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "1203389936195605";
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface QuoteNotificationPayload {
  buyerName: string;
  buyerWhatsappNumber: string;
  jewellerId: number;
  jewellerName: string;
  requestTitle: string;
  totalPrice: number;
  goldPurity?: string;
  message?: string;
  requestId: number;
}

export interface IncomingWhatsAppMessage {
  from: string;         // sender's phone number
  messageId: string;
  text?: string;
  timestamp: number;
  type: "text" | "image" | "document" | "audio" | "video" | "unknown";
  imageUrl?: string;
}

// ─── SEND NOTIFICATIONS ──────────────────────────────────────────────────────

/**
 * Send a WhatsApp notification to a buyer when they receive a new quote.
 *
 * PHASE 2: Uncomment and call this from server/routers.ts after quotes.create mutation.
 * Currently a no-op until WHATSAPP_ACCESS_TOKEN is configured.
 */
export async function sendQuoteNotification(payload: QuoteNotificationPayload): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    // MOCK MODE: Log notification details
    console.log(`[WhatsApp Bot MOCK] Quote notification to ${payload.buyerWhatsappNumber}:`);
    console.log(`  Buyer: ${payload.buyerName}`);
    console.log(`  Request: ${payload.requestTitle}`);
    console.log(`  Jeweller: ${payload.jewellerName}`);
    console.log(`  Total: ₹${payload.totalPrice.toLocaleString("en-IN")}`);
    return;
  }

  const formattedPrice = `₹${payload.totalPrice.toLocaleString("en-IN")}`;
  const purityText = payload.goldPurity ? ` (${payload.goldPurity.toUpperCase()})` : "";

  const messageText = [
    `🔔 *New Quote Received!*`,
    ``,
    `Hi ${payload.buyerName}, you have a new quote for your request:`,
    `*"${payload.requestTitle}"*`,
    ``,
    `💰 *Total Price:* ${formattedPrice}${purityText}`,
    `👨‍💼 *From:* ${payload.jewellerName}`,
    payload.message ? `📝 *Message:* ${payload.message}` : null,
    ``,
    `Log in to VVServices to view the full quote and respond.`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendWhatsAppMessage(payload.buyerWhatsappNumber, messageText);
}

/**
 * Send a WhatsApp notification when a buyer's quote is accepted/rejected.
 */
export async function sendQuoteStatusNotification(
  jewellerId: number,
  jewellerWhatsappNumber: string,
  jewellerName: string,
  requestTitle: string,
  status: "accepted" | "dismissed"
): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.log(`[WhatsApp Bot MOCK] Quote status notification to ${jewellerWhatsappNumber}: ${status}`);
    return;
  }

  const emoji = status === "accepted" ? "✅" : "❌";
  const statusText = status === "accepted" ? "accepted" : "declined";

  const messageText = [
    `${emoji} *Quote ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}!*`,
    ``,
    `Hi ${jewellerName}, the buyer has *${statusText}* your quote for:`,
    `*"${requestTitle}"*`,
    ``,
    `Log in to VVServices to view details.`,
  ].join("\n");

  await sendWhatsAppMessage(jewellerWhatsappNumber, messageText);
}

// ─── RECEIVE MESSAGES (Webhook Handler) ──────────────────────────────────────

/**
 * Verify the WhatsApp webhook (GET request from Meta).
 * Register this in server/_core/index.ts:
 *   app.get("/api/webhooks/whatsapp", handleWhatsAppWebhookVerification);
 */
export function handleWhatsAppWebhookVerification(
  mode: string,
  token: string,
  challenge: string
): { valid: boolean; challenge?: string } {
  if (!WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.warn("[WhatsApp Bot] WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured");
    return { valid: false };
  }
  if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

/**
 * Parse an incoming WhatsApp webhook payload into a structured message.
 */
export function parseIncomingWhatsAppMessage(body: unknown): IncomingWhatsAppMessage | null {
  try {
    const b = body as any;
    const entry = b?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    const result: IncomingWhatsAppMessage = {
      from: message.from,
      messageId: message.id,
      timestamp: parseInt(message.timestamp) * 1000,
      type: message.type ?? "unknown",
    };

    if (message.type === "text") {
      result.text = message.text?.body;
    } else if (message.type === "image") {
      // PHASE 2: Download image from WhatsApp media API and re-host
      // result.imageUrl = await downloadWhatsAppMedia(message.image.id);
      result.imageUrl = `whatsapp-media:${message.image?.id}`;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Process an incoming WhatsApp message and create an enquiry if applicable.
 *
 * PHASE 2: This is the AI processing layer.
 * When a user sends a message/image to your company WhatsApp number,
 * this function will:
 *   1. Look up the user by their WhatsApp number
 *   2. If they send an image → create a new request with that image
 *   3. If they send a URL → scrape and create a request
 *   4. If they send text → use AI to extract product details and create a request
 *   5. Send a confirmation message back to the user
 *
 * TODO (Phase 2):
 *   - Integrate with LLM to extract jewellery details from text/image
 *   - Auto-categorize the request
 *   - Send confirmation with request ID
 */
export async function processIncomingWhatsAppMessage(
  message: IncomingWhatsAppMessage
): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.log(`[WhatsApp Bot MOCK] Incoming message from ${message.from}: ${message.text ?? "[media]"}`);
    return;
  }

  // PHASE 2 IMPLEMENTATION:
  // 1. Look up account by WhatsApp number
  // const account = await db.getAccountByWhatsapp(`+${message.from}`);
  // if (!account) {
  //   await sendWhatsAppMessage(message.from, "Welcome to VVServices! Please register at our website first.");
  //   return;
  // }

  // 2. Process message type
  // if (message.type === "text" && message.text) {
  //   if (isUrl(message.text)) {
  //     // Scrape URL and create request
  //     const scraped = await scrapeProductUrl(message.text);
  //     const requestId = await db.createRequest({ ... });
  //     await sendWhatsAppMessage(message.from, `✅ Request #${requestId} created! Jewellers will respond soon.`);
  //   } else {
  //     // Use AI to extract product details
  //     const details = await extractJewelleryDetails(message.text);
  //     // ... create request
  //   }
  // } else if (message.type === "image" && message.imageUrl) {
  //   // Create request with image
  //   const requestId = await db.createRequest({ imageUrl: message.imageUrl, ... });
  //   await sendWhatsAppMessage(message.from, `✅ Request #${requestId} created with your image!`);
  // }

  console.log(`[WhatsApp Bot] Processing message from ${message.from} — PHASE 2 not yet implemented`);
}

// ─── CORE SEND FUNCTION ──────────────────────────────────────────────────────

/**
 * Low-level function to send a WhatsApp text message.
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const toNormalized = to.replace(/\+/g, "").replace(/\s/g, "");
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toNormalized,
      type: "text",
      text: { body: text },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${response.status}): ${detail}`);
  }
}
