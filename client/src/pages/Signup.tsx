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

export default function Signup({ jeweller = false }: { jeweller?: boolean }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    businessName: "",
    city: "",
  });
  const [categories, setCategories] = useState<CategorySlug[]>([]);

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
          <form
            className="mt-7 space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (jeweller && categories.length === 0) {
                return toast.error("Select at least one category you work with");
              }
              register.mutate({
                role: jeweller ? "jeweller" : "buyer",
                name: form.name,
                email: form.email,
                phone: form.phone,
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
              <Input id="phone" type="tel" required value={form.phone} onChange={set("phone")} className="h-11" placeholder="+91 98765 43210" />
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
