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
import { formatUSD2, formatUSD, formatNumber, formatDate, ITEM_TYPES } from "@/lib/format";
import { toast } from "sonner";
import { Pencil, Check, X, Wand2 } from "lucide-react";
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
    const rec = data?.recommendation;
    if (!rec) return;
    setApplying(true);
    try {
      await api.post(`/items/${encodeURIComponent(itemCode)}/apply-recommendation`, {
        min_qty: rec.recommended_min,
        max_qty: rec.recommended_max,
      });
      toast.success(`Applied: Min ${rec.recommended_min} / Max ${rec.recommended_max}`);
      await load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const item = data?.item;
  const rec = data?.recommendation;

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
                {item.uom} · {item.item_type || "Other"} {item.criticality ? `· Criticality ${item.criticality}` : ""}
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
                    <Label className="text-xs">UOM</Label>
                    <Input data-testid="item-edit-uom" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Minimum Stock</Label>
                    <Input data-testid="item-edit-min" type="number" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Maximum Stock</Label>
                    <Input data-testid="item-edit-max" type="number" value={form.max_qty} onChange={(e) => setForm({ ...form, max_qty: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit Rate (USD)</Label>
                    <Input data-testid="item-edit-price" type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-5" />

            {/* Consumption metrics */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consumption Analysis</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Total Consumption" value={formatNumber(data.total_consumption)} testId="item-detail-total-consumption" />
              <Metric label="Avg Monthly" value={formatNumber(data.avg_monthly_consumption)} testId="item-detail-avg-monthly" />
              <Metric label="Total IN" value={formatNumber(data.total_in)} testId="item-detail-total-in" />
              <Metric label="Total OUT" value={formatNumber(data.total_out)} testId="item-detail-total-out" />
              <Metric label="WO Returns" value={formatNumber(data.wo_returns)} testId="item-detail-wo-returns" />
              <Metric label="First Receipt" value={formatDate(data.first_receipt_date)} testId="item-detail-first-receipt" />
            </div>

            {data.monthly?.length > 0 && (
              <div data-testid="item-detail-consumption-chart" className="mt-4 rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consumption Trend (monthly)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={data.monthly} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar name="Consumption" dataKey="consumption" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line name="Cumulative" type="monotone" dataKey="cumulative_consumption" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recommendation */}
            {rec && (
              <div data-testid="item-detail-recommendation" className="mt-4 rounded-lg border bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Min/Max Recommendation</p>
                  <Button
                    data-testid="item-detail-apply-recommendation"
                    size="sm"
                    onClick={applyRecommendation}
                    disabled={applying || rec.recommended_min === 0}
                  >
                    <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {applying ? "Applying..." : "Apply"}
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Current Min" value={formatNumber(rec.current_min)} />
                  <Metric label="Recommended Min" value={formatNumber(rec.recommended_min)} testId="item-detail-rec-min" />
                  <Metric label="Current Max" value={formatNumber(rec.current_max)} />
                  <Metric label="Recommended Max" value={formatNumber(rec.recommended_max)} testId="item-detail-rec-max" />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Based on avg monthly consumption {formatNumber(rec.avg_monthly_consumption)} × lead time {data.settings.lead_time_months} mo + safety stock {formatNumber(rec.safety_stock)} ({data.settings.safety_months} mo); coverage {data.settings.coverage_months} mo.
                  {rec.recommended_min === 0 ? " No consumption history yet — recommendation unavailable." : ""}
                </p>
              </div>
            )}

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
