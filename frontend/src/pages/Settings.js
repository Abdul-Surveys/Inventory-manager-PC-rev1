import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api";
import { CRITICALITY_META } from "@/lib/format";
import { toast } from "sonner";
import { Save, Calculator, ShieldCheck, Wand2, Sparkles } from "lucide-react";

const FIELDS = [
  { key: "lead_time_months", label: "Lead Time (months)", desc: "Time from placing an order until material arrives. Spec default: 90 days = 3 months", testId: "settings-lead-time-input" },
  { key: "max_demand_months", label: "Maximum Coverage (months)", desc: "Demand period used for Recommended Maximum. Spec default: 6 months", testId: "settings-coverage-input" },
  { key: "non_moving_months", label: "Non-Moving Threshold (months)", desc: "Months without movement before an item is classified as non-moving", testId: "settings-non-moving-input" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [onlyUnclassified, setOnlyUnclassified] = useState(true);
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);

  const runClassify = async (dryRun) => {
    dryRun ? setRunning(true) : setApplying(true);
    try {
      const res = await api.post("/items/auto-classify", {
        dry_run: dryRun,
        only_unclassified: onlyUnclassified,
      });
      setPreview(res.data);
      if (!dryRun) {
        toast.success(`${res.data.applied} item${res.data.applied === 1 ? "" : "s"} reclassified`);
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      dryRun ? setRunning(false) : setApplying(false);
    }
  };

  useEffect(() => {
    api.get("/settings")
      .then((res) => setSettings(res.data))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put("/settings", {
        lead_time_months: Number(settings.lead_time_months),
        max_demand_months: Number(settings.max_demand_months),
        non_moving_months: Number(settings.non_moving_months),
      });
      setSettings(res.data);
      toast.success("Settings saved — recommendations updated across the system");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="space-y-4"><Skeleton className="h-64 w-full max-w-2xl" /></div>;
  }

  const lead = Number(settings.lead_time_months || 3);
  const maxM = Number(settings.max_demand_months || 6);
  const avgEx = 2, sdEx = 1.5, zEx = 0.842;
  const ssEx = zEx * sdEx * Math.sqrt(lead);
  const recMinEx = Math.ceil(avgEx * lead + ssEx);
  const recMaxEx = Math.ceil(avgEx * maxM + ssEx);

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Planning Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-sm font-medium">{f.label}</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">{f.desc}</p>
              <Input
                data-testid={f.testId}
                type="number"
                min="0"
                step="0.5"
                className="max-w-[180px]"
                value={settings[f.key]}
                onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <Button data-testid="settings-save-button" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-7">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Criticality → Service Level (fixed table)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <table data-testid="settings-criticality-table" className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Criticality</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Service Level</th>
                  <th className="px-3 py-2 text-right">Z-Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(CRITICALITY_META).map(([k, m]) => (
                  <tr key={k} className="border-b last:border-0 odd:bg-muted/20">
                    <td className="px-3 py-2"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${m.chip}`}>{k}</span></td>
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.serviceLevel}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.z}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Z-Value is the standard-normal quantile for the service level, not the percentage itself. Criticality is set per item in the Item Master (item detail → Edit).
          </p>

          <div className="rounded-lg bg-muted/50 p-4 font-mono text-xs leading-6">
            <p>Consumption = OUT transactions − Return from Work Order (net consumption)</p>
            <p>Avg Monthly Consumption = Cumulative Consumption ÷ calendar months since First IN Date (zero months included)</p>
            <p>Std Dev = STDEV.S of monthly consumption series</p>
            <p>Lead-Time Demand = Avg Monthly × {lead} mo</p>
            <p>Safety Stock = Z × Std Dev × √{lead}</p>
            <p>Recommended Min (ROP) = Lead-Time Demand + Safety Stock</p>
            <p>Recommended Max = (Avg Monthly × {maxM} mo) + Safety Stock</p>
            <p>Stock Status: Current ≤ Rec. Min → REORDER, otherwise OK</p>
          </div>

          <div data-testid="settings-example-preview" className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Calculator className="h-3.5 w-3.5" /> Live example</p>
            <p className="mt-1 text-sm">Critical spare (Z = 0.842) consuming <span className="font-semibold">{avgEx} units/month</span> with monthly Std Dev <span className="font-semibold">{sdEx}</span>:</p>
            <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
              <li>Safety Stock = 0.842 × {sdEx} × √{lead} = {ssEx.toFixed(2)}</li>
              <li>Recommended Min (ROP) = {avgEx} × {lead} + {ssEx.toFixed(2)} → <span className="font-semibold">{recMinEx}</span></li>
              <li>Recommended Max = {avgEx} × {maxM} + {ssEx.toFixed(2)} → <span className="font-semibold">{recMaxEx}</span></li>
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">A Normal / Non-Critical item (Z = 0) would carry no safety stock.</p>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Classify Criticality */}
      <Card className="col-span-12 rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Wand2 className="h-4 w-4" /> Auto-Classify Criticality (rules-based)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Scans each item's description for safety and equipment keywords and suggests a criticality tier —
            Tier 1 for safety/critical wording (valve, relief, ESD, fire, wellhead…), Tier 2 for rotating and
            instrument equipment (pump, motor, transmitter, bearing…), and Tier 3 for everything else.
            Preview first; nothing changes until you apply.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Switch
                data-testid="autoclassify-only-unclassified"
                checked={onlyUnclassified}
                onCheckedChange={setOnlyUnclassified}
                id="only-unclassified"
              />
              <Label htmlFor="only-unclassified" className="text-sm">
                Only items currently Tier 3 (preserve manual 1 &amp; 2)
              </Label>
            </div>
            <Button data-testid="autoclassify-preview-button" variant="outline" onClick={() => runClassify(true)} disabled={running || applying}>
              <Sparkles className="mr-2 h-4 w-4" /> {running ? "Scanning..." : "Preview Suggestions"}
            </Button>
            <Button
              data-testid="autoclassify-apply-button"
              onClick={() => runClassify(false)}
              disabled={applying || running || !preview || preview.changes === 0}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {applying ? "Applying..." : preview ? `Apply ${preview.changes} Change${preview.changes === 1 ? "" : "s"}` : "Apply"}
            </Button>
          </div>

          {preview && (
            <div data-testid="autoclassify-preview" className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((tier) => {
                  const meta = CRITICALITY_META[tier];
                  return (
                    <div key={tier} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${meta.chip}`}>{tier}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">{meta.label}</p>
                        <p data-testid={`autoclassify-count-${tier}`} className="text-lg font-bold tabular-nums">{preview.suggested_counts[tier]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Scanned {preview.scanned} item{preview.scanned === 1 ? "" : "s"} · {preview.changes} would change
                {preview.applied > 0 ? ` · ${preview.applied} applied` : ""}.
              </p>
              {preview.samples.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-center">Now</th>
                        <th className="px-3 py-2 text-center">Suggested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.samples.slice(0, 15).map((s) => (
                        <tr key={s.item_code} className="border-b last:border-0 odd:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-xs text-primary">{s.item_code}</td>
                          <td className="px-3 py-2 max-w-[320px] truncate">{s.description}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{s.current}</td>
                          <td className="px-3 py-2 text-center font-semibold tabular-nums">{s.suggested}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.changes > preview.samples.length && (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">Showing first {Math.min(15, preview.samples.length)} of {preview.changes} changes.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
