import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export const ItemAutocomplete = ({ onSelect, selected, placeholder = "Search item code or description..." }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = (q) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get("/items/search", { params: { q, limit: 8 } });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        data-testid="txn-item-search-input"
        value={selected ? `${selected.item_code} — ${selected.description}` : query}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (selected) onSelect(null);
          setQuery(v);
          if (v.trim().length >= 1) {
            setOpen(true);
            setLoading(true);
            search(v.trim());
          } else {
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (!selected && query.trim().length >= 1) {
            setOpen(true);
            setLoading(true);
            search(query.trim());
          }
        }}
        autoComplete="off"
      />
      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No items found</div>}
          {!loading &&
            results.map((r) => (
              <button
                key={r.item_code}
                type="button"
                data-testid={`txn-item-option-${r.item_code}`}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs text-primary font-medium">{r.item_code}</span>
                  <span className="ml-2 truncate">{r.description}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Stock: {r.current_qty}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
