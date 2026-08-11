import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CATEGORIES, type CategorySlug } from "@shared/categories";
import {
  BadgeCheck,
  Building2,
  Clock,
  ExternalLink,
  Globe,
  ImagePlus,
  Info,
  Instagram,
  Loader2,
  MapPin,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { jewellerNav } from "./JewellerDashboard";

/** Read a File into a base64 payload the upload mutations expect. */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve({ base64: result.slice(comma + 1), mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({
  status,
  reviewNote,
  slug,
}: {
  status: string;
  reviewNote?: string | null;
  slug?: string | null;
}) {
  const config: Record<
    string,
    { icon: React.ReactNode; title: string; body: string; className: string }
  > = {
    draft: {
      icon: <Info className="h-5 w-5 text-neutral-500" />,
      title: "Profile not submitted",
      body: "Fill in your details, add a few photos of your work, then submit for review. Our team runs a verification check before your profile goes live.",
      className: "border-neutral-200 bg-neutral-50 text-neutral-700",
    },
    pending: {
      icon: <Clock className="h-5 w-5 text-amber-600" />,
      title: "Under review",
      body: "Your profile has been submitted. We are running our verification checks and will publish it once complete. You can keep editing meanwhile.",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    approved: {
      icon: <BadgeCheck className="h-5 w-5 text-emerald-600" />,
      title: "Your profile is live",
      body: "Buyers can find you in the directory and contact you directly.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    rejected: {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      title: "Changes needed",
      body: reviewNote || "Our team asked for changes before this profile can go live.",
      className: "border-red-200 bg-red-50 text-red-800",
    },
    suspended: {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      title: "Profile suspended",
      body: reviewNote || "This profile has been taken down. Please contact support.",
      className: "border-red-200 bg-red-50 text-red-800",
    },
  };
  const c = config[status] ?? config.draft;
  return (
    <div className={`rounded-xl border p-4 ${c.className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{c.icon}</div>
        <div className="min-w-0">
          <p className="font-semibold">{c.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed">{c.body}</p>
          {status === "rejected" && reviewNote && (
            <p className="mt-2 text-xs opacity-80">
              Once you have made the changes, submit for review again.
            </p>
          )}
          {status === "approved" && slug && (
            <a
              href={`/j/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2"
            >
              View public profile <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JewellerProfileEditor() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.jewellers.myProfile.useQuery();

  const [businessName, setBusinessName] = useState("");
  const [categories, setCategories] = useState<CategorySlug[]>([]);
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [about, setAbout] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  // Hydrate the form once, so typing is never clobbered by a refetch.
  useEffect(() => {
    if (!data || hydrated) return;
    setBusinessName(data.businessName ?? "");
    setCategories((data.categories ?? []) as CategorySlug[]);
    setCity(data.city ?? "");
    setAddress(data.address ?? "");
    setWebsite(data.website ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
    setAbout(data.about ?? "");
    setWhatsappNumber(data.whatsappNumber ?? "");
    setHydrated(true);
  }, [data, hydrated]);

  const save = trpc.jewellers.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      utils.jewellers.myProfile.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const uploadLogo = trpc.jewellers.uploadLogo.useMutation({
    onSuccess: () => {
      toast.success("Logo updated");
      utils.jewellers.myProfile.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const addImage = trpc.jewellers.addPortfolioImage.useMutation({
    onSuccess: () => {
      toast.success("Photo added to your portfolio");
      utils.jewellers.myProfile.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const removeImage = trpc.jewellers.deletePortfolioItem.useMutation({
    onSuccess: () => {
      toast.success("Photo removed");
      utils.jewellers.myProfile.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submitForReview = trpc.jewellers.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Submitted for review — we will verify and publish it shortly.");
      utils.jewellers.myProfile.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleLogoPick = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return toast.error("Please pick an image under 5 MB");
    const { base64, mimeType } = await fileToBase64(file);
    uploadLogo.mutate({ imageBase64: base64, mimeType });
  };

  const handlePortfolioPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 5 MB — skipped`);
        continue;
      }
      const { base64, mimeType } = await fileToBase64(file);
      addImage.mutate({ imageBase64: base64, mimeType });
    }
  };

  const toggleCategory = (slug: CategorySlug) => {
    setCategories(prev =>
      prev.includes(slug) ? prev.filter(c => c !== slug) : [...prev, slug]
    );
  };

  const uploaded = (data?.portfolio ?? []).filter(p => p.source === "uploaded");
  const quoted = (data?.portfolio ?? []).filter(p => p.source === "quoted");

  const canSubmit =
    !!businessName.trim() && categories.length > 0 && !!city.trim() && !!address.trim();
  const status = data?.profileStatus ?? "draft";

  return (
    <AppShell nav={jewellerNav} requiredRole="jeweller" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Public Profile</h1>
        <p className="mt-1 text-sm text-neutral-500">
          This is what buyers see when they browse the directory or open one of your quotes
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* ── Left: form ── */}
          <div className="space-y-6">
            <StatusBanner
              status={status}
              reviewNote={data?.profileReviewNote}
              slug={data?.profileSlug}
            />

            {/* Business details */}
            <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-semibold">
                <Building2 className="h-4 w-4 text-[#D4AF37]" /> Business details
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business name</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g. VV Jewellers"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Categories you work in</Label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => {
                      const active = categories.includes(c.slug);
                      return (
                        <button
                          key={c.slug}
                          type="button"
                          onClick={() => toggleCategory(c.slug)}
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                            active
                              ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#8a6d1c]"
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#D4AF37]" /> City
                    </Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Jaipur"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp" className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-[#D4AF37]" /> WhatsApp number
                    </Label>
                    <Input
                      id="whatsapp"
                      value={whatsappNumber}
                      onChange={e => setWhatsappNumber(e.target.value)}
                      placeholder="+919111130655"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Shop address</Label>
                  <Textarea
                    id="address"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Shop number, street, area, city, PIN"
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="website" className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-[#D4AF37]" /> Website
                    </Label>
                    <Input
                      id="website"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      placeholder="https://yourshop.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instagram" className="flex items-center gap-1.5">
                      <Instagram className="h-3.5 w-3.5 text-[#D4AF37]" /> Instagram
                    </Label>
                    <Input
                      id="instagram"
                      value={instagramUrl}
                      onChange={e => setInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/yourshop"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="about">About your business</Label>
                  <Textarea
                    id="about"
                    value={about}
                    onChange={e => setAbout(e.target.value)}
                    placeholder="Tell buyers about your craft, experience, and what you specialise in."
                    rows={4}
                    maxLength={2000}
                  />
                  <p className="text-xs text-neutral-400">{about.length}/2000</p>
                </div>

                <Button
                  className="bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      businessName: businessName.trim() || undefined,
                      categories,
                      city: city.trim(),
                      address: address.trim(),
                      website: website.trim(),
                      instagramUrl: instagramUrl.trim(),
                      about: about.trim(),
                      whatsappNumber: whatsappNumber.trim() || undefined,
                    })
                  }
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </section>

            {/* Portfolio */}
            <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                  <ImagePlus className="h-4 w-4 text-[#D4AF37]" /> Your work
                </h2>
                <span className="text-xs text-neutral-400">{uploaded.length}/30</span>
              </div>
              <p className="mb-4 text-sm text-neutral-500">
                Photos you upload here are public. Buyers browsing the directory see these first.
              </p>

              <input
                ref={portfolioInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  handlePortfolioPick(e.target.files);
                  e.target.value = "";
                }}
              />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {uploaded.map(item => (
                  <div
                    key={item.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.caption ?? "Portfolio piece"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => removeImage.mutate({ itemId: item.id })}
                      className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => portfolioInputRef.current?.click()}
                  disabled={addImage.isPending || uploaded.length >= 30}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[#8a6d1c] transition-colors duration-150 hover:bg-[#D4AF37]/10 disabled:opacity-50"
                >
                  {addImage.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-xs font-medium">Add photos</span>
                    </>
                  )}
                </button>
              </div>

              {quoted.length > 0 && (
                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-3.5 w-3.5 text-[#D4AF37]" /> Designs you quoted on
                  </h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    These are only shown to logged-in buyers, since they came from someone
                    else's request.
                  </p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {quoted.map(item => (
                      <div
                        key={item.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.caption ?? "Quoted design"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          aria-label="Remove from profile"
                          onClick={() => removeImage.mutate({ itemId: item.id })}
                          className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ── Right: logo + submit ── */}
          <aside className="space-y-5">
            <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6">
              <h2 className="mb-4 font-serif text-lg font-semibold">Logo</h2>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  handleLogoPick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadLogo.isPending}
                className="group relative mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 transition-colors duration-150 hover:bg-[#D4AF37]/10"
              >
                {uploadLogo.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#8a6d1c]" />
                ) : data?.logoUrl ? (
                  <img src={data.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-6 w-6 text-[#8a6d1c]" />
                )}
              </button>
              <p className="mt-3 text-center text-xs text-neutral-400">
                Square image works best. Under 5 MB.
              </p>
            </section>

            <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6">
              <h2 className="mb-2 font-serif text-lg font-semibold">Go live</h2>
              <p className="mb-4 text-sm leading-relaxed text-neutral-500">
                We verify every jeweller before publishing. Submit once your details and a
                few photos are in place.
              </p>
              <ul className="mb-4 space-y-1.5 text-sm">
                {[
                  { ok: !!businessName.trim(), label: "Business name" },
                  { ok: categories.length > 0, label: "At least one category" },
                  { ok: !!city.trim(), label: "City" },
                  { ok: !!address.trim(), label: "Shop address" },
                  { ok: uploaded.length > 0, label: "At least one photo (recommended)" },
                ].map(item => (
                  <li key={item.label} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        item.ok ? "bg-emerald-500" : "bg-neutral-300"
                      }`}
                    />
                    <span className={item.ok ? "text-neutral-700" : "text-neutral-400"}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full gap-2 bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                disabled={
                  !canSubmit ||
                  submitForReview.isPending ||
                  status === "pending" ||
                  status === "approved" ||
                  status === "suspended"
                }
                onClick={() => submitForReview.mutate()}
              >
                {submitForReview.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {status === "pending"
                      ? "Awaiting review"
                      : status === "approved"
                        ? "Already live"
                        : "Submit for review"}
                  </>
                )}
              </Button>
              {!canSubmit && status !== "approved" && (
                <p className="mt-2 text-xs text-neutral-400">
                  Save the required details above first.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
