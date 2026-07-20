import AppShell from "@/components/AppShell";
import { CategoryBadge, formatINR } from "@/components/Brand";
import { buyerNav } from "@/pages/BuyerDashboard";
import { Badge } from "@/components/ui/badge";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { MessageSquare, MapPin } from "lucide-react";
import { useLocation } from "wouter";

function threadStatusLabel(status: string) {
  switch (status) {
    case "open":
      return { label: "Active", className: "bg-emerald-100 text-emerald-700" };
    case "buyer_declined":
      return { label: "Declined", className: "bg-neutral-100 text-neutral-500" };
    case "jeweller_withdrawn":
      return { label: "Withdrawn", className: "bg-neutral-100 text-neutral-500" };
    default:
      return { label: status, className: "bg-neutral-100 text-neutral-500" };
  }
}

export default function BuyerChats() {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.chat.myThreads.useQuery(undefined, {
    enabled: !!account,
  });

  useSocket({
    "new-message": () => utils.chat.myThreads.invalidate(),
    "thread-status": () => utils.chat.myThreads.invalidate(),
    "requote-event": () => utils.chat.myThreads.invalidate(),
  });

  return (
    <AppShell nav={buyerNav} requiredRole="buyer" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Chats</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Conversations with jewellers whose quotes you've accepted
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
          <MessageSquare
            className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]"
            strokeWidth={1.4}
          />
          <h2 className="text-xl font-semibold">No conversations yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Accept a jeweller's quote to start a conversation and finalise your order.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((row: any) => {
            const { label, className } = threadStatusLabel(row.thread.status);
            const displayName = row.businessName || row.jewellerName || "Jeweller";
            return (
              <button
                key={row.thread.id}
                className="w-full text-left rounded-2xl border border-[#D4AF37]/20 bg-white p-5 shadow-sm hover:border-[#D4AF37]/50 hover:shadow-md transition-all"
                onClick={() => navigate(`/app/chat/${row.thread.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-gradient font-serif text-lg font-semibold text-[#1A1A1A]">
                      {displayName.charAt(0)}
                    </span>
                    <div>
                      <p className="font-semibold leading-tight">{displayName}</p>
                      {row.city && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400">
                          <MapPin className="h-3 w-3" /> {row.city}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.requestCategory && <CategoryBadge category={row.requestCategory} />}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
                      {label}
                    </span>
                  </div>
                </div>
                {row.requestTitle && (
                  <p className="mt-3 text-xs text-neutral-400 uppercase tracking-wide">
                    Re: {row.requestTitle}
                  </p>
                )}
                <p className="mt-1 text-xs text-neutral-400">
                  Started {new Date(row.thread.createdAt).toLocaleDateString()}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
