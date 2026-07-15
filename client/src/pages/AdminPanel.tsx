import AppShell from "@/components/AppShell";
import { CategoryBadge, StatusBadge, formatINR } from "@/components/Brand";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/hooks/useAccount";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/lib/trpc";
import {
  BadgeCheck,
  FileText,
  Gem,
  ListChecks,
  Store,
  Users,
} from "lucide-react";

const adminNav = [{ href: "/admin", label: "Dashboard" }];

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <div className="luxury-shadow rounded-2xl border border-[#D4AF37]/15 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D4AF37]/12 text-[#8a6d1c]">
          <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-xs text-neutral-500">{label}</p>
          <p className="font-serif text-2xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { account } = useAccount();
  const utils = trpc.useUtils();
  const enabled = !!account;

  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled });
  const { data: accounts } = trpc.admin.accounts.useQuery(undefined, { enabled });
  const { data: requests } = trpc.admin.requests.useQuery(undefined, { enabled });
  const { data: quotes } = trpc.admin.quotes.useQuery(undefined, { enabled });

  useSocket({
    "admin-update": () => {
      utils.admin.invalidate();
    },
  });

  const buyers = accounts?.filter(a => a.role === "buyer") ?? [];
  const jewellers = accounts?.filter(a => a.role === "jeweller") ?? [];

  return (
    <AppShell nav={adminNav} requiredRole="admin" loginPath="/login">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Platform overview — counters update live as activity happens
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard icon={Users} label="Buyers" value={stats?.buyers ?? "—"} />
        <StatCard icon={Store} label="Jewellers" value={stats?.jewellers ?? "—"} />
        <StatCard icon={Gem} label="Requests" value={stats?.requests ?? "—"} />
        <StatCard icon={FileText} label="Quotes" value={stats?.quotes ?? "—"} />
        <StatCard icon={BadgeCheck} label="Accepted" value={stats?.accepted ?? "—"} />
        <StatCard icon={ListChecks} label="Waitlist" value={stats?.waitlist ?? "—"} />
      </div>

      <Tabs defaultValue="buyers">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="buyers">Buyers ({buyers.length})</TabsTrigger>
          <TabsTrigger value="jewellers">Jewellers ({jewellers.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({requests?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes?.length ?? 0})</TabsTrigger>
        </TabsList>

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

        <TabsContent value="requests">
          <div className="luxury-shadow overflow-x-auto rounded-2xl border border-[#D4AF37]/15 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Budget</TableHead>
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
                      <span className="block text-xs text-neutral-400">
                        {row.buyerEmail}
                      </span>
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
      </Tabs>
    </AppShell>
  );
}
