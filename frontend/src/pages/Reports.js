import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatUSD, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { Download, TrendingUp, TrendingDown, Minus, DollarSign, ArrowLeftRight, PackageCheck, Flame } from "lucide-react";

const DeltaBadge = ({ value, pct, invert = false }) => {
  if (value === null || value === undefined || value === 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><Minus className="h-3 w-3" /> No change</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = good
    ? "bg-[hsl(var(--status-ok)/0.1)] text-[hsl(var(--status-ok))]"
    : "bg-[hsl(var(--status-below-min)/0.1)] text-[hsl(var(--status-below-min))]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{typeof value === "number" && Math.abs(value) >= 1000 ? formatUSD(value) : formatNumber(value)}
      {pct !== null && pct !== undefined ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}
    </span>
  );
};

const CompareCard = ({ title, icon: Icon, cur, prev, delta, pct, money = true, invert = false, testId }) => (
  <Card className="rounded-xl shadow-sm">
    <CardContent className="p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <p data-testid={testId} className="mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums">
        {money ? formatUSD(cur) : formatNumber(cur)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <DeltaBadge value={delta} pct={pct} invert={invert} />
        <span className="text-xs text-muted-foreground tabular-nums">prev: {money ? formatUSD(prev) : formatNumber(prev)}</span>
      </div>
    </CardContent>
  </Card>
);

export default function Reports() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (m) => {
    setLoading(true);
    try {
      const res = await api.get("/reports/monthly-snapshot", { params: { month: m } });
      setData(res.data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report Month</p>
            <Input data-testid="report-month-input" type="month" max={currentMonth} className="mt-1 w-[180px]" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </div>
          <div className="flex-1" />
          <Button data-testid="report-export-button" onClick={() => downloadReport("/export/monthly-snapshot", { month })}>
            <Download className="mr-1.5 h-4 w-4" /> Export Snapshot
          </Button>
        </CardContent>
      </Card>

      {loading || !data ? (
        <div className="grid grid-cols-12 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="col-span-12 h-32 sm:col-span-6 xl:col-span-3" />)}
          <Skeleton className="col-span-12 h-72" />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Comparing <span className="font-semibold text-foreground">{data.month}</span> against <span className="font-semibold text-foreground">{data.prev_month}</span>
          </p>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <CompareCard title="End Inventory Value" icon={DollarSign} cur={data.current.end_inventory_value} prev={data.previous.end_inventory_value} delta={data.deltas.inventory_value} pct={data.deltas.inventory_value_pct} testId="report-inventory-value" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <CompareCard title="Consumption Value" icon={Flame} cur={data.current.consumption_value} prev={data.previous.consumption_value} delta={data.deltas.consumption_value} pct={data.deltas.consumption_value_pct} invert testId="report-consumption-value" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <CompareCard title="Receipts Value" icon={PackageCheck} cur={data.current.receipts_value} prev={data.previous.receipts_value} delta={data.deltas.receipts_value} pct={data.deltas.receipts_value_pct} testId="report-receipts-value" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <CompareCard title="Transactions" icon={ArrowLeftRight} cur={data.current.txn_count} prev={data.previous.txn_count} delta={data.deltas.txn_count} pct={null} money={false} testId="report-txn-count" />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top 10 Consumed Items — {data.month}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table data-testid="report-top-consumed-table" className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Item Code</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">UOM</th>
                        <th className="px-3 py-2 text-right">Consumed Qty</th>
                        <th className="px-3 py-2 text-right">Consumption Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_consumed.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">No consumption recorded in {data.month}.</td></tr>
                      ) : (
                        data.top_consumed.map((t) => (
                          <tr key={t.item_code} className="border-b last:border-0 odd:bg-muted/20">
                            <td className="px-3 py-2 font-mono text-xs text-primary">{t.item_code}</td>
                            <td className="px-3 py-2 max-w-[260px] truncate">{t.description}</td>
                            <td className="px-3 py-2 text-xs">{t.uom}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatNumber(t.consumption_qty)}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUSD(t.consumption_value)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Movement Summary — {data.month}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Consumption Quantity", cur: data.current.consumption_qty, prev: data.previous.consumption_qty, money: false },
                  { label: "Receipts Quantity", cur: data.current.receipts_qty, prev: data.previous.receipts_qty, money: false },
                  { label: "Items with Movement", cur: data.current.items_moved, prev: data.previous.items_moved, money: false },
                  { label: "Items with Consumption", cur: data.current.items_consumed, prev: data.previous.items_consumed, money: false },
                  { label: "Total IN Value", cur: data.current.in_value, prev: data.previous.in_value, money: true },
                  { label: "Total OUT Value", cur: data.current.out_value, prev: data.previous.out_value, money: true },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm">{r.label}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {r.money ? formatUSD(r.cur) : formatNumber(r.cur)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">prev {r.money ? formatUSD(r.prev) : formatNumber(r.prev)}</span>
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Previous month-end inventory value is estimated by reversing this month's net movements from the current value.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
