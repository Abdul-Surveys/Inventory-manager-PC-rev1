import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/KpiCard";
import { StatusChip } from "@/components/StatusChip";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatUSD, formatNumber, CRITICALITY_META } from "@/lib/format";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, PackageX, DollarSign, Download, ArrowRight } from "lucide-react";

const TierCard = ({ tier }) => {
  const meta = CRITICALITY_META[tier.criticality] || CRITICALITY_META[3];
  const atRisk = tier.below_min + tier.minimum;
  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${meta.chip}`}>
            {tier.criticality}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{tier.label}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(tier.count)} items · {formatUSD(tier.value)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-[hsl(var(--status-below-min)/0.3)] bg-[hsl(var(--status-below-min)/0.08)] px-3 py-2">
            <p className="text-muted-foreground">Below Minimum</p>
            <p data-testid={`critical-tier-${tier.criticality}-below-min`} className="text-lg font-bold tabular-nums text-[hsl(var(--status-below-min))]">{formatNumber(tier.below_min)}</p>
          </div>
          <div className="rounded-lg border border-[hsl(var(--status-minimum)/0.32)] bg-[hsl(var(--status-minimum)/0.1)] px-3 py-2">
            <p className="text-muted-foreground">At Minimum</p>
            <p className="text-lg font-bold tabular-nums text-[hsl(var(--status-minimum))]">{formatNumber(tier.minimum)}</p>
          </div>
          <div className="rounded-lg border border-[hsl(var(--status-ok)/0.3)] bg-[hsl(var(--status-ok)/0.08)] px-3 py-2">
            <p className="text-muted-foreground">Healthy (OK)</p>
            <p className="text-lg font-bold tabular-nums text-[hsl(var(--status-ok))]">{formatNumber(tier.ok)}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground">Needs Reorder</p>
            <p className="text-lg font-bold tabular-nums">{formatNumber(atRisk)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function CriticalMaterials() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/dashboard/critical");
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
        <Skeleton className="col-span-12 h-64 xl:col-span-6" />
        <Skeleton className="col-span-12 h-64 xl:col-span-6" />
        <Skeleton className="col-span-12 h-80" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Failed to load critical materials.</p>;

  const openItem = (code) => {
    setDrawerCode(code);
    setDrawerOpen(true);
  };

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* KPIs */}
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Critical Materials" value={formatNumber(data.total_count)} sub="Tier 1 & Tier 2 items" icon={ShieldCheck} testId="critical-total-count" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Critical Stock Value" value={formatUSD(data.total_value)} sub="Value held in critical spares" icon={DollarSign} iconClass="text-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.1)]" testId="critical-total-value" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Needing Reorder" value={formatNumber(data.reorder_count)} sub="Below or at minimum" icon={ShieldAlert} iconClass="text-[hsl(var(--status-below-min))] bg-[hsl(var(--status-below-min)/0.1)]" testId="critical-reorder-count" />
      </div>
      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
        <KpiCard title="Stocked Out (Below Min)" value={formatNumber(data.below_min_count)} sub="Highest supply risk" icon={PackageX} iconClass="text-[hsl(var(--status-minimum))] bg-[hsl(var(--status-minimum)/0.12)]" testId="critical-below-min-count" />
      </div>

      {/* Tier breakdown */}
      {data.by_tier.map((tier) => (
        <div key={tier.criticality} className="col-span-12 xl:col-span-6">
          <TierCard tier={tier} />
        </div>
      ))}

      {/* At-risk table */}
      <Card className="col-span-12 rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-[hsl(var(--status-below-min))]" /> Critical Materials Needing Attention
          </CardTitle>
          <div className="flex items-center gap-2">
            <Link to="/reorder" data-testid="critical-view-reorder">
              <Button variant="ghost" size="sm" className="text-xs">Reorder proposals <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
            </Link>
            <Button data-testid="critical-export-button" variant="outline" size="sm" onClick={() => downloadReport("/export/critical")}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table data-testid="critical-at-risk-table" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Crit</th>
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.at_risk.map((it) => {
                  const meta = CRITICALITY_META[Number(it.criticality) || 3] || CRITICALITY_META[3];
                  return (
                    <tr
                      key={it.item_code}
                      data-testid={`critical-row-${it.item_code}`}
                      onClick={() => openItem(it.item_code)}
                      className="h-11 cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                    >
                      <td className="px-3 py-2"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${meta.chip}`}>{it.criticality}</span></td>
                      <td className="px-3 py-2 font-mono text-xs text-primary">{it.item_code}</td>
                      <td className="px-3 py-2 max-w-[280px] truncate">{it.description}</td>
                      <td className="px-3 py-2 text-xs">{it.item_type || "Other"}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatNumber(it.current_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.min_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.max_qty)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUSD(it.total_value)}</td>
                      <td className="px-3 py-2"><StatusChip status={it.status} /></td>
                    </tr>
                  );
                })}
                {data.at_risk.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    All critical materials are adequately stocked. No items below minimum.
                  </td></tr>
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
