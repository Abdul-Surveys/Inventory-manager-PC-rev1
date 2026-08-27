import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { FileUp, Download, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle, History } from "lucide-react";

const EXPORTS = [
  { label: "Inventory Report", path: "/export/inventory", testId: "export-inventory-button", desc: "Full item master with stock, values and status" },
  { label: "Transactions Report", path: "/export/transactions", testId: "export-transactions-button", desc: "All warehouse IN/OUT movements" },
  { label: "Consumption Analysis", path: "/export/analysis", testId: "export-analysis-button", desc: "Consumption, averages and min/max recommendations" },
  { label: "Reorder Proposal", path: "/export/reorder", testId: "export-reorder-button", desc: "Suggested purchase quantities for low-stock items" },
  { label: "Monthly Snapshot", path: "/export/monthly-snapshot", testId: "export-snapshot-button", desc: "This month vs previous month comparison" },
  { label: "Non-Moving Items", path: "/export/non-moving", testId: "export-non-moving-button", desc: "Items with no movement for 12 months" },
  { label: "Top 20 High-Value", path: "/export/top20", testId: "export-top20-button", desc: "Highest inventory value items" },
];

export default function ImportExport() {
  const itemFileRef = useRef(null);
  const txnFileRef = useRef(null);
  const [itemFile, setItemFile] = useState(null);
  const [txnFile, setTxnFile] = useState(null);
  const [openingBalance, setOpeningBalance] = useState(true);
  const [applyToStock, setApplyToStock] = useState(false);
  const [importingItems, setImportingItems] = useState(false);
  const [importingTxns, setImportingTxns] = useState(false);
  const [itemResult, setItemResult] = useState(null);
  const [txnResult, setTxnResult] = useState(null);

  const runItemImport = async () => {
    if (!itemFile) {
      toast.error("Please choose an .xlsx or .csv file first");
      return;
    }
    setImportingItems(true);
    setItemResult(null);
    try {
      const fd = new FormData();
      fd.append("file", itemFile);
      const res = await api.post(`/import/items?create_opening_balance=${openingBalance}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      });
      setItemResult(res.data);
      toast.success(`Import complete: ${formatNumber(res.data.created)} created, ${formatNumber(res.data.updated)} updated`);
      setItemFile(null);
      if (itemFileRef.current) itemFileRef.current.value = "";
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setImportingItems(false);
    }
  };

  const runTxnImport = async () => {
    if (!txnFile) {
      toast.error("Please choose an .xlsx or .csv file first");
      return;
    }
    setImportingTxns(true);
    setTxnResult(null);
    try {
      const fd = new FormData();
      fd.append("file", txnFile);
      const res = await api.post(`/import/transactions?apply_to_stock=${applyToStock}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      });
      setTxnResult(res.data);
      toast.success(`Transactions imported: ${formatNumber(res.data.imported)}`);
      setTxnFile(null);
      if (txnFileRef.current) txnFileRef.current.value = "";
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setImportingTxns(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* Item master import */}
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Import Item Master (Excel / CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            data-testid="import-dropzone"
            onClick={() => itemFileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{itemFile ? itemFile.name : "Click to choose a file"}</p>
            <p className="text-xs text-muted-foreground">Columns: Item Code, Item Description, UOM, Unit Price, Min Qty, Max Qty, Current Qty, Item Type, Criticality</p>
          </button>
          <input
            ref={itemFileRef}
            data-testid="import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setItemFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-center gap-2">
            <Checkbox data-testid="import-opening-balance-checkbox" id="ob" checked={openingBalance} onCheckedChange={(v) => setOpeningBalance(Boolean(v))} />
            <Label htmlFor="ob" className="text-sm">Create Opening Balance IN transactions for new items with current stock</Label>
          </div>
          <Button data-testid="import-submit-button" onClick={runItemImport} disabled={importingItems || !itemFile} className="w-full sm:w-auto">
            {importingItems ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>) : (<><FileUp className="mr-2 h-4 w-4" /> Import Items</>)}
          </Button>

          {itemResult && (
            <div data-testid="import-result" className="rounded-lg border border-[hsl(var(--status-ok)/0.35)] bg-[hsl(var(--status-ok)/0.06)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--status-ok))]">
                <CheckCircle2 className="h-4 w-4" /> Import complete
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-foreground sm:grid-cols-3">
                <li>Rows processed: <span className="font-semibold tabular-nums">{formatNumber(itemResult.total_rows)}</span></li>
                <li>Items created: <span className="font-semibold tabular-nums">{formatNumber(itemResult.created)}</span></li>
                <li>Items updated: <span className="font-semibold tabular-nums">{formatNumber(itemResult.updated)}</span></li>
                <li>Rows skipped: <span className="font-semibold tabular-nums">{formatNumber(itemResult.skipped)}</span></li>
                <li className="col-span-2">Opening balance transactions: <span className="font-semibold tabular-nums">{formatNumber(itemResult.opening_balance_transactions)}</span></li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction history import */}
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-4 w-4" /> Import Past Transactions (Excel / CSV)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            data-testid="txn-import-dropzone"
            onClick={() => txnFileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{txnFile ? txnFile.name : "Click to choose a file"}</p>
            <p className="text-xs text-muted-foreground">Required: Date, Item Code, Direction (IN/OUT), Quantity · Optional: Transaction Type, Reference No, Notes</p>
          </button>
          <input
            ref={txnFileRef}
            data-testid="txn-import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setTxnFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-start gap-2">
            <Checkbox data-testid="txn-import-apply-stock-checkbox" id="apply-stock" checked={applyToStock} onCheckedChange={(v) => setApplyToStock(Boolean(v))} className="mt-0.5" />
            <Label htmlFor="apply-stock" className="text-sm leading-snug">
              Apply these movements to current stock
              <span className="block text-xs font-normal text-muted-foreground">Leave unchecked if current stock already reflects this history — transactions will feed consumption analysis only.</span>
            </Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="txn-import-submit-button" onClick={runTxnImport} disabled={importingTxns || !txnFile}>
              {importingTxns ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>) : (<><FileUp className="mr-2 h-4 w-4" /> Import Transactions</>)}
            </Button>
            <Button data-testid="txn-import-template-button" variant="outline" onClick={() => downloadReport("/import/transactions/template")}>
              <Download className="mr-1.5 h-4 w-4" /> Download Template
            </Button>
          </div>

          {txnResult && (
            <div data-testid="txn-import-result" className="rounded-lg border border-[hsl(var(--status-ok)/0.35)] bg-[hsl(var(--status-ok)/0.06)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--status-ok))]">
                <CheckCircle2 className="h-4 w-4" /> Transactions imported
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-foreground">
                <li>Imported: <span className="font-semibold tabular-nums">{formatNumber(txnResult.imported)}</span></li>
                <li>Skipped: <span className="font-semibold tabular-nums">{formatNumber(txnResult.skipped)}</span></li>
                <li>Unknown item codes: <span className="font-semibold tabular-nums">{formatNumber(txnResult.unknown_item_codes)}</span></li>
                <li>Stock updated for: <span className="font-semibold tabular-nums">{txnResult.stock_applied ? `${formatNumber(txnResult.items_affected)} items` : "not applied"}</span></li>
              </ul>
              {txnResult.errors_sample?.length > 0 && (
                <div className="mt-3 rounded-md border border-[hsl(var(--status-minimum)/0.35)] bg-[hsl(var(--status-minimum)/0.07)] p-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--status-minimum))]">
                    <AlertTriangle className="h-3.5 w-3.5" /> Skipped row details (first {txnResult.errors_sample.length})
                  </p>
                  <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[11px] text-muted-foreground">
                    {txnResult.errors_sample.map((er, i) => (
                      <li key={i}>{er.row ? `Row ${er.row}: ` : ""}{er.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exports */}
      <Card className="col-span-12 rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Export Reports to Excel</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
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
