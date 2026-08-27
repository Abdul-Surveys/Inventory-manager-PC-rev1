import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusChip } from "@/components/StatusChip";
import { api, getErrorMessage } from "@/lib/api";
import { formatUSD2, formatUSD, formatNumber, formatDate, ITEM_TYPES, CRITICALITY_META } from "@/lib/format";
import { toast } from "sonner";
import { Pencil, Check, X, Wand2, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, Legend,
} from "recharts";

const Metric = ({ label, value, testId }) => (
  <div className="rounded-lg border bg-muted/40 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p data-testid={testId} className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
  </div>
);

export const ItemDetailDrawer = ({ itemCode, open, onOpenChange, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!itemCode) return;
    setLoading(true);
    try {
      const res = await api.get(`/items/${encodeURIComponent(itemCode)}/analysis`);
      setData(res.data);
      setForm({
        item_type: res.data.item.item_type || "Other",
        criticality: String(res.data.stats.criticality || 3),
        min_qty: res.data.item.min_qty,
        max_qty: res.data.item.max_qty,
        unit_price: res.data.item.unit_price,
        description: res.data.item.description,
        uom: res.data.item.uom,
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [itemCode]);

  useEffect(() => {
    if (open) {
      setEditing(false);
      load();
    }
  }, [open, load]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/items/${encodeURIComponent(itemCode)}`, {
        item_type: form.item_type,
        criticality: Number(form.criticality),
        min_qty: Number(form.min_qty),
        max_qty: Number(form.max_qty),
        unit_price: Number(form.unit_price),
        description: form.description,
        uom: form.uom,
      });
      toast.success("Item updated");
      setEditing(false);
      await load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const applyRecommendation = async () => {
    const s = data?.stats;
    if (!s) return;
    setApplying(true);
    try {
      await api.post(`/items/${encodeURIComponent(itemCode)}/apply-recommendation`, {
        min_qty: s.recommended_min,
        max_qty: s.recommended_max,
      });
      toast.success(`Applied: Min ${s.recommended_min} / Max ${s.recommended_max}`);
      await load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const item = data?.item;
  const s = data?.stats;
  const critMeta = s ? (CRITICALITY_META[s.criticality] || CRITICALITY_META[3]) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {loading || !item ? (
          <div className="space-y-4 pt-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center justify-between gap-2 pr-6">
                <SheetTitle className="font-heading">
                  <span className="font-mono text-primary">{item.item_code}</span>
                </SheetTitle>
                <StatusChip status={item.status} />
              </div>
              <SheetDescription data-testid="item-detail-description" className="text-sm text-foreground">
                {item.description}
              </SheetDescription>
              <p className="text-xs text-muted-foreground">
                {item.uom} · {item.item_type || "Other"} · Criticality {s.criticality} — {s.criticality_label}
              </p>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Current Stock" value={formatNumber(item.current_qty)} testId="item-detail-current-stock" />
              <Metric label="Minimum" value={formatNumber(item.min_qty)} testId="item-detail-min" />
              <Metric label="Maximum" value={formatNumber(item.max_qty)} testId="item-detail-max" />
              <Metric label="Unit Rate" value={formatUSD2(item.unit_price)} testId="item-detail-unit-rate" />
              <Metric label="Total Value" value={formatUSD(item.total_value)} testId="item-detail-total-value" />
              <Metric label="Last Transaction" value={formatDate(data.last_transaction_date)} testId="item-detail-last-txn" />
            </div>

            {/* Edit master data */}
            <div className="mt-4 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Master Data</p>
                {!editing ? (
                  <Button data-testid="item-detail-edit-button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button data-testid="item-detail-save-button" size="sm" onClick={saveEdit} disabled={saving}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {editing && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Input data-testid="item-edit-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Item Type</Label>
                    <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                      <SelectTrigger data-testid="item-edit-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Criticality</Label>
                    <Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}>
                      <SelectTrigger data-testid="item-edit-criticality-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CRITICALITY_META).map(([k, m]) => (
                          <SelectItem key={k} value={k}>{k} — {m.label} ({m.serviceLevel}% SL)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">UOM</Label>
                    <Input data-testid="item-edit-uom" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit Rate (USD)</Label>
                    <Input data-testid="item-edit-price" type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Minimum Stock</Label>
                    <Input data-testid="item-edit-min" type="number" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Maximum Stock</Label>
                    <Input data-testid="item-edit-max" type="number" value={form.max_qty} onChange={(e) => setForm({ ...form, max_qty: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-5" />

            {/* Consumption metrics per spec */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consumption Analysis</p>
              <p className="text-[11px] text-muted-foreground">Review date: {formatDate(s.report_review_date)}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="First IN Date" value={formatDate(s.first_in_date)} testId="item-detail-first-receipt" />
              <Metric label="Months History" value={formatNumber(s.months_history)} testId="item-detail-months-history" />
              <Metric label="Cumulative Consumption" value={formatNumber(s.cumulative_consumption)} testId="item-detail-total-consumption" />
              <Metric label="Avg Monthly" value={formatNumber(s.avg_monthly_consumption)} testId="item-detail-avg-monthly" />
              <Metric label="Avg Yearly" value={formatNumber(s.avg_yearly_consumption)} testId="item-detail-avg-yearly" />
              <Metric label="Monthly Std Dev" value={formatNumber(s.consumption_std_dev)} testId="item-detail-std-dev" />
            </div>

            {data.monthly?.length > 0 && (
              <div data-testid="item-detail-consumption-chart" className="mt-4 rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consumption Trend (monthly net = OUT − WO returns, zero months included)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={data.monthly} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar name="Consumption (net)" dataKey="consumption" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line name="Cumulative" type="monotone" dataKey="cumulative_consumption" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recommendation per spec */}
            <div data-testid="item-detail-recommendation" className="mt-4 rounded-lg border bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recommended Min / Max</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    s.stock_status === "REORDER"
                      ? "bg-[hsl(var(--status-below-min)/0.12)] text-[hsl(var(--status-below-min))]"
                      : "bg-[hsl(var(--status-ok)/0.1)] text-[hsl(var(--status-ok))]"
                  }`} data-testid="item-detail-reorder-status">{s.stock_status}</span>
                </div>
                <Button
                  data-testid="item-detail-apply-recommendation"
                  size="sm"
                  onClick={applyRecommendation}
                  disabled={applying || s.recommended_min === 0}
                >
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {applying ? "Applying..." : "Apply"}
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Service Level" value={`${s.service_level}%`} testId="item-detail-service-level" />
                <Metric label="Z-Value" value={s.z_value} testId="item-detail-z-value" />
                <Metric label="Lead-Time Demand" value={formatNumber(s.lead_time_demand)} testId="item-detail-lt-demand" />
                <Metric label="Safety Stock" value={formatNumber(s.safety_stock)} testId="item-detail-safety-stock" />
                <Metric label="Current Min" value={formatNumber(item.min_qty)} />
                <Metric label="Recommended Min (ROP)" value={formatNumber(s.recommended_min)} testId="item-detail-rec-min" />
                <Metric label="Current Max" value={formatNumber(item.max_qty)} />
                <Metric label="Recommended Max" value={formatNumber(s.recommended_max)} testId="item-detail-rec-max" />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Criticality {s.criticality} ({critMeta.label}) → {s.service_level}% service level, Z = {s.z_value}. Safety Stock = Z × Std Dev × √{s.lead_time_months} = {formatNumber(s.safety_stock)}. Rec. Min = Lead-Time Demand ({formatNumber(s.lead_time_demand)}) + Safety Stock. Rec. Max = {s.max_demand_months}-month demand ({formatNumber(s.six_month_demand)}) + Safety Stock.
              </p>
              {s.confidence === "LOW" && (
                <div data-testid="item-detail-low-confidence" className="mt-2 flex items-start gap-2 rounded-md border border-[hsl(var(--status-minimum)/0.35)] bg-[hsl(var(--status-minimum)/0.08)] p-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--status-minimum))]" />
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">Lower-confidence recommendation:</span> {s.confidence_reasons.join("; ")}. The normal-distribution model may not represent intermittent or low-history items well — review manually before applying.
                  </p>
                </div>
              )}
            </div>

            {/* Recent transactions */}
            {data.recent_transactions?.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Transactions</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Dir</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 odd:bg-muted/20">
                          <td className="px-3 py-1.5 tabular-nums">{t.date}</td>
                          <td className="px-3 py-1.5">{t.txn_type}</td>
                          <td className={`px-3 py-1.5 font-semibold ${t.direction === "IN" ? "text-[hsl(var(--status-ok))]" : "text-[hsl(var(--status-below-min))]"}`}>{t.direction}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(t.qty)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{t.reference_no || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
