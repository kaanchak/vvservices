import AppShell from "@/components/AppShell";
import { formatINR, StatusBadge } from "@/components/Brand";
import { buyerNav } from "@/pages/BuyerDashboard";
import { jewellerNav } from "@/pages/JewellerDashboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Flag,
  Gem,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Official Quote Card ─────────────────────────────────────────────────────

function OfficialQuoteCard({
  quote,
  acceptedRequote,
  jewellerName,
  businessName,
  city,
  rating,
}: {
  quote: {
    id: number;
    totalPrice: number;
    goldPurity?: string | null;
    goldWeightGrams?: string | null;
    diamondWeightCarats?: string | null;
    makingCharges?: number | null;
    goldPricePerGram?: string | null;
    message?: string | null;
    preMessage?: string | null;
  };
  acceptedRequote?: {
    newPrice: number;
    newGoldPurity?: string | null;
    newGoldWeightGrams?: string | null;
    newDiamondWeightCarats?: string | null;
    newMakingCharges?: number | null;
  } | null;
  jewellerName?: string | null;
  businessName?: string | null;
  city?: string | null;
  rating?: string | null;
}) {
  const effectivePrice = acceptedRequote ? acceptedRequote.newPrice : quote.totalPrice;
  const effectivePurity = acceptedRequote?.newGoldPurity ?? quote.goldPurity;
  const effectiveGoldWeight = acceptedRequote?.newGoldWeightGrams ?? quote.goldWeightGrams;
  const effectiveDiamondWeight = acceptedRequote?.newDiamondWeightCarats ?? quote.diamondWeightCarats;
  const effectiveMaking = acceptedRequote?.newMakingCharges ?? quote.makingCharges;

  return (
    <div className="rounded-2xl border-2 border-[#D4AF37]/40 bg-gradient-to-br from-[#fdf9ee] to-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-gradient">
          <Gem className="h-4 w-4 text-[#1A1A1A]" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6d1c]">
            Official Quote
          </p>
          {acceptedRequote && (
            <p className="text-xs text-emerald-600 font-medium">Revised quote accepted</p>
          )}
        </div>
      </div>

      <div className="mb-4 text-center">
        <p className="font-serif text-4xl font-bold text-[#8a6d1c]">
          {formatINR(effectivePrice)}
        </p>
        {acceptedRequote && (
          <p className="text-xs text-neutral-400 line-through mt-0.5">
            Original: {formatINR(quote.totalPrice)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/60 p-3 text-sm mb-4">
        <div>
          <p className="text-xs text-neutral-400">Purity</p>
          <p className="font-semibold">{effectivePurity?.toUpperCase() ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Gold Weight</p>
          <p className="font-semibold">{effectiveGoldWeight ? `${effectiveGoldWeight} g` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Diamonds</p>
          <p className="font-semibold">
            {effectiveDiamondWeight ? `${effectiveDiamondWeight} ct` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Making</p>
          <p className="font-semibold">{formatINR(effectiveMaking)}</p>
        </div>
      </div>

      {businessName && (
        <p className="text-xs text-neutral-500 mb-4">
          By <span className="font-semibold">{businessName}</span>
          {city && ` · ${city}`}
          {rating && ` · ★ ${rating}`}
        </p>
      )}
    </div>
  );
}

// ─── Requote Card (in chat) ───────────────────────────────────────────────────

function RequoteCard({
  requote,
  originalPrice,
  isBuyer,
  onAccept,
  onReject,
  isPending,
}: {
  requote: {
    id: number;
    newPrice: number;
    newGoldPurity?: string | null;
    newGoldWeightGrams?: string | null;
    newDiamondWeightCarats?: string | null;
    newMakingCharges?: number | null;
    reason: string;
    status: string;
  };
  originalPrice: number;
  isBuyer: boolean;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  isPending: boolean;
}) {
  const priceDiff = requote.newPrice - originalPrice;
  const isHigher = priceDiff > 0;

  return (
    <div
      className={`rounded-xl border-2 p-4 ${
        requote.status === "accepted"
          ? "border-emerald-300 bg-emerald-50"
          : requote.status === "rejected"
            ? "border-neutral-200 bg-neutral-50 opacity-70"
            : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-semibold text-amber-800">Revised Quote Proposal</p>
        {requote.status !== "pending" && (
          <Badge
            variant={requote.status === "accepted" ? "default" : "secondary"}
            className="ml-auto text-xs"
          >
            {requote.status === "accepted" ? "Accepted" : "Declined"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <p className="text-xs text-neutral-500">New Price</p>
          <p className="font-bold text-[#8a6d1c] text-lg">{formatINR(requote.newPrice)}</p>
          <p className={`text-xs font-medium ${isHigher ? "text-red-500" : "text-emerald-600"}`}>
            {isHigher ? "+" : ""}
            {formatINR(priceDiff)} vs original
          </p>
        </div>
        {requote.newGoldPurity && (
          <div>
            <p className="text-xs text-neutral-500">Purity</p>
            <p className="font-semibold">{requote.newGoldPurity.toUpperCase()}</p>
          </div>
        )}
        {requote.newGoldWeightGrams && (
          <div>
            <p className="text-xs text-neutral-500">Gold Weight</p>
            <p className="font-semibold">{requote.newGoldWeightGrams} g</p>
          </div>
        )}
        {requote.newMakingCharges !== null && requote.newMakingCharges !== undefined && (
          <div>
            <p className="text-xs text-neutral-500">Making</p>
            <p className="font-semibold">{formatINR(requote.newMakingCharges)}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white/70 p-2.5 mb-3">
        <p className="text-xs text-neutral-500 mb-1">Reason for revision</p>
        <p className="text-sm text-neutral-700">{requote.reason}</p>
      </div>

      {isBuyer && requote.status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isPending}
            onClick={() => onAccept(requote.id)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={isPending}
            onClick={() => onReject(requote.id)}
          >
            <XCircle className="h-3.5 w-3.5" /> Decline
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Send Requote Dialog ──────────────────────────────────────────────────────

function SendRequoteDialog({
  threadId,
  originalPrice,
  onSuccess,
}: {
  threadId: number;
  originalPrice: number;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newPrice, setNewPrice] = useState(originalPrice.toString());
  const [purity, setPurity] = useState<string>("");
  const [goldWeight, setGoldWeight] = useState("");
  const [diamondWeight, setDiamondWeight] = useState("");
  const [makingCharges, setMakingCharges] = useState("");
  const [reason, setReason] = useState("");

  const sendRequote = trpc.requotes.send.useMutation({
    onSuccess: () => {
      toast.success("Revised quote sent to buyer.");
      setOpen(false);
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Send Requote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Revised Quote</DialogTitle>
          <DialogDescription>
            Propose a revised quote to the buyer. They must accept it for it to take effect.
            The original quote remains official until accepted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>New Total Price (₹) *</Label>
            <Input
              type="number"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder="e.g. 45000"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Gold Purity</Label>
              <Select value={purity} onValueChange={setPurity}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Same as original" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9kt">9KT</SelectItem>
                  <SelectItem value="14kt">14KT</SelectItem>
                  <SelectItem value="18kt">18KT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gold Weight (g)</Label>
              <Input
                type="number"
                value={goldWeight}
                onChange={e => setGoldWeight(e.target.value)}
                placeholder="e.g. 5.2"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Diamond Weight (ct)</Label>
              <Input
                type="number"
                value={diamondWeight}
                onChange={e => setDiamondWeight(e.target.value)}
                placeholder="e.g. 0.5"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Making Charges (₹)</Label>
              <Input
                type="number"
                value={makingCharges}
                onChange={e => setMakingCharges(e.target.value)}
                placeholder="e.g. 2000"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Reason for Revision *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why you are revising the quote (e.g. material cost change, design update)..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gold-gradient text-[#1A1A1A]"
            disabled={sendRequote.isPending || !newPrice || !reason.trim()}
            onClick={() =>
              sendRequote.mutate({
                threadId,
                newPrice: parseInt(newPrice),
                newGoldPurity: purity as "9kt" | "14kt" | "18kt" | undefined || undefined,
                newGoldWeightGrams: goldWeight ? parseFloat(goldWeight) : undefined,
                newDiamondWeightCarats: diamondWeight ? parseFloat(diamondWeight) : undefined,
                newMakingCharges: makingCharges ? parseInt(makingCharges) : undefined,
                reason,
              })
            }
          >
            {sendRequote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Requote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Report Dialog ────────────────────────────────────────────────────────────

function ReportDialog({ threadId, onSuccess }: { threadId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const fileReport = trpc.reports.file.useMutation({
    onSuccess: () => {
      toast.success("Report submitted. Our team will review it shortly.");
      setOpen(false);
      setReason("");
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50">
          <Flag className="h-3.5 w-3.5" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Report Jeweller
          </DialogTitle>
          <DialogDescription>
            Report this jeweller for misconduct such as changing the quote without your request,
            unprofessional behaviour, or misrepresentation. Our team will review and take action.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>Describe the issue *</Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Please describe what happened in detail..."
            rows={4}
            className="mt-1"
          />
          <p className="mt-1.5 text-xs text-neutral-400">Minimum 10 characters required.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={fileReport.isPending || reason.trim().length < 10}
            onClick={() => fileReport.mutate({ threadId, reason })}
          >
            {fileReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Thread Dialog ──────────────────────────────────────────────────────

function CloseThreadDialog({
  threadId,
  isBuyer,
  onSuccess,
}: {
  threadId: number;
  isBuyer: boolean;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);

  const closeThread = trpc.chat.closeThread.useMutation({
    onSuccess: () => {
      toast.success(isBuyer ? "Quote declined." : "You have withdrawn from this conversation.");
      setOpen(false);
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-500 hover:text-red-500">
          <XCircle className="h-3.5 w-3.5" />
          {isBuyer ? "Decline Quote" : "Withdraw"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isBuyer ? "Decline this quote?" : "Withdraw from conversation?"}</DialogTitle>
          <DialogDescription>
            {isBuyer
              ? "Closing this chat will decline the quote. The jeweller will be notified. This action cannot be undone."
              : "Withdrawing will close this chat. The buyer will be notified. This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={closeThread.isPending}
            onClick={() => closeThread.mutate({ threadId })}
          >
            {closeThread.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isBuyer ? (
              "Decline Quote"
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwnMessage,
}: {
  msg: {
    id: number;
    content: string;
    senderRole: string;
    type: string;
    createdAt: Date;
  };
  isOwnMessage: boolean;
}) {
  if (msg.type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isOwnMessage
            ? "bg-[#D4AF37] text-[#1A1A1A] rounded-br-sm"
            : "bg-white border border-border text-neutral-800 rounded-bl-sm shadow-sm"
        }`}
      >
        <p>{msg.content}</p>
        <p
          className={`mt-1 text-right text-[10px] ${
            isOwnMessage ? "text-[#1A1A1A]/60" : "text-neutral-400"
          }`}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ─── Main ChatThread Page ─────────────────────────────────────────────────────

export default function ChatThreadPage({ threadId }: { threadId: number }) {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const [msgText, setMsgText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const isBuyer = account?.role === "buyer";
  const nav = isBuyer ? buyerNav : jewellerNav;

  const { data, isLoading, refetch } = trpc.chat.getThread.useQuery(
    { threadId },
    { enabled: !!account }
  );

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMsgText("");
      refetch();
    },
    onError: e => toast.error(e.message),
  });

  const acceptRequote = trpc.requotes.accept.useMutation({
    onSuccess: () => {
      toast.success("Revised quote accepted! This is now the official quote.");
      refetch();
    },
    onError: e => toast.error(e.message),
  });

  const rejectRequote = trpc.requotes.reject.useMutation({
    onSuccess: () => {
      toast.success("Revised quote declined. Original quote remains in effect.");
      refetch();
    },
    onError: e => toast.error(e.message),
  });

  // Real-time: listen for new messages and requote events
  useSocket({
    "new-message": (payload: any) => {
      if (payload?.threadId === threadId) {
        refetch();
      }
    },
    "requote-event": (payload: any) => {
      if (payload?.threadId === threadId) {
        refetch();
      }
    },
    "thread-status": (payload: any) => {
      if (payload?.threadId === threadId) {
        refetch();
      }
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const handleSend = () => {
    if (!msgText.trim()) return;
    sendMessage.mutate({ threadId, content: msgText.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isThreadClosed = data?.thread.status !== "open";
  return (
    <AppShell nav={nav} requiredRole={isBuyer ? "buyer" : "jeweller"} loginPath="/login">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isBuyer ? "/app/quotes" : "/jeweller/quotes")}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#D4AF37]" />
              {isLoading
                ? "Loading..."
                : isBuyer
                  ? data?.jeweller?.businessName ?? data?.jeweller?.name ?? "Jeweller"
                  : data?.buyer?.name ?? "Buyer"}
            </h1>
            {data?.request && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Re: {data.request.title}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {data?.thread.status === "open" && (
            <>
              {isBuyer && <ReportDialog threadId={threadId} onSuccess={refetch} />}
              <CloseThreadDialog
                threadId={threadId}
                isBuyer={isBuyer}
                onSuccess={() => {
                  utils.chat.myThreads.invalidate();
                  utils.chat.jewellersThreads.invalidate();
                  refetch();
                }}
              />
            </>
          )}
          {isThreadClosed && (
            <Badge variant="secondary" className="text-xs">
              {data?.thread.status === "buyer_declined"
                ? "Declined by Buyer"
                : "Withdrawn by Jeweller"}
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-neutral-500">Thread not found.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Chat Column */}
          <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto rounded-2xl border bg-[#faf9f6] p-4 space-y-1">
              {data.messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-neutral-400 text-sm">
                  No messages yet. Say hello!
                </div>
              ) : (
                data.messages.map((msg: any) => {
                  // Requote messages get special rendering — embedded interactive card
                  if (msg.type === "requote" && msg.requoteId) {
                    const rq = ((data as any).requotes ?? []).find(
                      (r: any) => r.id === msg.requoteId
                    );
                    if (rq) {
                      const isOwnRequote = msg.senderId === account?.id;
                      return (
                        <div
                          key={msg.id}
                          id={`requote-${rq.id}`}
                          className={`my-3 flex ${isOwnRequote ? "justify-end" : "justify-start"}`}
                        >
                          <div className="w-full max-w-[420px]">
                            <div className={`mb-1 flex items-center gap-1.5 text-[11px] text-neutral-400 ${isOwnRequote ? "justify-end" : ""}`}>
                              <RefreshCw className="h-3 w-3" />
                              {isOwnRequote ? "You sent a revised quote" : "Revised quote received"}
                              <span>·</span>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <RequoteCard
                              requote={rq}
                              originalPrice={data.quote?.totalPrice ?? 0}
                              isBuyer={isBuyer}
                              onAccept={id => acceptRequote.mutate({ requoteId: id })}
                              onReject={id => rejectRequote.mutate({ requoteId: id })}
                              isPending={acceptRequote.isPending || rejectRequote.isPending}
                            />
                          </div>
                        </div>
                      );
                    }
                  }
                  const isOwn = msg.senderId === account?.id;
                  return (
                    <MessageBubble key={msg.id} msg={msg} isOwnMessage={isOwn} />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Active requote banner — clickable, scrolls to the embedded card */}
            {data.activeRequote && isBuyer && (
              <button
                type="button"
                onClick={() => {
                  document
                    .getElementById(`requote-${data.activeRequote!.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-center gap-2 hover:bg-amber-100 transition-colors text-left"
              >
                <RefreshCw className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Revised quote for <strong>{formatINR(data.activeRequote.newPrice)}</strong>{" "}
                  awaiting your response — tap to review &amp; accept.
                </span>
              </button>
            )}

            {/* Input area */}
            {!isThreadClosed ? (
              <div className="mt-3 flex gap-2">
                <Textarea
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  className="flex-1 resize-none"
                />
                <Button
                  className="self-end bg-gold-gradient text-[#1A1A1A] hover:opacity-90"
                  disabled={sendMessage.isPending || !msgText.trim()}
                  onClick={handleSend}
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-center text-sm text-neutral-400">
                This chat is closed.
              </div>
            )}

            {/* Jeweller: send requote */}
            {!isBuyer && !isThreadClosed && (
              <div className="mt-2 flex justify-end">
                <SendRequoteDialog
                  threadId={threadId}
                  originalPrice={data.quote?.totalPrice ?? 0}
                  onSuccess={refetch}
                />
              </div>
            )}
          </div>

          {/* Right sidebar: Official Quote Card */}
          <div className="space-y-4">
            {data.quote && (
              <OfficialQuoteCard
                quote={data.quote}
                acceptedRequote={data.acceptedRequote}
                jewellerName={data.jeweller?.name}
                businessName={data.jeweller?.businessName}
                city={data.jeweller?.city}
                rating={data.jeweller?.rating}
              />
            )}

            {/* Thread status info */}
            {isThreadClosed && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
                <p className="font-medium text-neutral-700 mb-1">Chat Closed</p>
                <p>
                  {data.thread.status === "buyer_declined"
                    ? "The buyer declined this quote."
                    : "The jeweller withdrew from this conversation."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
