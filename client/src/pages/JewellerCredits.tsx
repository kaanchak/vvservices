import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import { jewellerNav } from "@/pages/JewellerDashboard";
import { trpc } from "@/lib/trpc";
import { CircleHelp, CreditCard, Gem, History, IndianRupee, LockKeyhole, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";

const statusCopy: Record<string, { label: string; className: string; detail: string }> = {
  active: {
    label: "Active",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    detail: "You can use V◈ credits to submit new quotes.",
  },
  inactive: {
    label: "Inactive",
    className: "border-neutral-200 bg-neutral-100 text-neutral-600",
    detail: "Activate your subscription to send quotes and use top-ups.",
  },
  past_due: {
    label: "Payment due",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    detail: "Renew your subscription to resume quote access.",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-red-200 bg-red-50 text-red-700",
    detail: "Credits are retained in the ledger but cannot be used while cancelled.",
  },
  suspended: {
    label: "Suspended",
    className: "border-red-200 bg-red-50 text-red-700",
    detail: "Please contact VVServices support about this subscription.",
  },
};

function formatLedgerType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export default function JewellerCredits() {
  const { data: overview, isLoading } = trpc.credits.overview.useQuery();
  const { data: ledger } = trpc.credits.ledger.useQuery({ limit: 50 });
  const { data: catalog } = trpc.credits.catalog.useQuery();
  const state = overview ? statusCopy[overview.subscription.status] ?? statusCopy.inactive : statusCopy.inactive;
  const total = overview?.totalCredits ?? 0;
  const lowBalance = total > 0 && total <= 25;

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8a6d1c]">
            <Gem className="h-3.5 w-3.5" /> V◈ credit wallet
          </p>
          <h1 className="font-serif text-3xl text-[#1A1A1A]">Credits & subscription</h1>
          <p className="mt-1 text-sm text-neutral-500">Every original quote uses 1 V◈. Requotes are always free.</p>
        </div>
        <Link href="/jeweller">
          <Button variant="outline" className="border-[#D4AF37]/40 text-[#8a6d1c]">View lead feed</Button>
        </Link>
      </section>

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"><div className="h-64 animate-pulse rounded-3xl bg-neutral-100" /><div className="h-64 animate-pulse rounded-3xl bg-neutral-100" /></div>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden rounded-3xl bg-[#1A1A1A] p-7 text-white shadow-xl">
              <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-[#D4AF37]/20 blur-2xl" />
              <div className="relative flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Available balance</p>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="font-serif text-5xl leading-none">{total.toLocaleString("en-IN")}</span>
                    <span className="pb-1 text-lg font-semibold text-[#E8D98B]">{catalog?.symbol ?? "V◈"}</span>
                  </div>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-300">
                    {overview?.canQuote ? "You have enough V◈ credits to submit a new quote." : "Quote access is currently unavailable. Review your subscription status below."}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#D4AF37]/15 p-4 text-[#E8D98B]"><Gem className="h-8 w-8" /></div>
              </div>
              <div className="relative mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-center">
                <div><p className="text-lg font-semibold">{overview?.wallet.subscriptionCredits ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">Plan</p></div>
                <div><p className="text-lg font-semibold">{overview?.wallet.topupCredits ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">Top-up</p></div>
                <div><p className="text-lg font-semibold">{overview?.wallet.adjustmentCredits ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">Adjusted</p></div>
              </div>
              {lowBalance && <div className="relative mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Low balance: you have {total} V◈ left. Renew or top up before submitting more quotes.</div>}
              {overview?.wallet.isFrozen && <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-2 text-xs text-red-100"><LockKeyhole className="h-3.5 w-3.5" /> Your wallet is temporarily frozen.</div>}
            </div>

            <div className="rounded-3xl border border-[#D4AF37]/25 bg-white p-6 luxury-shadow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6d1c]">V◈ Pro subscription</p>
                  <p className="mt-2 font-serif text-2xl text-[#1A1A1A]">₹{(catalog?.monthlyPlan.priceInr ?? 9999).toLocaleString("en-IN")}<span className="font-sans text-sm font-normal text-neutral-500"> / month</span></p>
                </div>
                <Badge className={state.className}>{state.label}</Badge>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">{state.detail}</p>
              <div className="mt-5 space-y-3 border-y border-neutral-100 py-4 text-sm">
                <div className="flex justify-between gap-3"><span className="text-neutral-500">Monthly allowance</span><strong>{catalog?.monthlyPlan.credits ?? 500} V◈</strong></div>
                <div className="flex justify-between gap-3"><span className="text-neutral-500">Roll-over cap</span><strong>{catalog?.monthlyPlan.rolloverCap ?? 1500} V◈</strong></div>
                <div className="flex justify-between gap-3"><span className="text-neutral-500">Original quote</span><strong>1 V◈</strong></div>
                <div className="flex justify-between gap-3"><span className="text-neutral-500">Requote</span><strong className="text-emerald-700">Free</strong></div>
              </div>
              <Button disabled className="mt-5 w-full bg-[#D4AF37] text-[#1A1A1A] hover:bg-[#D4AF37]">
                <CreditCard className="h-4 w-4" /> Payment activation pending
              </Button>
              <p className="mt-2 text-center text-[11px] text-neutral-400">Online renewal and top-ups will appear here once payment activation is complete.</p>
            </div>
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6">
              <div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-[#D4AF37]" /><h2 className="font-semibold">How V◈ works</h2></div>
              <div className="mt-5 space-y-4 text-sm leading-6 text-neutral-600">
                <p className="flex gap-3"><Send className="mt-1 h-4 w-4 shrink-0 text-[#D4AF37]" /><span>Submitting an original quote safely uses <strong className="text-[#1A1A1A]">1 V◈</strong>.</span></p>
                <p className="flex gap-3"><Sparkles className="mt-1 h-4 w-4 shrink-0 text-[#D4AF37]" /><span>If a buyer dismisses a pending quote, the same V◈ is automatically refunded.</span></p>
                <p className="flex gap-3"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#D4AF37]" /><span>Credits roll over up to 1,500 V◈. Paid top-ups remain valid only while your subscription is active.</span></p>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#D4AF37]" /><h2 className="font-semibold">Credit history</h2></div><span className="text-xs text-neutral-400">Immutable audit trail</span></div>
              {!ledger || ledger.length === 0 ? <div className="px-6 py-14 text-center text-sm text-neutral-500">Your V◈ transactions will appear here.</div> : <div className="divide-y divide-neutral-100">{ledger.map(entry => {
                const delta = entry.subscriptionDelta + entry.topupDelta + entry.adjustmentDelta;
                const balance = entry.subscriptionBalanceAfter + entry.topupBalanceAfter + entry.adjustmentBalanceAfter;
                return <div key={entry.id} className="flex items-center justify-between gap-4 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium text-[#1A1A1A]">{formatLedgerType(entry.type)}</p><p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{entry.reason}</p><p className="mt-1 text-[11px] text-neutral-400">{new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="shrink-0 text-right"><p className={`text-sm font-bold ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-neutral-500"}`}>{delta > 0 ? "+" : ""}{delta} V◈</p><p className="mt-1 text-[11px] text-neutral-400">Balance {balance}</p></div></div>;
              })}</div>}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
