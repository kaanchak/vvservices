import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
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
import { proxiedImageUrl } from "@/lib/imageProxy";
import { trpc } from "@/lib/trpc";
import { CATEGORIES, TIMELINES, type CategorySlug } from "@shared/categories";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Gem,
  ImagePlus,
  IndianRupee,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export const buyerNav = [
  { href: "/app", label: "My Requests" },
  { href: "/app/quotes", label: "Quotes" },
  { href: "/app/chats", label: "Chats" },
];

// ─── types ──────────────────────────────────────────────────────────────────

interface ScrapedProduct {
  imageUrl?: string;
  /** base64-encoded image bytes when storagePut failed server-side */
  imageBase64?: string;
  /** MIME type for imageBase64 */
  imageMimeType?: string;
  title?: string;
  description?: string;
  price?: string;
  currency?: string;
  goldWeight?: string;
  diamondWeight?: string;
  metalType?: string;
  stoneType?: string;
  sourceUrl: string;
  /** true when the site blocked the scraper */
  blocked?: boolean;
  /** human-readable reason shown to the user */
  blockedReason?: string;
}

// ─── ScrapedPreview panel ────────────────────────────────────────────────────

function ScrapedPreview({
  data,
  onClear,
}: {
  data: ScrapedProduct;
  onClear: () => void;
}) {
  const fields: { label: string; value?: string }[] = [
    { label: "Description", value: data.description },
    { label: "Price", value: data.price ? `${data.currency ?? ""}${data.price}`.trim() : undefined },
    { label: "Metal type", value: data.metalType },
    { label: "Gold weight", value: data.goldWeight },
    { label: "Diamond weight", value: data.diamondWeight },
    { label: "Stone type", value: data.stoneType },
  ].filter(f => f.value);

  return (
    <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[#8a6d1c]">
          <CheckCircle2 className="h-4 w-4" />
          Product details extracted
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-neutral-400 hover:text-neutral-600"
          aria-label="Clear scraped data"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-4">
        {(data.imageUrl || data.imageBase64) && (
          <img
            src={data.imageBase64
              ? `data:${data.imageMimeType ?? 'image/jpeg'};base64,${data.imageBase64}`
              : proxiedImageUrl(data.imageUrl!)}
            alt="Extracted product"
            className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          {data.title && (
            <p className="line-clamp-2 text-sm font-semibold text-[#1A1A1A]">{data.title}</p>
          )}
          {fields.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {fields.map(f => (
                <Badge
                  key={f.label}
                  variant="outline"
                  className="border-[#D4AF37]/40 bg-white text-xs text-neutral-700"
                >
                  <span className="font-medium text-[#8a6d1c]">{f.label}:</span>&nbsp;
                  {f.value}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Image extracted. No additional product details found on this page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── NewRequestDialog ────────────────────────────────────────────────────────

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
  const [scraped, setScraped] = useState<ScrapedProduct | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrapeUrl = trpc.scraper.scrapeUrl.useMutation({
    onSuccess: data => {
      if (data.blocked) {
        // Site blocked scraper — show graceful fallback, don't store as scraped
        setScrapeError(data.blockedReason ?? "Auto-extraction wasn't possible for this site. You can still submit your request manually.");
        setScraped(null);
      } else {
        setScraped(data as ScrapedProduct);
        setScrapeError(null);
        // Auto-fill title if empty
        if (!title && data.title) setTitle(data.title.slice(0, 191));
      }
    },
    onError: e => {
      setScrapeError(e.message);
      setScraped(null);
    },
  });

  const create = trpc.requests.create.useMutation({
    onSuccess: () => {
      toast.success("Request submitted! Jewellers are being notified now.");
      utils.requests.mine.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  function resetForm() {
    setTitle("");
    setCategory("");
    setImageUrl("");
    setImageBase64(null);
    setImagePreview(null);
    setImageMimeType(null);
    setBudgetMin("");
    setBudgetMax("");
    setTimeline("");
    setNotes("");
    setScraped(null);
    setScrapeError(null);
    if (scrapeTimerRef.current) clearTimeout(scrapeTimerRef.current);
  }

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

  // Debounced scrape on URL input change
  const handleUrlChange = (val: string) => {
    setImageUrl(val);
    setScraped(null);
    setScrapeError(null);
    if (scrapeTimerRef.current) clearTimeout(scrapeTimerRef.current);
    const trimmed = val.trim();
    if (!trimmed) return;
    // Only trigger if it looks like a full URL (has scheme + host)
    try {
      const u = new URL(trimmed);
      if (!["http:", "https:"].includes(u.protocol)) return;
    } catch {
      return;
    }
    scrapeTimerRef.current = setTimeout(() => {
      scrapeUrl.mutate({ url: trimmed });
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    // Use scraped image if available and no upload.
    // If the server returned imageBase64 (storagePut failed server-side), use that
    // as the upload so the existing working imageBase64 → storagePut path handles it.
    const scrapedHasBase64 = imageMode === "url" && !!scraped?.imageBase64;
    const finalImageUrl =
      imageMode === "url" && imageUrl && !scrapedHasBase64
        ? (scraped?.imageUrl ?? imageUrl)
        : undefined;

    create.mutate({
      title,
      category,
      imageUrl: finalImageUrl,
      imageBase64: scrapedHasBase64
        ? scraped!.imageBase64
        : (imageMode === "upload" && imageBase64 ? imageBase64 : undefined),
      imageMimeType: scrapedHasBase64
        ? (scraped!.imageMimeType ?? "image/jpeg")
        : (imageMimeType ?? undefined),
      budgetMin: min,
      budgetMax: max,
      timeline: timeline || undefined,
      notes: notes || undefined,
      scrapedDetails: scraped ? JSON.stringify(scraped) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
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
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Title */}
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

          {/* Category */}
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

          {/* Image */}
          <div className="space-y-2">
            <Label>Reference image</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={imageMode === "upload" ? "default" : "outline"}
                onClick={() => { setImageMode("upload"); setScraped(null); setScrapeError(null); }}
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
                    <p className="text-sm text-neutral-600">Click to upload a jewellery photo</p>
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
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    type="url"
                    placeholder="https://example.com/jewellery-product"
                    value={imageUrl}
                    onChange={e => handleUrlChange(e.target.value)}
                    className="pr-10"
                  />
                  {scrapeUrl.isPending && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#D4AF37]" />
                  )}
                </div>

                {/* Scraping status */}
                {scrapeUrl.isPending && (
                  <p className="flex items-center gap-2 text-xs text-neutral-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting product details from page…
                  </p>
                )}

                {scrapeError && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    <div className="space-y-1">
                      <p className="font-medium">Auto-extraction not available</p>
                      <p>{scrapeError}</p>
                      <p className="text-amber-700">You can still submit your request — add any details you know in the notes field below.</p>
                    </div>
                  </div>
                )}

                {scraped && (
                  <ScrapedPreview
                    data={scraped}
                    onClear={() => { setScraped(null); setScrapeError(null); }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Budget */}
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

          {/* Timeline */}
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

          {/* Notes */}
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

// ─── BuyerDashboard ──────────────────────────────────────────────────────────

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
            Upload a photo of jewellery you love and verified manufacturers will send you quotes.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map(r => {
            const scraped: ScrapedProduct | null = r.scrapedDetails
              ? (() => { try { return JSON.parse(r.scrapedDetails!); } catch { return null; } })()
              : null;
            return (
              <Link
                key={r.id}
                href={`/app/requests/${r.id}`}
                className="luxury-shadow group overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-white transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="relative h-44 overflow-hidden bg-neutral-100">
                  {r.imageUrl ? (
                    <img
                      src={proxiedImageUrl(r.imageUrl)}
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
                  {scraped && (
                    <div className="absolute right-3 top-3">
                      <Badge className="border-0 bg-black/60 text-[10px] text-white backdrop-blur-sm">
                        <Gem className="mr-1 h-2.5 w-2.5" /> Details extracted
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 font-semibold">{r.title}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  {/* Scraped highlights */}
                  {scraped && (scraped.metalType || scraped.goldWeight || scraped.diamondWeight || scraped.stoneType) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {scraped.metalType && (
                        <span className="rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6d1c]">
                          {scraped.metalType}
                        </span>
                      )}
                      {scraped.goldWeight && (
                        <span className="rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6d1c]">
                          Gold {scraped.goldWeight}
                        </span>
                      )}
                      {scraped.diamondWeight && (
                        <span className="rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6d1c]">
                          Diamond {scraped.diamondWeight}
                        </span>
                      )}
                      {scraped.stoneType && (
                        <span className="rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6d1c]">
                          {scraped.stoneType}
                        </span>
                      )}
                    </div>
                  )}
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
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
