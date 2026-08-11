import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CATEGORY_SLUGS } from "../shared/categories";
import {
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "./accountAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  emitNewQuote,
  emitNewRequest,
  emitQuoteStatus,
  emitNewMessage,
  emitRequoteEvent,
  emitThreadStatusChange,
  emitRequestUpdated,
} from "./realtime";
import { scrapeProductUrl, reHostImageForRequest } from "./scraper";
import { storagePut } from "./storage";
import { getLatestGoldPrice, fetchAndStoreGoldPrice, getGoldPriceHistory } from "./goldPrice";
import { getLatestExchangeRates, convertToInr } from "./exchangeRate";
import { sendWhatsappOtp, verifyWhatsappOtp, normalizeWhatsappNumber } from "./whatsappAuth";

const categoryEnum = z.enum(CATEGORY_SLUGS);

// --- VVServices account-auth middleware -----------------------------------

const accountProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.account) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please log in" });
  }
  return next({ ctx: { ...ctx, account: ctx.account } });
});

const buyerProcedure = accountProcedure.use(async ({ ctx, next }) => {
  if (ctx.account.role !== "buyer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Buyer account required" });
  }
  return next({ ctx });
});

const jewellerProcedure = accountProcedure.use(async ({ ctx, next }) => {
  if (ctx.account.role !== "jeweller") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Jeweller account required" });
  }
  return next({ ctx });
});

const vvAdminProcedure = accountProcedure.use(async ({ ctx, next }) => {
  if (ctx.account.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin account required" });
  }
  return next({ ctx });
});

function sanitizeAccount(account: NonNullable<Awaited<ReturnType<typeof db.getAccountById>>>) {
  const { passwordHash, ...rest } = account;
  return rest;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // --- VVServices custom auth ---------------------------------------------
  account: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.account) return null;
      const account = await db.getAccountById(ctx.account.accountId);
      return account ? sanitizeAccount(account) : null;
    }),

    register: publicProcedure
      .input(
        z.object({
          role: z.enum(["buyer", "jeweller"]),
          name: z.string().min(1).max(191),
          email: z.string().email().max(320),
          phone: z.string().min(7).max(32).optional(),
          password: z.string().min(6).max(128).optional().default(""),
          whatsappNumber: z.string().min(7).max(32).optional(),
          businessName: z.string().max(191).optional(),
          categories: z.array(categoryEnum).max(3).optional(),
          city: z.string().max(191).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getAccountByEmail(input.email);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists. Please log in.",
          });
        }
        // Check if WhatsApp number already used
        if (input.whatsappNumber) {
          const normalized = normalizeWhatsappNumber(input.whatsappNumber);
          const existingWa = await db.getAccountByWhatsapp(normalized);
          if (existingWa) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This WhatsApp number is already registered.",
            });
          }
        }
        if (input.role === "jeweller" && (!input.categories || input.categories.length === 0)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please select at least one category you work with.",
          });
        }
        const id = await db.createAccount({
          role: input.role,
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash: hashPassword(input.password),
          businessName: input.businessName,
          categories: input.categories?.join(","),
          city: input.city,
          whatsappNumber: input.whatsappNumber ? normalizeWhatsappNumber(input.whatsappNumber) : undefined,
        });
        await setSessionCookie(ctx.req, ctx.res, { accountId: id, role: input.role });
        const account = await db.getAccountById(id);
        return sanitizeAccount(account!);
      }),

    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const account = await db.getAccountByEmail(input.email);
        if (!account || !verifyPassword(input.password, account.passwordHash)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }
        await setSessionCookie(ctx.req, ctx.res, {
          accountId: account.id,
          role: account.role,
        });
        return sanitizeAccount(account);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      clearSessionCookie(ctx.req, ctx.res);
      return { success: true } as const;
    }),

    sendWhatsappOtp: publicProcedure
      .input(z.object({ whatsappNumber: z.string().min(7).max(32) }))
      .mutation(async ({ input }) => {
        const { expiresAt } = await sendWhatsappOtp(input.whatsappNumber);
        return { success: true, expiresAt } as const;
      }),

    verifyWhatsappOtp: publicProcedure
      .input(
        z.object({
          whatsappNumber: z.string().min(7).max(32),
          otp: z.string().length(6),
          name: z.string().min(1).max(191).optional(),
          role: z.enum(["buyer", "jeweller"]).optional().default("buyer"),
          businessName: z.string().max(191).optional(),
          categories: z.array(z.enum(CATEGORY_SLUGS)).max(3).optional(),
          city: z.string().max(191).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const normalized = normalizeWhatsappNumber(input.whatsappNumber);
        const valid = await verifyWhatsappOtp(input.whatsappNumber, input.otp);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid or expired OTP. Please request a new code.",
          });
        }

        let account = await db.getAccountByWhatsapp(normalized);

        if (!account) {
          if (!input.name) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Name is required for new registrations.",
            });
          }
          if (input.role === "jeweller" && (!input.categories || input.categories.length === 0)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Please select at least one category you work with.",
            });
          }
          const placeholderEmail = `wa_${normalized.replace(/\+/g, "")}@vvservices.internal`;
          const id = await db.createAccount({
            role: input.role,
            name: input.name,
            email: placeholderEmail,
            phone: normalized,
            passwordHash: hashPassword(Math.random().toString(36)),
            whatsappNumber: normalized,
            businessName: input.businessName,
            categories: input.categories?.join(","),
            city: input.city,
          });
          account = await db.getAccountById(id);
        }

        if (!account) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account error" });

        await setSessionCookie(ctx.req, ctx.res, { accountId: account.id, role: account.role });
        const { passwordHash, ...rest } = account;
        return rest;
      }),
  }),

  // --- Waitlist -------------------------------------------------------------
  waitlist: router({
    join: publicProcedure
      .input(z.object({ email: z.string().email(), role: z.enum(["buyer", "jeweller"]) }))
      .mutation(async ({ input }) => {
        await db.addToWaitlist(input.email, input.role);
        return { success: true } as const;
      }),
  }),

  // --- URL scraper (public) --------------------------------------------------
  scraper: router({
    scrapeUrl: publicProcedure
      .input(z.object({ url: z.string().url().max(2000) }))
      .mutation(async ({ input }) => {
        try {
          return await scrapeProductUrl(input.url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to scrape URL";
          throw new TRPCError({ code: "BAD_REQUEST", message: msg });
        }
      }),
  }),

  // --- Buyer requests ---------------------------------------------------------
  requests: router({
    create: buyerProcedure
      .input(
        z.object({
          title: z.string().min(1).max(191),
          category: categoryEnum,
          imageUrl: z.string().max(2000).optional(),
          imageUrls: z.array(z.string().max(2000)).max(5).optional(),
          imageBase64: z.string().max(8_000_000).optional(),
          imageMimeType: z.string().max(100).optional(),
          budgetMin: z.number().int().min(0).optional(),
          budgetMax: z.number().int().min(0).optional(),
          timeline: z.string().max(100).optional(),
          notes: z.string().max(2000).optional(),
          scrapedDetails: z.string().max(10_000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let imageUrl = input.imageUrl;
        let imageUrls: string[] = input.imageUrls ?? [];
        // Detect whether the submitted imageUrl is actually a product PAGE url
        // (buyer hit submit before the frontend scrape finished). In that case we
        // create the request immediately and scrape in the background.
        const looksLikePageUrl = (u: string) => {
          if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
          const path = u.split("?")[0]!.toLowerCase();
          return !/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/.test(path) && !path.includes("/manus-storage/");
        };
        const needsBackgroundScrape =
          !input.imageBase64 &&
          !!imageUrl &&
          imageUrls.length === 0 &&
          !input.scrapedDetails &&
          looksLikePageUrl(imageUrl);

        if (input.imageBase64) {
          const buffer = Buffer.from(input.imageBase64, "base64");
          const ext = (input.imageMimeType || "image/jpeg").split("/")[1] || "jpg";
          const { url } = await storagePut(
            `requests/${ctx.account.accountId}-${Date.now()}.${ext}`,
            buffer,
            input.imageMimeType || "image/jpeg"
          );
          imageUrl = url;
          if (imageUrls.length === 0) imageUrls = [url];
        } else if (!needsBackgroundScrape && imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
          console.log("[requests.create] Re-hosting external image:", imageUrl.slice(0, 80));
          try {
            const rehosted = await reHostImageForRequest(imageUrl);
            if (rehosted) imageUrl = rehosted;
          } catch (err) {
            console.error("[requests.create] Image re-host threw:", (err as Error)?.message);
          }
        }
        // Re-host any still-external gallery images (already-hosted ones pass through).
        // Scraper output is normally already re-hosted, so this is a safety net.
        if (imageUrls.length > 0) {
          imageUrls = await Promise.all(
            imageUrls.map(async u => {
              if (u.includes("/manus-storage/") || !u.startsWith("http")) return u;
              try {
                const hosted = await reHostImageForRequest(u);
                return hosted ?? u;
              } catch {
                return u;
              }
            })
          );
          if (!imageUrl || looksLikePageUrl(imageUrl)) imageUrl = imageUrls[0];
        } else if (imageUrl && !needsBackgroundScrape) {
          imageUrls = [imageUrl];
        }
        // Currency conversion: if scrapedDetails has a foreign-currency price, convert to INR
        let originalPrice: string | undefined;
        let originalCurrency: string | undefined;
        if (input.scrapedDetails) {
          try {
            const scraped = JSON.parse(input.scrapedDetails) as { price?: string; currency?: string };
            if (scraped.price && scraped.currency && scraped.currency !== "INR") {
              originalPrice = scraped.price;
              originalCurrency = scraped.currency;
              const rateMap = await getLatestExchangeRates();
              const numericPrice = parseFloat(scraped.price.replace(/[,\s]/g, ""));
              if (!isNaN(numericPrice)) {
                const inrPrice = convertToInr(numericPrice, scraped.currency, rateMap.rates);
                if (inrPrice !== null) {
                  // Patch the scrapedDetails price to INR before storing
                  const patched = { ...scraped, price: String(inrPrice), currency: "INR", originalPrice: scraped.price, originalCurrency: scraped.currency };
                  input = { ...input, scrapedDetails: JSON.stringify(patched).slice(0, 10_000) };
                  console.log(`[requests.create] Converted ${scraped.currency} ${scraped.price} → ₹${inrPrice}`);
                }
              }
            }
          } catch { /* non-fatal */ }
        }

        const id = await db.createRequest({
          buyerId: ctx.account.accountId,
          title: input.title,
          category: input.category,
          imageUrl,
          imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : undefined,
          originalPrice,
          originalCurrency,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          timeline: input.timeline,
          notes: input.notes,
          scrapedDetails: input.scrapedDetails,
        });

        // Background scrape fallback (non-blocking): buyer submitted a page URL
        // before the frontend scrape completed. Scrape server-side and patch the
        // request row with the extracted images + details once done.
        if (needsBackgroundScrape && imageUrl) {
          const pageUrl = imageUrl;
          scrapeProductUrl(pageUrl)
            .then(async scraped => {
              if (scraped.blocked) {
                console.warn("[requests.create] Background scrape blocked:", scraped.blockedReason);
                return;
              }
              const urls = scraped.imageUrls ?? (scraped.imageUrl ? [scraped.imageUrl] : []);
              if (urls.length === 0 && !scraped.title) return;
              // Currency conversion for background-scraped price
              let bgOriginalPrice: string | undefined;
              let bgOriginalCurrency: string | undefined;
              let scrapedForStorage = { ...scraped, imageBase64: undefined, imageMimeType: undefined };
              if (scraped.price && scraped.currency && scraped.currency !== "INR") {
                bgOriginalPrice = scraped.price;
                bgOriginalCurrency = scraped.currency;
                try {
                  const rateMap = await getLatestExchangeRates();
                  const numericPrice = parseFloat(scraped.price.replace(/[,\s]/g, ""));
                  if (!isNaN(numericPrice)) {
                    const inrPrice = convertToInr(numericPrice, scraped.currency, rateMap.rates);
                    if (inrPrice !== null) {
                      scrapedForStorage = { ...scrapedForStorage, price: String(inrPrice), currency: "INR" };
                      console.log(`[requests.create] BG scrape converted ${scraped.currency} ${scraped.price} → ₹${inrPrice}`);
                    }
                  }
                } catch { /* non-fatal */ }
              }
              const details = JSON.stringify(scrapedForStorage);
              await db.updateRequestImages(id, scraped.imageUrl ?? null, urls, details.slice(0, 10_000), bgOriginalPrice, bgOriginalCurrency);
              console.log(`[requests.create] Background scrape patched request ${id} with ${urls.length} image(s)`);
              // Notify the buyer's open dashboard so the listing refreshes with images
              emitRequestUpdated(ctx.account.accountId, { requestId: id });
            })
            .catch(err => {
              console.error("[requests.create] Background scrape failed:", (err as Error)?.message);
            });
        }

        const request = await db.getRequestById(id);
        const buyer = await db.getAccountById(ctx.account.accountId);
        emitNewRequest(input.category, {
          ...request,
          buyerName: buyer?.name ?? "Buyer",
        });
        return request!;
      }),

    mine: buyerProcedure.query(async ({ ctx }) => {
      const list = await db.getRequestsByBuyer(ctx.account.accountId);
      const withCounts = await Promise.all(
        list.map(async r => ({
          ...r,
          quoteCount: await db.getQuoteCountForRequest(r.id),
        }))
      );
      return withCounts;
    }),

    getLeadById: jewellerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const request = await db.getRequestById(input.id);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        }
        const jeweller = await db.getAccountById(ctx.account.accountId);
        const categories = (jeweller?.categories?.split(",") ?? []) as string[];
        if (!categories.includes(request.category)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This lead is not in your categories" });
        }
        const buyer = await db.getAccountById(request.buyerId);
        const alreadyQuoted = await db.hasJewellerQuoted(request.id, ctx.account.accountId);
        // If already quoted, fetch the quote to check if accepted + get thread
        let myQuote: { id: number; status: string; totalPrice: number } | null = null;
        let myThreadId: number | null = null;
        if (alreadyQuoted) {
          const q = await db.getJewellerQuoteForRequest(request.id, ctx.account.accountId);
          if (q) {
            myQuote = { id: q.id, status: q.status, totalPrice: q.totalPrice };
            if (q.status === "accepted") {
              const thread = await db.getChatThreadByQuote(q.id);
              myThreadId = thread?.id ?? null;
            }
          }
        }
        return {
          ...request,
          buyerName: buyer?.name ?? "Buyer",
          alreadyQuoted,
          myQuote,
          myThreadId,
        };
      }),

    leads: jewellerProcedure.query(async ({ ctx }) => {
      const jeweller = await db.getAccountById(ctx.account.accountId);
      const categories = (jeweller?.categories?.split(",") ?? []).filter(c =>
        (CATEGORY_SLUGS as readonly string[]).includes(c)
      ) as (typeof CATEGORY_SLUGS)[number][];
      const leads = await db.getOpenRequestsByCategories(categories);
      const withQuoted = await Promise.all(
        leads.map(async l => ({
          ...l.request,
          buyerName: l.buyerName,
          alreadyQuoted: await db.hasJewellerQuoted(l.request.id, ctx.account.accountId),
        }))
      );
      return withQuoted;
    }),
  }),

  // --- Quotes -----------------------------------------------------------------
  quotes: router({
    create: jewellerProcedure
      .input(
        z.object({
          requestId: z.number().int().positive(),
          goldWeightGrams: z.number().min(0).max(100000).optional(),
          diamondWeightCarats: z.number().min(0).max(100000).optional(),
          makingCharges: z.number().int().min(0).optional(),
          totalPrice: z.number().int().positive(),
          message: z.string().max(2000).optional(),
          /** One pre-acceptance message shown to buyer before they accept/dismiss */
          preMessage: z.string().max(500).optional(),
          goldPurity: z.enum(["9kt", "14kt", "18kt"]).default("18kt"),
          goldPricePerGram: z.number().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const request = await db.getRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }
        // Block quoting on paused or closed requests
        if (request.status === "paused" || request.status === "closed") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This request is no longer accepting quotes.",
          });
        }
        // Enforce 5-slot limit
        if ((request.activeQuoteCount ?? 0) >= 5) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This request has reached its maximum of 5 quotes.",
          });
        }
        const already = await db.hasJewellerQuoted(input.requestId, ctx.account.accountId);
        if (already) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already submitted a quote for this request",
          });
        }
        const id = await db.createQuote({
          requestId: input.requestId,
          jewellerId: ctx.account.accountId,
          goldWeightGrams: input.goldWeightGrams?.toFixed(2),
          diamondWeightCarats: input.diamondWeightCarats?.toFixed(2),
          makingCharges: input.makingCharges,
          totalPrice: input.totalPrice,
          message: input.message,
          preMessage: input.preMessage,
          goldPurity: input.goldPurity,
          goldPricePerGram: input.goldPricePerGram?.toFixed(2),
        });
        // Increment slot count (may pause request if it hits 5)
        await db.adjustActiveQuoteCount(input.requestId, 1);
        // Ensure status is at least "quoted"
        const updatedRequest = await db.getRequestById(input.requestId);
        if (updatedRequest?.status === "open") {
          await db.updateRequestStatus(input.requestId, "quoted");
        }
        const quote = await db.getQuoteById(id);
        const jeweller = await db.getAccountById(ctx.account.accountId);
        emitNewQuote(request.buyerId, {
          ...quote,
          jewellerName: jeweller?.name,
          businessName: jeweller?.businessName,
          rating: jeweller?.rating,
          city: jeweller?.city,
          requestTitle: request.title,
          requestCategory: request.category,
          requestImageUrl: request.imageUrl,
        });
        return quote!;
      }),

    forRequest: buyerProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const request = await db.getRequestById(input.requestId);
        if (!request || request.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }
        return db.getQuotesForRequest(input.requestId);
      }),

    forBuyer: buyerProcedure.query(async ({ ctx }) => {
      return db.getQuotesForBuyer(ctx.account.accountId);
    }),

    mine: jewellerProcedure.query(async ({ ctx }) => {
      return db.getQuotesByJeweller(ctx.account.accountId);
    }),

    /**
     * Buyer accepts or dismisses a quote.
     * - Accept: opens a chat thread between buyer and jeweller.
     *   Request is NOT paused on accept (only paused when all 5 slots fill).
     * - Dismiss: frees the slot; request may reappear in feed if it was paused.
     */
    setStatus: buyerProcedure
      .input(
        z.object({
          quoteId: z.number().int().positive(),
          status: z.enum(["accepted", "dismissed"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
        }
        const request = await db.getRequestById(quote.requestId);
        if (!request || request.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your quote" });
        }
        if (quote.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This quote has already been actioned.",
          });
        }

        await db.updateQuoteStatus(input.quoteId, input.status);

        let threadId: number | undefined;

        if (input.status === "accepted") {
          // Open a chat thread — request stays open for other jewellers
          threadId = await db.createChatThread({
            requestId: request.id,
            buyerId: ctx.account.accountId,
            jewellerId: quote.jewellerId,
            quoteId: quote.id,
          });
          // Post a system message to mark thread opening
          await db.createMessage({
            threadId,
            senderId: ctx.account.accountId,
            senderRole: "system",
            content: "Chat unlocked — you can now discuss the details.",
            type: "system",
          });
        } else {
          // Dismissed: free the slot
          await db.adjustActiveQuoteCount(request.id, -1);
        }

        emitQuoteStatus(quote.jewellerId, {
          quoteId: quote.id,
          requestTitle: request.title,
          status: input.status,
          threadId,
        });

        return { success: true, threadId } as const;
      }),
  }),

  // --- Chat Threads -----------------------------------------------------------
  chat: router({
    /** Get all threads for the current buyer. */
    myThreads: buyerProcedure.query(async ({ ctx }) => {
      return db.getChatThreadsForBuyer(ctx.account.accountId);
    }),

    /** Get all threads for the current jeweller. */
    jewellersThreads: jewellerProcedure.query(async ({ ctx }) => {
      return db.getChatThreadsForJeweller(ctx.account.accountId);
    }),

    /** Get a single thread with its messages and the associated quote. */
    getThread: accountProcedure
      .input(z.object({ threadId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        }
        // Only buyer or jeweller of this thread can access it
        if (
          thread.buyerId !== ctx.account.accountId &&
          thread.jewellerId !== ctx.account.accountId &&
          ctx.account.role !== "admin"
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const [msgs, quote, request] = await Promise.all([
          db.getMessagesByThread(input.threadId),
          db.getQuoteById(thread.quoteId),
          db.getRequestById(thread.requestId),
        ]);
        const buyer = await db.getAccountById(thread.buyerId);
        const jeweller = await db.getAccountById(thread.jewellerId);
        // Get latest accepted requote if any
        const allRequotes = await db.getRequotesByThread(input.threadId);
        const activeRequote = allRequotes.find(r => r.status === "pending") ?? null;
        const acceptedRequote = allRequotes.find(r => r.status === "accepted") ?? null;
        return {
          thread,
          messages: msgs,
          quote,
          request,
          buyer: buyer ? { id: buyer.id, name: buyer.name } : null,
          jeweller: jeweller
            ? {
                id: jeweller.id,
                name: jeweller.name,
                businessName: jeweller.businessName,
                city: jeweller.city,
                rating: jeweller.rating,
              }
            : null,
          activeRequote,
          acceptedRequote,
          requotes: allRequotes,
        };
      }),

    /** Send a text message in a thread. */
    sendMessage: accountProcedure
      .input(
        z.object({
          threadId: z.number().int().positive(),
          content: z.string().min(1).max(5000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        }
        if (thread.status !== "open") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This chat is closed." });
        }
        if (
          thread.buyerId !== ctx.account.accountId &&
          thread.jewellerId !== ctx.account.accountId
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const senderRole = ctx.account.role === "buyer" ? "buyer" : "jeweller";
        const msgId = await db.createMessage({
          threadId: input.threadId,
          senderId: ctx.account.accountId,
          senderRole,
          content: input.content,
          type: "text",
        });
        const msg = await db.getMessageById(msgId);
        // Real-time: notify the other party
        const otherId =
          ctx.account.accountId === thread.buyerId ? thread.jewellerId : thread.buyerId;
        const otherRole =
          ctx.account.accountId === thread.buyerId ? "jeweller" : "buyer";
        emitNewMessage(otherId, otherRole, { threadId: input.threadId, message: msg });
        return msg!;
      }),

    /**
     * Close a thread.
     * - Buyer closes → buyer_declined (counts as dismissing the quote)
     * - Jeweller closes → jeweller_withdrawn
     */
    closeThread: accountProcedure
      .input(z.object({ threadId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        }
        if (thread.status !== "open") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Thread is already closed." });
        }
        if (
          thread.buyerId !== ctx.account.accountId &&
          thread.jewellerId !== ctx.account.accountId
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const isBuyer = ctx.account.accountId === thread.buyerId;
        const newStatus = isBuyer ? "buyer_declined" : "jeweller_withdrawn";
        await db.updateChatThreadStatus(input.threadId, newStatus);

        // Post a system message
        const systemMsg = isBuyer
          ? "Buyer has closed this chat and declined the quote."
          : "Jeweller has withdrawn from this conversation.";
        await db.createMessage({
          threadId: input.threadId,
          senderId: ctx.account.accountId,
          senderRole: "system",
          content: systemMsg,
          type: "system",
        });

        // If buyer closes → free the quote slot
        if (isBuyer) {
          await db.updateQuoteStatus(thread.quoteId, "dismissed");
          await db.adjustActiveQuoteCount(thread.requestId, -1);
        }

        const otherId = isBuyer ? thread.jewellerId : thread.buyerId;
        const otherRole = isBuyer ? "jeweller" : "buyer";
        emitThreadStatusChange(otherId, otherRole, {
          threadId: input.threadId,
          status: newStatus,
        });

        return { success: true, status: newStatus } as const;
      }),

    /** Get thread for a specific quote (buyer checking if chat is open). */
    threadByQuote: accountProcedure
      .input(z.object({ quoteId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const thread = await db.getChatThreadByQuote(input.quoteId);
        if (!thread) return null;
        if (
          thread.buyerId !== ctx.account.accountId &&
          thread.jewellerId !== ctx.account.accountId &&
          ctx.account.role !== "admin"
        ) {
          return null;
        }
        return thread;
      }),
  }),

  // --- Requotes ---------------------------------------------------------------
  requotes: router({
    /**
     * Jeweller sends an official requote inside a chat thread.
     * Only one pending requote allowed per thread at a time.
     */
    send: jewellerProcedure
      .input(
        z.object({
          threadId: z.number().int().positive(),
          newPrice: z.number().int().positive(),
          newGoldPurity: z.enum(["9kt", "14kt", "18kt"]).optional(),
          newGoldWeightGrams: z.number().min(0).optional(),
          newDiamondWeightCarats: z.number().min(0).optional(),
          newMakingCharges: z.number().int().min(0).optional(),
          reason: z.string().min(1).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        }
        if (thread.jewellerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your thread" });
        }
        if (thread.status !== "open") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Thread is closed." });
        }
        // Only one pending requote at a time
        const existing = await db.getPendingRequoteForThread(input.threadId);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already have a pending requote. Wait for the buyer to respond.",
          });
        }
        const requoteId = await db.createRequote({
          threadId: input.threadId,
          jewellerId: ctx.account.accountId,
          newPrice: input.newPrice,
          newGoldPurity: input.newGoldPurity,
          newGoldWeightGrams: input.newGoldWeightGrams?.toFixed(2),
          newDiamondWeightCarats: input.newDiamondWeightCarats?.toFixed(2),
          newMakingCharges: input.newMakingCharges,
          reason: input.reason,
        });
        // Post a requote message in the thread
        const msgId = await db.createMessage({
          threadId: input.threadId,
          senderId: ctx.account.accountId,
          senderRole: "jeweller",
          content: `Jeweller has sent a revised quote for ₹${input.newPrice.toLocaleString("en-IN")}.`,
          requoteId,
          type: "requote",
        });
        const msg = await db.getMessageById(msgId);
        const requote = await db.getRequoteById(requoteId);
        // Notify buyer
        emitRequoteEvent(thread.buyerId, "buyer", {
          threadId: input.threadId,
          requote,
          message: msg,
        });
        return requote!;
      }),

    /** Buyer accepts a requote — it becomes the new official quote. */
    accept: buyerProcedure
      .input(z.object({ requoteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const requote = await db.getRequoteById(input.requoteId);
        if (!requote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Requote not found" });
        }
        const thread = await db.getChatThreadById(requote.threadId);
        if (!thread || thread.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your thread" });
        }
        if (requote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Requote already resolved." });
        }
        await db.updateRequoteStatus(input.requoteId, "accepted");
        // Post system message
        await db.createMessage({
          threadId: requote.threadId,
          senderId: ctx.account.accountId,
          senderRole: "system",
          content: `Buyer accepted the revised quote of ₹${requote.newPrice.toLocaleString("en-IN")}.`,
          type: "system",
        });
        // Notify jeweller
        emitRequoteEvent(thread.jewellerId, "jeweller", {
          threadId: requote.threadId,
          requoteId: input.requoteId,
          status: "accepted",
        });
        return { success: true } as const;
      }),

    /** Buyer rejects a requote — original quote remains official. */
    reject: buyerProcedure
      .input(z.object({ requoteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const requote = await db.getRequoteById(input.requoteId);
        if (!requote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Requote not found" });
        }
        const thread = await db.getChatThreadById(requote.threadId);
        if (!thread || thread.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your thread" });
        }
        if (requote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Requote already resolved." });
        }
        await db.updateRequoteStatus(input.requoteId, "rejected");
        await db.createMessage({
          threadId: requote.threadId,
          senderId: ctx.account.accountId,
          senderRole: "system",
          content: "Buyer declined the revised quote. Original quote remains in effect.",
          type: "system",
        });
        emitRequoteEvent(thread.jewellerId, "jeweller", {
          threadId: requote.threadId,
          requoteId: input.requoteId,
          status: "rejected",
        });
        return { success: true } as const;
      }),
  }),

  // --- Orders (placeholder — payment gateway to be wired later) ---------------
  orders: router({
    /** Buyer places an order from the official quote card in chat. */
    placeOrder: buyerProcedure
      .input(z.object({ threadId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread || thread.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your thread" });
        }
        if (thread.status !== "open") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Chat is closed." });
        }
        // Check if order already exists
        const existing = await db.getOrderByThread(input.threadId);
        if (existing) {
          return existing;
        }
        // Determine final price: accepted requote or original quote
        const allRequotes = await db.getRequotesByThread(input.threadId);
        const acceptedRequote = allRequotes.find(r => r.status === "accepted");
        const quote = await db.getQuoteById(thread.quoteId);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
        }
        const amount = acceptedRequote ? acceptedRequote.newPrice : quote.totalPrice;
        const orderId = await db.createOrder({
          threadId: input.threadId,
          quoteId: thread.quoteId,
          buyerId: ctx.account.accountId,
          jewellerId: thread.jewellerId,
          amount,
          platformFeePercent: "5.00",
        });
        const order = await db.getOrderById(orderId);
        return order!;
      }),

    myOrders: buyerProcedure.query(async ({ ctx }) => {
      return db.getOrdersForBuyer(ctx.account.accountId);
    }),
  }),

  // --- Reports ----------------------------------------------------------------
  reports: router({
    /** Buyer reports a jeweller for misconduct. */
    file: buyerProcedure
      .input(
        z.object({
          threadId: z.number().int().positive(),
          reason: z.string().min(10).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread || thread.buyerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your thread" });
        }
        const reportId = await db.createReport({
          reporterId: ctx.account.accountId,
          reportedJewellerId: thread.jewellerId,
          threadId: input.threadId,
          reason: input.reason,
        });
        return { success: true, reportId } as const;
      }),
  }),

  // --- Gold Price ---------------------------------------------------------------
  goldPrice: router({
    current: publicProcedure.query(async () => {
      const price = await getLatestGoldPrice();
      return price;
    }),

    history: publicProcedure.query(async () => {
      return getGoldPriceHistory(30);
    }),

    refresh: vvAdminProcedure.mutation(async () => {
      const result = await fetchAndStoreGoldPrice();
      return result;
    }),
  }),

  // --- Admin --------------------------------------------------------------------
  admin: router({
    stats: vvAdminProcedure.query(() => db.getAdminStats()),
    accounts: vvAdminProcedure.query(async () => {
      const list = await db.getAllAccounts();
      return list.map(a => {
        const { passwordHash, ...rest } = a;
        return rest;
      });
    }),
    requests: vvAdminProcedure.query(() => db.getAllRequestsAdmin()),
    quotes: vvAdminProcedure.query(() => db.getAllQuotesAdmin()),

    /** All chat threads (admin oversight). */
    chats: vvAdminProcedure.query(async () => {
      const db2 = await import("./db");
      return db2.getAllChatThreadsAdmin();
    }),

    /** Pending reports for admin review. */
    pendingReports: vvAdminProcedure.query(() => db.getPendingReports()),

    /** All reports (full history). */
    allReports: vvAdminProcedure.query(() => db.getAllReports()),

    /** Resolve a report with admin notes. */
    resolveReport: vvAdminProcedure
      .input(
        z.object({
          reportId: z.number().int().positive(),
          adminNotes: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ input }) => {
        await db.resolveReport(input.reportId, input.adminNotes);
        return { success: true } as const;
      }),

    /** Jeweller incidents tracker. */
    jewellersIncidents: vvAdminProcedure.query(() => db.getJewellerIncidents()),

    /**
     * Jeweller profiles for moderation, optionally filtered by state.
     * Passwords are never returned.
     */
    jewellerProfiles: vvAdminProcedure
      .input(
        z
          .object({
            status: z
              .enum(["draft", "pending", "approved", "rejected", "suspended"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const list = await db.listJewellersByProfileStatus(input?.status);
        return Promise.all(
          list.map(async a => {
            const { passwordHash, ...rest } = a;
            const portfolio = await db.getPortfolioForJeweller(a.id);
            return {
              ...rest,
              categoryList: (a.categories ?? "").split(",").filter(Boolean),
              portfolioCount: portfolio.length,
              uploadedCount: portfolio.filter(p => p.source === "uploaded").length,
            };
          })
        );
      }),

    /** Full profile detail for the admin review screen. */
    jewellerProfileDetail: vvAdminProcedure
      .input(z.object({ jewellerId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const jeweller = await db.getAccountById(input.jewellerId);
        if (!jeweller || jeweller.role !== "jeweller") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Jeweller not found" });
        }
        const { passwordHash, ...rest } = jeweller;
        const portfolio = await db.getPortfolioForJeweller(jeweller.id);
        const incidentCount = await db.getJewellerIncidentCount(jeweller.id);
        return {
          ...rest,
          categoryList: (jeweller.categories ?? "").split(",").filter(Boolean),
          portfolio,
          incidentCount,
        };
      }),

    /**
     * Move a profile through moderation. Approving publishes it, which also
     * assigns a slug if the jeweller does not have one yet.
     */
    setJewellerProfileStatus: vvAdminProcedure
      .input(
        z.object({
          jewellerId: z.number().int().positive(),
          status: z.enum(["approved", "rejected", "suspended", "pending"]),
          reviewNote: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const jeweller = await db.getAccountById(input.jewellerId);
        if (!jeweller || jeweller.role !== "jeweller") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Jeweller not found" });
        }
        if (input.status === "rejected" || input.status === "suspended") {
          if (!input.reviewNote?.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Please give a reason — the jeweller sees this note.",
            });
          }
        }
        if (input.status === "approved") {
          if (!jeweller.businessName) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot approve a profile without a business name.",
            });
          }
          await db.ensureProfileSlug(jeweller.id, jeweller.businessName);
        }
        await db.setProfileStatus(input.jewellerId, input.status, input.reviewNote ?? null);
        return { success: true } as const;
      }),

    /** Admin can correct profile fields during review. */
    editJewellerProfile: vvAdminProcedure
      .input(
        z.object({
          jewellerId: z.number().int().positive(),
          businessName: z.string().max(191).optional(),
          city: z.string().max(191).optional(),
          address: z.string().max(500).optional(),
          website: z.string().max(500).optional(),
          instagramUrl: z.string().max(500).optional(),
          about: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { jewellerId, ...patch } = input;
        await db.updateJewellerProfile(jewellerId, patch);
        return { success: true } as const;
      }),

    /** Admin can take down an inappropriate portfolio image. */
    removePortfolioItem: vvAdminProcedure
      .input(z.object({ itemId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await db.deletePortfolioItem(input.itemId);
        return { success: true } as const;
      }),


    /** Get full thread detail for admin (same as user getThread but no ownership check). */
    getThread: vvAdminProcedure
      .input(z.object({ threadId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const thread = await db.getChatThreadById(input.threadId);
        if (!thread) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        }
        const [msgs, quote, request] = await Promise.all([
          db.getMessagesByThread(input.threadId),
          db.getQuoteById(thread.quoteId),
          db.getRequestById(thread.requestId),
        ]);
        const buyer = await db.getAccountById(thread.buyerId);
        const jeweller = await db.getAccountById(thread.jewellerId);
        const allRequotes = await db.getRequotesByThread(input.threadId);
        return {
          thread,
          messages: msgs,
          quote,
          request,
          buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null,
          jeweller: jeweller
            ? {
                id: jeweller.id,
                name: jeweller.name,
                businessName: jeweller.businessName,
                city: jeweller.city,
                email: jeweller.email,
              }
            : null,
          requotes: allRequotes,
        };
      }),
  }),

  // --- Jeweller Profiles ------------------------------------------------------
  jewellers: router({
    /**
     * Public profile by slug. Only approved profiles resolve.
     * Quoted work is withheld unless the viewer is logged in, since it derives
     * from a specific buyer's commission.
     */
    publicProfile: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(191) }))
      .query(async ({ ctx, input }) => {
        const jeweller = await db.getApprovedJewellerBySlug(input.slug);
        if (!jeweller) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Jeweller profile not found" });
        }
        const viewerIsLoggedIn = !!ctx.account;
        const portfolio = await db.getVisiblePortfolio(jeweller.id, viewerIsLoggedIn);
        return {
          id: jeweller.id,
          name: jeweller.name,
          businessName: jeweller.businessName,
          categories: (jeweller.categories ?? "").split(",").filter(Boolean),
          city: jeweller.city,
          address: jeweller.address,
          website: jeweller.website,
          instagramUrl: jeweller.instagramUrl,
          about: jeweller.about,
          logoUrl: jeweller.logoUrl,
          rating: jeweller.rating,
          profileSlug: jeweller.profileSlug,
          whatsappNumber: jeweller.whatsappNumber,
          portfolio,
          viewerIsLoggedIn,
        };
      }),

    /** Public directory of approved jewellers, optionally filtered by category. */
    directory: publicProcedure
      .input(z.object({ category: categoryEnum.optional() }).optional())
      .query(async ({ input }) => {
        const list = await db.listApprovedJewellers(input?.category);
        return Promise.all(
          list.map(async j => {
            const portfolio = await db.getVisiblePortfolio(j.id, false);
            return {
              id: j.id,
              name: j.name,
              businessName: j.businessName,
              categories: (j.categories ?? "").split(",").filter(Boolean),
              city: j.city,
              logoUrl: j.logoUrl,
              rating: j.rating,
              profileSlug: j.profileSlug,
              about: j.about,
              previewImages: portfolio.slice(0, 3).map(p => p.imageUrl),
              portfolioCount: portfolio.length,
            };
          })
        );
      }),

    /** The logged-in jeweller's own profile, including moderation state. */
    myProfile: jewellerProcedure.query(async ({ ctx }) => {
      const me = await db.getAccountById(ctx.account.accountId);
      if (!me) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const portfolio = await db.getPortfolioForJeweller(me.id);
      return {
        id: me.id,
        name: me.name,
        businessName: me.businessName,
        categories: (me.categories ?? "").split(",").filter(Boolean),
        city: me.city,
        address: me.address,
        website: me.website,
        instagramUrl: me.instagramUrl,
        about: me.about,
        logoUrl: me.logoUrl,
        whatsappNumber: me.whatsappNumber,
        profileSlug: me.profileSlug,
        profileStatus: me.profileStatus,
        profileReviewNote: me.profileReviewNote,
        profileApprovedAt: me.profileApprovedAt,
        portfolio,
      };
    }),

    /** Save editable profile fields. Editing a live profile does not unpublish it. */
    updateProfile: jewellerProcedure
      .input(
        z.object({
          businessName: z.string().min(1).max(191).optional(),
          categories: z.array(categoryEnum).max(3).optional(),
          city: z.string().max(191).optional(),
          address: z.string().max(500).optional(),
          website: z.string().max(500).optional(),
          instagramUrl: z.string().max(500).optional(),
          about: z.string().max(2000).optional(),
          whatsappNumber: z.string().max(32).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateJewellerProfile(ctx.account.accountId, {
          businessName: input.businessName,
          categories: input.categories ? input.categories.join(",") : undefined,
          city: input.city,
          address: input.address,
          website: input.website,
          instagramUrl: input.instagramUrl,
          about: input.about,
          whatsappNumber: input.whatsappNumber
            ? normalizeWhatsappNumber(input.whatsappNumber)
            : undefined,
        });
        return { success: true } as const;
      }),

    /** Upload or replace the profile logo. */
    uploadLogo: jewellerProcedure
      .input(
        z.object({
          imageBase64: z.string().max(8_000_000),
          mimeType: z.string().max(100).default("image/jpeg"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.split("/")[1] || "jpg";
        const { url } = await storagePut(
          `jewellers/${ctx.account.accountId}-logo-${Date.now()}.${ext}`,
          buffer,
          input.mimeType
        );
        await db.updateJewellerProfile(ctx.account.accountId, { logoUrl: url });
        return { logoUrl: url };
      }),

    /**
     * Submit the profile for admin review. Requires the fields a buyer needs in
     * order to trust and contact the business.
     */
    submitForReview: jewellerProcedure.mutation(async ({ ctx }) => {
      const me = await db.getAccountById(ctx.account.accountId);
      if (!me) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      const missing: string[] = [];
      const businessName = me.businessName;
      if (!businessName) missing.push("business name");
      if (!me.categories) missing.push("at least one category");
      if (!me.city) missing.push("city");
      if (!me.address) missing.push("address");
      if (missing.length > 0 || !businessName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Please add your ${missing.join(", ")} before submitting for review.`,
        });
      }
      if (me.profileStatus === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your profile is already live." });
      }
      if (me.profileStatus === "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your profile is already under review." });
      }
      if (me.profileStatus === "suspended") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your profile is suspended. Please contact support.",
        });
      }

      await db.ensureProfileSlug(me.id, businessName);
      await db.setProfileStatus(me.id, "pending", null);
      return { success: true } as const;
    }),

    /** Add an uploaded portfolio image. */
    addPortfolioImage: jewellerProcedure
      .input(
        z.object({
          imageBase64: z.string().max(8_000_000),
          mimeType: z.string().max(100).default("image/jpeg"),
          caption: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getPortfolioForJeweller(ctx.account.accountId);
        if (existing.length >= 30) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Portfolio limit reached (30 images). Remove one before adding more.",
          });
        }
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.split("/")[1] || "jpg";
        const { url } = await storagePut(
          `jewellers/${ctx.account.accountId}-portfolio-${Date.now()}.${ext}`,
          buffer,
          input.mimeType
        );
        const id = await db.createPortfolioItem({
          jewellerId: ctx.account.accountId,
          imageUrl: url,
          caption: input.caption,
          source: "uploaded",
          sortOrder: existing.length,
        });
        return { id, imageUrl: url };
      }),

    /** Edit caption, order, or promotion state of one of your own items. */
    updatePortfolioItem: jewellerProcedure
      .input(
        z.object({
          itemId: z.number().int().positive(),
          caption: z.string().max(500).optional(),
          sortOrder: z.number().int().min(0).max(999).optional(),
          isPromoted: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const item = await db.getPortfolioItemById(input.itemId);
        if (!item || item.jewellerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your portfolio item" });
        }
        await db.updatePortfolioItem(input.itemId, {
          caption: input.caption,
          sortOrder: input.sortOrder,
          isPromoted: input.isPromoted,
        });
        return { success: true } as const;
      }),

    deletePortfolioItem: jewellerProcedure
      .input(z.object({ itemId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getPortfolioItemById(input.itemId);
        if (!item || item.jewellerId !== ctx.account.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your portfolio item" });
        }
        await db.deletePortfolioItem(input.itemId);
        return { success: true } as const;
      }),

    /**
     * Designs from requests this jeweller has quoted on, offered as candidates
     * for the portfolio. Promoting one copies it in as a 'quoted' item, which
     * stays hidden from anonymous visitors.
     */
    quotedWorkCandidates: jewellerProcedure.query(async ({ ctx }) => {
      const myQuotes = await db.getQuotesByJeweller(ctx.account.accountId);
      const existing = await db.getPortfolioForJeweller(ctx.account.accountId);
      const alreadyAdded = new Set(
        existing.filter(e => e.source === "quoted" && e.requestId).map(e => e.requestId)
      );
      const candidates: {
        requestId: number;
        title: string;
        imageUrl: string;
        quoteStatus: string;
        alreadyInPortfolio: boolean;
      }[] = [];
      for (const row of myQuotes) {
        const request = (row as { request?: { id: number; title: string; imageUrl: string | null } })
          .request;
        const quote = (row as { quote?: { status: string } }).quote;
        if (!request?.imageUrl) continue;
        if (candidates.some(c => c.requestId === request.id)) continue;
        candidates.push({
          requestId: request.id,
          title: request.title,
          imageUrl: request.imageUrl,
          quoteStatus: quote?.status ?? "pending",
          alreadyInPortfolio: alreadyAdded.has(request.id),
        });
      }
      return candidates;
    }),

    /** Promote a quoted design into the portfolio (logged-in viewers only). */
    promoteQuotedWork: jewellerProcedure
      .input(
        z.object({
          requestId: z.number().int().positive(),
          caption: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const hasQuoted = await db.hasJewellerQuoted(input.requestId, ctx.account.accountId);
        if (!hasQuoted) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only showcase designs you have quoted on.",
          });
        }
        const request = await db.getRequestById(input.requestId);
        if (!request?.imageUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This design has no image." });
        }
        const existing = await db.getPortfolioForJeweller(ctx.account.accountId);
        if (existing.some(e => e.source === "quoted" && e.requestId === input.requestId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Already in your portfolio." });
        }
        const id = await db.createPortfolioItem({
          jewellerId: ctx.account.accountId,
          imageUrl: request.imageUrl,
          caption: input.caption,
          source: "quoted",
          requestId: input.requestId,
          isPromoted: true,
          sortOrder: existing.length,
        });
        return { id } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
