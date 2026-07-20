import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { proxiedImageUrl } from "@/lib/imageProxy";
import { trpc } from "@/lib/trpc";
import { categoryLabel } from "@shared/categories";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gem,
  ImagePlus,
  IndianRupee,
  Info,
  RefreshCw,
  StickyNote,
  Tag,
  User,
  Weight,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { jewellerNav } from "./JewellerDashboard";

// ─── types ───────────────────────────────────────────────────────────────────

interface ScrapedProduct {
  imageUrl?: string;
  title?: string;
  description?: string;
  price?: string;
  currency?: string;
  goldWeight?: string;
  diamondWeight?: string;
  metalType?: string;
  stoneType?: string;
  sourceUrl?: string;
}

type GoldPurity = "9kt" | "14kt" | "18kt";

const PURITY_LABELS: Record<GoldPurity, string> = {
  "9kt": "9KT (37.5%)",
  "14kt": "14KT (58.3%)",
  "18kt": "18KT (75%)",
};

const PURITY_FRACTION: Record<GoldPurity, number> = {
  "9kt": 9 / 24,
  "14kt": 14 / 24,
  "18kt": 18 / 24,
};

const DEFAULT_DIAMOND_RATE = 50000; // ₹50,000 per carat

// ─── helpers ─────────────────────────────────────────────────────────────────

function SpecRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-[#8a6d1c]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-[#1A1A1A]">{value}</p>
      </div>
    </div>
  );
}

/** Parse a weight string like "10g", "10 grams", "10.5" → number | null */
function parseWeightString(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/[\d.]+/);
  if (!match) return null;
  const val = parseFloat(match[0]);
  return isNaN(val) ? null : val;
}

// ─── QuoteForm ────────────────────────────────────────────────────────────────

function QuoteForm({
  requestId,
  alreadyQuoted,
  isClosed,
  onSuccess,
  scraped,
  myQuote,
  myThreadId,
}: {
  requestId: number;
  alreadyQuoted: boolean;
  isClosed: boolean;
  myQuote?: { id: number; status: string; totalPrice: number } | null;
  myThreadId?: number | null;
  onSuccess: () => void;
  scraped: ScrapedProduct | null;
}) {
  const utils = trpc.useUtils();

  // ── Gold price from API ──
  const { data: goldPriceData } = trpc.goldPrice.current.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min
  });

  // ── Purity state ──
  const [purity, setPurity] = useState<GoldPurity>("18kt");

  // Derived live gold rate for selected purity
  const liveGoldRate24kt = goldPriceData?.pricePerGram24kt ?? null;
  const liveGoldRateForPurity = liveGoldRate24kt
    ? Math.round(liveGoldRate24kt * PURITY_FRACTION[purity])
    : null;

  // ── Weight fields — auto-filled from scraped data ──
  const scrapedGoldWeight = useMemo(() => parseWeightString(scraped?.goldWeight), [scraped]);
  const scrapedDiamondWeight = useMemo(() => parseWeightString(scraped?.diamondWeight), [scraped]);

  const [goldWeight, setGoldWeight] = useState(scrapedGoldWeight ? String(scrapedGoldWeight) : "");
  const [diamondWeight, setDiamondWeight] = useState(scrapedDiamondWeight ? String(scrapedDiamondWeight) : "");
  const [makingCharges, setMakingCharges] = useState("");
  const [diamondRate, setDiamondRate] = useState(String(DEFAULT_DIAMOND_RATE));
  const [message, setMessage] = useState("");
  const [preMessage, setPreMessage] = useState("");

  // When purity changes, update the displayed gold rate (read-only, derived from live price)
  const goldRateDisplay = liveGoldRateForPurity
    ? `₹${liveGoldRateForPurity.toLocaleString("en-IN")}`
    : "Loading…";

  // Auto-calculated total
  const effectiveGoldRate = liveGoldRateForPurity ?? 7000; // fallback if API not loaded
  const goldCost = (parseFloat(goldWeight) || 0) * effectiveGoldRate;
  const diamondCost = (parseFloat(diamondWeight) || 0) * (parseFloat(diamondRate) || DEFAULT_DIAMOND_RATE);
  const makingCost = parseInt(makingCharges) || 0;
  const totalPrice = Math.round(goldCost + diamondCost + makingCost);

  const create = trpc.quotes.create.useMutation({
    onSuccess: () => {
      toast.success("Quote sent! The buyer sees it instantly.");
      utils.requests.leads.invalidate();
      utils.requests.getLeadById.invalidate({ id: requestId });
      utils.quotes.mine.invalidate();
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  if (alreadyQuoted) {
    const isAccepted = myQuote?.status === "accepted";
    return (
      <div className="space-y-3">
        {isAccepted && myThreadId ? (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800">Buyer accepted your quote!</p>
                <p className="text-sm text-emerald-700">
                  Chat is now unlocked. Discuss details and finalise the order.
                </p>
              </div>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => window.location.href = `/jeweller/chat/${myThreadId}`}
            >
              <RefreshCw className="h-4 w-4" /> Open Chat with Buyer
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">Quote submitted</p>
              <p className="text-sm text-green-700">
                Your quote has been sent to the buyer. You'll be notified when they respond.
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <strong>Quote is locked.</strong> You cannot change your quote after submission.
            If you need to revise it, use the <strong>"Send Requote"</strong> button inside the chat
            — the buyer must accept the revision for it to take effect.
          </p>
        </div>
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <Info className="h-5 w-5 flex-shrink-0 text-neutral-500" />
        <p className="text-sm text-neutral-600">This request has been closed by the buyer.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={e => {
        e.preventDefault();
        if (!totalPrice || totalPrice <= 0) return toast.error("Total price must be greater than zero");
        create.mutate({
          requestId,
          goldWeightGrams: goldWeight ? parseFloat(goldWeight) : undefined,
          diamondWeightCarats: diamondWeight ? parseFloat(diamondWeight) : undefined,
          makingCharges: makingCharges ? parseInt(makingCharges) : undefined,
          totalPrice,
          message: message || undefined,
          preMessage: preMessage || undefined,
          goldPurity: purity,
          goldPricePerGram: liveGoldRateForPurity ?? undefined,
        });
      }}
    >
      {/* ── Live Gold Price Banner ── */}
      <div className="rounded-xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#D4AF37]/10 to-[#D4AF37]/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[#8a6d1c]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">
              Live Gold Price (24KT)
            </span>
          </div>
          {goldPriceData?.fetchedAt && (
            <span className="text-[10px] text-neutral-400 flex items-center gap-1">
              <RefreshCw className="h-2.5 w-2.5" />
              Updated {new Date(goldPriceData.fetchedAt).toLocaleDateString("en-IN")}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#1A1A1A]">
            {liveGoldRate24kt
              ? `₹${Math.round(liveGoldRate24kt).toLocaleString("en-IN")}`
              : "—"}
          </span>
          <span className="text-sm text-neutral-500">per gram</span>
        </div>
      </div>

      {/* ── Gold Purity Selector ── */}
      <div className="space-y-2">
        <Label htmlFor="purity" className="flex items-center gap-1.5">
          <Weight className="h-3.5 w-3.5 text-[#D4AF37]" />
          Gold purity
        </Label>
        <Select value={purity} onValueChange={v => setPurity(v as GoldPurity)}>
          <SelectTrigger id="purity" className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["9kt", "14kt", "18kt"] as GoldPurity[]).map(p => (
              <SelectItem key={p} value={p}>
                {PURITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-neutral-400">
          Gold rate for selected purity:{" "}
          <span className="font-semibold text-[#8a6d1c]">{goldRateDisplay} / gram</span>
        </p>
      </div>

      {/* ── Diamond rate ── */}
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">Diamond rate (₹ / carat)</p>
        <Input
          type="number"
          min={1}
          value={diamondRate}
          onChange={e => setDiamondRate(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* ── Weights + making charges ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="goldWeight" className="flex items-center gap-1.5">
            <Weight className="h-3.5 w-3.5 text-[#D4AF37]" />
            Gold weight (g)
          </Label>
          <Input
            id="goldWeight"
            type="number"
            step="0.01"
            min={0}
            placeholder="e.g. 45.5"
            value={goldWeight}
            onChange={e => setGoldWeight(e.target.value)}
          />
          {scrapedGoldWeight && (
            <p className="text-[10px] text-[#8a6d1c]">
              ↑ Auto-filled from listing
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="diamondWeight" className="flex items-center gap-1.5">
            <Gem className="h-3.5 w-3.5 text-[#D4AF37]" />
            Diamond weight (ct)
          </Label>
          <Input
            id="diamondWeight"
            type="number"
            step="0.01"
            min={0}
            placeholder="e.g. 1.25"
            value={diamondWeight}
            onChange={e => setDiamondWeight(e.target.value)}
          />
          {scrapedDiamondWeight && (
            <p className="text-[10px] text-[#8a6d1c]">
              ↑ Auto-filled from listing
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="makingCharges" className="flex items-center gap-1.5">
          <IndianRupee className="h-3.5 w-3.5 text-[#D4AF37]" />
          Making charges (₹)
        </Label>
        <Input
          id="makingCharges"
          type="number"
          min={0}
          placeholder="e.g. 15,000"
          value={makingCharges}
          onChange={e => setMakingCharges(e.target.value)}
        />
      </div>

      {/* ── Auto-calculated total ── */}
      <div className="rounded-xl border border-[#D4AF37]/40 bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">Price breakdown</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>
              Gold ({goldWeight || "0"} g × ₹{effectiveGoldRate.toLocaleString("en-IN")}
              <span className="ml-1 text-[10px] text-neutral-400">({PURITY_LABELS[purity]})</span>
              )
            </span>
            <span>₹{goldCost.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Diamond ({diamondWeight || "0"} ct × ₹{Number(diamondRate).toLocaleString("en-IN")})</span>
            <span>₹{diamondCost.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Making charges</span>
            <span>₹{makingCost.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-[#D4AF37]/30 pt-2 font-bold text-[#1A1A1A]">
            <span>Total price</span>
            <span className="text-lg text-[#8a6d1c]">₹{totalPrice.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* ── Pre-acceptance message ── */}
      <div className="space-y-2">
        <Label htmlFor="preMessage" className="flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-[#D4AF37]" />
          Pre-acceptance message
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Shown before buyer accepts
          </span>
        </Label>
        <Textarea
          id="preMessage"
          rows={2}
          maxLength={500}
          placeholder="Introduce yourself — e.g. 'We specialise in bridal sets and offer BIS hallmarked jewellery with 30-day returns.'"
          value={preMessage}
          onChange={e => setPreMessage(e.target.value)}
        />
        <p className="text-[10px] text-neutral-400">
          This message is visible to the buyer alongside your quote, before they accept or dismiss it.
          Max 500 characters.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-[#D4AF37]" />
          Internal notes (optional)
        </Label>
        <Textarea
          id="message"
          rows={3}
          maxLength={2000}
          placeholder="Certifications, delivery time, what's included, hallmark details…"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        disabled={create.isPending}
        className="w-full bg-gold-gradient py-6 text-base font-semibold text-[#1A1A1A] hover:opacity-90"
      >
        {create.isPending ? "Sending quote…" : "Send quote to buyer"}
      </Button>
    </form>
  );
}

// ─── JewellerLeadDetail ───────────────────────────────────────────────────────

export default function JewellerLeadDetail({ id }: { id: number }) {
  const { account } = useAccount();
  const [, navigate] = useLocation();

  const { data: lead, isLoading, error } = trpc.requests.getLeadById.useQuery(
    { id },
    { enabled: !!account }
  );

  const scraped: ScrapedProduct | null = lead?.scrapedDetails
    ? (() => { try { return JSON.parse(lead.scrapedDetails); } catch { return null; } })()
    : null;

  const extractedSpecs = scraped
    ? [
        { icon: <Tag className="h-4 w-4" />, label: "Metal type", value: scraped.metalType },
        { icon: <Weight className="h-4 w-4" />, label: "Gold weight", value: scraped.goldWeight },
        { icon: <Gem className="h-4 w-4" />, label: "Diamond weight", value: scraped.diamondWeight },
        { icon: <Gem className="h-4 w-4" />, label: "Stone type", value: scraped.stoneType },
        {
          icon: <IndianRupee className="h-4 w-4" />,
          label: "Listed / retail price",
          value: scraped.price
            ? `${scraped.currency && scraped.currency !== "INR" ? scraped.currency + " " : ""}${scraped.price}${scraped.currency === "INR" ? " (₹)" : ""}`
            : undefined,
        },
      ].filter(s => s.value) as { icon: React.ReactNode; label: string; value: string }[]
    : [];

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      {/* Back button */}
      <button
        onClick={() => navigate("/jeweller")}
        className="mb-6 flex items-center gap-2 text-sm font-medium text-neutral-500 transition-colors hover:text-[#8a6d1c]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Lead Feed
      </button>

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : error || !lead ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="font-semibold text-red-700">Lead not found or not accessible.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/jeweller")}>
            Back to Lead Feed
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          {/* ── Left column: product details ─────────────────────────────── */}
          <div className="space-y-6">
            {/* Hero image */}
            <div className="overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-neutral-100 shadow-sm">
              {lead.imageUrl ? (
                <img
                  src={proxiedImageUrl(lead.imageUrl)}
                  alt={lead.title}
                  className="h-80 w-full object-contain p-4 lg:h-[420px]"
                  onError={e => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = "none";
                    el.parentElement!.classList.add("flex", "items-center", "justify-center");
                  }}
                />
              ) : (
                <div className="flex h-80 items-center justify-center text-neutral-300 lg:h-[420px]">
                  <ImagePlus className="h-16 w-16" strokeWidth={1} />
                </div>
              )}
            </div>

            {/* Title + badges */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <CategoryBadge category={lead.category} />
                <StatusBadge status={lead.status} />
              </div>
              <h1 className="mt-3 font-serif text-3xl font-semibold text-[#1A1A1A]">
                {lead.title}
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                <User className="h-3.5 w-3.5" />
                Request from <span className="font-medium text-[#1A1A1A]">{lead.buyerName}</span>
                <span className="text-neutral-300">·</span>
                <Calendar className="h-3.5 w-3.5" />
                {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Extracted product specs */}
            {extractedSpecs.length > 0 && (
              <Card className="border-[#D4AF37]/20 shadow-none">
                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#8a6d1c]">
                    <Gem className="h-4 w-4" />
                    Extracted product specifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-[#D4AF37]/15">
                    {extractedSpecs.map(s => (
                      <SpecRow key={s.label} icon={s.icon} label={s.label} value={s.value} />
                    ))}
                  </div>
                  {scraped?.sourceUrl && (
                    <a
                      href={scraped.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1.5 text-xs text-[#8a6d1c] underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View original product page
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Product description from scrape */}
            {scraped?.description && (
              <Card className="border-neutral-200 shadow-none">
                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                    Product description
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm leading-relaxed text-neutral-700">{scraped.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Buyer requirements */}
            <Card className="border-neutral-200 shadow-none">
              <CardHeader className="pb-2 pt-5">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Buyer requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 pt-0">
                <div className="divide-y divide-neutral-100">
                  <SpecRow
                    icon={<Tag className="h-4 w-4" />}
                    label="Category"
                    value={categoryLabel(lead.category)}
                  />
                  <SpecRow
                    icon={<IndianRupee className="h-4 w-4" />}
                    label="Budget range"
                    value={
                      lead.budgetMin || lead.budgetMax
                        ? `${formatINR(lead.budgetMin)} – ${formatINR(lead.budgetMax)}`
                        : "Flexible / not specified"
                    }
                  />
                  {lead.timeline && (
                    <SpecRow
                      icon={<Clock className="h-4 w-4" />}
                      label="Timeline"
                      value={lead.timeline}
                    />
                  )}
                </div>
                {lead.notes && (
                  <>
                    <Separator className="my-3" />
                    <div className="flex items-start gap-3 pt-1">
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                        <StickyNote className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                          Additional notes
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-700">{lead.notes}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: quote form (sticky on desktop) ──────────────── */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card className="border-[#D4AF37]/25 shadow-md">
              <CardHeader className="border-b border-[#D4AF37]/15 pb-4 pt-6">
                <CardTitle className="font-serif text-2xl text-[#1A1A1A]">
                  Submit your quote
                </CardTitle>
                <p className="mt-1 text-sm text-neutral-500">
                  Itemise your offer — the buyer sees it the moment you submit.
                </p>
                {/* Quick-reference badges */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {scraped?.goldWeight && (
                    <Badge variant="outline" className="border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[#8a6d1c]">
                      Ref gold: {scraped.goldWeight}
                    </Badge>
                  )}
                  {scraped?.diamondWeight && (
                    <Badge variant="outline" className="border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[#8a6d1c]">
                      Ref diamond: {scraped.diamondWeight}
                    </Badge>
                  )}
                  {(lead.budgetMin || lead.budgetMax) && (
                    <Badge variant="outline" className="border-neutral-300 text-neutral-600">
                      Budget: {formatINR(lead.budgetMin)} – {formatINR(lead.budgetMax)}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <QuoteForm
                  requestId={lead.id}
                  alreadyQuoted={lead.alreadyQuoted}
                  isClosed={lead.status === "closed"}
                  onSuccess={() => navigate("/jeweller")}
                  scraped={scraped}
                  myQuote={(lead as any).myQuote}
                  myThreadId={(lead as any).myThreadId}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
