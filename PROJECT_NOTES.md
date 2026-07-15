# VVServices — Internal build notes (for agent)

## Key facts
- Project path: /home/ubuntu/vvservices, template web-db-user (React19+Tailwind4+Express+tRPC11+Drizzle MySQL)
- Dev URL: https://3000-ikl42uvrzm9andkkj1ndi-f9a76c42.sg1.manus.computer
- Custom auth: server/accountAuth.ts (scrypt + jose JWT, cookie `vv_session`), context has `ctx.account`
- Socket.io: server/realtime.ts, path `/api/socket.io`, rooms: jewellers:{cat}, buyer:{id}, jeweller:{id}, admins
  - Events: new-request, new-quote, quote-status, admin-update; client emits subscribe-categories
- Client socket hook: client/src/hooks/useSocket.ts (shared socket, reconnectSocket() after login/logout)
- Auth hook: client/src/hooks/useAccount.ts (trpc.account.me)
- Manus OAuth redirect disabled in client/src/main.tsx
- Categories (shared/categories.ts): gold, diamond-gold, stone-studded; labels Gold / Diamond with Gold / Stone-studded
- Hero images (already uploaded): /manus-storage/hero-necklace_1beb76eb.jpg, /manus-storage/hero-ring_da3dc6cb.jpg, /manus-storage/hero-earring_51c6a7c2.jpg
- Seed: seed-demo.mjs (run `node seed-demo.mjs`) — user@demo.com/demo123 (buyer id1), jeweller@demo.com/demo123 (id2, all 3 cats, Verma Jewels), admin@vvservices.com/admin123 (id3), +2 extra jewellers, 3 requests, 2 quotes
- Routes: / /login /signup /signup/jeweller /app /app/quotes /app/requests/:id /jeweller /jeweller/quotes /admin
- Pages built: Home, Login, Signup, BuyerDashboard, BuyerQuotes, JewellerDashboard (+QuoteDialog), JewellerQuotes, AdminPanel; AppShell layout; Brand components
- tRPC routers: account.{me,register,login,logout}, waitlist.join, requests.{create,mine,leads}, quotes.{create,forRequest,forBuyer,mine,setStatus}, admin.{stats,accounts,requests,quotes}
- Image upload: base64 via requests.create → storagePut in server/storage.ts
- Typecheck passes (pnpm check exit 0). Landing/login/signup/jeweller-signup screenshots verified desktop+mobile. /signup transient hook error was a vite dep-optimization reload, re-verified fine.

## Remaining
- Test login flows + realtime end-to-end via browser
- Vitest tests for auth/requests/quotes
- Update todo.md checkmarks
- Checkpoint, deploy, deliver

## Test progress (browser, Jul 15)
- Buyer login user@demo.com works → redirected to /app, seeded 3 requests visible with images.
- New request submitted via UI: "Rose Gold Diamond Pendant", category Diamond with Gold, image URL unsplash photo-1602751584552-8ba73aad10e1, budget 60000-90000. Toast "Request submitted!" shown → request id likely 4.
- Next: login as jeweller@demo.com in same browser (or check realtime via socket logs), send quote on the new request, verify buyer sees quote; check admin panel; then vitest, todo.md, checkpoint, deploy.
