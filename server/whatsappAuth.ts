/**
 * WhatsApp OTP Authentication
 *
 * Handles OTP generation, sending, and verification for WhatsApp-based login.
 *
 * CURRENT STATE: OTP is logged to console (mock mode).
 * When WHATSAPP_ACCESS_TOKEN is available, replace the sendOtpViaWhatsApp
 * function body with the real WhatsApp Cloud API call.
 *
 * WhatsApp Cloud API endpoint:
 *   POST https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
 *   Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
 *
 * Credentials needed (Phase 2):
 *   WHATSAPP_ACCESS_TOKEN        = (blank — fill when Meta Business Account is active)
 *   WHATSAPP_PHONE_NUMBER_ID     = 1203389936195605
 *   WHATSAPP_BUSINESS_ACCOUNT_ID = 2237849483719013
 *   WHATSAPP_BUSINESS_PHONE_NUMBER = +91 9111130655
 */

import { getDb } from "./db";
import { whatsappOtps } from "../drizzle/schema";
import { and, eq, gt } from "drizzle-orm";

const OTP_EXPIRY_MINUTES = 10;
const WHATSAPP_PHONE_NUMBER_ID = "1203389936195605";
// PHASE 2: Fill this in when Meta Business Account is active
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";

/**
 * Generate a 6-digit OTP.
 */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Normalize a WhatsApp number to E.164 format.
 * Accepts: +919111130655, 919111130655, 09111130655, 9111130655
 */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Send OTP via WhatsApp Cloud API.
 *
 * PHASE 2: When WHATSAPP_ACCESS_TOKEN is configured, this will send a real WhatsApp message.
 * Currently logs the OTP to console for testing.
 */
async function sendOtpViaWhatsApp(toNumber: string, otp: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    // MOCK MODE: Log OTP to console for testing
    console.log(`[WhatsApp OTP MOCK] To: ${toNumber} | OTP: ${otp} | Expires in ${OTP_EXPIRY_MINUTES} minutes`);
    return;
  }

  // PHASE 2: Real WhatsApp Cloud API call
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toNumber.replace("+", ""),
    type: "text",
    text: {
      body: `Your VVServices verification code is: *${otp}*\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp API error ${response.status}: ${detail}`);
  }

  console.log(`[WhatsApp OTP] Sent to ${toNumber}`);
}

/**
 * Generate and send an OTP to a WhatsApp number.
 * Returns the OTP expiry time.
 */
export async function sendWhatsappOtp(rawNumber: string): Promise<{ expiresAt: Date }> {
  const whatsappNumber = normalizeWhatsappNumber(rawNumber);
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Store OTP in DB
  await db.insert(whatsappOtps).values({
    whatsappNumber,
    otp,
    used: false,
    expiresAt,
  });

  // Send via WhatsApp (or mock)
  await sendOtpViaWhatsApp(whatsappNumber, otp);

  return { expiresAt };
}

/**
 * Verify an OTP for a WhatsApp number.
 * Returns true if valid, marks it as used.
 */
export async function verifyWhatsappOtp(rawNumber: string, otp: string): Promise<boolean> {
  const whatsappNumber = normalizeWhatsappNumber(rawNumber);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const rows = await db
    .select()
    .from(whatsappOtps)
    .where(
      and(
        eq(whatsappOtps.whatsappNumber, whatsappNumber),
        eq(whatsappOtps.otp, otp),
        eq(whatsappOtps.used, false),
        gt(whatsappOtps.expiresAt, now)
      )
    )
    .limit(1);

  if (rows.length === 0) return false;

  // Mark as used
  await db
    .update(whatsappOtps)
    .set({ used: true })
    .where(eq(whatsappOtps.id, rows[0]!.id));

  return true;
}
