import { useMemo } from "react";
import { diffWords } from "diff";

interface Props {
  original: string;
  tailored: string;
  maxLength?: number;
}

// Side-by-side diff with inline highlighting on the tailored side.
export default function CvDiff({ original, tailored, maxLength = 12000 }: Props) {
  const parts = useMemo(() => {
    const a = (original || "").slice(0, maxLength);
    const b = (tailored || "").slice(0, maxLength);
    return diffWords(a, b);
  }, [original, tailored, maxLength]);

  const addedCount = parts.filter(p => p.added).reduce((n, p) => n + p.value.length, 0);
  const removedCount = parts.filter(p => p.removed).reduce((n, p) => n + p.value.length, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success/60" /> +{addedCount} chars added
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive/60" /> −{removedCount} chars removed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded border border-border bg-secondary/30 p-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Original CV</p>
          <pre className="text-[11px] whitespace-pre-wrap font-sans text-muted-foreground">
            {original || "— empty —"}
          </pre>
        </div>
        <div className="rounded border border-primary/30 bg-primary/5 p-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-semibold text-primary mb-1">Tailored CV (diff highlighted)</p>
          <pre className="text-[11px] whitespace-pre-wrap font-sans">
            {parts.map((p, i) => (
              <span
                key={i}
                className={
                  p.added
                    ? "bg-success/25 text-foreground"
                    : p.removed
                    ? "bg-destructive/20 text-muted-foreground line-through"
                    : "text-foreground/80"
                }
              >
                {p.value}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
