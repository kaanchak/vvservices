import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { categoryLabel } from "@shared/categories";
import {
  ArrowLeft,
  BadgeCheck,
  Gem,
  Globe,
  Instagram,
  Lock,
  MapPin,
  MessageSquare,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

/** Normalise a user-entered URL so an href always works. */
function externalHref(raw?: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function JewellerPublicProfile({ slug }: { slug: string }) {
  const { account } = useAccount();
  const { data, isLoading, error } = trpc.jewellers.publicProfile.useQuery({ slug });
  const [lightbox, setLightbox] = useState<string | null>(null);

  const displayName = data?.businessName || data?.name || "Jeweller";
  const waDigits = data?.whatsappNumber?.replace(/\D/g, "");
  const waLink = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
        `Hi ${displayName}, I found your profile on VVServices and would like to enquire about a piece.`
      )}`
    : null;
  const websiteHref = externalHref(data?.website);
  const instagramHref = externalHref(data?.instagramUrl);

  const uploaded = (data?.portfolio ?? []).filter(p => p.source === "uploaded");
  const quoted = (data?.portfolio ?? []).filter(p => p.source === "quoted");

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      {/* Public header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/jewellers">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> All jewellers
              </Button>
            </Link>
            {!account && (
              <Link href="/login">
                <Button size="sm" className="bg-gold-gradient font-semibold text-[#1A1A1A]">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
            <Gem className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
            <h1 className="text-xl font-semibold">Profile not found</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
              This jeweller profile does not exist, or it is not published yet.
            </p>
            <Link href="/jewellers">
              <Button variant="outline" className="mt-5">
                Browse all jewellers
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* ── Main column ── */}
            <div className="space-y-8">
              {/* Identity */}
              <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-gold-gradient">
                    {data.logoUrl ? (
                      <img
                        src={data.logoUrl}
                        alt={displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-serif text-3xl font-semibold text-[#1A1A1A]">
                        {displayName.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-serif text-3xl font-semibold leading-tight">
                        {displayName}
                      </h1>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                      {data.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                          {data.rating}
                        </span>
                      )}
                      {data.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {data.city}
                        </span>
                      )}
                    </div>
                    {data.categories.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {data.categories.map(c => (
                          <span
                            key={c}
                            className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-medium text-[#8a6d1c]"
                          >
                            {categoryLabel(c)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {data.about && (
                  <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                    {data.about}
                  </p>
                )}
              </section>

              {/* Uploaded work — public */}
              <section>
                <h2 className="mb-4 font-serif text-2xl font-semibold">Their work</h2>
                {uploaded.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-200 bg-white py-14 text-center">
                    <Gem className="mx-auto mb-3 h-8 w-8 text-neutral-300" strokeWidth={1.4} />
                    <p className="text-sm text-neutral-500">
                      This jeweller has not added photos yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {uploaded.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLightbox(item.imageUrl)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 transition-transform duration-150 active:scale-[0.98]"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.caption ?? "Jewellery piece"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {item.caption && (
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                            {item.caption}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Quoted work — logged-in only */}
              <section>
                <h2 className="mb-1 font-serif text-2xl font-semibold">
                  Designs they have quoted on
                </h2>
                {data.viewerIsLoggedIn ? (
                  quoted.length === 0 ? (
                    <p className="mt-3 text-sm text-neutral-500">
                      Nothing here yet.
                    </p>
                  ) : (
                    <>
                      <p className="mb-4 text-sm text-neutral-500">
                        Shared with signed-in members only.
                      </p>
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                        {quoted.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setLightbox(item.imageUrl)}
                            className="aspect-square overflow-hidden rounded-lg border border-neutral-200 transition-transform duration-150 active:scale-[0.98]"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.caption ?? "Quoted design"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  )
                ) : (
                  <div className="mt-3 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-6 text-center">
                    <Lock className="mx-auto mb-3 h-7 w-7 text-[#8a6d1c]" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      Sign in to see designs this jeweller has quoted on
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-xs text-neutral-500">
                      These come from real buyer requests, so we only show them to members.
                    </p>
                    <Link href="/login">
                      <Button
                        size="sm"
                        className="mt-4 bg-gold-gradient font-semibold text-[#1A1A1A]"
                      >
                        Sign in
                      </Button>
                    </Link>
                  </div>
                )}
              </section>
            </div>

            {/* ── Contact sidebar ── */}
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <section className="luxury-shadow rounded-2xl border border-[#D4AF37]/20 bg-white p-6">
                <h2 className="mb-4 font-serif text-lg font-semibold">Get in touch</h2>
                <div className="space-y-2.5">
                  {waLink && (
                    <a href={waLink} target="_blank" rel="noopener noreferrer" className="block">
                      <Button className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-700">
                        <MessageSquare className="h-4 w-4" /> Chat on WhatsApp
                      </Button>
                    </a>
                  )}
                  {websiteHref && (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button variant="outline" className="w-full gap-2">
                        <Globe className="h-4 w-4" /> Visit website
                      </Button>
                    </a>
                  )}
                  {instagramHref && (
                    <a
                      href={instagramHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button variant="outline" className="w-full gap-2">
                        <Instagram className="h-4 w-4" /> Instagram
                      </Button>
                    </a>
                  )}
                  {!waLink && !websiteHref && !instagramHref && (
                    <p className="text-sm text-neutral-500">
                      This jeweller has not added contact links yet.
                    </p>
                  )}
                </div>

                {data.address && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Address
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                      {data.address}
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[#D4AF37]/20 bg-white p-5">
                <p className="text-sm leading-relaxed text-neutral-600">
                  Want quotes from several jewellers at once? Post your design and receive
                  itemised offers.
                </p>
                <Link href={account ? "/app" : "/signup"}>
                  <Button variant="outline" className="mt-3 w-full">
                    Post a request
                  </Button>
                </Link>
              </section>
            </aside>
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Jewellery piece"
            className="max-h-[85vh] max-w-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
