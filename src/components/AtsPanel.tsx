import { Check, X } from "lucide-react";
import type { FitScore } from "@/lib/jobScoring";
import { scoreBand } from "@/lib/jobScoring";

export function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const band = scoreBand(score);
  const tone = band.tone === "success" ? "bg-primary/20 text-primary border-primary/30"
    : band.tone === "warning" ? "bg-warning/20 text-warning border-warning/30"
    : "bg-destructive/20 text-destructive border-destructive/30";
  const sz = size === "md" ? "text-sm px-2.5 py-1" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-semibold ${tone} ${sz}`}>
      {score}<span className="opacity-60 font-normal">/100</span>
      <span className="opacity-70 font-sans font-normal">· {band.label}</span>
    </span>
  );
}

export function AtsPanel({ fit }: { fit: FitScore }) {
  const b = fit.breakdown;
  const bars: Array<[string, number, number]> = [
    ["Skills", b.skill, 30], ["Experience", b.experience, 20],
    ["Location", b.location, 15], ["Salary", b.salary, 10],
    ["Industry", b.industry, 10], ["Company", b.company, 10],
    ["Effort", b.effort, 5],
  ];
  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-2">
        {bars.map(([label, val, max]) => {
          const pct = (val / max) * 100;
          return (
            <div key={label} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{val}/{max}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          Recommended CV: <span className="text-foreground">{fit.role.label}</span>
        </p>
      </div>

      {(fit.ats.present.length > 0 || fit.ats.missing.length > 0) && (
        <div className="space-y-2">
          {fit.ats.present.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">ATS keywords · present</p>
              <div className="flex gap-1 flex-wrap">
                {fit.ats.present.slice(0, 20).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    <Check className="h-2.5 w-2.5" /> {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {fit.ats.missing.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">ATS keywords · missing from CV</p>
              <div className="flex gap-1 flex-wrap">
                {fit.ats.missing.slice(0, 20).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                    <X className="h-2.5 w-2.5" /> {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {fit.reasons.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {fit.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
