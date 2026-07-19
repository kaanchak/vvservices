# VVServices Phase 1 + Phase 2 Skeleton — Session TODO

## Phase 1: Gold Price API
- [x] Add goldPrices table to drizzle/schema.ts
- [x] Add goldPrice DB helpers in server/db.ts
- [x] Create server/goldPrice.ts with fetch + purity calculation logic
- [x] Add goldPrice tRPC router (current, history, refresh)
- [x] Register /api/scheduled/syncGoldPrice handler in server/_core/index.ts
- [ ] Create heartbeat cron job via manus-heartbeat CLI for 12 AM IST (18:30 UTC)
- [ ] Show gold price on Home page (all 3 purities)
- [x] Show gold price on JewellerDashboard

## Phase 1: WhatsApp OTP Login
- [x] Add whatsappNumber (nullable) to accounts table
- [x] Add whatsappOtps table (phone, otp, expiresAt, used)
- [x] Add DB helpers for OTP in server/db.ts
- [x] Create server/whatsappAuth.ts: sendOtp (mock/console), verifyOtp
- [x] Add account.sendWhatsappOtp tRPC procedure (public)
- [x] Add account.verifyWhatsappOtp tRPC procedure (public, creates session)
- [x] Update Signup.tsx: add WhatsApp signup tab as primary method
- [x] Update Login.tsx: add WhatsApp login option

## Phase 1: Jeweller Quote Form Improvements
- [x] Add goldPurity field to quotes table (9kt/14kt/18kt)
- [x] Update quotes.create tRPC input to accept goldPurity + goldPricePerGram
- [x] Update JewellerLeadDetail.tsx QuoteForm: add purity selector (9KT/14KT/18KT)
- [x] Update JewellerLeadDetail.tsx: auto-fill goldWeight from scrapedDetails
- [x] Update JewellerLeadDetail.tsx: auto-fill diamondWeight from scrapedDetails
- [x] Update JewellerLeadDetail.tsx: live gold price from API, purity-adjusted
- [x] Update JewellerDashboard.tsx QuoteDialog: same purity + auto-fill changes

## Phase 2 Skeleton: WhatsApp Business Bot (blank credentials)
- [x] Create server/whatsappBot.ts with blank credential placeholders
- [x] Add /api/webhooks/whatsapp webhook handler (placeholder)
- [x] Register webhook route in server/_core/index.ts

## Phase 2 Skeleton: Instagram Business Bot (blank credentials)
- [x] Create server/instagramBot.ts with blank credential placeholders
- [x] Add /api/webhooks/instagram webhook handler (placeholder)
- [x] Register webhook route in server/_core/index.ts
- [x] Add instagramWhatsappLinks table to schema

## Phase 2 Skeleton: Unified Notification Dispatcher
- [x] Create server/businessNotifications.ts

## Testing
- [x] Run pnpm test — all 25 tests pass
- [x] TypeScript check passes (no errors)
- [x] Add vitest test for goldPrice purity calculation
- [x] Add vitest test for whatsappOtp flow (normalizeWhatsappNumber)
- [x] Save checkpoint
