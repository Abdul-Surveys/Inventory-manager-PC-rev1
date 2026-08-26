import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { FileUp, Download, FileSpreadsheet, CheckCircle2, Loader2 } from "lucide-react";

const EXPORTS = [
  { label: "Inventory Report", path: "/export/inventory", testId: "export-inventory-button", desc: "Full item master with stock, values and status" },
  { label: "Transactions Report", path: "/export/transactions", testId: "export-transactions-button", desc: "All warehouse IN/OUT movements" },
  { label: "Consumption Analysis", path: "/export/analysis", testId: "export-analysis-button", desc: "Consumption, averages and min/max recommendations" },
  { label: "Non-Moving Items", path: "/export/non-moving", testId: "export-non-moving-button", desc: "Items with no movement for 12 months" },
  { label: "Top 20 High-Value", path: "/export/top20", testId: "export-top20-button", desc: "Highest inventory value items" },
];

export default function ImportExport() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [openingBalance, setOpeningBalance] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const runImport = async () => {
    if (!file) {
      toast.error("Please choose an .xlsx or .csv file first");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/import/items?create_opening_balance=${openingBalance}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      });
      setResult(res.data);
      toast.success(`Import complete: ${formatNumber(res.data.created)} created, ${formatNumber(res.data.updated)} updated`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* Import */}
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Import Item Master (Excel / CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            data-testid="import-dropzone"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{file ? file.name : "Click to choose a file"}</p>
            <p className="text-xs text-muted-foreground">Supports .xlsx and .csv · Columns: Item Code, Item Description, UOM, Unit Price, Min Qty, Max Qty, Current Qty, Item Type, Criticality</p>
          </button>
          <input
            ref={fileRef}
            data-testid="import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-center gap-2">
            <Checkbox data-testid="import-opening-balance-checkbox" id="ob" checked={openingBalance} onCheckedChange={(v) => setOpeningBalance(Boolean(v))} />
            <Label htmlFor="ob" className="text-sm">Create Opening Balance IN transactions for new items with current stock</Label>
          </div>
          <Button data-testid="import-submit-button" onClick={runImport} disabled={importing || !file} className="w-full sm:w-auto">
            {importing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing... this can take a moment for large files</>) : (<><FileUp className="mr-2 h-4 w-4" /> Import File</>)}
          </Button>

          {result && (
            <div data-testid="import-result" className="rounded-lg border border-[hsl(var(--status-ok)/0.35)] bg-[hsl(var(--status-ok)/0.06)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--status-ok))]">
                <CheckCircle2 className="h-4 w-4" /> Import complete
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-foreground sm:grid-cols-3">
                <li>Rows processed: <span className="font-semibold tabular-nums">{formatNumber(result.total_rows)}</span></li>
                <li>Items created: <span className="font-semibold tabular-nums">{formatNumber(result.created)}</span></li>
                <li>Items updated: <span className="font-semibold tabular-nums">{formatNumber(result.updated)}</span></li>
                <li>Rows skipped: <span className="font-semibold tabular-nums">{formatNumber(result.skipped)}</span></li>
                <li className="col-span-2">Opening balance transactions: <span className="font-semibold tabular-nums">{formatNumber(result.opening_balance_transactions)}</span></li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exports */}
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Export Reports to Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {EXPORTS.map((e) => (
            <div key={e.path} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[hsl(var(--status-ok))]" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.desc}</p>
                </div>
              </div>
              <Button data-testid={e.testId} variant="outline" size="sm" onClick={() => downloadReport(e.path)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
