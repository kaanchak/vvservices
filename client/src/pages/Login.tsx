import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconnectSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.account.login.useMutation({
    onSuccess: account => {
      utils.account.me.setData(undefined, account);
      utils.invalidate();
      reconnectSocket();
      toast.success(`Welcome back, ${account.name}!`);
      navigate(
        account.role === "buyer"
          ? "/app"
          : account.role === "jeweller"
            ? "/jeweller"
            : "/admin"
      );
    },
    onError: e => toast.error(e.message),
  });

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
          <p className="mt-1.5 text-sm text-neutral-500">
            Log in to your VVServices account
          </p>
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
          <p className="mt-6 text-center text-sm text-neutral-500">
            New to VVServices?{" "}
            <Link href="/signup" className="font-medium text-[#8a6d1c] hover:underline">
              Create a buyer account
            </Link>{" "}
            or{" "}
            <Link
              href="/signup/jeweller"
              className="font-medium text-[#8a6d1c] hover:underline"
            >
              join as a jeweller
            </Link>
          </p>
          <div className="mt-6 rounded-lg border border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5 p-3.5 text-xs leading-relaxed text-neutral-600">
            <p className="mb-1 font-semibold text-[#8a6d1c]">Demo accounts</p>
            <p>Buyer: user@demo.com / demo123</p>
            <p>Jeweller: jeweller@demo.com / demo123</p>
            <p>Admin: admin@vvservices.com / admin123</p>
          </div>
        </div>
      </main>
    </div>
  );
}
