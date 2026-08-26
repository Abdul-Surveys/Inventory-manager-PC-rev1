import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Save, Calculator } from "lucide-react";

const FIELDS = [
  { key: "lead_time_months", label: "Lead Time (months)", desc: "Time from placing an order until material arrives at the warehouse", testId: "settings-lead-time-input" },
  { key: "coverage_months", label: "Required Stock Coverage (months)", desc: "How many months of consumption the stock should cover beyond the minimum", testId: "settings-coverage-input" },
  { key: "safety_months", label: "Safety Stock (months)", desc: "Extra buffer expressed in months of average consumption", testId: "settings-safety-input" },
  { key: "non_moving_months", label: "Non-Moving Threshold (months)", desc: "Months without movement before an item is classified as non-moving", testId: "settings-non-moving-input" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

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
        coverage_months: Number(settings.coverage_months),
        safety_months: Number(settings.safety_months),
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

  const avgExample = 2;
  const safety = avgExample * Number(settings.safety_months || 0);
  const recMin = Math.ceil(avgExample * Number(settings.lead_time_months || 0) + safety);
  const recMax = Math.ceil(recMin + avgExample * Number(settings.coverage_months || 0));

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
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

      <Card className="col-span-12 rounded-xl shadow-sm xl:col-span-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Calculator className="h-4 w-4" /> How Recommendations Are Calculated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-lg bg-muted/50 p-4 font-mono text-xs leading-6">
            <p>Safety Stock = Avg Monthly Consumption × {settings.safety_months} mo</p>
            <p>Recommended Min = (Avg Monthly × {settings.lead_time_months} mo lead time) + Safety Stock</p>
            <p>Recommended Max = Recommended Min + (Avg Monthly × {settings.coverage_months} mo coverage)</p>
          </div>
          <div data-testid="settings-example-preview" className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Live example</p>
            <p className="mt-1 text-sm">If an item consumes <span className="font-semibold">{avgExample} units/month</span>:</p>
            <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
              <li>Safety Stock = {safety}</li>
              <li>Recommended Min = <span className="font-semibold">{recMin}</span></li>
              <li>Recommended Max = <span className="font-semibold">{recMax}</span></li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Average monthly consumption is derived from actual OUT transactions minus returns from work orders, measured from each item's first issue date. Changing these parameters immediately affects the recommendations shown in the Consumption &amp; Min/Max page and item details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
