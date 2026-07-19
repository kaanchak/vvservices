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
import { emitNewQuote, emitNewRequest, emitQuoteStatus } from "./realtime";
import { scrapeProductUrl, reHostImageForRequest } from "./scraper";
import { storagePut } from "./storage";
import { getLatestGoldPrice, fetchAndStoreGoldPrice, getGoldPriceHistory } from "./goldPrice";
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

    /**
     * Step 1 of WhatsApp login: send OTP to the given number.
     * Works for both new registrations and existing accounts.
     */
    sendWhatsappOtp: publicProcedure
      .input(z.object({ whatsappNumber: z.string().min(7).max(32) }))
      .mutation(async ({ input }) => {
        const { expiresAt } = await sendWhatsappOtp(input.whatsappNumber);
        return { success: true, expiresAt } as const;
      }),

    /**
     * Step 2 of WhatsApp login: verify OTP and create/login account.
     * If the account doesn't exist, creates a new buyer account.
     * If it exists, logs them in.
     */
    verifyWhatsappOtp: publicProcedure
      .input(
        z.object({
          whatsappNumber: z.string().min(7).max(32),
          otp: z.string().length(6),
          /** Only required for new registrations */
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

        // Check if account exists with this WhatsApp number
        let account = await db.getAccountByWhatsapp(normalized);

        if (!account) {
          // New user — create account
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
          // Generate a placeholder email from WhatsApp number
          const placeholderEmail = `wa_${normalized.replace(/\+/g, "")}@vvservices.internal`;
          const id = await db.createAccount({
            role: input.role,
            name: input.name,
            email: placeholderEmail,
            phone: normalized,
            passwordHash: hashPassword(Math.random().toString(36)), // random password (WA login only)
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
          imageUrl: z.string().max(2000).optional(), // accepts full URLs and /manus-storage/ relative paths
          imageBase64: z.string().max(8_000_000).optional(),
          imageMimeType: z.string().max(100).optional(),
          budgetMin: z.number().int().min(0).optional(),
          budgetMax: z.number().int().min(0).optional(),
          timeline: z.string().max(100).optional(),
          notes: z.string().max(2000).optional(),
          /** JSON-stringified ScrapedProduct from the URL scraper */
          scrapedDetails: z.string().max(10_000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let imageUrl = input.imageUrl;
        if (input.imageBase64) {
          // User uploaded a file — store it to S3
          const buffer = Buffer.from(input.imageBase64, "base64");
          const ext = (input.imageMimeType || "image/jpeg").split("/")[1] || "jpg";
          const { url } = await storagePut(
            `requests/${ctx.account.accountId}-${Date.now()}.${ext}`,
            buffer,
            input.imageMimeType || "image/jpeg"
          );
          imageUrl = url;
        } else if (imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
          // External URL from URL-paste mode — re-host to our S3 so it always displays
          console.log("[requests.create] Re-hosting external image:", imageUrl.slice(0, 80));
          try {
            const rehosted = await reHostImageForRequest(imageUrl);
            console.log("[requests.create] Re-host result:", rehosted ? rehosted.slice(0, 80) : "null (fallback to external)");
            if (rehosted) imageUrl = rehosted;
          } catch (err) {
            console.error("[requests.create] Image re-host threw:", (err as Error)?.message);
          }
        }
        const id = await db.createRequest({
          buyerId: ctx.account.accountId,
          title: input.title,
          category: input.category,
          imageUrl,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          timeline: input.timeline,
          notes: input.notes,
          scrapedDetails: input.scrapedDetails,
        });
        const request = await db.getRequestById(id);
        const buyer = await db.getAccountById(ctx.account.accountId);
        // Real-time: notify jewellers in this category instantly
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

    /** Single lead detail for jeweller — verifies the lead is in their categories */
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
        return {
          ...request,
          buyerName: buyer?.name ?? "Buyer",
          alreadyQuoted,
        };
      }),

    /** Lead feed for the logged-in jeweller, filtered by their categories. */
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
          goldPurity: z.enum(["9kt", "14kt", "18kt"]).default("18kt"),
          goldPricePerGram: z.number().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const request = await db.getRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
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
          goldPurity: input.goldPurity,
          goldPricePerGram: input.goldPricePerGram?.toFixed(2),
        });
        if (request.status === "open") {
          await db.updateRequestStatus(request.id, "quoted");
        }
        const quote = await db.getQuoteById(id);
        const jeweller = await db.getAccountById(ctx.account.accountId);
        // Real-time: notify the buyer instantly
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
        await db.updateQuoteStatus(input.quoteId, input.status);
        if (input.status === "accepted") {
          await db.updateRequestStatus(request.id, "closed");
        }
        // Real-time: notify the jeweller of the status change
        emitQuoteStatus(quote.jewellerId, {
          quoteId: quote.id,
          requestTitle: request.title,
          status: input.status,
        });
        return { success: true } as const;
      }),
  }),

  // --- Gold Price ---------------------------------------------------------------
  goldPrice: router({
    /** Get the latest gold price (all purities) */
    current: publicProcedure.query(async () => {
      const price = await getLatestGoldPrice();
      return price;
    }),

    /** Get last 30 gold price snapshots for history/chart */
    history: publicProcedure.query(async () => {
      return getGoldPriceHistory(30);
    }),

    /** Admin: manually trigger a gold price refresh */
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
  }),
});

export type AppRouter = typeof appRouter;
