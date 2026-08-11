import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import { CATEGORIES, categoryLabel, type CategorySlug } from "@shared/categories";
import { BadgeCheck, Gem, MapPin, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

export default function JewellerDirectory() {
  const { account } = useAccount();
  const [category, setCategory] = useState<CategorySlug | undefined>(undefined);
  const [search, setSearch] = useState("");

  const input = useMemo(() => (category ? { category } : {}), [category]);
  const { data, isLoading } = trpc.jewellers.directory.useQuery(input);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(j =>
      [j.businessName, j.name, j.city].some(v => v?.toLowerCase().includes(q))
    );
  }, [data, search]);

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href={account ? (account.role === "jeweller" ? "/jeweller" : "/app") : "/"}>
              <Button variant="ghost" size="sm">
                {account ? "Dashboard" : "Home"}
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

      <main className="container py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            Verified jewellers
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            Every jeweller here has been verified by our team. Browse their work and reach
            out directly.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or city"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory(undefined)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                !category
                  ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#8a6d1c]"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              All
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCategory(c.slug)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                  category === c.slug
                    ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#8a6d1c]"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37]/40 bg-white py-20 text-center">
            <Gem className="mx-auto mb-4 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
            <h2 className="text-xl font-semibold">No jewellers to show yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
              {search || category
                ? "Try clearing your filters."
                : "Verified jeweller profiles will appear here as they are published."}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(j => {
              const displayName = j.businessName || j.name || "Jeweller";
              return (
                <Link key={j.id} href={`/j/${j.profileSlug}`}>
                  <article className="luxury-shadow group h-full cursor-pointer overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D4AF37]/50">
                    {/* Preview strip */}
                    <div className="grid h-36 grid-cols-3 gap-0.5 bg-neutral-100">
                      {j.previewImages.length > 0 ? (
                        j.previewImages.slice(0, 3).map((url, i) => (
                          <div key={i} className="overflow-hidden bg-neutral-50">
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                        ))
                      ) : (
                        <div className="col-span-3 flex items-center justify-center">
                          <Gem className="h-8 w-8 text-neutral-300" strokeWidth={1.4} />
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold-gradient">
                          {j.logoUrl ? (
                            <img
                              src={j.logoUrl}
                              alt={displayName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="font-serif text-lg font-semibold text-[#1A1A1A]">
                              {displayName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-semibold leading-tight">
                            <span className="truncate">{displayName}</span>
                            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                            {j.rating && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-[#D4AF37] text-[#D4AF37]" />
                                {j.rating}
                              </span>
                            )}
                            {j.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {j.city}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {j.categories.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {j.categories.map(c => (
                            <span
                              key={c}
                              className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-medium text-[#8a6d1c]"
                            >
                              {categoryLabel(c)}
                            </span>
                          ))}
                        </div>
                      )}

                      {j.about && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                          {j.about}
                        </p>
                      )}

                      <p className="mt-3 text-[11px] text-neutral-400">
                        {j.portfolioCount} {j.portfolioCount === 1 ? "photo" : "photos"}
                      </p>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
