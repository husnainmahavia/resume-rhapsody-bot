import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, Loader2, Search, FileText, Mail, Send, CheckCircle2,
  XCircle, Clock, Zap, AlertTriangle, Shield, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { USER_PROFILE } from "@/lib/user-profile";
import { runServerPipeline, getPipelineStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type PipelineStep = "idle" | "running" | "complete" | "error";

interface PipelineResult {
  job: string;
  company: string;
  status: string;
  email?: string;
  error?: string;
}

interface AutoApplyPipelineProps {
  onUpdate: () => void;
}

export default function AutoApplyPipeline({ onUpdate }: AutoApplyPipelineProps) {
  const [status, setStatus] = useState<PipelineStep>("idle");
  const [location, setLocation] = useState("Manchester, UK");
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [pipelineStats, setPipelineStats] = useState({ total: 0, applied: 0, today: 0, dailyLimit: 80 });
  const [isPolling, setIsPolling] = useState(false);
  const { toast } = useToast();

  // Fetch status on mount
  useEffect(() => {
    getPipelineStatus().then(setPipelineStats).catch(() => {});
  }, []);

  const runPipeline = useCallback(async () => {
    setStatus("running");
    setResults([]);

    try {
      toast({
        title: "🚀 Pipeline Started",
        description: "Running server-side — safe to switch tabs. Human-like delays between emails.",
      });

      const result = await runServerPipeline(
        location,
        USER_PROFILE.skills.slice(0, 15)
      );

      if (result.error) {
        toast({ title: "Pipeline Error", description: result.error, variant: "destructive" });
        setStatus("error");
        return;
      }

      setResults(result.results || []);
      setStatus("complete");
      onUpdate();

      // Refresh stats
      const stats = await getPipelineStatus();
      setPipelineStats(stats);

      toast({
        title: "✅ Pipeline Complete!",
        description: `${result.emailsSent} emails sent, ${result.processed} jobs processed`,
      });
    } catch (err) {
      console.error("Pipeline error:", err);
      setStatus("error");
      toast({
        title: "Pipeline Error",
        description: String(err),
        variant: "destructive",
      });
    }
  }, [location, onUpdate, toast]);

  const statusIcon = (s: string) => {
    switch (s) {
      case "applied": return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case "duplicate_skipped": return <Shield className="h-3.5 w-3.5 text-info" />;
      case "no_email": return <Mail className="h-3.5 w-3.5 text-warning" />;
      case "skipped_limit": return <Timer className="h-3.5 w-3.5 text-warning" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "applied": return "Sent ✅";
      case "duplicate_skipped": return "Already applied";
      case "no_email": return "No email found";
      case "skipped_limit": return "Daily limit";
      case "error": return "Error";
      default: return s;
    }
  };

  return (
    <div className="space-y-4">
      {/* Gmail Safety Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
        <Shield className="h-4 w-4 text-success mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">Gmail-safe mode:</span>{" "}
          Human-like delays (45s–2min between emails), max {pipelineStats.dailyLimit}/day, 
          5-min pause every 10 emails. Runs server-side — won't stop if you switch tabs.
          <span className="text-muted-foreground block mt-1">
            📊 Today: {pipelineStats.today}/{pipelineStats.dailyLimit} emails sent
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Manchester, UK"
            className="bg-secondary border-border"
            disabled={status === "running"}
          />
        </div>
        <Button 
          onClick={runPipeline} 
          className="gap-2 glow-primary"
          disabled={status === "running"}
        >
          {status === "running" ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Rocket className="h-4 w-4" /> Auto-Apply All</>
          )}
        </Button>
      </div>

      {/* Running indicator */}
      {status === "running" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono">
              🤖 Pipeline running server-side with human-like pacing...
            </span>
            <Badge variant="outline">Processing</Badge>
          </div>
          <Progress value={30} className="h-2 animate-pulse" />
          <p className="text-xs text-muted-foreground">
            Safe to switch tabs or close this page. The pipeline continues on the server.
          </p>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1"
          >
            {results.map((r, i) => (
              <motion.div
                key={`${r.company}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.job}</p>
                    <p className="text-xs text-muted-foreground">{r.company}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {statusIcon(r.status)}
                    <span className="text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                  </div>
                </div>
                {r.email && (
                  <p className="text-xs text-success/70 mt-1">→ {r.email}</p>
                )}
                {r.error && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    <p className="text-xs text-warning">{r.error}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle State */}
      {status === "idle" && results.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click <span className="text-primary font-medium">"Auto-Apply All"</span> to start</p>
          <p className="text-xs mt-1">
            Searches jobs → tailors CV → writes email with CV included → sends via Gmail
          </p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            Runs entirely server-side with human-like delays to protect your Gmail account
          </p>
        </div>
      )}

      {/* Complete summary */}
      {status === "complete" && (
        <div className="text-center p-3 rounded-lg bg-success/10 border border-success/20">
          <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-1" />
          <p className="text-sm font-medium text-success">
            {results.filter(r => r.status === "applied").length} emails sent successfully
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {results.filter(r => r.status === "duplicate_skipped").length} duplicates skipped • 
            {results.filter(r => r.status === "no_email").length} no email found
          </p>
        </div>
      )}
    </div>
  );
}
