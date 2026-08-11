import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { buyerNav } from "@/pages/BuyerDashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { Check, Gem, MapPin, MessageSquare, Star, Store, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Quote Slot Indicator ─────────────────────────────────────────────────────

function QuoteSlotIndicator({ count }: { count: number }) {
  const filled = Math.min(count, 5);
  const isPaused = count >= 5;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-400">Quotes:</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-4 rounded-sm transition-colors ${
              i < filled
                ? isPaused
                  ? "bg-amber-400"
                  : "bg-emerald-400"
                : "bg-neutral-200"
            }`}
          />
        ))}
      </div>
      <span className={`text-xs font-medium ${isPaused ? "text-amber-600" : "text-neutral-500"}`}>
        {filled}/5 {isPaused && "· Full"}
      </span>
    </div>
  );
}

// ─── Quote Card ───────────────────────────────────────────────────────────────

function QuoteCard({
  quote,
  jewellerName,
  businessName,
  rating,
  city,
  jewellerWhatsapp,
  jewellerSlug,
  requestTitle,
  onStatus,
  pending,
  onOpenChat,
}: {
  quote: {
    id: number;
    goldWeightGrams: string | null;
    diamondWeightCarats: string | null;
    makingCharges: number | null;
    totalPrice: number;
    message: string | null;
    preMessage: string | null;
    goldPurity: string | null;
    status: string;
    createdAt: Date;
  };
  jewellerName?: string | null;
  businessName?: string | null;
  rating?: string | null;
  city?: string | null;
  jewellerWhatsapp?: string | null;
  jewellerSlug?: string | null;
  requestTitle?: string | null;
  onStatus: (quoteId: number, status: "accepted" | "dismissed") => void;
  pending: boolean;
  onOpenChat: (quoteId: number) => void;
}) {
  const displayName = businessName || jewellerName || "Jeweller";
  const isAccepted = quote.status === "accepted";
  const isDismissed = quote.status === "dismissed";
  const waDigits = jewellerWhatsapp?.replace(/\D/g, "");
  const waLink = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
        `Hi ${displayName}, I saw your quote on VVServices${
          requestTitle ? ` for "${requestTitle}"` : ""
        } and would like to discuss it.`
      )}`
    : null;

  return (
    <div
      className={`luxury-shadow rounded-2xl border bg-white p-6 transition-colors ${
        isAccepted
          ? "border-emerald-300 ring-1 ring-emerald-200"
          : isDismissed
            ? "border-neutral-200 opacity-60"
            : "border-[#D4AF37]/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-gradient font-serif text-lg font-semibold text-[#1A1A1A]">
            {displayName.charAt(0)}
          </span>
          <div>
            <p className="font-semibold leading-tight">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-[#D4AF37] text-[#D4AF37]" />
                {rating ?? "4.5"}
              </span>
              {city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {city}
                </span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={quote.status} />
      </div>

      {requestTitle && (
        <p className="mt-3 text-xs uppercase tracking-wide text-neutral-400">
          For: {requestTitle}
        </p>
      )}

      {/* Pre-acceptance message — shown on pending quotes */}
      {quote.preMessage && quote.status === "pending" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
            Jeweller's introduction
          </p>
          <p className="text-sm leading-relaxed text-amber-900">"{quote.preMessage}"</p>
        </div>
      )}

      {/* Specs grid */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#faf9f6] p-3.5 text-center">
        <div>
          <p className="text-xs text-neutral-500">Gold</p>
          <p className="text-sm font-semibold">
            {quote.goldWeightGrams ? `${quote.goldWeightGrams} g` : "—"}
          </p>
          {quote.goldPurity && (
            <p className="text-[10px] text-neutral-400">{quote.goldPurity.toUpperCase()}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-neutral-500">Diamonds</p>
          <p className="text-sm font-semibold">
            {quote.diamondWeightCarats ? `${quote.diamondWeightCarats} ct` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Making</p>
          <p className="text-sm font-semibold">{formatINR(quote.makingCharges)}</p>
        </div>
      </div>

      {/* Total price */}
      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm text-neutral-500">Total price</p>
        <p className="font-serif text-3xl font-semibold text-[#8a6d1c]">
          {formatINR(quote.totalPrice)}
        </p>
      </div>

      {/* Internal notes */}
      {quote.message && (
        <p className="mt-3 rounded-lg border border-border bg-white p-3 text-sm leading-relaxed text-neutral-600">
          "{quote.message}"
        </p>
      )}

      {/* Actions */}
      {quote.status === "pending" && (
        <div className="mt-5 flex gap-3">
          <Button
            className="flex-1 bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
            disabled={pending}
            onClick={() => onStatus(quote.id, "accepted")}
          >
            <Check className="h-4 w-4" /> Accept
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => onStatus(quote.id, "dismissed")}
          >
            <X className="h-4 w-4" /> Dismiss
          </Button>
        </div>
      )}

      {/* Contact the jeweller directly — no acceptance required */}
      {!isDismissed && (waLink || jewellerSlug) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {waLink && (
            <Button
              variant="outline"
              className="flex-1 gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              onClick={() => window.open(waLink, "_blank", "noopener,noreferrer")}
            >
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </Button>
          )}
          {jewellerSlug && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() =>
                window.open(`/j/${jewellerSlug}`, "_blank", "noopener,noreferrer")
              }
            >
              <Store className="h-4 w-4" /> Profile
            </Button>
          )}
        </div>
      )}

      {isAccepted && (
        <Button
          className="mt-2 w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onOpenChat(quote.id)}
        >
          <MessageSquare className="h-4 w-4" /> Open chat on VVServices
        </Button>
      )}
    </div>
  );
}

// ─── BuyerQuotes Page ─────────────────────────────────────────────────────────

export default function BuyerQuotes({ requestId }: { requestId?: number }) {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const allQuotes = trpc.quotes.forBuyer.useQuery(undefined, {
    enabled: !!account && !requestId,
  });
  const requestQuotes = trpc.quotes.forRequest.useQuery(
    { requestId: requestId! },
    { enabled: !!account && !!requestId }
  );

  const setStatus = trpc.quotes.setStatus.useMutation({
    onSuccess: (data, vars) => {
      toast.success(
        vars.status === "accepted"
          ? "Quote accepted — chat is open."
          : "Quote dismissed."
      );
      utils.quotes.invalidate();
      utils.requests.mine.invalidate();
      // Navigate to chat if accepted and threadId returned
      if (vars.status === "accepted" && data?.threadId) {
        navigate(`/app/chat/${data.threadId}`);
      }
    },
    onError: e => toast.error(e.message),
  });

  // For "Open Chat" on already-accepted quotes, look up the thread
  const threadByQuote = trpc.chat.threadByQuote.useQuery;

  const handleOpenChat = async (quoteId: number) => {
    // We navigate to chats page; the thread will be listed there
    navigate("/app/chats");
  };

  useSocket({
    "new-quote": payload => {
      toast.success(
        `New quote: ${formatINR(payload?.totalPrice)} from ${payload?.businessName || payload?.jewellerName || "a jeweller"}`,
        { duration: 6000 }
      );
      utils.quotes.forBuyer.invalidate();
      if (requestId) utils.quotes.forRequest.invalidate({ requestId });
    },
  });

  const isLoading = requestId ? requestQuotes.isLoading : allQuotes.isLoading;
  const quotes = requestId ? requestQuotes.data : allQuotes.data;

  // Count active (non-dismissed) quotes per request for slot indicator
  const slotMap: Record<number, number> = {};
  if (quotes) {
    for (const row of quotes as any[]) {
      const rId = row.quote?.requestId;
      if (rId && row.quote?.status !== "dismissed") {
        slotMap[rId] = (slotMap[rId] ?? 0) + 1;
      }
    }
  }

  return (
    <AppShell nav={buyerNav} requiredRole="buyer" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">
          {requestId ? "Quotes for this request" : "All Quotes"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Compare itemised offers from verified manufacturers — new quotes appear live
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !quotes || quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
          <Gem className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
          <h2 className="text-xl font-semibold">No quotes yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Quotes from jewellers will appear here instantly as they respond to your
            requests.
          </p>
        </div>
      ) : (
        <>
          {/* Slot indicator when viewing a specific request */}
          {requestId && (
            <div className="mb-4">
              <QuoteSlotIndicator count={slotMap[requestId] ?? 0} />
              {(slotMap[requestId] ?? 0) >= 5 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  This request has reached 5 quotes and is hidden from the jeweller feed.
                  Dismiss a quote to free a slot.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(quotes as any[]).map((row: any) => (
              <QuoteCard
                key={row.quote.id}
                quote={row.quote}
                jewellerName={row.jewellerName}
                businessName={row.businessName}
                rating={row.rating}
                city={row.city}
                jewellerWhatsapp={row.jewellerWhatsapp}
                jewellerSlug={
                  row.jewellerProfileStatus === "approved" ? row.jewellerSlug : null
                }
                requestTitle={requestId ? undefined : row.requestTitle}
                pending={setStatus.isPending}
                onStatus={(quoteId, status) => setStatus.mutate({ quoteId, status })}
                onOpenChat={handleOpenChat}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
