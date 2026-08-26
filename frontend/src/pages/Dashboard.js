import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/KpiCard";
import { StatusChip } from "@/components/StatusChip";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatUSD, formatNumber, STATUS_META } from "@/lib/format";
import { toast } from "sonner";
import { DollarSign, Boxes, AlertTriangle, PackageX, Download, ArrowRight } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip } from "recharts";

const TYPE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/dashboard");
      setData(res.data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="col-span-12 h-28 sm:col-span-6 xl:col-span-3" />)}
        <Skeleton className="col-span-12 h-80 xl:col-span-7" />
        <Skeleton className="col-span-12 h-80 xl:col-span-5" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Failed to load dashboard.</p>;

  const openItem = (code) => {
    setDrawerCode(code);
    setDrawerOpen(true);
  };

  const byStatus = data.by_status || {};

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* KPI row */}
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Total Inventory Value" value={formatUSD(data.total_value)} sub="Current stock × unit rate" icon={DollarSign} testId="dashboard-total-inventory-value" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Total Items" value={formatNumber(data.total_items)} sub={`${formatNumber(data.total_stock_units)} units in stock`} icon={Boxes} iconClass="text-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.1)]" testId="dashboard-total-items" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Low Stock Items" value={formatNumber(data.low_stock_count)} sub="Below or at minimum" icon={AlertTriangle} iconClass="text-[hsl(var(--status-below-min))] bg-[hsl(var(--status-below-min)/0.1)]" testId="dashboard-low-stock-count" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Non-Moving (1 Year)" value={formatNumber(data.non_moving_count)} sub={`No movement for ${data.settings?.non_moving_months || 12} months`} icon={PackageX} iconClass="text-[hsl(var(--status-minimum))] bg-[hsl(var(--status-minimum)/0.12)]" testId="dashboard-non-moving-count" />
      </div>

      {/* Value by type */}
      <Card className="col-span-12 xl:col-span-7 rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inventory Value by Item Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <div data-testid="dashboard-type-donut" className="h-[240px] w-[240px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.by_type} dataKey="value" nameKey="item_type" innerRadius={62} outerRadius={95} paddingAngle={2} strokeWidth={1}>
                    {data.by_type.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                  </Pie>
                  <ReTooltip formatter={(v) => formatUSD(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-2">
              {data.by_type.map((t, i) => (
                <div key={t.item_type} data-testid={`dashboard-type-row-${t.item_type.replace(/\s+/g, '-').toLowerCase()}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                    <span className="truncate text-sm font-medium">{t.item_type}</span>
                    <span className="text-xs text-muted-foreground">({formatNumber(t.count)} items)</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">{formatUSD(t.value)}</span>
                    <span className="w-12 text-right text-xs font-medium text-muted-foreground tabular-nums">{t.pct}%</span>
                  </div>
                </div>
              ))}
              {data.by_type.length === 0 && <p className="text-sm text-muted-foreground">No inventory value yet. Import your item master to get started.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts panel */}
      <Card className="col-span-12 xl:col-span-5 rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Low-Stock Alerts</CardTitle>
          <Link to="/inventory?status=BELOW_MIN" data-testid="dashboard-view-all-alerts">
            <Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}: {formatNumber(byStatus[key]?.count || 0)}
              </span>
            ))}
          </div>
          {data.low_stock_items.length === 0 && <p className="text-sm text-muted-foreground">No low-stock items. All good.</p>}
          {data.low_stock_items.map((it) => (
            <button
              key={it.item_code}
              data-testid={`dashboard-alert-row-${it.item_code}`}
              onClick={() => openItem(it.item_code)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium"><span className="font-mono text-xs text-primary">{it.item_code}</span> — {it.description}</p>
                <p className="text-xs text-muted-foreground tabular-nums">Current {formatNumber(it.current_qty)} · Min {formatNumber(it.min_qty)} · Max {formatNumber(it.max_qty)}</p>
              </div>
              <StatusChip status={it.status} />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Top 20 */}
      <Card className="col-span-12 rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top 20 High-Value Items</CardTitle>
          <Button data-testid="dashboard-export-top20-button" variant="outline" size="sm" onClick={() => downloadReport("/export/top20")}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table data-testid="dashboard-top20-table" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Current Stock</th>
                  <th className="px-3 py-2 text-right">Unit Rate</th>
                  <th className="px-3 py-2 text-right">Total Value</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.top20.map((it, idx) => (
                  <tr
                    key={it.item_code}
                    data-testid={`dashboard-top20-row-${idx + 1}`}
                    onClick={() => openItem(it.item_code)}
                    className="cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 text-xs font-semibold text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-primary">{it.item_code}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate">{it.description}</td>
                    <td className="px-3 py-2 text-xs">{it.item_type || "Other"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.current_qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatUSD(it.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUSD(it.total_value)}</td>
                    <td className="px-3 py-2"><StatusChip status={it.status} /></td>
                  </tr>
                ))}
                {data.top20.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">No items with value yet. Import your item master first.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ItemDetailDrawer itemCode={drawerCode} open={drawerOpen} onOpenChange={setDrawerOpen} onChanged={load} />
    </div>
  );
}
