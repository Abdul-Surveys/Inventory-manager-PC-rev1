import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Paginator } from "@/components/Paginator";
import { ItemAutocomplete } from "@/components/ItemAutocomplete";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatNumber, TXN_TYPES } from "@/lib/format";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Download, Search, Pencil, Trash2 } from "lucide-react";

const FORM_TXN_TYPES = ["Purchase Order", "Work Order", "Return from Work Order", "Return Other", "Adjustment"];
const TYPE_DEFAULT_DIRECTION = {
  "Purchase Order": "IN",
  "Work Order": "OUT",
  "Return from Work Order": "IN",
  "Return Other": "IN",
};

const todayLocal = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

export default function Transactions() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({ date: todayLocal(), direction: "IN", qty: "", txn_type: "Purchase Order", reference_no: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const [txns, setTxns] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [txnType, setTxnType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  const [editTxn, setEditTxn] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/transactions", {
        params: {
          page: opts.page ?? page, page_size: pageSize,
          search: (opts.search ?? search) || undefined,
          direction, txn_type: txnType,
          date_from: dateFrom || undefined, date_to: dateTo || undefined,
        },
      });
      setTxns(res.data.transactions);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, direction, txnType, dateFrom, dateTo]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, direction, txnType, dateFrom, dateTo]);

  const onSearchChange = (v) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: v });
    }, 350);
  };

  const submit = async () => {
    if (!selectedItem) { toast.error("Please select an item"); return; }
    const qty = Number(form.qty);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than zero"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    setSubmitting(true);
    try {
      const res = await api.post("/transactions", {
        date: form.date,
        item_code: selectedItem.item_code,
        direction: form.direction,
        qty,
        txn_type: form.txn_type,
        reference_no: form.reference_no,
        notes: form.notes,
      });
      toast.success(`${form.direction} recorded — new stock: ${formatNumber(res.data.new_stock)}`);
      setForm({ ...form, qty: "", reference_no: "", notes: "" });
      setSelectedItem(null);
      setPage(1);
      load({ page: 1 });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t) => {
    setEditTxn(t);
    setEditForm({ date: t.date, direction: t.direction, qty: t.qty, txn_type: t.txn_type, reference_no: t.reference_no || "", notes: t.notes || "" });
  };

  const saveEdit = async () => {
    const qty = Number(editForm.qty);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than zero"); return; }
    if (!editForm.date) { toast.error("Date is required"); return; }
    setSavingEdit(true);
    try {
      const res = await api.put(`/transactions/${editTxn.id}`, { ...editForm, qty });
      toast.success(`Transaction updated — new stock: ${formatNumber(res.data.new_stock)}`);
      setEditTxn(null);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteTxn = async (t) => {
    try {
      const res = await api.delete(`/transactions/${t.id}`);
      toast.success(`Transaction deleted — new stock: ${formatNumber(res.data.new_stock)}`);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Add transaction */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Record Transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Label className="text-xs">Item *</Label>
              <ItemAutocomplete selected={selectedItem} onSelect={setSelectedItem} />
              {selectedItem && (
                <p data-testid="txn-selected-item-info" className="mt-1 text-xs text-muted-foreground tabular-nums">
                  Current stock: {formatNumber(selectedItem.current_qty)} · UOM: {selectedItem.uom}
                </p>
              )}
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs">Direction *</Label>
              <ToggleGroup
                type="single"
                value={form.direction}
                onValueChange={(v) => v && setForm({ ...form, direction: v })}
                className="mt-0.5 grid w-full grid-cols-2 rounded-md border p-0.5"
              >
                <ToggleGroupItem data-testid="txn-direction-in" value="IN" className="h-8 text-xs data-[state=on]:bg-[hsl(var(--status-ok))] data-[state=on]:text-white">
                  <ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> IN
                </ToggleGroupItem>
                <ToggleGroupItem data-testid="txn-direction-out" value="OUT" className="h-8 text-xs data-[state=on]:bg-[hsl(var(--status-below-min))] data-[state=on]:text-white">
                  <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" /> OUT
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs">Transaction Type *</Label>
              <Select
                value={form.txn_type}
                onValueChange={(v) => setForm({ ...form, txn_type: v, direction: TYPE_DEFAULT_DIRECTION[v] || form.direction })}
              >
                <SelectTrigger data-testid="txn-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_TXN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-1">
              <Label className="text-xs">Quantity *</Label>
              <Input data-testid="txn-qty-input" type="number" min="0" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div className="lg:col-span-1">
              <Label className="text-xs">Date *</Label>
              <Input data-testid="txn-date-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs">Reference No</Label>
              <Input data-testid="txn-reference-input" placeholder="WO / PO number..." value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
            </div>
            <div className="lg:col-span-10">
              <Label className="text-xs">Notes</Label>
              <Textarea data-testid="txn-notes-input" rows={1} className="min-h-[38px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button data-testid="transactions-add-submit-button" className="w-full" onClick={submit} disabled={submitting}>
                {submitting ? "Recording..." : "Record Transaction"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input data-testid="txn-search-input" className="pl-9" placeholder="Search code, description, reference..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
            </div>
            <Select value={direction} onValueChange={(v) => { setDirection(v); setPage(1); }}>
              <SelectTrigger data-testid="txn-direction-filter" className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
                <SelectItem value="OUT">OUT</SelectItem>
              </SelectContent>
            </Select>
            <Select value={txnType} onValueChange={(v) => { setTxnType(v); setPage(1); }}>
              <SelectTrigger data-testid="txn-type-filter" className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TXN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input data-testid="txn-date-from" type="date" className="w-[150px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input data-testid="txn-date-to" type="date" className="w-[150px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            <Button data-testid="txn-export-button" variant="outline" onClick={() => downloadReport("/export/transactions", { date_from: dateFrom, date_to: dateTo, direction, txn_type: txnType })}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table data-testid="transactions-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2 w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={8} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : txns.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">No transactions recorded yet.</td></tr>
                ) : (
                  txns.map((t) => (
                    <tr key={t.id} data-testid={`txn-row-${t.id}`} className="h-11 border-b last:border-0 odd:bg-muted/20">
                      <td className="px-3 py-2 tabular-nums text-xs">{t.date}</td>
                      <td className="px-3 py-2 font-mono text-xs text-primary">{t.item_code}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate">{t.item_description}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${t.direction === "IN" ? "bg-[hsl(var(--status-ok)/0.1)] text-[hsl(var(--status-ok))]" : "bg-[hsl(var(--status-below-min)/0.1)] text-[hsl(var(--status-below-min))]"}`}>
                          {t.direction === "IN" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                          {t.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatNumber(t.qty)}</td>
                      <td className="px-3 py-2 text-xs">{t.txn_type}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t.reference_no || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button data-testid={`txn-edit-${t.id}`} variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Edit transaction" onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button data-testid={`txn-delete-${t.id}`} variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete transaction">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t.direction} of {formatNumber(t.qty)} for item {t.item_code} ({t.date}) will be permanently removed as if it never happened. Current stock will be recalculated accordingly.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction data-testid="txn-delete-confirm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTxn(t)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-3">
            <Paginator page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} label="transactions" />
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editTxn} onOpenChange={(v) => !v && setEditTxn(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Transaction</DialogTitle>
          </DialogHeader>
          {editTxn && editForm && (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono text-xs text-primary">{editTxn.item_code}</span> — {editTxn.item_description}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input data-testid="txn-edit-date-input" type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Quantity *</Label>
                  <Input data-testid="txn-edit-qty-input" type="number" min="0" value={editForm.qty} onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Direction *</Label>
                  <ToggleGroup
                    type="single"
                    value={editForm.direction}
                    onValueChange={(v) => v && setEditForm({ ...editForm, direction: v })}
                    className="mt-0.5 grid w-full grid-cols-2 rounded-md border p-0.5"
                  >
                    <ToggleGroupItem data-testid="txn-edit-direction-in" value="IN" className="h-8 text-xs data-[state=on]:bg-[hsl(var(--status-ok))] data-[state=on]:text-white">IN</ToggleGroupItem>
                    <ToggleGroupItem data-testid="txn-edit-direction-out" value="OUT" className="h-8 text-xs data-[state=on]:bg-[hsl(var(--status-below-min))] data-[state=on]:text-white">OUT</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div>
                  <Label className="text-xs">Transaction Type *</Label>
                  <Select value={editForm.txn_type} onValueChange={(v) => setEditForm({ ...editForm, txn_type: v })}>
                    <SelectTrigger data-testid="txn-edit-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TXN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Reference No</Label>
                  <Input data-testid="txn-edit-reference-input" value={editForm.reference_no} onChange={(e) => setEditForm({ ...editForm, reference_no: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Textarea data-testid="txn-edit-notes-input" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditTxn(null)}>Cancel</Button>
                <Button data-testid="txn-edit-save-button" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
