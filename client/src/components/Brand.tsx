import { Gem } from "lucide-react";
import { Link } from "wouter";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 select-none">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-gradient">
        <Gem className="h-4.5 w-4.5 text-[#1A1A1A]" strokeWidth={1.8} />
      </span>
      <span
        className={`font-serif text-2xl font-semibold tracking-wide ${light ? "text-white" : "text-ink"}`}
      >
        VV<span className="text-gold-gradient">Services</span>
      </span>
    </Link>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    gold: "Gold",
    "diamond-gold": "Diamond with Gold",
    "stone-studded": "Stone-studded",
  };
  return (
    <span className="inline-flex items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2.5 py-0.5 text-xs font-medium text-[#8a6d1c]">
      {labels[category] ?? category}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-emerald-50 text-emerald-700 border-emerald-200",
    quoted: "bg-[#D4AF37]/10 text-[#8a6d1c] border-[#D4AF37]/40",
    closed: "bg-neutral-100 text-neutral-600 border-neutral-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dismissed: "bg-neutral-100 text-neutral-500 border-neutral-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"}`}
    >
      {status}
    </span>
  );
}

export function formatINR(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
}
