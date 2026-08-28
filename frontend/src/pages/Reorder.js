import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Paginator } from "@/components/Paginator";
import { StatusChip } from "@/components/StatusChip";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatUSD, formatUSD2, formatNumber, ITEM_TYPES, CRITICALITY_META } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Search, Download, ShoppingCart } from "lucide-react";

const CritBadge = ({ value }) => {
  const v = Number(value) || 3;
  const meta = CRITICALITY_META[v] || CRITICALITY_META[3];
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${meta.chip}`}>{v}</span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{v} — {meta.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default function Reorder() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCost, setTotalCost] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState("all");
  const [criticality, setCriticality] = useState("all");
  const [includeMinimum, setIncludeMinimum] = useState(true);
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/reorder", {
        params: {
          page: opts.page ?? page, page_size: pageSize,
          search: (opts.search ?? search) || undefined,
          item_type: itemType, criticality, include_minimum: includeMinimum,
        },
      });
      setRows(res.data.rows);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      setTotalCost(res.data.total_est_cost);
      setTotalUnits(res.data.total_units);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, itemType, criticality, includeMinimum]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, itemType, criticality, includeMinimum]);

  const onSearchChange = (v) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: v });
    }, 350);
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="reorder-search-input" className="pl-9" placeholder="Search item code or description..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
          </div>
          <Select value={itemType} onValueChange={(v) => { setItemType(v); setPage(1); }}>
            <SelectTrigger data-testid="reorder-type-filter" className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={criticality} onValueChange={(v) => { setCriticality(v); setPage(1); }}>
            <SelectTrigger data-testid="reorder-criticality-filter" className="w-[180px]"><SelectValue placeholder="Criticality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criticality</SelectItem>
              {Object.entries(CRITICALITY_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{k} — {m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch data-testid="reorder-include-minimum-toggle" id="inc-min" checked={includeMinimum} onCheckedChange={(v) => { setIncludeMinimum(v); setPage(1); }} />
            <Label htmlFor="inc-min" className="text-sm">Include items at minimum</Label>
          </div>
          <Button data-testid="reorder-export-button" onClick={() => downloadReport("/export/reorder", { search, item_type: itemType, criticality, include_minimum: includeMinimum })}>
            <Download className="mr-1.5 h-4 w-4" /> Export Proposal
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 rounded-xl shadow-sm sm:col-span-4">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items to Reorder</p>
            <p data-testid="reorder-total-items" className="mt-1 font-heading text-2xl font-semibold tabular-nums">{formatNumber(total)}</p>
          </CardContent>
        </Card>
        <Card className="col-span-12 rounded-xl shadow-sm sm:col-span-4">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested Units</p>
            <p data-testid="reorder-total-units" className="mt-1 font-heading text-2xl font-semibold tabular-nums">{formatNumber(totalUnits)}</p>
          </CardContent>
        </Card>
        <Card className="col-span-12 rounded-xl shadow-sm sm:col-span-4">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimated Total Cost</p>
            <p data-testid="reorder-total-cost" className="mt-1 font-heading text-2xl font-semibold tabular-nums text-primary">{formatUSD(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table data-testid="reorder-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Crit</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2 text-right">Suggested Qty</th>
                  <th className="px-3 py-2 text-right">Unit Rate</th>
                  <th className="px-3 py-2 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={10} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">No items need reordering. All stock levels are healthy.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.item_code}
                      data-testid={`reorder-row-${r.item_code}`}
                      onClick={() => { setDrawerCode(r.item_code); setDrawerOpen(true); }}
                      className="h-11 cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-primary">{r.item_code}</td>
                      <td className="px-3 py-2"><CritBadge value={r.criticality} /></td>
                      <td className="px-3 py-2 max-w-[260px] truncate">{r.description}</td>
                      <td className="px-3 py-2"><StatusChip status={r.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.current_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.min_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.max_qty)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-primary">{formatNumber(r.suggested_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUSD2(r.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUSD(r.est_cost)}</td>
                    </tr>
                  ))
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

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShoppingCart className="h-3.5 w-3.5" /> Sorted critical-first (Tier 1 → 2 → 3), then by estimated cost. Suggested Order Qty = Target stock (Maximum, or Minimum when no maximum is set) − Current stock.
      </p>
    </div>
  );
}
