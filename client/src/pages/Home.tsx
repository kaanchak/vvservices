import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/hooks/useAccount";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BadgeCheck,
  Gem,
  Handshake,
  ImagePlus,
  LineChart,
  Scale,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const HERO_NECKLACE = "/manus-storage/hero-necklace_1beb76eb.jpg";
const HERO_RING = "/manus-storage/hero-ring_da3dc6cb.jpg";
const HERO_EARRING = "/manus-storage/hero-earring_51c6a7c2.jpg";

const buyerSteps = [
  {
    icon: ImagePlus,
    title: "Share your design",
    text: "Upload a photo or paste a link of any jewellery piece you love — a necklace from Instagram, a ring from a magazine, anything.",
  },
  {
    icon: Scale,
    title: "Compare live quotes",
    text: "Verified manufacturers send you itemised quotes — gold weight, diamond carats, making charges — within hours, not days.",
  },
  {
    icon: BadgeCheck,
    title: "Accept the best offer",
    text: "Pick the jeweller with the best price and rating. Pay manufacturer rates, skipping the 30–40% retail markup.",
  },
];

const jewellerSteps = [
  {
    icon: Store,
    title: "Create your workshop profile",
    text: "Register with the categories you craft — gold, diamond with gold, or stone-studded jewellery.",
  },
  {
    icon: Sparkles,
    title: "Receive matching leads instantly",
    text: "New buyer requests in your categories appear on your dashboard in real time. No cold calls, no ad spend.",
  },
  {
    icon: Handshake,
    title: "Quote and win customers",
    text: "Send transparent itemised quotes directly to buyers and grow your order book with serious, ready-to-buy customers.",
  },
];

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"buyer" | "jeweller">("buyer");
  const join = trpc.waitlist.join.useMutation({
    onSuccess: () => {
      toast.success("You're on the list! We'll be in touch soon.");
      setEmail("");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row"
      onSubmit={e => {
        e.preventDefault();
        if (!email) return toast.error("Please enter your email");
        join.mutate({ email, role });
      }}
    >
      <div className="flex flex-1 gap-2">
        <Input
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="h-12 flex-1 border-white/25 bg-white/10 text-white placeholder:text-white/50"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as "buyer" | "jeweller")}
          className="h-12 rounded-md border border-white/25 bg-white/10 px-3 text-sm text-white [&>option]:text-black"
        >
          <option value="buyer">I'm a buyer</option>
          <option value="jeweller">I'm a jeweller</option>
        </select>
      </div>
      <Button
        type="submit"
        disabled={join.isPending}
        className="h-12 bg-gold-gradient px-8 font-semibold text-[#1A1A1A] hover:opacity-90"
      >
        {join.isPending ? "Joining…" : "Join the waitlist"}
      </Button>
    </form>
  );
}

export default function Home() {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const { data: goldPriceData, isLoading: goldLoading } = trpc.goldPrice.current.useQuery();

  const dashboardPath =
    account?.role === "buyer"
      ? "/app"
      : account?.role === "jeweller"
        ? "/jeweller"
        : account?.role === "admin"
          ? "/admin"
          : null;

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#D4AF37]/20 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-600 md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-[#8a6d1c]">
              How it works
            </a>
            <a href="#for-jewellers" className="transition-colors hover:text-[#8a6d1c]">
              For jewellers
            </a>
            <a href="#waitlist" className="transition-colors hover:text-[#8a6d1c]">
              Waitlist
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {dashboardPath ? (
              <Button
                onClick={() => navigate(dashboardPath)}
                className="bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
              >
                My dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="text-neutral-700">
                    Log in
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90">
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.45) 0%, rgba(212,175,55,0) 70%)",
          }}
        />
        <div className="container grid items-center gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div className="fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/8 px-4 py-1.5 text-sm font-medium text-[#8a6d1c]">
              <Gem className="h-3.5 w-3.5" />
              India's jewellery lead marketplace
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
              Get custom jewellery made at{" "}
              <span className="text-gold-gradient">manufacturer prices</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-neutral-600">
              Skip the showroom markup. Share a photo of the design you love, receive
              itemised quotes from verified manufacturers, and pick the best one — all
              in real time.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="h-13 w-full bg-gold-gradient px-8 text-base font-semibold text-[#1A1A1A] hover:opacity-90 sm:w-auto"
                >
                  Submit a design
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/signup/jeweller">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 w-full border-[#1A1A1A]/20 px-8 text-base font-medium hover:bg-neutral-50 sm:w-auto"
                >
                  I'm a jeweller
                </Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-neutral-500">
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-[#D4AF37]" /> Verified manufacturers
              </span>
              <span className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[#D4AF37]" /> Itemised transparent quotes
              </span>
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#D4AF37]" /> Real-time responses
              </span>
            </div>
            {/* Live gold price ticker */}
            {(goldLoading || goldPriceData) && (
              <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/8 px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8a6d1c]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Live Gold Rate
                </div>
                {goldLoading && !goldPriceData ? (
                  <span className="text-xs text-[#8a6d1c] animate-pulse">Loading...</span>
                ) : goldPriceData ? (
                  ([
                    { label: "24KT", value: goldPriceData.pricePerGram24kt },
                    { label: "18KT", value: goldPriceData.pricePerGram18kt },
                    { label: "14KT", value: goldPriceData.pricePerGram14kt },
                    { label: "9KT", value: goldPriceData.pricePerGram9kt },
                  ] as { label: string; value: number }[]).map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-1 text-xs">
                      <span className="rounded bg-[#D4AF37]/20 px-1.5 py-0.5 font-bold text-[#8a6d1c]">{label}</span>
                      <span className="font-medium text-[#1A1A1A]">₹{value.toLocaleString("en-IN")}/g</span>
                    </div>
                  ))
                ) : null}
              </div>
            )}
          </div>

          {/* Hero collage */}
          <div className="relative hidden md:block">
            <div className="grid grid-cols-2 gap-4">
              <img
                src={HERO_NECKLACE}
                alt="Diamond and gold necklace"
                className="luxury-shadow col-span-2 h-64 w-full rounded-2xl object-cover"
              />
              <img
                src={HERO_RING}
                alt="Gold diamond ring"
                className="luxury-shadow h-40 w-full rounded-2xl object-cover"
              />
              <img
                src={HERO_EARRING}
                alt="Stone-studded earrings"
                className="luxury-shadow h-40 w-full rounded-2xl object-cover"
              />
            </div>
            <div className="gold-border-glow absolute -bottom-5 -left-6 rounded-xl bg-white px-5 py-3.5">
              <p className="text-xs text-neutral-500">Average buyer savings</p>
              <p className="font-serif text-2xl font-semibold text-[#8a6d1c]">
                30–40% vs retail
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — buyers */}
      <section id="how-it-works" className="border-t border-[#D4AF37]/15 bg-[#faf9f6] py-20">
        <div className="container">
          <div className="mb-12 max-w-2xl">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#8a6d1c]">
              For buyers
            </p>
            <h2 className="text-3xl font-semibold md:text-4xl">
              Your dream piece, three steps away
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {buyerSteps.map((step, i) => (
              <div
                key={step.title}
                className="luxury-shadow group rounded-2xl border border-[#D4AF37]/15 bg-white p-7 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D4AF37]/12 text-[#8a6d1c]">
                    <step.icon className="h-5.5 w-5.5" strokeWidth={1.7} />
                  </span>
                  <span className="font-serif text-5xl font-medium text-[#D4AF37]/25">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-600">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — jewellers */}
      <section id="for-jewellers" className="bg-[#1A1A1A] py-20 text-white">
        <div className="container">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                For jewellers
              </p>
              <h2 className="text-3xl font-semibold md:text-4xl">
                A stream of ready-to-buy customers
              </h2>
            </div>
            <Link href="/signup/jeweller">
              <Button className="bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90">
                Join as a jeweller
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {jewellerSteps.map((step, i) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition-colors hover:border-[#D4AF37]/40"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
                    <step.icon className="h-5.5 w-5.5" strokeWidth={1.7} />
                  </span>
                  <span className="font-serif text-5xl font-medium text-white/10">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-14 grid gap-6 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 p-8 sm:grid-cols-3">
            {[
              { icon: UserPlus, stat: "Zero", label: "cost to receive leads" },
              { icon: LineChart, stat: "Real-time", label: "lead notifications" },
              { icon: Gem, stat: "3 categories", label: "gold, diamond & stone-studded" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-4">
                <item.icon className="h-8 w-8 shrink-0 text-[#D4AF37]" strokeWidth={1.5} />
                <div>
                  <p className="font-serif text-2xl font-semibold text-white">{item.stat}</p>
                  <p className="text-sm text-neutral-400">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section
        id="waitlist"
        className="relative overflow-hidden bg-[#141414] py-20 text-center text-white"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at 50% 120%, rgba(212,175,55,0.5) 0%, rgba(212,175,55,0) 60%)",
          }}
        />
        <div className="container relative">
          <Gem className="mx-auto mb-5 h-10 w-10 text-[#D4AF37]" strokeWidth={1.4} />
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold md:text-4xl">
            Be first in line when we launch in your city
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-400">
            Join the waitlist for early access, launch offers, and priority onboarding
            for jewellers.
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D4AF37]/15 bg-white py-10">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo />
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} VVServices. Custom jewellery at manufacturer
            prices.
          </p>
        </div>
      </footer>
    </div>
  );
}
