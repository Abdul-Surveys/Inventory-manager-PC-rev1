import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Paginator } from "@/components/Paginator";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatNumber, formatUSD, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Download, Info, PackageX } from "lucide-react";

export default function NonMoving() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/non-moving", { params: { page, page_size: pageSize } });
      setRows(res.data.rows);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      setMonths(res.data.months);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Alert className="rounded-xl border-[hsl(var(--status-minimum)/0.4)] bg-[hsl(var(--status-minimum)/0.06)]">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm font-semibold">Non-Moving classification rules</AlertTitle>
        <AlertDescription className="text-xs">
          An item is Non-Moving only if it has been received into the warehouse (at least one IN transaction) and has had no movement for {months} months.
          Items that were never purchased/received (even with zero stock) are excluded.
        </AlertDescription>
      </Alert>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <p data-testid="non-moving-count" className="text-sm font-medium">
              <PackageX className="mr-1.5 inline h-4 w-4 text-muted-foreground" />
              {formatNumber(total)} non-moving item{total === 1 ? "" : "s"}
            </p>
            <Button data-testid="non-moving-export-button" variant="outline" size="sm" onClick={() => downloadReport("/export/non-moving")}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table data-testid="non-moving-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Current Stock</th>
                  <th className="px-3 py-2 text-right">Total Value</th>
                  <th className="px-3 py-2">First Receipt</th>
                  <th className="px-3 py-2">Last Transaction</th>
                  <th className="px-3 py-2">Classification</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={8} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No non-moving items found. Items appear here once they have been received but show no movement for {months} months.
                  </td></tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.item_code}
                      data-testid={`non-moving-row-${r.item_code}`}
                      onClick={() => { setDrawerCode(r.item_code); setDrawerOpen(true); }}
                      className="h-11 cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-primary">{r.item_code}</td>
                      <td className="px-3 py-2 max-w-[280px] truncate">{r.description}</td>
                      <td className="px-3 py-2 text-xs">{r.item_type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.current_qty)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatUSD(r.total_value)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatDate(r.first_receipt_date)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatDate(r.last_transaction_date)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full border border-[hsl(var(--status-minimum)/0.35)] bg-[hsl(var(--status-minimum)/0.1)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--status-minimum))]">
                          {r.classification}
                        </span>
                      </td>
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
    </div>
  );
}
