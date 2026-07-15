import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { jewellerNav } from "@/pages/JewellerDashboard";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { proxiedImageUrl } from "@/lib/imageProxy";
import { FileText, ImagePlus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

export default function JewellerQuotes() {
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const { data: quotes, isLoading } = trpc.quotes.mine.useQuery(undefined, {
    enabled: !!account,
  });

  const categories = useMemo(
    () => (account?.categories ? account.categories.split(",") : []),
    [account?.categories]
  );

  useSocket(
    {
      "quote-status": payload => {
        toast.info(
          payload?.status === "accepted"
            ? `🎉 Your quote for "${payload?.requestTitle}" was ACCEPTED!`
            : `Your quote for "${payload?.requestTitle}" was dismissed.`,
          { duration: 8000 }
        );
        utils.quotes.mine.invalidate();
      },
      "new-request": () => {
        utils.requests.leads.invalidate();
      },
    },
    { categories }
  );

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Quotes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Track the status of every quote you've sent — updates arrive live
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !quotes || quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
          <h2 className="text-xl font-semibold">No quotes sent yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Head to your lead feed and send your first quote.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {quotes.map(row => (
            <div
              key={row.quote.id}
              className={`luxury-shadow flex flex-col gap-4 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center ${
                row.quote.status === "accepted"
                  ? "border-emerald-300 ring-1 ring-emerald-200"
                  : row.quote.status === "dismissed"
                    ? "border-neutral-200 opacity-70"
                    : "border-[#D4AF37]/15"
              }`}
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {row.requestImageUrl ? (
                  <img
                    src={proxiedImageUrl(row.requestImageUrl)}
                    alt={row.requestTitle}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-300">
                    <ImagePlus className="h-6 w-6" strokeWidth={1.2} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{row.requestTitle}</h3>
                  <CategoryBadge category={row.requestCategory} />
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  Buyer: {row.buyerName ?? "—"} · Sent{" "}
                  {new Date(row.quote.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {row.quote.goldWeightGrams && `Gold ${row.quote.goldWeightGrams} g`}
                  {row.quote.diamondWeightCarats &&
                    ` · Diamonds ${row.quote.diamondWeightCarats} ct`}
                  {row.quote.makingCharges != null &&
                    ` · Making ${formatINR(row.quote.makingCharges)}`}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <p className="font-serif text-2xl font-semibold text-[#8a6d1c]">
                  {formatINR(row.quote.totalPrice)}
                </p>
                <StatusBadge status={row.quote.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
