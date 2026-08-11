import AppShell from "@/components/AppShell";
import { StatusBadge, formatINR } from "@/components/Brand";
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
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { proxiedImageUrl } from "@/lib/imageProxy";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
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
  /** all extracted product images (re-hosted), up to 5 */
  imageUrls?: string[];
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
  return (
    <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#8a6d1c]">
          <CheckCircle2 className="h-4 w-4" />
          Reference captured
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

      <div className="mt-2 flex items-center gap-3">
        {(data.imageUrl || data.imageBase64) && (
          <img
            src={data.imageBase64
              ? `data:${data.imageMimeType ?? 'image/jpeg'};base64,${data.imageBase64}`
              : proxiedImageUrl(data.imageUrl!)}
            alt="Extracted product"
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          {data.title && (
            <p className="line-clamp-1 text-xs font-medium text-[#1A1A1A]">{data.title}</p>
          )}
          <p className="text-xs text-neutral-500">
            We will use this URL and its photos as your product reference.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── NewRequestDialog ────────────────────────────────────────────────────────

function NewRequestDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadedImages, setUploadedImages] = useState<
    { base64: string; mimeType: string; preview: string }[]
  >([]);
  const [approximateBudget, setApproximateBudget] = useState("");
  const [specifications, setSpecifications] = useState("");
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
    setImageUrl("");
    setUploadedImages([]);
    setApproximateBudget("");
    setSpecifications("");
    setScraped(null);
    setScrapeError(null);
    if (scrapeTimerRef.current) clearTimeout(scrapeTimerRef.current);
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const available = 5 - uploadedImages.length;
    if (available <= 0) return toast.error("You can add up to 5 reference photos");
    const selected = Array.from(files).slice(0, available);
    if (files.length > available) toast.message(`Only the first ${available} additional photos were added`);
    selected.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is over 5 MB and was skipped`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setUploadedImages(previous => [
          ...previous,
          {
            base64: dataUrl.split(",")[1],
            mimeType: file.type || "image/jpeg",
            preview: dataUrl,
          },
        ].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
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
    const hasUploadedImages = uploadedImages.length > 0;
    const hasUrl = imageUrl.trim().length > 0;
    if (!hasUploadedImages && !hasUrl) {
      return toast.error("Add a product URL or at least one reference photo");
    }
    const budget = Number(approximateBudget.replace(/[^\d]/g, ""));
    if (!budget || budget < 1) {
      return toast.error("Add an approximate budget in rupees");
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
      imageUrl: finalImageUrl,
      imageUrls:
        imageMode === "url" && scraped?.imageUrls && scraped.imageUrls.length > 0
          ? scraped.imageUrls.slice(0, 5)
          : undefined,
      imageBase64s:
        imageMode === "upload" && !scrapedHasBase64
          ? uploadedImages.map(image => image.base64)
          : undefined,
      imageMimeTypes:
        imageMode === "upload" && !scrapedHasBase64
          ? uploadedImages.map(image => image.mimeType)
          : undefined,
      imageBase64: scrapedHasBase64 ? scraped!.imageBase64 : undefined,
      imageMimeType: scrapedHasBase64 ? (scraped!.imageMimeType ?? "image/jpeg") : undefined,
      budgetMin: budget,
      budgetMax: budget,
      notes: specifications.trim() || undefined,
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
          {/* 1. Product reference */}
          <div className="space-y-2">
            <Label>1. Product reference</Label>
            <p className="text-xs text-neutral-500">
              Paste a product URL or add up to 5 photos. We will extract the details we can.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={imageMode === "upload" ? "default" : "outline"}
                onClick={() => { setImageMode("upload"); setScraped(null); setScrapeError(null); }}
              >
                <Upload className="h-3.5 w-3.5" /> Add photos
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
                className="cursor-pointer rounded-lg border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 p-4 text-center transition-colors hover:bg-[#D4AF37]/10"
                onClick={() => fileRef.current?.click()}
              >
                {uploadedImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {uploadedImages.map((image, index) => (
                      <div key={`${image.preview}-${index}`} className="group relative aspect-square overflow-hidden rounded-md bg-white">
                        <img src={image.preview} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          aria-label={`Remove reference photo ${index + 1}`}
                          onClick={event => {
                            event.stopPropagation();
                            setUploadedImages(previous => previous.filter((_, i) => i !== index));
                          }}
                          className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {uploadedImages.length < 5 && (
                      <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-[#D4AF37]/50 text-[#8a6d1c]">
                        <Plus className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <ImagePlus className="mb-2 h-8 w-8 text-[#D4AF37]" strokeWidth={1.5} />
                    <p className="text-sm text-neutral-600">Click to add jewellery photos</p>
                    <p className="text-xs text-neutral-400">Up to 5 JPG, PNG or WEBP images, 5 MB each</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    handleFiles(e.target.files);
                    e.target.value = "";
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
                      <p className="text-amber-700">You can still submit — add any details you know in the specifications field below.</p>
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

          {/* 2. Budget */}
          <div className="space-y-2">
            <Label htmlFor="approximateBudget">2. Approximate budget (₹)</Label>
            <Input
              id="approximateBudget"
              type="text"
              inputMode="numeric"
              required
              placeholder="e.g. 75,000"
              value={approximateBudget}
              onChange={e => setApproximateBudget(e.target.value)}
            />
            <p className="text-xs text-neutral-500">An estimate is enough — it helps jewellers quote realistically.</p>
          </div>

          {/* 3. Specifications */}
          <div className="space-y-2">
            <Label htmlFor="specifications">3. Specifications <span className="font-normal text-neutral-400">(optional)</span></Label>
            <Textarea
              id="specifications"
              rows={3}
              maxLength={2000}
              placeholder="e.g. 18KT yellow gold, lab-grown diamond, ring size 12, around 5g"
              value={specifications}
              onChange={e => setSpecifications(e.target.value)}
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
    "request-updated": () => {
      // Background scrape attached images to a request — refresh the listing
      utils.requests.mine.invalidate();
    },
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
            const galleryUrls: string[] = (() => {
              try {
                const arr = r.imageUrls ? JSON.parse(r.imageUrls) : [];
                return Array.isArray(arr) ? arr.slice(0, 5) : [];
              } catch { return []; }
            })();
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
                  {galleryUrls.length > 1 && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                      <div className="flex gap-1">
                        {galleryUrls.slice(1, 4).map((img, i) => (
                          <img
                            key={img}
                            src={proxiedImageUrl(img)}
                            alt={`${r.title} ${i + 2}`}
                            className="h-9 w-9 rounded-md border border-white/70 object-cover shadow-sm"
                            onError={e => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ))}
                      </div>
                      <div className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {galleryUrls.length} photos
                      </div>
                    </div>
                  )}
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
                        ? r.budgetMin && r.budgetMax && r.budgetMin === r.budgetMax
                          ? `Approx. ${formatINR(r.budgetMax)}`
                          : `Approx. ${formatINR(r.budgetMin)} – ${formatINR(r.budgetMax)}`
                        : "Budget flexible"}
                    </p>
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
