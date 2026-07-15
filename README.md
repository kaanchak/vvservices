# VVServices — Jewellery Lead Generation Marketplace

VVServices connects jewellery buyers with manufacturers. Buyers submit a design (image upload or URL) with their requirements; jewellers receive matching leads in real time and respond with itemised quotes (gold weight, diamond carats, making charges, total price) that buyers can compare, accept, or dismiss.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Vite |
| Backend | Node.js, Express 4, tRPC 11 |
| Real-time | Socket.io (WebSockets, path `/api/socket.io`) |
| Database | MySQL via Drizzle ORM (portable to SQLite, see below) |
| Auth | Email/password with scrypt hashing + JWT session cookies |
| Tests | Vitest (`pnpm test` / `npm test`) |

The entire codebase is standard, transparent Node.js — no proprietary services are required at runtime beyond a SQL database and S3-compatible storage for uploaded images (image-URL requests work without any storage service).

## Running Locally

```bash
npm install          # or pnpm install
# create a .env file with DATABASE_URL and JWT_SECRET
npm run db:push      # create tables (drizzle-kit)
node seed-demo.mjs   # seed demo accounts and sample data
npm run dev          # http://localhost:3000
```

Build for production with `npm run build` and start with `npm start`.

## Exporting to GitHub

The project is a self-contained repository. Export it from the Manus Management UI (Settings → GitHub) or push manually: `git remote add origin <your-repo-url> && git push -u origin main`. The `.gitignore` already excludes `node_modules`, build output, and `.env` files. After cloning on any machine, the standard flow applies: `npm install`, create a `.env` with `DATABASE_URL` and `JWT_SECRET`, `npm run db:push`, `node seed-demo.mjs`, then `npm run dev`. No proprietary services are required — point `DATABASE_URL` at any MySQL instance (or SQLite, see below).

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Buyer | user@demo.com | demo123 |
| Jeweller | jeweller@demo.com | demo123 |
| Admin | admin@vvservices.com | admin123 |

## Database Portability (SQLite)

All queries go through Drizzle ORM, so the storage engine is swappable. To run on SQLite instead of MySQL:

1. Install the driver: `npm install better-sqlite3`.
2. In `drizzle/schema.ts`, switch imports from `drizzle-orm/mysql-core` to `drizzle-orm/sqlite-core` (`mysqlTable` → `sqliteTable`, `mysqlEnum` → `text` with a check, `timestamp` → `integer({ mode: "timestamp" })`).
3. In `server/db.ts`, replace `drizzle-orm/mysql2` with `drizzle-orm/better-sqlite3` and set `DATABASE_URL=file:./vvservices.db`.
4. Update `drizzle.config.ts` dialect to `sqlite` and re-run `npm run db:push`.

No application logic changes are required — routers, auth, and Socket.io are database-agnostic.

## Project Structure

```
client/src/pages/      Landing, Login, Signup, BuyerDashboard, BuyerQuotes,
                       JewellerDashboard, JewellerQuotes, AdminPanel
client/src/hooks/      useAccount (auth state), useSocket (realtime)
server/routers.ts      tRPC procedures (account, requests, quotes, waitlist, admin)
server/accountAuth.ts  Password hashing + JWT session cookies
server/realtime.ts     Socket.io rooms and event emitters
server/db.ts           Drizzle query helpers
drizzle/schema.ts      Database schema (accounts, requests, quotes, waitlist)
seed-demo.mjs          Demo data seeder
```

## Real-time Event Model

Socket.io rooms are joined automatically from the session cookie on connect. A new buyer request is emitted to `jewellers:{category}` rooms so only matching jewellers see the lead instantly; a new quote is emitted to the buyer's private `buyer:{id}` room; accept/dismiss decisions are emitted to the jeweller's `jeweller:{id}` room; and the `admins` room receives counter updates for the live dashboard.
