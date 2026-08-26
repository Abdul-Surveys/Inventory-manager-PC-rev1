import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Paginator } from "@/components/Paginator";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatNumber, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Search, Download, Wand2 } from "lucide-react";

export default function Analysis() {
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [withConsumptionOnly, setWithConsumptionOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [applyingCode, setApplyingCode] = useState(null);
  const debounceRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/analysis", {
        params: {
          page: opts.page ?? page, page_size: pageSize,
          search: (opts.search ?? search) || undefined,
          with_consumption_only: opts.withConsumptionOnly ?? withConsumptionOnly,
        },
      });
      setRows(res.data.rows);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      setSettings(res.data.settings);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, withConsumptionOnly]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, withConsumptionOnly]);

  const onSearchChange = (v) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: v });
    }, 350);
  };

  const applyRec = async (row) => {
    const rec = row.recommendation;
    setApplyingCode(row.item_code);
    try {
      await api.post(`/items/${encodeURIComponent(row.item_code)}/apply-recommendation`, {
        min_qty: rec.recommended_min, max_qty: rec.recommended_max,
      });
      toast.success(`${row.item_code}: Min ${rec.recommended_min} / Max ${rec.recommended_max} applied`);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setApplyingCode(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="analysis-search-input" className="pl-9" placeholder="Search item code or description..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch data-testid="analysis-consumption-toggle" checked={withConsumptionOnly} onCheckedChange={(v) => { setWithConsumptionOnly(v); setPage(1); }} id="cons-only" />
            <Label htmlFor="cons-only" className="text-sm">Items with actual consumption only</Label>
          </div>
          <Button data-testid="analysis-export-button" variant="outline" onClick={() => downloadReport("/export/analysis")}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          {settings && (
            <p className="w-full text-xs text-muted-foreground">
              Formula: Rec. Min = Avg Monthly × Lead Time ({settings.lead_time_months} mo) + Safety Stock ({settings.safety_months} mo) · Rec. Max = Rec. Min + Avg Monthly × Coverage ({settings.coverage_months} mo). Adjust in Settings.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table data-testid="analysis-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">Total Consumption</th>
                  <th className="px-3 py-2 text-right">Avg Monthly</th>
                  <th className="px-3 py-2">First Receipt</th>
                  <th className="px-3 py-2">Last Txn</th>
                  <th className="px-3 py-2 text-right">Min (Cur → Rec)</th>
                  <th className="px-3 py-2 text-right">Max (Cur → Rec)</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={10} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {withConsumptionOnly ? "No items with consumption yet. Record OUT transactions to see analysis." : "No transaction data yet."}
                  </td></tr>
                ) : (
                  rows.map((r) => {
                    const rec = r.recommendation;
                    const minChanged = rec.recommended_min !== r.min_qty;
                    const maxChanged = rec.recommended_max !== r.max_qty;
                    return (
                      <tr
                        key={r.item_code}
                        data-testid={`analysis-row-${r.item_code}`}
                        className="h-11 cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                        onClick={() => { setDrawerCode(r.item_code); setDrawerOpen(true); }}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-primary">{r.item_code}</td>
                        <td className="px-3 py-2 max-w-[240px] truncate">{r.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.current_qty)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatNumber(r.total_consumption)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.avg_monthly_consumption)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{formatDate(r.first_receipt_date)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{formatDate(r.last_transaction_date)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(r.min_qty)} <span className="text-muted-foreground">→</span>{" "}
                          <span className={minChanged ? "font-semibold text-primary" : ""}>{formatNumber(rec.recommended_min)}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(r.max_qty)} <span className="text-muted-foreground">→</span>{" "}
                          <span className={maxChanged ? "font-semibold text-primary" : ""}>{formatNumber(rec.recommended_max)}</span>
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            data-testid={`analysis-apply-${r.item_code}`}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={applyingCode === r.item_code || rec.recommended_min === 0 || (!minChanged && !maxChanged)}
                            onClick={() => applyRec(r)}
                          >
                            <Wand2 className="mr-1 h-3 w-3" /> {applyingCode === r.item_code ? "..." : "Apply"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-3">
            <Paginator page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} label="items" />
          </div>
        </CardContent>
      </Card>

      <ItemDetailDrawer itemCode={drawerCode} open={drawerOpen} onOpenChange={setDrawerOpen} onChanged={() => load()} />
    </div>
  );
}
