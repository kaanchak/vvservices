import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconnectSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { CATEGORIES, type CategorySlug } from "@shared/categories";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { MessageCircle, Mail } from "lucide-react";

type SignupMethod = "whatsapp" | "email";
type WaStep = "phone" | "otp" | "details";

export default function Signup({ jeweller = false }: { jeweller?: boolean }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // --- Method toggle ---
  const [method, setMethod] = useState<SignupMethod>("whatsapp");

  // --- WhatsApp flow state ---
  const [waStep, setWaStep] = useState<WaStep>("phone");
  const [waPhone, setWaPhone] = useState("");
  const [waOtp, setWaOtp] = useState("");
  const [waName, setWaName] = useState("");
  const [waBusinessName, setWaBusinessName] = useState("");
  const [waCity, setWaCity] = useState("");
  const [waCategories, setWaCategories] = useState<CategorySlug[]>([]);
  const [waOtpExpiry, setWaOtpExpiry] = useState<Date | null>(null);

  // --- Email flow state ---
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    businessName: "",
    city: "",
  });
  const [categories, setCategories] = useState<CategorySlug[]>([]);

  // --- tRPC mutations ---
  const sendOtp = trpc.account.sendWhatsappOtp.useMutation({
    onSuccess: ({ expiresAt }) => {
      setWaOtpExpiry(new Date(expiresAt));
      setWaStep("otp");
      toast.success("OTP sent to your WhatsApp number!");
    },
    onError: e => toast.error(e.message),
  });

  const verifyOtp = trpc.account.verifyWhatsappOtp.useMutation({
    onSuccess: account => {
      utils.account.me.setData(undefined, account);
      utils.invalidate();
      reconnectSocket();
      toast.success(`Welcome to VVServices, ${account.name}!`);
      navigate(account.role === "buyer" ? "/app" : "/jeweller");
    },
    onError: e => {
      if (e.message.includes("Name is required")) {
        // New user — need details
        setWaStep("details");
      } else {
        toast.error(e.message);
      }
    },
  });

  const register = trpc.account.register.useMutation({
    onSuccess: account => {
      utils.account.me.setData(undefined, account);
      utils.invalidate();
      reconnectSocket();
      toast.success(`Welcome to VVServices, ${account.name}!`);
      navigate(account.role === "buyer" ? "/app" : "/jeweller");
    },
    onError: e => toast.error(e.message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  // --- WhatsApp handlers ---
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhone.trim()) return toast.error("Please enter your WhatsApp number");
    sendOtp.mutate({ whatsappNumber: waPhone.trim() });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (waOtp.length !== 6) return toast.error("Please enter the 6-digit OTP");
    // Try login first — if account doesn't exist, server will ask for name
    verifyOtp.mutate({
      whatsappNumber: waPhone,
      otp: waOtp,
      role: jeweller ? "jeweller" : "buyer",
    });
  };

  const handleCompleteRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waName.trim()) return toast.error("Please enter your name");
    if (jeweller && waCategories.length === 0) {
      return toast.error("Select at least one category you work with");
    }
    verifyOtp.mutate({
      whatsappNumber: waPhone,
      otp: waOtp,
      name: waName.trim(),
      role: jeweller ? "jeweller" : "buyer",
      businessName: jeweller ? waBusinessName || undefined : undefined,
      city: jeweller ? waCity || undefined : undefined,
      categories: jeweller ? waCategories : undefined,
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f6]">
      <header className="border-b border-[#D4AF37]/20 bg-white">
        <div className="container flex h-16 items-center">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="luxury-shadow w-full max-w-md rounded-2xl border border-[#D4AF37]/15 bg-white p-8">
          <h1 className="text-3xl font-semibold">
            {jeweller ? "Join as a jeweller" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {jeweller
              ? "Receive live leads from buyers in your categories"
              : "Start getting quotes at manufacturer prices"}
          </p>

          {/* Method Toggle */}
          <div className="mt-6 flex rounded-lg border border-[#D4AF37]/30 overflow-hidden">
            <button
              type="button"
              onClick={() => { setMethod("whatsapp"); setWaStep("phone"); }}
              className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                method === "whatsapp"
                  ? "bg-[#25D366] text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setMethod("email")}
              className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                method === "email"
                  ? "bg-[#D4AF37] text-[#1A1A1A]"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
          </div>

          {/* ── WhatsApp Flow ── */}
          {method === "whatsapp" && (
            <>
              {/* Step 1: Enter phone */}
              {waStep === "phone" && (
                <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
                  <div className="space-y-2">
                    <Label htmlFor="waPhone">WhatsApp number</Label>
                    <Input
                      id="waPhone"
                      type="tel"
                      required
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      className="h-11"
                      placeholder="+91 98765 43210"
                    />
                    <p className="text-xs text-neutral-400">
                      We'll send a 6-digit code to this number
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={sendOtp.isPending}
                    className="h-11 w-full bg-[#25D366] font-semibold text-white hover:bg-[#1da851]"
                  >
                    {sendOtp.isPending ? "Sending OTP…" : "Send OTP via WhatsApp"}
                  </Button>
                </form>
              )}

              {/* Step 2: Enter OTP */}
              {waStep === "otp" && (
                <form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
                  <div className="rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 p-3 text-sm text-neutral-700">
                    OTP sent to <span className="font-semibold">{waPhone}</span>
                    {waOtpExpiry && (
                      <span className="ml-1 text-neutral-500">
                        · expires at {waOtpExpiry.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waOtp">Enter 6-digit OTP</Label>
                    <Input
                      id="waOtp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={waOtp}
                      onChange={e => setWaOtp(e.target.value.replace(/\D/g, ""))}
                      className="h-11 text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={verifyOtp.isPending}
                    className="h-11 w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                  >
                    {verifyOtp.isPending ? "Verifying…" : "Verify & Continue"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setWaStep("phone")}
                    className="w-full text-center text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← Change number
                  </button>
                </form>
              )}

              {/* Step 3: New user details */}
              {waStep === "details" && (
                <form className="mt-6 space-y-4" onSubmit={handleCompleteRegistration}>
                  <p className="text-sm text-neutral-500">
                    Almost there! Tell us a bit about yourself.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="waName">{jeweller ? "Your name" : "Full name"}</Label>
                    <Input
                      id="waName"
                      required
                      value={waName}
                      onChange={e => setWaName(e.target.value)}
                      className="h-11"
                      placeholder="Priya Sharma"
                    />
                  </div>
                  {jeweller && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="waBusinessName">Business name</Label>
                        <Input
                          id="waBusinessName"
                          value={waBusinessName}
                          onChange={e => setWaBusinessName(e.target.value)}
                          className="h-11"
                          placeholder="Sharma Jewels"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="waCity">City</Label>
                        <Input
                          id="waCity"
                          value={waCity}
                          onChange={e => setWaCity(e.target.value)}
                          className="h-11"
                          placeholder="Mumbai"
                        />
                      </div>
                    </div>
                  )}
                  {jeweller && (
                    <div className="space-y-2.5">
                      <Label>Categories you work with</Label>
                      <div className="space-y-2 rounded-lg border border-border p-3.5">
                        {CATEGORIES.map(cat => (
                          <label key={cat.slug} className="flex cursor-pointer items-center gap-2.5 text-sm">
                            <Checkbox
                              checked={waCategories.includes(cat.slug)}
                              onCheckedChange={checked => {
                                setWaCategories(prev =>
                                  checked
                                    ? [...prev, cat.slug]
                                    : prev.filter(c => c !== cat.slug)
                                );
                              }}
                            />
                            {cat.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={verifyOtp.isPending}
                    className="h-11 w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                  >
                    {verifyOtp.isPending ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              )}
            </>
          )}

          {/* ── Email Flow ── */}
          {method === "email" && (
            <form
              className="mt-6 space-y-4"
              onSubmit={e => {
                e.preventDefault();
                if (jeweller && categories.length === 0) {
                  return toast.error("Select at least one category you work with");
                }
                register.mutate({
                  role: jeweller ? "jeweller" : "buyer",
                  name: form.name,
                  email: form.email,
                  phone: form.phone || undefined,
                  password: form.password,
                  businessName: jeweller ? form.businessName || undefined : undefined,
                  city: jeweller ? form.city || undefined : undefined,
                  categories: jeweller ? categories : undefined,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">{jeweller ? "Your name" : "Full name"}</Label>
                <Input id="name" required value={form.name} onChange={set("name")} className="h-11" placeholder="Priya Sharma" />
              </div>
              {jeweller && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business name</Label>
                    <Input id="businessName" value={form.businessName} onChange={set("businessName")} className="h-11" placeholder="Sharma Jewels" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={set("city")} className="h-11" placeholder="Mumbai" />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={set("email")} className="h-11" placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} className="h-11" placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={6} value={form.password} onChange={set("password")} className="h-11" placeholder="At least 6 characters" />
              </div>
              {jeweller && (
                <div className="space-y-2.5">
                  <Label>Categories you work with</Label>
                  <div className="space-y-2 rounded-lg border border-border p-3.5">
                    {CATEGORIES.map(cat => (
                      <label key={cat.slug} className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <Checkbox
                          checked={categories.includes(cat.slug)}
                          onCheckedChange={checked => {
                            setCategories(prev =>
                              checked
                                ? [...prev, cat.slug]
                                : prev.filter(c => c !== cat.slug)
                            );
                          }}
                        />
                        {cat.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <Button
                type="submit"
                disabled={register.isPending}
                className="h-11 w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
              >
                {register.isPending ? "Creating account…" : "Create account"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-neutral-500">
            {jeweller ? (
              <>
                Buying jewellery instead?{" "}
                <Link href="/signup" className="font-medium text-[#8a6d1c] hover:underline">
                  Sign up as a buyer
                </Link>
              </>
            ) : (
              <>
                Are you a manufacturer?{" "}
                <Link href="/signup/jeweller" className="font-medium text-[#8a6d1c] hover:underline">
                  Join as a jeweller
                </Link>
              </>
            )}
            {" · "}
            <Link href="/login" className="font-medium text-[#8a6d1c] hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
