import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { reconnectSocket } from "@/hooks/useSocket";
import { LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

type NavItem = { href: string; label: string };

export default function AppShell({
  children,
  nav,
  requiredRole,
  loginPath,
}: {
  children: ReactNode;
  nav: NavItem[];
  requiredRole: "buyer" | "jeweller" | "admin";
  loginPath: string;
}) {
  const { account, loading, logout } = useAccount();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!loading && (!account || account.role !== requiredRole)) {
      navigate(loginPath, { replace: true });
    }
  }, [loading, account, requiredRole, loginPath, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />
      </div>
    );
  }

  if (!account || account.role !== requiredRole) return null;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    location === item.href
                      ? "bg-[#D4AF37]/10 text-[#8a6d1c]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{account.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{account.role}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout();
                reconnectSocket();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5 md:hidden">
          {nav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                location === item.href
                  ? "bg-[#D4AF37]/10 text-[#8a6d1c]"
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container py-6 md:py-10">{children}</main>
    </div>
  );
}
