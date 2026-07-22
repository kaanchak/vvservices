# VVServices Phase 1 + Phase 2 Skeleton — Session TODO

## Phase 1: Gold Price API
- [x] Add goldPrices table to drizzle/schema.ts
- [x] Add goldPrice DB helpers in server/db.ts
- [x] Create server/goldPrice.ts with fetch + purity calculation logic
- [x] Add goldPrice tRPC router (current, history, refresh)
- [x] Register /api/scheduled/syncGoldPrice handler in server/_core/index.ts
- [x] Create heartbeat cron job via manus-heartbeat CLI for 12 AM IST (18:30 UTC) — task_uid: XNQ94j6uMh8tqbgwbMSfwZ
- [x] Show gold price on Home page (all 3 purities)
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

## Robustness
- [x] Add loading/empty state for Home page gold price ticker
- [x] Trigger initial gold price fetch on server startup (so first run is populated)

## Phase 2 — Messaging, Quote Slots, Requote, Reports, Admin

### DB Schema
- [x] Add `chatThreads` table (id, requestId, buyerId, jewellerId, quoteId, status: open/closed/buyer_declined/jeweller_withdrawn)
- [x] Add `messages` table (id, threadId, senderId, senderRole, content, type: text/requote, createdAt)
- [x] Add `requotes` table (id, threadId, jewellerId, price, specs, reason, status: pending/accepted/rejected, createdAt)
- [x] Add `orders` table (id, threadId, quoteId, buyerId, jewellerId, amount, platformFeePercent, status: pending_payment/paid/fulfilled, createdAt)
- [x] Add `jewelleryReports` table (id, reporterId, reportedJewellerId, threadId, reason, status: pending/reviewed, adminNotes, createdAt)
- [x] Update `quotes` table: add `preMessage` text field
- [x] Update `requests` table: add `activeQuoteCount` int (0-5), update status enum to include `paused`

### Backend
- [x] Quote slot logic: max 5 per request, slot freed on dismiss, request pauses at 5 (not on accept)
- [x] tRPC: createThread (on quote accept), sendMessage, getThread, getMessages
- [x] tRPC: closeThread (buyer = decline, jeweller = withdraw)
- [x] tRPC: sendRequote, acceptRequote, rejectRequote
- [x] tRPC: reportJeweller, getReports (admin), resolveReport (admin)
- [x] tRPC: getAdminChats, getJewellerIncidents

### Frontend — Buyer
- [x] Buyer request detail: show quote cards with Accept/Dismiss buttons + slot counter
- [x] Buyer chat page: full chat UI with official quote card at top
- [x] Official quote card: shows price, purity, weight, delivery time + Add to Cart (placeholder)
- [x] Requote card in chat: Accept/Reject buttons, shows new specs vs original
- [x] Close chat button (buyer = decline)
- [x] Report jeweller button in chat

### Frontend — Jeweller
- [x] Jeweller quote form: add pre-acceptance message field + warning about quote lock
- [x] Jeweller lead detail: show accepted quote with chat unlock indicator
- [x] Jeweller chat page: full chat UI
- [x] Send Requote button in chat: structured form (price, specs, reason)
- [x] Close chat button (jeweller = withdraw)

### Admin
- [x] Admin chats panel: list all active chat threads
- [x] Admin reported chats panel: flagged threads with full history
- [x] Admin jeweller incidents tracker: report count per jeweller + warn/suspend controls

### Real-time
- [x] Socket.io: emit new messages to buyer:{id} and jeweller:{id} rooms
- [x] Socket.io: emit requote events to buyer:{id} room
- [x] Socket.io: emit thread status changes to both parties

### Tests
- [x] Tests for quote slot logic (5 slot cap, slot freeing, pause at 5)
- [x] Tests for chat thread creation and message sending
- [x] Tests for requote flow (send, accept, reject)
- [x] Tests for report system

## Phase 3 — UX Fixes (Jul 22)

- [x] Fix requote card in buyer chat: currently shows "scroll to top" hint with nothing rendered — must appear embedded inline in the chat flow with interactive Accept/Reject buttons
- [x] Fix image race condition: buyer pastes URL and submits before scraping completes → listing has no image; scraping must complete/attach in background (server-side background scrape fallback patches the request row)
- [x] Support multiple product images (up to 5 if available) instead of only 1, with photo-count badge on buyer request cards and thumbnail gallery in jeweller lead detail
- [x] ~~Redesign jeweller lead detail page (buyer listing view)~~ SKIPPED — explicitly deferred by user (Jul 22, "don't do fix 3 now")
- [x] ~~Redesign jeweller quote price form interface~~ SKIPPED — explicitly deferred by user (Jul 22, "don't do fix 3 now")
- [x] Tests + checkpoint for fixes 1 & 2 (server/requestImages.test.ts — 3 new tests; 56/56 passing)

## Phase 3 — Currency Fix (Stage A + B)

### Stage B — Exchange Rate Service
- [x] Add `exchangeRates` table to drizzle/schema.ts (currency pair, rate, fetchedAt)
- [x] Generate and apply migration SQL
- [x] Create server/exchangeRate.ts: fetch rates from free API (fawazahmed0/exchange-api, no key needed), store in DB
- [x] Register /api/scheduled/syncExchangeRates heartbeat handler
- [x] Create daily cron job via manus-heartbeat at 18:35 UTC (task_uid: NHumrwGxsZ2shaNuXvZqic)
- [x] Startup seed: exchange rates fetched on server boot alongside gold price

### Stage A — Fix USD Conversion Bug in Scraper
- [x] Update scraper text-regex to detect and set currency (USD/EUR/GBP/AED/INR) alongside price
- [x] Fix Shopify helper: removed hardcoded INR assumption
- [x] Store originalPrice + originalCurrency on the request row (new columns)
- [x] On scrape (foreground + background), convert foreign currency price to INR using cached exchange rate
- [x] scrapedDetails stored with INR-converted price; original preserved in originalPrice/originalCurrency columns

### Tests + Checkpoint
- [x] Vitest: convertToInr (6 cases including the exact $45,600 bug), parsePriceString (10 cases)
- [x] 72/72 tests passing, tsc clean
- [ ] Checkpoint saved
