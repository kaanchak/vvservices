import AppShell from "@/components/AppShell";
import { CategoryBadge, formatINR } from "@/components/Brand";
import { jewellerNav } from "@/pages/JewellerDashboard";
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
      return { label: "Rejected", className: "bg-red-100 text-red-600" };
    case "jeweller_withdrawn":
      return { label: "Withdrawn", className: "bg-neutral-100 text-neutral-500" };
    default:
      return { label: status, className: "bg-neutral-100 text-neutral-500" };
  }
}

export default function JewellerChats() {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.chat.jewellersThreads.useQuery(undefined, {
    enabled: !!account,
  });

  useSocket({
    "new-message": () => utils.chat.jewellersThreads.invalidate(),
    "thread-status": () => utils.chat.jewellersThreads.invalidate(),
    "requote-event": () => utils.chat.jewellersThreads.invalidate(),
  });

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Conversations</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Chats with buyers who accepted your quotes
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
            When a buyer accepts your quote, a private chat will open here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((row: any) => {
            const { label, className } = threadStatusLabel(row.thread.status);
            return (
              <button
                key={row.thread.id}
                className="w-full text-left rounded-2xl border border-[#D4AF37]/20 bg-white p-5 shadow-sm hover:border-[#D4AF37]/50 hover:shadow-md transition-all"
                onClick={() => navigate(`/jeweller/chat/${row.thread.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-200 to-neutral-100 font-serif text-lg font-semibold text-neutral-600">
                      {(row.buyerName ?? "B").charAt(0)}
                    </span>
                    <div>
                      <p className="font-semibold leading-tight">{row.buyerName ?? "Buyer"}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        Started {new Date(row.thread.createdAt).toLocaleDateString()}
                      </p>
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
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
