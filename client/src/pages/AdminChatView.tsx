import AppShell from "@/components/AppShell";
import { formatINR, StatusBadge } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Gem,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";

const adminNav = [{ href: "/admin", label: "Dashboard" }];

function threadStatusBadge(status: string) {
  switch (status) {
    case "open":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>;
    case "buyer_declined":
      return <Badge variant="secondary">Declined by Buyer</Badge>;
    case "jeweller_withdrawn":
      return <Badge variant="secondary">Withdrawn by Jeweller</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminChatView({ threadId }: { threadId: number }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.admin.getThread.useQuery({ threadId });

  return (
    <AppShell nav={adminNav} requiredRole="admin" loginPath="/login">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#D4AF37]" />
          Chat Thread #{threadId}
        </h1>
        {data?.thread && threadStatusBadge(data.thread.status)}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-neutral-500">Thread not found.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Messages */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Message History
            </h2>
            <div className="rounded-2xl border bg-[#faf9f6] p-4 space-y-2 max-h-[70vh] overflow-y-auto">
              {data.messages.length === 0 ? (
                <p className="text-center text-neutral-400 py-10 text-sm">No messages.</p>
              ) : (
                data.messages.map((msg: any) => {
                  if (msg.type === "system") {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }
                  if (msg.type === "requote" && msg.requoteId) {
                    const rq = (data as any).requotes?.find?.((r: any) => r.id === msg.requoteId);
                    if (rq) {
                      return (
                        <div key={msg.id} className="my-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <RefreshCw className="h-4 w-4 text-amber-600" />
                            <p className="text-sm font-semibold text-amber-800">
                              Revised Quote Proposal
                            </p>
                            <Badge
                              variant={rq.status === "accepted" ? "default" : "secondary"}
                              className="ml-auto text-xs"
                            >
                              {rq.status}
                            </Badge>
                          </div>
                          <p className="text-lg font-bold text-[#8a6d1c]">
                            {formatINR(rq.newPrice)}
                          </p>
                          <p className="text-xs text-neutral-500 mt-1">
                            Reason: {rq.reason}
                          </p>
                        </div>
                      );
                    }
                  }
                  const isBuyerMsg = msg.senderRole === "buyer";
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isBuyerMsg ? "justify-end" : "justify-start"} mb-2`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                          isBuyerMsg
                            ? "bg-blue-100 text-blue-900"
                            : "bg-white border border-border text-neutral-800 shadow-sm"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">
                          {isBuyerMsg ? "Buyer" : "Jeweller"}
                        </p>
                        <p>{msg.content}</p>
                        <p className="mt-1 text-right text-[10px] opacity-50">
                          {new Date(msg.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sidebar: Quote + Participants */}
          <div className="space-y-4">
            {/* Official Quote */}
            {data.quote && (
              <div className="rounded-2xl border-2 border-[#D4AF37]/40 bg-gradient-to-br from-[#fdf9ee] to-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Gem className="h-4 w-4 text-[#8a6d1c]" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6d1c]">
                    Official Quote
                  </p>
                </div>
                <p className="font-serif text-3xl font-bold text-[#8a6d1c] mb-3">
                  {formatINR(data.quote.totalPrice)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-neutral-400">Purity</p>
                    <p className="font-semibold">{data.quote.goldPurity?.toUpperCase() ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-neutral-400">Gold</p>
                    <p className="font-semibold">
                      {data.quote.goldWeightGrams ? `${data.quote.goldWeightGrams} g` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-400">Diamonds</p>
                    <p className="font-semibold">
                      {data.quote.diamondWeightCarats ? `${data.quote.diamondWeightCarats} ct` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-400">Making</p>
                    <p className="font-semibold">{formatINR(data.quote.makingCharges)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <StatusBadge status={data.quote.status} />
                </div>
              </div>
            )}

            {/* Participants */}
            <div className="rounded-2xl border border-[#D4AF37]/15 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Participants
              </p>
              <div>
                <p className="text-xs text-neutral-400">Buyer</p>
                <p className="font-medium">{data.buyer?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400">Jeweller</p>
                <p className="font-medium">
                  {data.jeweller?.businessName ?? data.jeweller?.name ?? "—"}
                </p>
                {data.jeweller?.city && (
                  <p className="text-xs text-neutral-400">{data.jeweller.city}</p>
                )}
              </div>
              {data.request && (
                <div>
                  <p className="text-xs text-neutral-400">Request</p>
                  <p className="font-medium">{data.request.title}</p>
                </div>
              )}
            </div>

            {/* Thread metadata */}
            <div className="rounded-2xl border border-[#D4AF37]/15 bg-white p-4 space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Thread Info
              </p>
              <div className="flex justify-between">
                <span className="text-neutral-500">Status</span>
                {threadStatusBadge(data.thread.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Opened</span>
                <span>{new Date(data.thread.createdAt).toLocaleDateString("en-IN")}</span>
              </div>
              {data.thread.closedAt && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Closed</span>
                  <span>{new Date(data.thread.closedAt).toLocaleDateString("en-IN")}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
