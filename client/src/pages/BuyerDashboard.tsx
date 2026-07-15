import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { CATEGORIES, TIMELINES, type CategorySlug } from "@shared/categories";
import { Clock, ImagePlus, IndianRupee, Link2, Plus, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export const buyerNav = [
  { href: "/app", label: "My Requests" },
  { href: "/app/quotes", label: "Quotes" },
];

function NewRequestDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategorySlug | "">("");
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [timeline, setTimeline] = useState("");
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const create = trpc.requests.create.useMutation({
    onSuccess: () => {
      toast.success("Request submitted! Jewellers are being notified now.");
      utils.requests.mine.invalidate();
      setOpen(false);
      // reset
      setTitle("");
      setCategory("");
      setImageUrl("");
      setImageBase64(null);
      setImagePreview(null);
      setBudgetMin("");
      setBudgetMax("");
      setTimeline("");
      setNotes("");
    },
    onError: e => toast.error(e.message),
  });

  const handleFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("Image must be under 5 MB");
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageBase64(dataUrl.split(",")[1]);
      setImageMimeType(file.type);
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90">
          <Plus className="h-4 w-4" />
          New request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Submit a jewellery request</DialogTitle>
          <DialogDescription>
            Share the design you love and jewellers will quote in real time.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!category) return toast.error("Please select a category");
            if (!imageBase64 && !imageUrl) {
              return toast.error("Please upload an image or paste an image URL");
            }
            const min = budgetMin ? parseInt(budgetMin) : undefined;
            const max = budgetMax ? parseInt(budgetMax) : undefined;
            if (min && max && min > max) {
              return toast.error("Minimum budget cannot exceed maximum");
            }
            create.mutate({
              title,
              category,
              imageUrl: imageMode === "url" && imageUrl ? imageUrl : undefined,
              imageBase64: imageMode === "upload" && imageBase64 ? imageBase64 : undefined,
              imageMimeType: imageMimeType ?? undefined,
              budgetMin: min,
              budgetMax: max,
              timeline: timeline || undefined,
              notes: notes || undefined,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="title">What do you want made?</Label>
            <Input
              id="title"
              required
              maxLength={191}
              placeholder="e.g. 22K gold bridal necklace set"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={v => setCategory(v as CategorySlug)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference image</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={imageMode === "upload" ? "default" : "outline"}
                onClick={() => setImageMode("upload")}
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </Button>
              <Button
                type="button"
                size="sm"
                variant={imageMode === "url" ? "default" : "outline"}
                onClick={() => setImageMode("url")}
              >
                <Link2 className="h-3.5 w-3.5" /> Paste URL
              </Button>
            </div>
            {imageMode === "upload" ? (
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 p-6 text-center transition-colors hover:bg-[#D4AF37]/10"
                onClick={() => fileRef.current?.click()}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-40 rounded-md object-contain"
                  />
                ) : (
                  <>
                    <ImagePlus className="mb-2 h-8 w-8 text-[#D4AF37]" strokeWidth={1.5} />
                    <p className="text-sm text-neutral-600">
                      Click to upload a jewellery photo
                    </p>
                    <p className="text-xs text-neutral-400">JPG or PNG, up to 5 MB</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            ) : (
              <Input
                type="url"
                placeholder="https://example.com/jewellery.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budgetMin">Budget min (₹)</Label>
              <Input
                id="budgetMin"
                type="number"
                min={0}
                placeholder="50,000"
                value={budgetMin}
                onChange={e => setBudgetMin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetMax">Budget max (₹)</Label>
              <Input
                id="budgetMax"
                type="number"
                min={0}
                placeholder="1,00,000"
                value={budgetMax}
                onChange={e => setBudgetMax(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timeline</Label>
            <Select value={timeline} onValueChange={setTimeline}>
              <SelectTrigger>
                <SelectValue placeholder="When do you need it?" />
              </SelectTrigger>
              <SelectContent>
                {TIMELINES.map(t => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for jewellers</Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={2000}
              placeholder="Weight, purity, size, stone preferences…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={create.isPending}
            className="w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
          >
            {create.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BuyerDashboard() {
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const { data: requests, isLoading } = trpc.requests.mine.useQuery(undefined, {
    enabled: !!account,
  });

  useSocket({
    "new-quote": payload => {
      toast.success(
        `New quote received: ${formatINR(payload?.totalPrice)} from ${payload?.businessName || payload?.jewellerName || "a jeweller"}`,
        { duration: 6000 }
      );
      utils.requests.mine.invalidate();
      utils.quotes.forBuyer.invalidate();
      if (payload?.requestId) {
        utils.quotes.forRequest.invalidate({ requestId: payload.requestId });
      }
    },
  });

  return (
    <AppShell nav={buyerNav} requiredRole="buyer" loginPath="/login">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold">My Requests</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Submit designs and watch quotes arrive in real time
          </p>
        </div>
        <NewRequestDialog />
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !requests || requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
          <h2 className="text-xl font-semibold">No requests yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Upload a photo of jewellery you love and verified manufacturers will send
            you quotes.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map(r => (
            <Link
              key={r.id}
              href={`/app/requests/${r.id}`}
              className="luxury-shadow group overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-white transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="relative h-44 overflow-hidden bg-neutral-100">
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={r.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-300">
                    <ImagePlus className="h-10 w-10" strokeWidth={1.2} />
                  </div>
                )}
                <div className="absolute left-3 top-3">
                  <CategoryBadge category={r.category} />
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-semibold">{r.title}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-neutral-500">
                  <p className="flex items-center gap-2">
                    <IndianRupee className="h-3.5 w-3.5 text-[#D4AF37]" />
                    {r.budgetMin || r.budgetMax
                      ? `${formatINR(r.budgetMin)} – ${formatINR(r.budgetMax)}`
                      : "Budget flexible"}
                  </p>
                  {r.timeline && (
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[#D4AF37]" />
                      {r.timeline}
                    </p>
                  )}
                </div>
                <div className="mt-4 border-t border-border pt-3 text-sm font-medium text-[#8a6d1c]">
                  {r.quoteCount === 0
                    ? "Awaiting quotes…"
                    : `${r.quoteCount} quote${r.quoteCount > 1 ? "s" : ""} received →`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
