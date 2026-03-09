import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSenderHealth } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface HealthData {
  stats: { sent: number; delivered: number; bounced: number; opened: number; replied: number };
  rates: { bounceRate: string; openRate: string; replyRate: string };
  reputation: "good" | "warning" | "critical";
  targets: { bounceRate: string; openRate: string; replyRate: string };
}

const TARGETS = {
  bounce: { max: 3, label: "<3%" },
  open: { min: 15, max: 25, label: "15–25%" },
  reply: { min: 2, max: 5, label: "2–5%" },
};

function parseRate(rate: string) {
  return parseFloat(rate.replace("%", "")) || 0;
}

function RateGauge({ label, value, target, invert }: { label: string; value: number; target: { min?: number; max: number; label: string }; invert?: boolean }) {
  const maxDisplay = Math.max(target.max * 2, value * 1.2, 10);
  const pct = Math.min((value / maxDisplay) * 100, 100);
  const targetMinPct = target.min ? (target.min / maxDisplay) * 100 : 0;
  const targetMaxPct = (target.max / maxDisplay) * 100;

  let status: "good" | "warning" | "bad";
  if (invert) {
    status = value < target.max ? "good" : value < target.max * 1.67 ? "warning" : "bad";
  } else {
    status = target.min && value >= target.min && value <= target.max
      ? "good"
      : target.min && value >= target.min * 0.6
        ? "warning"
        : value > target.max
          ? "good"
          : "bad";
  }

  const statusColor = status === "good" ? "text-emerald-400" : status === "warning" ? "text-amber-400" : "text-destructive";
  const barColor = status === "good" ? "bg-emerald-400" : status === "warning" ? "bg-amber-400" : "bg-destructive";
  const Icon = status === "good" ? TrendingUp : status === "warning" ? Minus : TrendingDown;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${statusColor}`} />
          <span className={`text-sm font-mono font-bold ${statusColor}`}>{value.toFixed(1)}%</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        {/* Target zone indicator */}
        {target.min !== undefined && (
          <div
            className="absolute inset-y-0 border-l border-r border-dashed border-foreground/20"
            style={{ left: `${targetMinPct}%`, width: `${targetMaxPct - targetMinPct}%` }}
          />
        )}
        {target.min === undefined && (
          <div
            className="absolute inset-y-0 border-r-2 border-dashed border-foreground/30"
            style={{ left: `${targetMaxPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>Target: {target.label}</span>
      </div>
    </div>
  );
}

export default function SenderHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await getSenderHealth();
      if (data?.success) setHealth(data as HealthData);
    } catch (err) {
      toast({ title: "Health check failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  const repBadge = health?.reputation === "good"
    ? { label: "Good", variant: "default" as const, className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" }
    : health?.reputation === "warning"
      ? { label: "Warning", variant: "outline" as const, className: "bg-amber-500/20 text-amber-400 border-amber-500/30" }
      : { label: "Critical", variant: "destructive" as const, className: "bg-destructive/20 text-destructive border-destructive/30" };

  return (
    <Card className="bg-secondary/30 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Sender Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {health && (
              <Badge variant={repBadge.variant} className={`text-[10px] ${repBadge.className}`}>
                {repBadge.label}
              </Badge>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchHealth} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!health ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {loading ? "Loading health data..." : "No data available"}
          </p>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { label: "Sent", value: health.stats.sent },
                { label: "Delivered", value: health.stats.delivered },
                { label: "Bounced", value: health.stats.bounced },
                { label: "Opened", value: health.stats.opened },
                { label: "Replied", value: health.stats.replied },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-lg font-mono font-bold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Rate gauges */}
            <div className="space-y-4 pt-2 border-t border-border">
              <RateGauge
                label="Bounce Rate"
                value={parseRate(health.rates.bounceRate)}
                target={{ max: TARGETS.bounce.max, label: TARGETS.bounce.label }}
                invert
              />
              <RateGauge
                label="Open Rate"
                value={parseRate(health.rates.openRate)}
                target={{ min: TARGETS.open.min, max: TARGETS.open.max, label: TARGETS.open.label }}
              />
              <RateGauge
                label="Reply Rate"
                value={parseRate(health.rates.replyRate)}
                target={{ min: TARGETS.reply.min, max: TARGETS.reply.max, label: TARGETS.reply.label }}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
