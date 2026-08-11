import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { initRealtime } from "../realtime";
import { registerImageProxy } from "../imageProxy";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { fetchAndStoreGoldPrice } from "../goldPrice";
import { fetchAndStoreExchangeRates } from "../exchangeRate";
import { processVerifiedRazorpayWebhook, razorpayProvider } from "../payments";
import type { Request, Response } from "express";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Socket.io realtime layer (path /api/socket.io so the gateway routes it)
  initRealtime(server);
  // Razorpay signs the raw JSON payload. This route must remain before the
  // global JSON parser so signature verification never receives altered bytes.
  app.post("/api/webhooks/razorpay", express.raw({ type: "application/json", limit: "1mb" }), async (req: Request, res: Response) => {
    if (!razorpayProvider.isConfigured()) {
      return res.status(503).json({ error: "razorpay-not-configured" });
    }
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      const result = await processVerifiedRazorpayWebhook(rawBody, req.header("x-razorpay-signature") ?? undefined);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const invalidSignature = message.includes("Invalid or unconfigured Razorpay webhook signature");
      console.error("[Razorpay Webhook] Processing failed:", message);
      return res.status(invalidSignature ? 401 : 500).json({ error: invalidSignature ? "invalid-signature" : "webhook-processing-failed" });
    }
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerImageProxy(app);
  registerOAuthRoutes(app);
  // --- Scheduled: Gold Price Sync (daily 12 AM IST = 18:30 UTC) ---
  app.post("/api/scheduled/syncGoldPrice", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await fetchAndStoreGoldPrice();
      return res.json({
        ok: true,
        pricePerGram24kt: result.pricePerGram24kt,
        pricePerGram18kt: result.pricePerGram18kt,
        fetchedAt: result.fetchedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[syncGoldPrice] Error:", message);
      return res.status(500).json({
        error: message,
        stack,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // --- Scheduled: Exchange Rate Sync (daily 12 AM IST = 18:30 UTC) ---
  app.post("/api/scheduled/syncExchangeRates", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await fetchAndStoreExchangeRates();
      return res.json({ ok: true, rates: result.rates, fetchedAt: result.fetchedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[syncExchangeRates] Error:", message);
      return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
    }
  });

  // --- Scheduled: WhatsApp Notification Webhook (Phase 2 - blank credentials) ---
  app.post("/api/webhooks/whatsapp", async (req: Request, res: Response) => {
    // PHASE 2 PLACEHOLDER: WhatsApp Business webhook handler
    // Fill in WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID to activate
    // See server/whatsappBot.ts for implementation
    console.log("[WhatsApp Webhook] Received (credentials not configured)");
    return res.status(200).json({ status: "placeholder" });
  });

  // --- Scheduled: Instagram Notification Webhook (Phase 2 - blank credentials) ---
  app.post("/api/webhooks/instagram", async (req: Request, res: Response) => {
    // PHASE 2 PLACEHOLDER: Instagram Business webhook handler
    // Fill in INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN to activate
    // See server/instagramBot.ts for implementation
    console.log("[Instagram Webhook] Received (credentials not configured)");
    return res.status(200).json({ status: "placeholder" });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Trigger an initial gold price fetch on startup so the first request
    // always has a price available (cron runs daily at 12 AM IST).
    fetchAndStoreGoldPrice()
      .then(r => console.log(`[startup] Gold price seeded: ₹${r.pricePerGram24kt}/g (24KT)`))
      .catch(err => console.warn("[startup] Gold price seed failed (non-fatal):", err?.message));
    fetchAndStoreExchangeRates()
      .then(r => console.log(`[startup] Exchange rates seeded: ${Object.keys(r.rates).join(", ")}`))
      .catch(err => console.warn("[startup] Exchange rate seed failed (non-fatal):", err?.message));
  });
}

startServer().catch(console.error);
