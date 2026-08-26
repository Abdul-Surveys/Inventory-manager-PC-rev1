import { STATUS_META } from "@/lib/format";

export const StatusChip = ({ status, size = "sm" }) => {
  const meta = STATUS_META[status] || { label: status || "—", chip: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span
      data-testid={`status-chip-${(status || "none").toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 ${size === "sm" ? "py-0.5 text-xs" : "py-1 text-sm"} font-medium whitespace-nowrap ${meta.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};
