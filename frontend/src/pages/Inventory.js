import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/StatusChip";
import { Paginator } from "@/components/Paginator";
import { ItemDetailDrawer } from "@/components/ItemDetailDrawer";
import { api, downloadReport, getErrorMessage } from "@/lib/api";
import { formatUSD2, formatUSD, formatNumber, ITEM_TYPES, STATUS_META } from "@/lib/format";
import { toast } from "sonner";
import { Search, Download, Plus, ArrowUpDown } from "lucide-react";

const EMPTY_ITEM = { item_code: "", description: "", uom: "PCS", item_type: "Other", min_qty: 0, max_qty: 0, current_qty: 0, unit_price: 0 };

export default function Inventory() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState("all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [sortBy, setSortBy] = useState("item_code");
  const [sortDir, setSortDir] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [drawerCode, setDrawerCode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/items", {
        params: {
          page: opts.page ?? page,
          page_size: pageSize,
          search: (opts.search ?? search) || undefined,
          item_type: opts.itemType ?? itemType,
          status: opts.status ?? status,
          sort_by: opts.sortBy ?? sortBy,
          sort_dir: opts.sortDir ?? sortDir,
        },
      });
      setItems(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, itemType, status, sortBy, sortDir]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, itemType, status, sortBy, sortDir]);

  const onSearchChange = (v) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: v });
    }, 350);
  };

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortDir(field === "item_code" ? "asc" : "desc");
    }
    setPage(1);
  };

  const createItem = async () => {
    if (!newItem.item_code.trim() || !newItem.description.trim()) {
      toast.error("Item code and description are required");
      return;
    }
    setCreating(true);
    try {
      await api.post("/items", {
        ...newItem,
        min_qty: Number(newItem.min_qty), max_qty: Number(newItem.max_qty),
        current_qty: Number(newItem.current_qty), unit_price: Number(newItem.unit_price),
      });
      toast.success(`Item ${newItem.item_code} created`);
      setAddOpen(false);
      setNewItem(EMPTY_ITEM);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const SortableHead = ({ field, children, className = "" }) => (
    <th className={`px-3 py-2 ${className}`}>
      <button data-testid={`inventory-sort-${field}`} onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {children} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="inventory-search-input"
              className="pl-9"
              placeholder="Search item code or description..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <Select value={itemType} onValueChange={(v) => { setItemType(v); setPage(1); }}>
            <SelectTrigger data-testid="inventory-type-filter" className="w-[160px]"><SelectValue placeholder="Item Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger data-testid="inventory-status-filter" className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button data-testid="inventory-export-excel-button" variant="outline" onClick={() => downloadReport("/export/inventory", { search, item_type: itemType, status })}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="inventory-add-item-button"><Plus className="mr-1.5 h-4 w-4" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle className="font-heading">Add New Item</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Item Code *</Label>
                  <Input data-testid="add-item-code-input" value={newItem.item_code} onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">UOM</Label>
                  <Input data-testid="add-item-uom-input" value={newItem.uom} onChange={(e) => setNewItem({ ...newItem, uom: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Description *</Label>
                  <Input data-testid="add-item-description-input" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Item Type</Label>
                  <Select value={newItem.item_type} onValueChange={(v) => setNewItem({ ...newItem, item_type: v })}>
                    <SelectTrigger data-testid="add-item-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Unit Rate (USD)</Label>
                  <Input data-testid="add-item-price-input" type="number" step="0.01" value={newItem.unit_price} onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Minimum Stock</Label>
                  <Input data-testid="add-item-min-input" type="number" value={newItem.min_qty} onChange={(e) => setNewItem({ ...newItem, min_qty: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Maximum Stock</Label>
                  <Input data-testid="add-item-max-input" type="number" value={newItem.max_qty} onChange={(e) => setNewItem({ ...newItem, max_qty: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Opening Stock</Label>
                  <Input data-testid="add-item-qty-input" type="number" value={newItem.current_qty} onChange={(e) => setNewItem({ ...newItem, current_qty: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="add-item-submit-button" onClick={createItem} disabled={creating}>{creating ? "Creating..." : "Create Item"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table data-testid="inventory-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <SortableHead field="item_code">Item Code</SortableHead>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">UOM</th>
                  <th className="px-3 py-2">Type</th>
                  <SortableHead field="min_qty" className="text-right">Min</SortableHead>
                  <SortableHead field="max_qty" className="text-right">Max</SortableHead>
                  <SortableHead field="current_qty" className="text-right">Current</SortableHead>
                  <SortableHead field="unit_price" className="text-right">Unit Rate</SortableHead>
                  <SortableHead field="total_value" className="text-right">Total Value</SortableHead>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={10} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : items.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">No items match your filters.</td></tr>
                ) : (
                  items.map((it) => (
                    <tr
                      key={it.item_code}
                      data-testid={`inventory-row-${it.item_code}`}
                      onClick={() => { setDrawerCode(it.item_code); setDrawerOpen(true); }}
                      className="h-11 cursor-pointer border-b last:border-0 odd:bg-muted/20 transition-colors hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-primary">{it.item_code}</td>
                      <td className="px-3 py-2 max-w-[300px] truncate">{it.description}</td>
                      <td className="px-3 py-2 text-xs">{it.uom}</td>
                      <td className="px-3 py-2 text-xs">{it.item_type || "Other"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.min_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.max_qty)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatNumber(it.current_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUSD2(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUSD(it.total_value)}</td>
                      <td className="px-3 py-2"><StatusChip status={it.status} /></td>
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
