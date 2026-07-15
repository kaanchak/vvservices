/**
 * Server-side image proxy — /api/image-proxy?url=<encoded-url>
 *
 * Fetches external images through the backend so the browser never makes
 * a cross-origin request directly. This resolves CORS issues with scraped
 * product images from jewellery sites (Caratlane, Tanishq, Shopify stores, etc.)
 *
 * Security:
 *  - Only http/https URLs are accepted.
 *  - Response Content-Type must be image/*.
 *  - Max response size: 5 MB.
 *  - 10-second timeout.
 */

import type { Express, Request, Response } from "express";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TIMEOUT_MS = 10_000;

const PROXY_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

export function registerImageProxy(app: Express): void {
  app.get("/api/image-proxy", async (req: Request, res: Response) => {
    const raw = req.query.url as string | undefined;
    if (!raw) {
      res.status(400).json({ error: "Missing url parameter" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      res.status(400).json({ error: "Only http/https URLs are supported" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(raw, {
        signal: controller.signal,
        headers: {
          ...PROXY_HEADERS,
          Referer: `${parsed.protocol}//${parsed.hostname}/`,
        },
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream returned ${upstream.status}` });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        res.status(415).json({ error: "URL does not point to an image" });
        return;
      }

      // Stream with size cap
      const reader = upstream.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "No response body from upstream" });
        return;
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > MAX_BYTES) {
            reader.cancel();
            res.status(413).json({ error: "Image too large (max 5 MB)" });
            return;
          }
          chunks.push(value);
        }
      }

      const body = Buffer.concat(chunks);

      // Cache for 1 hour in browser, 24 hours in CDN
      res.set({
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      });
      res.send(body);
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Proxy fetch failed: ${msg}` });
    }
  });
}
