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
