# VVServices — Project TODO

## Backend / Infrastructure
- [x] Database schema: accounts (buyer/jeweller/admin with email+phone+password), requests, quotes, categories
- [x] Custom email/password auth (JWT session cookie) separate from Manus OAuth
- [x] Demo accounts seeded: user@demo.com/demo123, jeweller@demo.com/demo123, admin@vvservices.com/admin123
- [x] tRPC routers: auth (register/login/logout/me), requests (create/list/mine), quotes (create/list/accept/dismiss), admin (users/requests/quotes/stats)
- [x] Image upload to S3 storage (file upload) + image URL paste support
- [x] Socket.io server wired into Express (path /api/socket.io) with rooms per role/category
- [x] Real-time: new request → jeweller dashboards (category-filtered) instantly
- [x] Real-time: new quote → buyer quotes view instantly
- [x] Real-time: quote accept/dismiss status → jeweller view instantly

## Landing Page
- [x] Hero with exact headline "Get custom jewellery made at manufacturer prices"
- [x] How-it-works: 3 steps for buyers, 3 steps for jewellers
- [x] Waitlist/signup CTA section
- [x] Premium white/gold design (#D4AF37, #FFFFFF, #1A1A1A), luxury typography
- [x] Mobile responsive landing

## Buyer Flow
- [x] Buyer signup/login page (email + phone + password)
- [x] Submit request: upload image OR paste URL, category select (Gold, Diamond with Gold, Stone-studded), budget range, timeline, notes
- [x] My Requests list with status
- [x] Quotes view: card comparison (price, jeweller name, rating), accept/dismiss buttons
- [x] Live quote arrival (Socket.io) with toast/animation

## Jeweller Flow
- [x] Jeweller signup with category multi-selection
- [x] Dashboard: lead feed filtered by jeweller categories, card layout with image/category/requirements
- [x] Quote form: gold weight (g), diamond weight (ct), making charges, total price
- [x] My Quotes list with status (pending/accepted/dismissed)
- [x] Live lead arrival (Socket.io) with toast/animation

## Admin Panel
- [x] Admin login (admin@vvservices.com / admin123)
- [x] Tables: all users, jewellers, requests, quotes
- [x] Analytics: totals for users, jewellers, requests, quotes

## Quality & Delivery
- [x] Vitest tests for auth, requests, quotes (8 tests passing: register w/ phone, demo logins, full request→quote→accept flow, category filtering, RBAC, admin tables)
- [x] Mobile responsiveness verified on key pages
- [x] End-to-end real-time flow tested (two sessions: request → lead feed → quote → buyer, verified via browser + socket clients)

## New requirements (Jul 15)
- [x] README documenting standard local run (npm install / npm run dev) and GitHub export, incl. SQLite portability note
- [x] Reset demo data to pristine state before deploy (5 accounts, 3 requests, 2 quotes)
- [x] Checkpoint and deploy to public URL (checkpoint saved; deploy done via webdev_deploy_project)

## URL Scraping Feature (Jul 15 addition)
- [x] Server-side scraper: fetch URL, extract OG image, JSON-LD product data, meta tags, HTML text patterns for gold/diamond/price/metal/stone
- [x] New tRPC procedure: scraper.scrapeUrl (public, returns ScrapedProduct)
- [x] DB schema: add scrapedDetails JSON column to requests table (migration 0002 applied)
- [x] tRPC requests.create: accept and store scrapedDetails
- [x] Buyer form: debounced auto-scrape on URL paste, loading spinner, preview panel with image + extracted badges, auto-fill title, clear button
- [x] Jeweller lead card: "Extracted product details" section showing metal, gold weight, diamond weight, stone type, listed price, description
- [x] Vitest tests for scraper (5 tests) — 13/13 total tests passing
- [x] Deploy updated version (checkpoint + redeploy)

## Jeweller UI Improvements (Jul 15 — Features 3 & 4)
- [x] Feature 3: Lead card scraped details — 2-column grid layout with gold-tinted background, per-field labels, description excerpt
- [x] Feature 4: Full-screen lead detail page — large hero image, extracted specs card, buyer requirements card, sticky quote form panel
- [x] Route /jeweller/leads/:id wired in App.tsx
- [x] Checkpoint and redeploy

## Bug Fixes (Jul 15 — Round 2)
- [x] Bug 1: Image proxy endpoint /api/image-proxy?url=... added (server/imageProxy.ts, registered in _core/index.ts)
- [x] Bug 1b: All image src references updated to use proxiedImageUrl() across BuyerDashboard, JewellerDashboard, JewellerLeadDetail, JewellerQuotes
- [x] Bug 2: Jeweller quote form — auto-calculated total (gold ₹7,000/g + diamond ₹50,000/ct + making charges), breakdown shown in both QuoteDialog and JewellerLeadDetail
- [x] Bug 3: materialgood.com fixed — Shopify JSON API (/products/<handle>.json) called first for Shopify product URLs; JSON-LD no longer overwrites Shopify data; returns correct title/image/price/metal/stone
- [x] Checkpoint and redeploy (16/16 tests passing)

## Security: SSRF Fix (Jul 19)
- [x] SSRF protection in scraper.ts: protocol check (http/https only), DNS pre-resolution via dns.promises.lookup(), private IP blocklist (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0)
- [x] Timeout tightened to 10s (was 15s), response size cap raised to 10MB (was 2MB)
- [x] Exact error message: "This URL cannot be processed for security reasons"
- [x] 9 new SSRF vitest tests (localhost, 127.0.0.1, 10.x, 192.168.x, 172.16.x, 169.254.x, file://, ftp://, data:) — 25/25 total tests passing
- [x] Checkpoint and redeploy
