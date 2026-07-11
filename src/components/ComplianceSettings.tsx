import { AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getShowRiskTools, setShowRiskTools, useSetting } from "@/lib/settings";

export default function ComplianceSettings() {
  const showRiskTools = useSetting(getShowRiskTools);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex gap-3">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold text-foreground mb-1">Assisted mode is the default</div>
          <p className="text-muted-foreground">
            Prepared applications land in the <span className="text-foreground">Review Queue</span> before anything sends.
            Every email is scored, tailored, and can be approved, edited, or skipped.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="font-semibold text-sm">Show compliance-risk tools</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              Enables the <span className="text-foreground">LinkedIn</span> and <span className="text-foreground">Scraper</span> tabs.
              These may violate the terms of service of LinkedIn, Indeed, and search engines,
              and can lead to account restrictions. Off by default per product policy.
            </p>
          </div>
          <Switch checked={showRiskTools} onCheckedChange={setShowRiskTools} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-4 flex gap-3">
        <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="text-foreground font-medium">Daily cap:</span> hard-limited to 50 sends/day, 3 per domain,
            with randomized 3–5 minute delays. Bounces auto-pause the sender.
          </p>
          <p>
            <span className="text-foreground font-medium">Evidence-only tailoring:</span> the AI may only use bullets
            from your Profile. It never invents skills, employers, dates, or metrics.
          </p>
        </div>
      </div>
    </div>
  );
}
