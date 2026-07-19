import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconnectSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { MessageCircle, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type Method = "whatsapp" | "email";
type WaStep = "phone" | "otp";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Method toggle
  const [method, setMethod] = useState<Method>("whatsapp");

  // Email/password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // WhatsApp OTP state
  const [waStep, setWaStep] = useState<WaStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpExpiry, setOtpExpiry] = useState<Date | null>(null);

  // Email login mutation
  const login = trpc.account.login.useMutation({
    onSuccess: account => {
      utils.account.me.setData(undefined, account);
      utils.invalidate();
      reconnectSocket();
      toast.success(`Welcome back, ${account.name}!`);
      navigate(
        account.role === "buyer" ? "/app" : account.role === "jeweller" ? "/jeweller" : "/admin"
      );
    },
    onError: e => toast.error(e.message),
  });

  // WhatsApp OTP mutations
  const sendOtp = trpc.account.sendWhatsappOtp.useMutation({
    onSuccess: data => {
      setOtpExpiry(data.expiresAt);
      setWaStep("otp");
      toast.success("OTP sent to your WhatsApp number");
    },
    onError: e => toast.error(e.message),
  });

  const verifyOtp = trpc.account.verifyWhatsappOtp.useMutation({
    onSuccess: account => {
      if (!account) {
        toast.error("No account found for this WhatsApp number. Please sign up first.");
        return;
      }
      utils.account.me.setData(undefined, account);
      utils.invalidate();
      reconnectSocket();
      toast.success(`Welcome back, ${account.name}!`);
      navigate(
        account.role === "buyer" ? "/app" : account.role === "jeweller" ? "/jeweller" : "/admin"
      );
    },
    onError: e => toast.error(e.message),
  });

  const minutesLeft = otpExpiry
    ? Math.max(0, Math.ceil((otpExpiry.getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f6]">
      <header className="border-b border-[#D4AF37]/20 bg-white">
        <div className="container flex h-16 items-center">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="luxury-shadow w-full max-w-md rounded-2xl border border-[#D4AF37]/15 bg-white p-8">
          <h1 className="text-3xl font-semibold">Welcome back</h1>
          <p className="mt-1.5 text-sm text-neutral-500">Log in to your VVServices account</p>

          {/* Method toggle */}
          <div className="mt-6 flex rounded-xl border border-[#D4AF37]/20 bg-[#faf9f6] p-1">
            <button
              type="button"
              onClick={() => { setMethod("whatsapp"); setWaStep("phone"); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                method === "whatsapp"
                  ? "bg-[#25D366] text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setMethod("email")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                method === "email"
                  ? "bg-white text-neutral-800 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
          </div>

          {/* WhatsApp Login */}
          {method === "whatsapp" && (
            <div className="mt-7 space-y-5">
              {waStep === "phone" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="wa-phone">WhatsApp number</Label>
                    <Input
                      id="wa-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-neutral-400">We'll send a 6-digit code to this number</p>
                  </div>
                  <Button
                    type="button"
                    disabled={sendOtp.isPending || !phone.trim()}
                    onClick={() => sendOtp.mutate({ whatsappNumber: phone })}
                    className="h-11 w-full bg-[#25D366] font-semibold text-white hover:bg-[#1ebe5d]"
                  >
                    {sendOtp.isPending ? "Sending…" : "Send OTP via WhatsApp"}
                  </Button>
                </>
              )}

              {waStep === "otp" && (
                <>
                  <div className="rounded-lg border border-[#25D366]/30 bg-[#25D366]/5 p-3.5 text-sm text-neutral-600">
                    OTP sent to <span className="font-semibold">{phone}</span>
                    {minutesLeft !== null && (
                      <span className="ml-1 text-xs text-neutral-400">· expires in {minutesLeft}m</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-otp">Enter 6-digit OTP</Label>
                    <Input
                      id="wa-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="h-11 text-center text-xl tracking-widest"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={verifyOtp.isPending || otp.length !== 6}
                    onClick={() => verifyOtp.mutate({ whatsappNumber: phone, otp })}
                    className="h-11 w-full bg-[#25D366] font-semibold text-white hover:bg-[#1ebe5d]"
                  >
                    {verifyOtp.isPending ? "Verifying…" : "Verify & Log in"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setWaStep("phone"); setOtp(""); }}
                    className="w-full text-center text-sm text-neutral-400 hover:text-neutral-600"
                  >
                    ← Change number
                  </button>
                </>
              )}
            </div>
          )}

          {/* Email / Password Login */}
          {method === "email" && (
            <form
              className="mt-7 space-y-5"
              onSubmit={e => {
                e.preventDefault();
                login.mutate({ email, password });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={login.isPending}
                className="h-11 w-full bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
              >
                {login.isPending ? "Logging in…" : "Log in"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-neutral-500">
            New to VVServices?{" "}
            <Link href="/signup" className="font-medium text-[#8a6d1c] hover:underline">
              Create a buyer account
            </Link>{" "}
            or{" "}
            <Link href="/signup/jeweller" className="font-medium text-[#8a6d1c] hover:underline">
              join as a jeweller
            </Link>
          </p>

          {/* Demo accounts — only show for email method */}
          {method === "email" && (
            <div className="mt-6 rounded-lg border border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 p-3.5 text-xs leading-relaxed text-neutral-600">
              <p className="mb-1 font-semibold text-[#8a6d1c]">Demo accounts</p>
              <p>Buyer: user@demo.com / demo123</p>
              <p>Jeweller: jeweller@demo.com / demo123</p>
              <p>Admin: admin@vvservices.com / admin123</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
