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
import { trpc } from "@/lib/trpc";
import { categoryLabel } from "@shared/categories";
import { Clock, Gem, ImagePlus, IndianRupee, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const jewellerNav = [
  { href: "/jeweller", label: "Lead Feed" },
  { href: "/jeweller/quotes", label: "My Quotes" },
];

type Lead = {
  id: number;
  title: string;
  category: string;
  imageUrl: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  buyerName: string | null;
  alreadyQuoted: boolean;
};

function QuoteDialog({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [goldWeight, setGoldWeight] = useState("");
  const [diamondWeight, setDiamondWeight] = useState("");
  const [makingCharges, setMakingCharges] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [message, setMessage] = useState("");

  const create = trpc.quotes.create.useMutation({
    onSuccess: () => {
      toast.success("Quote sent! The buyer sees it instantly.");
      utils.requests.leads.invalidate();
      utils.quotes.mine.invalidate();
      onClose();
      setGoldWeight("");
      setDiamondWeight("");
      setMakingCharges("");
      setTotalPrice("");
      setMessage("");
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
              const total = parseInt(totalPrice);
              if (!total || total <= 0) {
                return toast.error("Please enter the total price");
              }
              create.mutate({
                requestId: lead.id,
                goldWeightGrams: goldWeight ? parseFloat(goldWeight) : undefined,
                diamondWeightCarats: diamondWeight
                  ? parseFloat(diamondWeight)
                  : undefined,
                makingCharges: makingCharges ? parseInt(makingCharges) : undefined,
                totalPrice: total,
                message: message || undefined,
              });
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goldWeight">Gold weight (grams)</Label>
                <Input
                  id="goldWeight"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="e.g. 45.5"
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
                  placeholder="e.g. 1.25"
                  value={diamondWeight}
                  onChange={e => setDiamondWeight(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="makingCharges">Making charges (₹)</Label>
                <Input
                  id="makingCharges"
                  type="number"
                  min={0}
                  placeholder="e.g. 15,000"
                  value={makingCharges}
                  onChange={e => setMakingCharges(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalPrice">Total price (₹) *</Label>
                <Input
                  id="totalPrice"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 1,85,000"
                  value={totalPrice}
                  onChange={e => setTotalPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message to buyer</Label>
              <Textarea
                id="message"
                rows={3}
                maxLength={2000}
                placeholder="Certifications, delivery time, what's included…"
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={create.isPending}
              className="w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
            >
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
            <div
              key={lead.id}
              className="luxury-shadow flex flex-col overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-white"
            >
              <div className="relative h-44 overflow-hidden bg-neutral-100">
                {lead.imageUrl ? (
                  <img
                    src={lead.imageUrl}
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
                <div className="mt-auto pt-4">
                  {lead.alreadyQuoted ? (
                    <Button variant="outline" className="w-full" disabled>
                      Quote submitted ✓
                    </Button>
                  ) : lead.status === "closed" ? (
                    <Button variant="outline" className="w-full" disabled>
                      Request closed
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                      onClick={() => setQuotingLead(lead)}
                    >
                      Send a quote
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <QuoteDialog lead={quotingLead} onClose={() => setQuotingLead(null)} />
    </AppShell>
  );
}
