import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  FileText,
  Flag,
  Gem,
  ListChecks,
  MessageSquare,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const adminNav = [{ href: "/admin", label: "Dashboard" }];

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

  useSocket({
    "admin-update": () => {
      utils.admin.invalidate();
    },
  });

  const buyers = accounts?.filter(a => a.role === "buyer") ?? [];
  const jewellers = accounts?.filter(a => a.role === "jeweller") ?? [];
  const pendingCount = pendingReports?.length ?? 0;

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
      </Tabs>
    </AppShell>
  );
}
