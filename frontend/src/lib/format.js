export const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);

export const formatUSD2 = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0);

export const formatNumber = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value ?? 0);

export const formatDate = (value) => {
  if (!value) return "—";
  try {
    const d = new Date(String(value).slice(0, 10) + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(value).slice(0, 10);
  }
};

export const STATUS_META = {
  BELOW_MIN: {
    label: "Below Minimum",
    chip: "bg-[hsl(var(--status-below-min)/0.1)] text-[hsl(var(--status-below-min))] border-[hsl(var(--status-below-min)/0.3)]",
    dot: "bg-[hsl(var(--status-below-min))]",
  },
  MINIMUM: {
    label: "Minimum",
    chip: "bg-[hsl(var(--status-minimum)/0.12)] text-[hsl(var(--status-minimum))] border-[hsl(var(--status-minimum)/0.32)]",
    dot: "bg-[hsl(var(--status-minimum))]",
  },
  OK: {
    label: "OK",
    chip: "bg-[hsl(var(--status-ok)/0.1)] text-[hsl(var(--status-ok))] border-[hsl(var(--status-ok)/0.3)]",
    dot: "bg-[hsl(var(--status-ok))]",
  },
  ABOVE_MAX: {
    label: "Above Maximum",
    chip: "bg-[hsl(var(--status-above-max)/0.1)] text-[hsl(var(--status-above-max))] border-[hsl(var(--status-above-max)/0.3)]",
    dot: "bg-[hsl(var(--status-above-max))]",
  },
};

export const ITEM_TYPES = ["Spare Parts", "Consumables", "Chemicals", "Other"];
export const TXN_TYPES = ["Purchase Order", "Work Order", "Return from Work Order", "Return Other", "Opening Balance", "Adjustment"];
