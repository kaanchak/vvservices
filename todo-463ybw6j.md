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
- [x] Checkpoint saved (version: fa030548)

## Phase 4 — MSG91 WhatsApp OTP (BLOCKED)

- [x] Add MSG91 credentials as project secrets
- [x] Rewrite server/whatsappAuth.ts to send OTP via MSG91 WhatsApp template API
- [x] Vitest: credential validation + payload shape (8 tests passing)
- [ ] BLOCKED: MSG91 accepts the send (HTTP 200, request_id returned) but messages do not deliver — Meta-side WABA/template verification incomplete. User will resolve Meta verification later. Mock-mode fallback keeps login working meanwhile.
- [x] Confirmed server/whatsappAuth.livesend.test.ts is absent and no live-send test remains in the suite (89/89 tests run without hitting the real MSG91 API). NOTE: this is cleanup only — WhatsApp delivery itself is still UNCONFIRMED, see the blocked item above.

## Phase 5 — Pivot to Discovery Platform + Jeweller Profiles

### Remove transactional affordances
- [x] Remove "Add to Cart" / buy button from chat official quote card
- [x] Remove the contact permission gate: buyer quote cards now carry direct WhatsApp + Profile buttons on any non-dismissed quote, no acceptance required
- [x] Audit for any other checkout/cart/order affordances and remove (placeOrder mutation, myOrders query, Order Placed panel, order-framing copy)

### Schema
- [x] Add jeweller profile fields to accounts: address, website, instagramUrl, about, logoUrl, profileStatus (draft/pending/approved/rejected/suspended), profileSlug, profileReviewNote, profileApprovedAt
- [x] Add `portfolioItems` table (jewellerId, imageUrl, caption, sortOrder, source: uploaded|quoted, requestId nullable, isPromoted)
- [x] Generate and apply migration SQL (0007_first_dark_phoenix.sql)

### Backend
- [x] db helpers: getApprovedJewellerBySlug, listApprovedJewellers, listJewellersByProfileStatus, updateJewellerProfile, ensureProfileSlug, setProfileStatus, portfolio CRUD, getVisiblePortfolio
- [x] tRPC jewellers router: publicProfile, directory, myProfile, updateProfile, uploadLogo, submitForReview, addPortfolioImage, updatePortfolioItem, deletePortfolioItem, quotedWorkCandidates, promoteQuotedWork
- [x] tRPC admin moderation: jewellerProfiles, jewellerProfileDetail, setJewellerProfileStatus, editJewellerProfile, removePortfolioItem
- [x] Quoted work visibility enforced in getVisiblePortfolio: uploaded is public, quoted requires logged-in viewer AND isPromoted

### Frontend — Jeweller
- [x] Profile editor page at /jeweller/profile: business name, categories, city, address, website, Instagram, about, WhatsApp number, logo upload
- [x] Portfolio manager: multi-upload, delete, quoted-work section with removal
- [x] Profile status banner (draft / pending / approved / rejected / suspended) with readiness checklist and public-profile link
- [x] "My Profile" added to jeweller nav
### Frontend — Public
- [x] Public jeweller profile page at /j/:slug — logo, name, verified badge, categories, about, address, website link, Instagram link, WhatsApp chat button (wa.me), image lightbox
- [x] Quoted-work section gated to logged-in users with a sign-in prompt for guests
- [x] Browsable jeweller directory at /jewellers with category filter, name/city search, and 3-image preview strip
- [x] Routes registered in App.tsx; "Browse jewellers" links added to the home nav and hero
- [x] Route namespace chosen as /j/:slug to avoid colliding with the /jeweller/* dashboard routes

### Frontend — Admin
- [x] Admin "Profiles" tab with pending-count badge: table of every jeweller profile showing logo, name, email, city, categories, photo counts, status pill, and public URL
- [x] Review dialog: full detail with address/website/Instagram/about to verify, incident count warning, portfolio grid, review note field, and Approve / Request changes / Suspend actions
- [x] Admin can remove portfolio images from the review dialog

### Tests + Checkpoint
- [x] Vitest server/jewellerProfile.test.ts — 17 tests: slug generation (incl. route-collision safety), approval state machine (draft → pending → approved → suspended), review notes, partial profile patches, and portfolio visibility gating
- [x] Tests self-clean via afterAll teardown so approved test profiles no longer leak into the public directory
- [x] Removed the temporary live MSG91 send probe test
- [x] 89/89 tests passing across 9 files, tsc clean
- [x] Checkpoint saved (version: 58ee44d1)

## Reminders (raised by user, to revisit)
- [ ] REMINDER: revisit/redesign the quotation flow
- [ ] REMINDER: WhatsApp OTP login once Meta verification clears

## Phase 6 — Three-Field Buyer Request Form
- [x] Audit the existing request form and request-create contract for required compatibility fields
- [x] Audit the existing request form and request-create contract for required compatibility fields
- [x] Add `requests.autoRouteAll` flag with migration 0008_tired_ghost_rider.sql; category now infers from scraped details/specifications (gold, diamond-gold, stone-studded), with unknown requests deliberately routed to all jeweller categories
- [x] Keep legacy title/category/timeline inputs accepted server-side for old clients while deriving a safe title and category when the streamlined form omits them
- [x] Extend requests.create to store up to five locally uploaded reference photos in parallel
- [x] Reduce submission to product reference (URL or up to 5 photos), one required approximate budget, and optional specifications
- [x] Remove buyer-facing title, category, budget-range and timeline controls; collapse extraction output to a compact reference confirmation and update validation/copy
- [x] Preserve URL scraping, up-to-five-photo persistence, real-time lead routing, and jeweller quote compatibility; buyer cards now hide the internal category and show one approximate budget
- [x] Add server/shortRequestRouting.test.ts — 8 tests for 14KT/18KT, natural/lab-grown diamond, stone inference, no-guess routing, tRPC short-form compatibility, and all-category lead visibility
- [x] 97/97 tests passing across 10 files; TypeScript clean; test teardown confirmed no profile or short-form test accounts remain in live data
- [ ] Checkpoint and publish simplified request form
