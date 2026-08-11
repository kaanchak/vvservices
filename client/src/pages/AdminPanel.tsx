import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Flag,
  Gem,
  Globe,
  Instagram,
  ListChecks,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Store,
  Trash2,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const adminNav = [{ href: "/admin", label: "Dashboard" }];

/** Colour-coded pill for the profile moderation state. */
function ProfileStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-600 border-neutral-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    suspended: "bg-red-100 text-red-800 border-red-300",
  };
  const label: Record<string, string> = {
    draft: "Draft",
    pending: "Pending review",
    approved: "Live",
    rejected: "Changes needed",
    suspended: "Suspended",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        map[status] ?? map.draft
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

/**
 * Full review screen for one jeweller profile. Admin runs offline legitimacy
 * checks, then approves, requests changes, or suspends.
 */
function ReviewProfileDialog({
  jewellerId,
  onClose,
}: {
  jewellerId: number | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const { data, isLoading } = trpc.admin.jewellerProfileDetail.useQuery(
    { jewellerId: jewellerId! },
    { enabled: !!jewellerId }
  );

  const setStatus = trpc.admin.setJewellerProfileStatus.useMutation({
    onSuccess: (_res, vars) => {
      const verb =
        vars.status === "approved"
          ? "published"
          : vars.status === "rejected"
            ? "sent back for changes"
            : vars.status === "suspended"
              ? "suspended"
              : "moved back to review";
      toast.success(`Profile ${verb}.`);
      utils.admin.invalidate();
      setNote("");
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const removeItem = trpc.admin.removePortfolioItem.useMutation({
    onSuccess: () => {
      toast.success("Photo removed.");
      utils.admin.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const displayName = data?.businessName || data?.name || "Jeweller";
  const uploaded = (data?.portfolio ?? []).filter(p => p.source === "uploaded");
  const quoted = (data?.portfolio ?? []).filter(p => p.source === "quoted");

  return (
    <Dialog open={!!jewellerId} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Review profile</DialogTitle>
          <DialogDescription>
            Verify this jeweller offline before publishing their public page.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Identity */}
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D4AF37]/30 bg-gold-gradient">
                {data.logoUrl ? (
                  <img src={data.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-serif text-xl font-semibold text-[#1A1A1A]">
                    {displayName.charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold leading-tight">{displayName}</p>
                  <ProfileStatusBadge status={data.profileStatus ?? "draft"} />
                  {data.incidentCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      <ShieldAlert className="h-3 w-3" /> {data.incidentCount} incident
                      {data.incidentCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {data.name}
                  {data.email ? ` · ${data.email}` : ""}
                  {data.whatsappNumber ? ` · ${data.whatsappNumber}` : ""}
                </p>
                {data.categoryList.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.categoryList.map(c => (
                      <CategoryBadge key={c} category={c} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Details to verify */}
            <div className="rounded-xl border border-border bg-[#faf9f6] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Details to verify
              </p>
              <dl className="space-y-2.5 text-sm">
                <div className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6d1c]" />
                  <div className="min-w-0">
                    <dt className="text-xs text-neutral-400">Address</dt>
                    <dd className="whitespace-pre-line text-neutral-700">
                      {data.address || <span className="text-red-600">Not provided</span>}
                    </dd>
                    {data.city && <dd className="text-xs text-neutral-500">{data.city}</dd>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6d1c]" />
                  <div className="min-w-0">
                    <dt className="text-xs text-neutral-400">Website</dt>
                    <dd className="truncate text-neutral-700">
                      {data.website ? (
                        <a
                          href={
                            /^https?:\/\//i.test(data.website)
                              ? data.website
                              : `https://${data.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-2"
                        >
                          {data.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6d1c]" />
                  <div className="min-w-0">
                    <dt className="text-xs text-neutral-400">Instagram</dt>
                    <dd className="truncate text-neutral-700">
                      {data.instagramUrl ? (
                        <a
                          href={
                            /^https?:\/\//i.test(data.instagramUrl)
                              ? data.instagramUrl
                              : `https://${data.instagramUrl}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-2"
                        >
                          {data.instagramUrl} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
              {data.about && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs text-neutral-400">About</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                    {data.about}
                  </p>
                </div>
              )}
              {data.profileSlug && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-neutral-500">
                  Public URL:{" "}
                  <a
                    href={`/j/${data.profileSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    /j/{data.profileSlug}
                  </a>
                </p>
              )}
            </div>

            {/* Portfolio */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Uploaded photos ({uploaded.length}) — public
              </p>
              {uploaded.length === 0 ? (
                <p className="text-sm text-neutral-500">No photos uploaded.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {uploaded.map(item => (
                    <div
                      key={item.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200"
                    >
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => removeItem.mutate({ itemId: item.id })}
                        className="absolute right-1 top-1 rounded-full bg-white/90 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="h-3 w-3 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {quoted.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Plus {quoted.length} quoted design{quoted.length === 1 ? "" : "s"} (members
                  only).
                </p>
              )}
            </div>

            {/* Review note */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Note to jeweller (shown if you request changes or suspend)
              </p>
              <Textarea
                rows={2}
                maxLength={1000}
                placeholder="e.g. Shop address could not be verified — please share a GST certificate."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {data?.profileStatus === "approved" ? (
            <Button
              variant="outline"
              className="w-full gap-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 sm:w-auto"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  jewellerId: jewellerId!,
                  status: "suspended",
                  reviewNote: note || undefined,
                })
              }
            >
              <XCircle className="h-4 w-4" /> Suspend profile
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full gap-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 sm:w-auto"
                disabled={setStatus.isPending}
                onClick={() => {
                  if (!note.trim()) {
                    return toast.error("Please add a note explaining what needs changing.");
                  }
                  setStatus.mutate({
                    jewellerId: jewellerId!,
                    status: "rejected",
                    reviewNote: note,
                  });
                }}
              >
                <XCircle className="h-4 w-4" /> Request changes
              </Button>
              <Button
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({ jewellerId: jewellerId!, status: "approved" })
                }
              >
                <CheckCircle2 className="h-4 w-4" /> Approve and publish
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`luxury-shadow rounded-2xl border p-5 ${
        highlight
          ? "border-red-200 bg-red-50"
          : "border-[#D4AF37]/15 bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            highlight ? "bg-red-100 text-red-600" : "bg-[#D4AF37]/12 text-[#8a6d1c]"
          }`}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className={`font-serif text-2xl font-semibold ${highlight ? "text-red-700" : ""}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function threadStatusBadge(status: string) {
  switch (status) {
    case "open":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>;
    case "buyer_declined":
      return <Badge variant="secondary">Declined</Badge>;
    case "jeweller_withdrawn":
      return <Badge variant="secondary">Withdrawn</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function reportStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
    case "reviewed":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Reviewed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Resolve Report Dialog ────────────────────────────────────────────────────

function ResolveReportDialog({
  reportId,
  onSuccess,
}: {
  reportId: number;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const resolve = trpc.admin.resolveReport.useMutation({
    onSuccess: () => {
      toast.success("Report resolved.");
      setOpen(false);
      setNotes("");
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
        onClick={() => setOpen(true)}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Report</DialogTitle>
          <DialogDescription>
            Add your admin notes about the action taken. This is for internal records only.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Describe the action taken (e.g. 'Warned jeweller', 'No action needed', 'Account suspended')..."
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={resolve.isPending || !notes.trim()}
            onClick={() => resolve.mutate({ reportId, adminNotes: notes })}
          >
            Mark Resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditWalletDialog({ jewellerId, onClose }: { jewellerId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const { data, isLoading } = trpc.admin.creditJewellerDetail.useQuery(
    { jewellerId: jewellerId!, limit: 100 },
    { enabled: !!jewellerId }
  );
  const invalidate = () => utils.admin.invalidate();
  const adjust = trpc.admin.adjustJewellerCredits.useMutation({
    onSuccess: result => {
      toast.success(`${result.adjusted > 0 ? "Granted" : "Deducted"} ${Math.abs(result.adjusted)} V◈.`);
      setAmount("");
      setReason("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const freeze = trpc.admin.setJewellerWalletFrozen.useMutation({
    onSuccess: () => {
      toast.success("Wallet status updated.");
      setReason("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const subscription = trpc.admin.setJewellerSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription status updated.");
      setReason("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const status = data?.subscription.status ?? "inactive";
  const balance = data?.totalCredits ?? 0;
  const validReason = reason.trim().length >= 3;

  return (
    <Dialog open={!!jewellerId} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">V◈ credit controls</DialogTitle>
          <DialogDescription>Every action is recorded permanently with its reason.</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-3 py-5">{[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />)}</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#1A1A1A] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">{data.jeweller.businessName || data.jeweller.name}</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div><span className="font-serif text-4xl">{balance.toLocaleString("en-IN")}</span><span className="ml-2 text-[#E8D98B]">V◈</span></div>
                <Badge className={status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white"}>{status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center text-xs">
                <div><strong className="block text-base">{data.wallet.subscriptionCredits}</strong><span className="text-neutral-400">Plan</span></div>
                <div><strong className="block text-base">{data.wallet.topupCredits}</strong><span className="text-neutral-400">Top-up</span></div>
                <div><strong className="block text-base">{data.wallet.adjustmentCredits}</strong><span className="text-neutral-400">Adjusted</span></div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="font-semibold">Adjust credits</p>
                <p className="mt-1 text-xs text-neutral-500">Positive grants; negative deductions apply to admin-issued credits only.</p>
                <div className="mt-3 space-y-2">
                  <Input inputMode="numeric" placeholder="e.g. 100 or -25" value={amount} onChange={event => setAmount(event.target.value)} />
                  <Textarea rows={2} placeholder="Reason for this adjustment (required)" value={reason} onChange={event => setReason(event.target.value)} />
                  <Button size="sm" disabled={adjust.isPending || !validReason || !Number.isInteger(Number(amount)) || Number(amount) === 0} onClick={() => adjust.mutate({ jewellerId: data.jeweller.id, amount: Number(amount), reason: reason.trim() })}>
                    {Number(amount) < 0 ? "Deduct V◈" : "Grant V◈"}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="font-semibold">Access controls</p>
                <p className="mt-1 text-xs text-neutral-500">Cancellation expires paid top-ups and blocks future credit use.</p>
                <div className="mt-3 space-y-2">
                  <Textarea rows={2} placeholder="Reason for status change (required)" value={reason} onChange={event => setReason(event.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={freeze.isPending || !validReason} onClick={() => freeze.mutate({ jewellerId: data.jeweller.id, frozen: !data.wallet.isFrozen, reason: reason.trim() })}>{data.wallet.isFrozen ? "Unfreeze wallet" : "Freeze wallet"}</Button>
                    <select aria-label="Subscription status" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={selectedStatus || status} onChange={event => setSelectedStatus(event.target.value)}>
                      <option value="inactive">Inactive</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option>
                    </select>
                    <Button size="sm" disabled={subscription.isPending || !validReason} onClick={() => subscription.mutate({ jewellerId: data.jeweller.id, status: (selectedStatus || status) as "inactive" | "active" | "past_due" | "cancelled" | "suspended", reason: reason.trim() })}>Update plan</Button>
                  </div>
                  <Button size="sm" variant="destructive" disabled={subscription.isPending || !validReason || status === "cancelled"} onClick={() => subscription.mutate({ jewellerId: data.jeweller.id, status: "cancelled", reason: reason.trim() })}>Deactivate now & expire top-ups</Button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <div className="border-b border-neutral-100 px-4 py-3"><p className="font-semibold">Immutable V◈ ledger</p></div>
              {data.ledger.length === 0 ? <p className="px-4 py-10 text-center text-sm text-neutral-500">No V◈ activity recorded yet.</p> : <div className="divide-y divide-neutral-100">{data.ledger.map(entry => {
                const delta = entry.subscriptionDelta + entry.topupDelta + entry.adjustmentDelta;
                return <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="text-sm font-medium">{entry.type.replace(/_/g, " ")}</p><p className="truncate text-xs text-neutral-500">{entry.reason}</p></div><p className={`shrink-0 text-sm font-bold ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-neutral-500"}`}>{delta > 0 ? "+" : ""}{delta} V◈</p></div>;
              })}</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── AdminPanel ───────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { account } = useAccount();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const enabled = !!account;

  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled });
  const { data: accounts } = trpc.admin.accounts.useQuery(undefined, { enabled });
  const { data: requests } = trpc.admin.requests.useQuery(undefined, { enabled });
  const { data: quotes } = trpc.admin.quotes.useQuery(undefined, { enabled });
  const { data: chats } = trpc.admin.chats.useQuery(undefined, { enabled });
  const { data: pendingReports } = trpc.admin.pendingReports.useQuery(undefined, { enabled });
  const { data: allReports } = trpc.admin.allReports.useQuery(undefined, { enabled });
  const { data: incidents } = trpc.admin.jewellersIncidents.useQuery(undefined, { enabled });
  const { data: profiles } = trpc.admin.jewellerProfiles.useQuery(undefined, { enabled });
  const { data: creditJewellers } = trpc.admin.creditJewellers.useQuery(undefined, { enabled });
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [creditJewellerId, setCreditJewellerId] = useState<number | null>(null);
  const [creditSearch, setCreditSearch] = useState("");
  const [creditStatusFilter, setCreditStatusFilter] = useState("all");

  useSocket({
    "admin-update": () => {
      utils.admin.invalidate();
    },
  });

  const buyers = accounts?.filter(a => a.role === "buyer") ?? [];
  const jewellers = accounts?.filter(a => a.role === "jeweller") ?? [];
  const pendingCount = pendingReports?.length ?? 0;
  const pendingProfiles = (profiles ?? []).filter(p => p.profileStatus === "pending");
  const visibleCreditJewellers = (creditJewellers ?? []).filter(jeweller => {
    const term = creditSearch.trim().toLowerCase();
    const matchesText = !term || [jeweller.name, jeweller.businessName, jeweller.email].filter(Boolean).some(value => value!.toLowerCase().includes(term));
    const matchesStatus = creditStatusFilter === "all" || jeweller.subscription.status === creditStatusFilter;
    return matchesText && matchesStatus;
  });

  return (
    <AppShell nav={adminNav} requiredRole="admin" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Platform overview — counters update live as activity happens
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-8">
        <StatCard icon={Users} label="Buyers" value={stats?.buyers ?? "—"} />
        <StatCard icon={Store} label="Jewellers" value={stats?.jewellers ?? "—"} />
        <StatCard icon={Gem} label="Requests" value={stats?.requests ?? "—"} />
        <StatCard icon={FileText} label="Quotes" value={stats?.quotes ?? "—"} />
        <StatCard icon={BadgeCheck} label="Accepted" value={stats?.accepted ?? "—"} />
        <StatCard icon={ListChecks} label="Waitlist" value={stats?.waitlist ?? "—"} />
        <StatCard icon={MessageSquare} label="Active Chats" value={stats?.activeChats ?? "—"} />
        <StatCard
          icon={Flag}
          label="Pending Reports"
          value={stats?.pendingReports ?? "—"}
          highlight={(stats?.pendingReports ?? 0) > 0}
        />
      </div>

      <Tabs defaultValue="buyers">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="buyers">Buyers ({buyers.length})</TabsTrigger>
          <TabsTrigger value="jewellers">Jewellers ({jewellers.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({requests?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="chats">
            Chats ({chats?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="reports" className="relative">
            Reports
            {pendingCount > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="incidents">
            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
            Incidents
          </TabsTrigger>
          <TabsTrigger value="profiles" className="relative">
            <BadgeCheck className="mr-1 h-3.5 w-3.5" />
            Profiles
            {pendingProfiles.length > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingProfiles.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="credits"><WalletCards className="mr-1 h-3.5 w-3.5" />V◈ Credits ({creditJewellers?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* ── Buyers ── */}
        <TabsContent value="buyers">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyers.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.phone ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(a.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Jewellers ── */}
        <TabsContent value="jewellers">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jewellers.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.businessName ?? "—"}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(a.categories?.split(",") ?? []).map(c => (
                          <CategoryBadge key={c} category={c} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{a.city ?? "—"}</TableCell>
                    <TableCell>{a.rating ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Requests ── */}
        <TabsContent value="requests">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Quotes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(requests ?? []).map(row => (
                  <TableRow key={row.request.id}>
                    <TableCell className="font-medium">{row.request.title}</TableCell>
                    <TableCell>
                      {row.buyerName}
                      <span className="block text-xs text-neutral-400">{row.buyerEmail}</span>
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={row.request.category} />
                    </TableCell>
                    <TableCell>
                      {row.request.budgetMin || row.request.budgetMax
                        ? `${formatINR(row.request.budgetMin)} – ${formatINR(row.request.budgetMax)}`
                        : "Flexible"}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{row.request.activeQuoteCount ?? 0}</span>
                      <span className="text-neutral-400">/5</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.request.status} />
                    </TableCell>
                    <TableCell>
                      {new Date(row.request.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Quotes ── */}
        <TabsContent value="quotes">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Jeweller</TableHead>
                  <TableHead>Gold (g)</TableHead>
                  <TableHead>Diamonds (ct)</TableHead>
                  <TableHead>Making</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotes ?? []).map(row => (
                  <TableRow key={row.quote.id}>
                    <TableCell className="font-medium">{row.requestTitle}</TableCell>
                    <TableCell>{row.jewellerName}</TableCell>
                    <TableCell>{row.quote.goldWeightGrams ?? "—"}</TableCell>
                    <TableCell>{row.quote.diamondWeightCarats ?? "—"}</TableCell>
                    <TableCell>{formatINR(row.quote.makingCharges)}</TableCell>
                    <TableCell className="font-semibold text-[#8a6d1c]">
                      {formatINR(row.quote.totalPrice)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.quote.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Chats ── */}
        <TabsContent value="chats">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thread ID</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Jeweller</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(chats ?? []).map((row: any) => (
                  <TableRow key={row.thread.id}>
                    <TableCell className="text-neutral-400 text-xs">#{row.thread.id}</TableCell>
                    <TableCell className="font-medium max-w-[160px] truncate">
                      {row.requestTitle ?? "—"}
                    </TableCell>
                    <TableCell>{row.buyerName ?? "—"}</TableCell>
                    <TableCell>
                      {row.jewellerName ?? "—"}
                      {row.businessName && (
                        <span className="block text-xs text-neutral-400">{row.businessName}</span>
                      )}
                    </TableCell>
                    <TableCell>{threadStatusBadge(row.thread.status)}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(row.thread.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.thread.closedAt
                        ? new Date(row.thread.closedAt).toLocaleDateString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1"
                        onClick={() => navigate(`/admin/chat/${row.thread.id}`)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Reports ── */}
        <TabsContent value="reports">
          {pendingCount > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{pendingCount}</strong> report{pendingCount !== 1 ? "s" : ""} awaiting review.
              </span>
            </div>
          )}
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Reported Jeweller</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Notes</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allReports ?? []).map((row: any) => (
                  <TableRow key={row.report.id}>
                    <TableCell>{row.reporterName ?? "—"}</TableCell>
                    <TableCell>
                      {row.reportedName ?? "—"}
                      {row.reportedBusinessName && (
                        <span className="block text-xs text-neutral-400">
                          {row.reportedBusinessName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="line-clamp-2 text-sm text-neutral-700">{row.report.reason}</p>
                    </TableCell>
                    <TableCell>{reportStatusBadge(row.report.status)}</TableCell>
                    <TableCell className="max-w-[160px]">
                      {row.report.adminNotes ? (
                        <p className="line-clamp-2 text-xs text-neutral-500">
                          {row.report.adminNotes}
                        </p>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(row.report.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      {row.report.status === "pending" && (
                        <ResolveReportDialog
                          reportId={row.report.id}
                          onSuccess={() => {
                            utils.admin.pendingReports.invalidate();
                            utils.admin.allReports.invalidate();
                            utils.admin.stats.invalidate();
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Jeweller Incidents ── */}
        <TabsContent value="incidents">
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            <ShieldAlert className="inline h-4 w-4 mr-1.5 text-neutral-400" />
            Jewellers sorted by number of reports filed against them. Use this to identify
            repeat offenders.
          </div>
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jeweller</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Reports Filed</TableHead>
                  <TableHead>Risk Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(incidents ?? []).map((row: any) => {
                  const count = Number(row.incidentCount ?? 0);
                  const risk =
                    count === 0
                      ? { label: "Clean", className: "bg-emerald-100 text-emerald-700" }
                      : count === 1
                        ? { label: "Low", className: "bg-amber-100 text-amber-700" }
                        : count <= 3
                          ? { label: "Medium", className: "bg-orange-100 text-orange-700" }
                          : { label: "High", className: "bg-red-100 text-red-700" };
                  return (
                    <TableRow key={row.jewellerId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.businessName ?? "—"}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.city ?? "—"}</TableCell>
                      <TableCell>
                        <span
                          className={`font-bold text-lg ${count > 0 ? "text-red-600" : "text-neutral-400"}`}
                        >
                          {count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${risk.className}`}
                        >
                          {risk.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Jeweller Profile Moderation ── */}
        <TabsContent value="profiles">
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <BadgeCheck className="mr-1.5 inline h-4 w-4 text-amber-600" />
            Profiles stay private until you approve them. Run your offline legitimacy checks
            first, then publish.
          </div>
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jeweller</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Photos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Public URL</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profiles ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-neutral-500">
                      No jeweller profiles yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (profiles ?? []).map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold-gradient">
                            {p.logoUrl ? (
                              <img src={p.logoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="font-serif text-sm font-semibold text-[#1A1A1A]">
                                {(p.businessName || p.name || "J").charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {p.businessName || p.name || "—"}
                            </p>
                            <p className="truncate text-xs text-neutral-500">{p.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{p.city ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.categoryList.length > 0
                            ? p.categoryList.map(c => <CategoryBadge key={c} category={c} />)
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {p.uploadedCount}
                          {p.portfolioCount > p.uploadedCount && (
                            <span className="text-neutral-400">
                              {" "}
                              (+{p.portfolioCount - p.uploadedCount})
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ProfileStatusBadge status={p.profileStatus ?? "draft"} />
                      </TableCell>
                      <TableCell>
                        {p.profileStatus === "approved" && p.profileSlug ? (
                          <a
                            href={`/j/${p.profileSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#8a6d1c] underline underline-offset-2"
                          >
                            /j/{p.profileSlug} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={p.profileStatus === "pending" ? "default" : "outline"}
                          className={
                            p.profileStatus === "pending"
                              ? "bg-gold-gradient font-semibold text-[#1A1A1A] hover:opacity-90"
                              : ""
                          }
                          onClick={() => setReviewingId(p.id)}
                        >
                          {p.profileStatus === "pending" ? "Review" : "Open"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── V◈ Credits ── */}
        <TabsContent value="credits">
          <div className="mb-4 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/8 px-4 py-3 text-sm text-[#6d5618]">
            <strong>V◈ control centre:</strong> Grant or deduct correction credits, freeze wallets, and manage subscription access. Every operation requires a reason and writes an immutable ledger entry.
          </div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input className="sm:max-w-sm" placeholder="Search jeweller, business, or email" value={creditSearch} onChange={event => setCreditSearch(event.target.value)} />
            <select aria-label="Filter credit accounts by subscription status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={creditStatusFilter} onChange={event => setCreditStatusFilter(event.target.value)}>
              <option value="all">All subscription states</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jeweller</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead className="text-right">Available V◈</TableHead>
                  <TableHead className="text-right">Plan / Top-up / Adjusted</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCreditJewellers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center text-neutral-500">No jeweller V◈ accounts match this filter.</TableCell></TableRow>
                ) : visibleCreditJewellers.map(jeweller => (
                  <TableRow key={jeweller.id}>
                    <TableCell><p className="font-medium">{jeweller.businessName || jeweller.name}</p><p className="text-xs text-neutral-500">{jeweller.email}</p></TableCell>
                    <TableCell><Badge className={jeweller.subscription.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-600"}>{jeweller.subscription.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right font-semibold text-[#8a6d1c]">{jeweller.totalCredits.toLocaleString("en-IN")} V◈</TableCell>
                    <TableCell className="text-right text-xs text-neutral-600">{jeweller.wallet.subscriptionCredits} / {jeweller.wallet.topupCredits} / {jeweller.wallet.adjustmentCredits}</TableCell>
                    <TableCell>{jeweller.wallet.isFrozen ? <Badge variant="destructive">Frozen</Badge> : <span className="text-sm text-emerald-700">Open</span>}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setCreditJewellerId(jeweller.id)}>Manage</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <ReviewProfileDialog jewellerId={reviewingId} onClose={() => setReviewingId(null)} />
      <CreditWalletDialog jewellerId={creditJewellerId} onClose={() => setCreditJewellerId(null)} />
    </AppShell>
  );
}
