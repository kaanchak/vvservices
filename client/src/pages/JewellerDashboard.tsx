import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { proxiedImageUrl } from "@/lib/imageProxy";
import { trpc } from "@/lib/trpc";
import { categoryLabel } from "@shared/categories";
import { CheckCircle2, Clock, Gem, ImagePlus, IndianRupee, TrendingUp, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export const jewellerNav = [
  { href: "/jeweller", label: "Lead Feed" },
  { href: "/jeweller/quotes", label: "My Quotes" },
  { href: "/jeweller/chats", label: "Chats" },
];

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
  sourceUrl: string;
}

type Lead = {
  id: number;
  title: string;
  category: string;
  imageUrl: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  notes: string | null;
  scrapedDetails: string | null;
  status: string;
  createdAt: Date;
  buyerName: string | null;
  alreadyQuoted: boolean;
};

const DIALOG_DIAMOND_RATE = 50000;
type GoldPurity = "9kt" | "14kt" | "18kt";

function QuoteDialog({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  // Live gold price from API
  const { data: goldPriceData } = trpc.goldPrice.current.useQuery();

  // Purity state
  const [purity, setPurity] = useState<GoldPurity>("18kt");

  // Auto-fill from scraped details
  const scraped = useMemo(() => {
    if (!lead?.scrapedDetails) return null;
    try { return JSON.parse(lead.scrapedDetails); } catch { return null; }
  }, [lead?.scrapedDetails]);

  const scrapedGoldWeight = scraped?.goldWeight ? parseFloat(scraped.goldWeight) : undefined;
  const scrapedDiamondWeight = scraped?.diamondWeight ? parseFloat(scraped.diamondWeight) : undefined;

  const [goldWeight, setGoldWeight] = useState("");
  const [diamondWeight, setDiamondWeight] = useState("");
  const [makingCharges, setMakingCharges] = useState("");
  const [diamondRate, setDiamondRate] = useState(String(DIALOG_DIAMOND_RATE));
  const [message, setMessage] = useState("");

  // Compute live gold rate from API based on purity
  const liveGoldRate = goldPriceData
    ? (purity === "9kt" ? goldPriceData.pricePerGram9kt : purity === "14kt" ? goldPriceData.pricePerGram14kt : goldPriceData.pricePerGram18kt)
    : null;

  // Effective gold weight: user input or scraped fallback
  const effectiveGoldWeight = goldWeight || (scrapedGoldWeight ? String(scrapedGoldWeight) : "");
  const effectiveDiamondWeight = diamondWeight || (scrapedDiamondWeight ? String(scrapedDiamondWeight) : "");

  const goldCost = (parseFloat(effectiveGoldWeight) || 0) * (liveGoldRate || 0);
  const diamondCost = (parseFloat(effectiveDiamondWeight) || 0) * (parseFloat(diamondRate) || DIALOG_DIAMOND_RATE);
  const makingCost = parseInt(makingCharges) || 0;
  const totalPrice = Math.round(goldCost + diamondCost + makingCost);

  const create = trpc.quotes.create.useMutation({
    onSuccess: () => {
      toast.success("Quote sent! The buyer sees it instantly.");
      utils.requests.leads.invalidate();
      utils.quotes.mine.invalidate();
      onClose();
      setGoldWeight("");
      setDiamondWeight("");
      setMakingCharges("");
      setDiamondRate(String(DIALOG_DIAMOND_RATE));
      setMessage("");
      setPurity("18kt");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={!!lead} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Send a quote</DialogTitle>
          <DialogDescription>
            {lead ? `For "${lead.title}" — itemise your offer below.` : ""}
          </DialogDescription>
        </DialogHeader>
        {lead && (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (!totalPrice || totalPrice <= 0) return toast.error("Total price must be greater than zero");
              create.mutate({
                requestId: lead.id,
                goldWeightGrams: effectiveGoldWeight ? parseFloat(effectiveGoldWeight) : undefined,
                diamondWeightCarats: effectiveDiamondWeight ? parseFloat(effectiveDiamondWeight) : undefined,
                makingCharges: makingCharges ? parseInt(makingCharges) : undefined,
                totalPrice,
                message: message || undefined,
                goldPurity: purity,
                goldPricePerGram: liveGoldRate ?? undefined,
              });
            }}
          >
            {/* Live gold price banner */}
            {goldPriceData && (
              <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/8 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">Live gold rate (today)</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["9kt", "14kt", "18kt"] as GoldPurity[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPurity(p)}
                      className={`rounded-lg border py-2 text-xs font-semibold transition-all ${
                        purity === p
                          ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#8a6d1c]"
                          : "border-[#D4AF37]/20 bg-white text-neutral-600 hover:border-[#D4AF37]/50"
                      }`}
                    >
                      <div className="font-bold uppercase">{p}</div>
                      <div className="text-[10px]">
                        ₹{(p === "9kt" ? goldPriceData.pricePerGram9kt : p === "14kt" ? goldPriceData.pricePerGram14kt : goldPriceData.pricePerGram18kt).toLocaleString("en-IN")}/g
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Auto-fill notice */}
            {(scrapedGoldWeight || scrapedDiamondWeight) && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <span className="font-semibold">Auto-filled from listing:</span>{" "}
                {scrapedGoldWeight && `Gold ${scrapedGoldWeight}g`}
                {scrapedGoldWeight && scrapedDiamondWeight && " · "}
                {scrapedDiamondWeight && `Diamond ${scrapedDiamondWeight}ct`}
                {" — edit below to override"}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goldWeight">Gold weight (grams)</Label>
                <Input
                  id="goldWeight"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={scrapedGoldWeight ? String(scrapedGoldWeight) : "e.g. 45.5"}
                  value={goldWeight}
                  onChange={e => setGoldWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diamondWeight">Diamond weight (carats)</Label>
                <Input
                  id="diamondWeight"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={scrapedDiamondWeight ? String(scrapedDiamondWeight) : "e.g. 1.25"}
                  value={diamondWeight}
                  onChange={e => setDiamondWeight(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="makingCharges">Making charges (₹)</Label>
                <Input id="makingCharges" type="number" min={0} placeholder="e.g. 15,000" value={makingCharges} onChange={e => setMakingCharges(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dDiamondRate" className="text-xs text-neutral-600">Diamond rate / carat (₹)</Label>
                <Input id="dDiamondRate" type="number" min={1} value={diamondRate} onChange={e => setDiamondRate(e.target.value)} className="h-10 text-sm" />
              </div>
            </div>
            {/* Auto-calculated total */}
            <div className="rounded-xl border border-[#D4AF37]/40 bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">Price breakdown</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-neutral-600">
                  <span>Gold ({effectiveGoldWeight || "0"} g × ₹{(liveGoldRate ?? 0).toLocaleString("en-IN")} [{purity.toUpperCase()}])</span>
                  <span>₹{goldCost.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Diamond ({effectiveDiamondWeight || "0"} ct × ₹{Number(diamondRate).toLocaleString("en-IN")})</span>
                  <span>₹{diamondCost.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Making charges</span>
                  <span>₹{makingCost.toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-[#D4AF37]/30 pt-1.5 font-bold text-[#1A1A1A]">
                  <span>Total</span>
                  <span className="text-[#8a6d1c]">₹{totalPrice.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message to buyer</Label>
              <Textarea id="message" rows={3} maxLength={2000} placeholder="Certifications, delivery time, what's included…" value={message} onChange={e => setMessage(e.target.value)} />
            </div>
            <Button type="submit" disabled={create.isPending} className="w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90">
              {create.isPending ? "Sending…" : "Send quote"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function JewellerDashboard() {
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const [quotingLead, setQuotingLead] = useState<Lead | null>(null);

  const { data: goldPriceData } = trpc.goldPrice.current.useQuery();

  const { data: leads, isLoading } = trpc.requests.leads.useQuery(undefined, {
    enabled: !!account,
  });

  const categories = useMemo(
    () => (account?.categories ? account.categories.split(",") : []),
    [account?.categories]
  );

  useSocket(
    {
      "new-request": payload => {
        toast.success(
          `New lead: "${payload?.title}" (${categoryLabel(payload?.category)})`,
          { duration: 6000 }
        );
        utils.requests.leads.invalidate();
      },
      "quote-status": payload => {
        toast.info(
          payload?.status === "accepted"
            ? `🎉 Your quote for "${payload?.requestTitle}" was ACCEPTED!`
            : `Your quote for "${payload?.requestTitle}" was dismissed.`,
          { duration: 8000 }
        );
        utils.quotes.mine.invalidate();
      },
    },
    { categories }
  );

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Lead Feed</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Live buyer requests in your categories:{" "}
          <span className="font-medium text-[#8a6d1c]">
            {categories.map(categoryLabel).join(", ") || "—"}
          </span>
        </p>
        {/* Live gold price banner */}
        {goldPriceData && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/8 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8a6d1c]">
              <TrendingUp className="h-3.5 w-3.5" />
              Today’s Gold Rate
            </div>
            {([
              { label: "24KT", value: goldPriceData.pricePerGram24kt },
              { label: "18KT", value: goldPriceData.pricePerGram18kt },
              { label: "14KT", value: goldPriceData.pricePerGram14kt },
              { label: "9KT", value: goldPriceData.pricePerGram9kt },
            ] as { label: string; value: number }[]).map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1 text-xs">
                <span className="rounded bg-[#D4AF37]/20 px-1.5 py-0.5 font-bold text-[#8a6d1c]">{label}</span>
                <span className="font-medium text-[#1A1A1A]">₹{value.toLocaleString("en-IN")}/g</span>
              </div>
            ))}
            <span className="ml-auto text-[10px] text-neutral-400">
              Updated {new Date(goldPriceData.fetchedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !leads || leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
          <Gem className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
          <h2 className="text-xl font-semibold">No leads yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            New buyer requests matching your categories will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map(lead => (
            <Link
              key={lead.id}
              href={`/jeweller/leads/${lead.id}`}
              className="luxury-shadow group flex flex-col overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-white transition-transform duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/40"
            >
              <div className="relative h-44 overflow-hidden bg-neutral-100">
                {lead.imageUrl ? (
                  <img
                    src={proxiedImageUrl(lead.imageUrl)}
                    alt={lead.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-300">
                    <ImagePlus className="h-10 w-10" strokeWidth={1.2} />
                  </div>
                )}
                <div className="absolute left-3 top-3 flex gap-2">
                  <CategoryBadge category={lead.category} />
                </div>
                <div className="absolute right-3 top-3">
                  <StatusBadge status={lead.status} />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-1 font-semibold">{lead.title}</h3>
                <div className="mt-3 space-y-1.5 text-sm text-neutral-500">
                  <p className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-[#D4AF37]" />
                    {lead.buyerName ?? "Buyer"}
                  </p>
                  <p className="flex items-center gap-2">
                    <IndianRupee className="h-3.5 w-3.5 text-[#D4AF37]" />
                    {lead.budgetMin || lead.budgetMax
                      ? `${formatINR(lead.budgetMin)} – ${formatINR(lead.budgetMax)}`
                      : "Budget flexible"}
                  </p>
                  {lead.timeline && (
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[#D4AF37]" />
                      {lead.timeline}
                    </p>
                  )}
                </div>
                {lead.notes && (
                  <p className="mt-3 line-clamp-2 rounded-lg bg-[#faf9f6] p-2.5 text-xs leading-relaxed text-neutral-600">
                    {lead.notes}
                  </p>
                )}

                {/* Scraped product details — enhanced card display */}
                {(() => {
                  const scraped: ScrapedProduct | null = lead.scrapedDetails
                    ? (() => { try { return JSON.parse(lead.scrapedDetails); } catch { return null; } })()
                    : null;
                  if (!scraped) return null;
                  const specs = [
                    scraped.metalType && { label: "Metal", value: scraped.metalType },
                    scraped.goldWeight && { label: "Gold", value: scraped.goldWeight },
                    scraped.diamondWeight && { label: "Diamond", value: scraped.diamondWeight },
                    scraped.stoneType && { label: "Stone", value: scraped.stoneType },
                    scraped.price && {
                      label: "Listed price",
                      value: `${scraped.currency && scraped.currency !== "INR" ? scraped.currency + " " : "₹"}${scraped.price}`,
                    },
                  ].filter(Boolean) as { label: string; value: string }[];
                  if (specs.length === 0 && !scraped.description) return null;
                  return (
                    <div className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/8 to-[#D4AF37]/3 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8a6d1c]">
                        <Gem className="h-3 w-3" /> Extracted specs
                      </p>
                      {specs.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {specs.map(s => (
                            <div key={s.label}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">{s.label}</p>
                              <p className="text-xs font-semibold text-[#1A1A1A]">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {scraped.description && (
                        <p className="mt-2 line-clamp-2 border-t border-[#D4AF37]/20 pt-2 text-[11px] leading-relaxed text-neutral-600">
                          {scraped.description}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-auto pt-4">
                  {lead.alreadyQuoted ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 py-2 text-sm font-medium text-green-700">
                      <CheckCircle2 className="h-4 w-4" /> Quote submitted
                    </div>
                  ) : lead.status === "closed" ? (
                    <div className="flex w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 py-2 text-sm text-neutral-500">
                      Request closed
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={e => { e.preventDefault(); setQuotingLead(lead); }}
                      >
                        Quick quote
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-gold-gradient text-xs font-semibold text-[#1A1A1A] hover:opacity-90"
                      >
                        View details →
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <QuoteDialog lead={quotingLead} onClose={() => setQuotingLead(null)} />
    </AppShell>
  );
}
