import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { formatNumber } from "@/lib/format";

export const Paginator = ({ page, totalPages, total, pageSize, onPageChange, label = "items" }) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      <p data-testid="paginator-info" className="text-xs text-muted-foreground tabular-nums">
        Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)} {label}
      </p>
      <div className="flex items-center gap-1">
        <Button data-testid="paginator-first" variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button data-testid="paginator-prev" variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs font-medium tabular-nums">
          Page {formatNumber(page)} / {formatNumber(totalPages)}
        </span>
        <Button data-testid="paginator-next" variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button data-testid="paginator-last" variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
