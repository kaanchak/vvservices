import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { buyerNav } from "@/pages/BuyerDashboard";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { Check, Gem, MapPin, Star, X } from "lucide-react";
import { toast } from "sonner";

function QuoteCard({
  quote,
  jewellerName,
  businessName,
  rating,
  city,
  requestTitle,
  onStatus,
  pending,
}: {
  quote: {
    id: number;
    goldWeightGrams: string | null;
    diamondWeightCarats: string | null;
    makingCharges: number | null;
    totalPrice: number;
    message: string | null;
    status: string;
    createdAt: Date;
  };
  jewellerName?: string | null;
  businessName?: string | null;
  rating?: string | null;
  city?: string | null;
  requestTitle?: string | null;
  onStatus: (quoteId: number, status: "accepted" | "dismissed") => void;
  pending: boolean;
}) {
  const displayName = businessName || jewellerName || "Jeweller";
  return (
    <div
      className={`luxury-shadow rounded-2xl border bg-white p-6 transition-colors ${
        quote.status === "accepted"
          ? "border-emerald-300 ring-1 ring-emerald-200"
          : quote.status === "dismissed"
            ? "border-neutral-200 opacity-60"
            : "border-[#D4AF37]/20"
      }`}
    >
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

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#faf9f6] p-3.5 text-center">
        <div>
          <p className="text-xs text-neutral-500">Gold</p>
          <p className="text-sm font-semibold">
            {quote.goldWeightGrams ? `${quote.goldWeightGrams} g` : "—"}
          </p>
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

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm text-neutral-500">Total price</p>
        <p className="font-serif text-3xl font-semibold text-[#8a6d1c]">
          {formatINR(quote.totalPrice)}
        </p>
      </div>

      {quote.message && (
        <p className="mt-3 rounded-lg border border-border bg-white p-3 text-sm leading-relaxed text-neutral-600">
          "{quote.message}"
        </p>
      )}

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
    </div>
  );
}

export default function BuyerQuotes({ requestId }: { requestId?: number }) {
  const { account } = useAccount();
  const utils = trpc.useUtils();

  const allQuotes = trpc.quotes.forBuyer.useQuery(undefined, {
    enabled: !!account && !requestId,
  });
  const requestQuotes = trpc.quotes.forRequest.useQuery(
    { requestId: requestId! },
    { enabled: !!account && !!requestId }
  );

  const setStatus = trpc.quotes.setStatus.useMutation({
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "accepted"
          ? "Quote accepted! The jeweller has been notified."
          : "Quote dismissed."
      );
      utils.quotes.invalidate();
      utils.requests.mine.invalidate();
    },
    onError: e => toast.error(e.message),
  });

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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((row: any) => (
            <QuoteCard
              key={row.quote.id}
              quote={row.quote}
              jewellerName={row.jewellerName}
              businessName={row.businessName}
              rating={row.rating}
              city={row.city}
              requestTitle={requestId ? undefined : row.requestTitle}
              pending={setStatus.isPending}
              onStatus={(quoteId, status) => setStatus.mutate({ quoteId, status })}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
