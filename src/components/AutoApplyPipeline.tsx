import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, Loader2, Mail, CheckCircle2,
  XCircle, Clock, Zap, AlertTriangle, Shield, Timer,
  Settings2, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { USER_PROFILE } from "@/lib/user-profile";
import { runServerPipeline, getPipelineStatus, sendFollowUps } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type PipelineStep = "idle" | "running" | "complete" | "error";

const PIPELINE_RUN_KEY = "autoApplyPipelineRun";

interface PipelineResult {
  job: string;
  company: string;
  status: string;
  email?: string;
  error?: string;
}

interface PipelineRunSnapshot {
  startedAt: number;
  location: string;
  skillCount: number;
  searchMode: string;
}

interface AutoApplyPipelineProps {
  onUpdate: () => void;
}

const ALL_SKILLS = USER_PROFILE.skills;

const CV_OPTIONS = [
  { value: "auto", label: "Auto (AI picks best)" },
  { value: "fullstack", label: "Full-Stack AI Developer" },
  { value: "aiSpecialist", label: "AI Specialist" },
  { value: "digitalMarketing", label: "Digital Marketing Manager" },
  { value: "webDeveloper", label: "Web Developer / WordPress" },
];

const JOB_TYPE_OPTIONS = [
  { value: "Full-time", label: "Full-time" },
  { value: "Part-time", label: "Part-time" },
  { value: "Contract", label: "Contract" },
  { value: "Remote", label: "Remote" },
  { value: "Hybrid", label: "Hybrid" },
];

const SEARCH_MODE_OPTIONS = [
  { value: "standard", label: "Standard Search" },
  { value: "careers_page", label: "Careers Page Scraping" },
  { value: "sponsorship", label: "Sponsorship Companies" },
  { value: "recent_24h", label: "Last 24h Jobs Only" },
];

export default function AutoApplyPipeline({ onUpdate }: AutoApplyPipelineProps) {
  const [status, setStatus] = useState<PipelineStep>("idle");
  const [location, setLocation] = useState("Manchester, UK");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(ALL_SKILLS.slice(0, 15));
  const [cvVersion, setCvVersion] = useState("auto");
  const [jobType, setJobType] = useState("Full-time");
  const [searchMode, setSearchMode] = useState("standard");
  const [showConfig, setShowConfig] = useState(true);
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [pipelineStats, setPipelineStats] = useState({ total: 0, applied: 0, today: 0, dailyLimit: 80 });
  const [activeRun, setActiveRun] = useState<PipelineRunSnapshot | null>(() => {
    const raw = localStorage.getItem(PIPELINE_RUN_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PipelineRunSnapshot;
      return Date.now() - parsed.startedAt < 30 * 60 * 1000 ? parsed : null;
    } catch {
      return null;
    }
  });
  const { toast } = useToast();

  useEffect(() => {
    getPipelineStatus().then(setPipelineStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeRun) return;

    setStatus("running");
    setShowConfig(false);

    const poll = async () => {
      try {
        const stats = await getPipelineStatus();
        setPipelineStats(stats);
        onUpdate();
      } catch {
        // Watching can fail without stopping the server-side run.
      }
    };

    poll();
    const timer = window.setInterval(poll, 10000);
    return () => window.clearInterval(timer);
  }, [activeRun, onUpdate]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const selectAllSkills = () => setSelectedSkills([...ALL_SKILLS]);
  const clearAllSkills = () => setSelectedSkills([]);

  const runPipeline = useCallback(async () => {
    if (selectedSkills.length === 0) {
      toast({ title: "No skills selected", description: "Select at least one skill.", variant: "destructive" });
      return;
    }

    setStatus("running");
    setResults([]);
    setShowConfig(false);
    const snapshot: PipelineRunSnapshot = {
      startedAt: Date.now(),
      location,
      skillCount: selectedSkills.length,
      searchMode,
    };
    localStorage.setItem(PIPELINE_RUN_KEY, JSON.stringify(snapshot));
    setActiveRun(snapshot);

    try {
      toast({
        title: "🚀 Pipeline Started",
        description: "Running server-side — safe to switch tabs.",
      });

      const result = await runServerPipeline(
        location,
        selectedSkills,
        cvVersion,
        jobType,
        searchMode
      );

      if (result.error) {
        toast({ title: "Pipeline Error", description: result.error, variant: "destructive" });
        setStatus("error");
        localStorage.removeItem(PIPELINE_RUN_KEY);
        setActiveRun(null);
        return;
      }

      setResults(result.results || []);
      onUpdate();

      const stats = await getPipelineStatus();
      setPipelineStats(stats);

      if (result.accepted) {
        toast({
          title: "Pipeline is running",
          description: result.message || "Backend accepted the run. You can close or switch tabs; refresh later to see new pipeline rows.",
        });
      } else {
        setStatus("complete");
        localStorage.removeItem(PIPELINE_RUN_KEY);
        setActiveRun(null);
        toast({
          title: "✅ Pipeline Complete!",
          description: `${result.emailsSent ?? 0} emails sent, ${result.processed ?? 0} jobs processed`,
        });
      }
    } catch (err) {
      setStatus("error");
      localStorage.removeItem(PIPELINE_RUN_KEY);
      setActiveRun(null);
      toast({ title: "Pipeline Error", description: String(err), variant: "destructive" });
    }
  }, [location, selectedSkills, cvVersion, jobType, searchMode, onUpdate, toast]);

  const clearActiveRun = () => {
    localStorage.removeItem(PIPELINE_RUN_KEY);
    setActiveRun(null);
    setStatus("idle");
    setShowConfig(true);
    getPipelineStatus().then(setPipelineStats).catch(() => {});
    onUpdate();
  };

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
          Human-like delays, max {pipelineStats.dailyLimit}/day, server-side execution.
          <span className="block mt-1">
            📊 Today: {pipelineStats.today}/{pipelineStats.dailyLimit} emails sent
          </span>
        </div>
      </div>

      {/* Config toggle */}
      <button
        onClick={() => setShowConfig(!showConfig)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        disabled={status === "running"}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="font-medium">Pre-Run Configuration</span>
        {showConfig ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>

      {/* Configuration panel */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Row 1: Location + Job Type + CV Version */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Manchester, UK"
                  className="bg-secondary border-border"
                  disabled={status === "running"}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Search Mode</label>
                <Select value={searchMode} onValueChange={setSearchMode} disabled={status === "running"}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEARCH_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Job Type</label>
                <Select value={jobType} onValueChange={setJobType} disabled={status === "running"}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">CV Version</label>
                <Select value={cvVersion} onValueChange={setCvVersion} disabled={status === "running"}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CV_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Skills selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">
                  Target Skills ({selectedSkills.length}/{ALL_SKILLS.length})
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSkills}
                    className="text-[10px] text-primary hover:underline"
                    disabled={status === "running"}
                  >
                    Select all
                  </button>
                  <button
                    onClick={clearAllSkills}
                    className="text-[10px] text-muted-foreground hover:underline"
                    disabled={status === "running"}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-2 rounded-lg bg-secondary/30 border border-border">
                {ALL_SKILLS.map((skill) => {
                  const isSelected = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      onClick={() => toggleSkill(skill)}
                      disabled={status === "running"}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border ${
                        isSelected
                          ? "bg-primary/20 text-primary border-primary/40"
                          : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launch button */}
      <Button
        onClick={runPipeline}
        className="gap-2 glow-primary w-full"
        disabled={status === "running" || selectedSkills.length === 0}
        size="lg"
      >
        {status === "running" ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Running Server-Side...</>
        ) : (
          <><Rocket className="h-4 w-4" /> Auto-Apply ({selectedSkills.length} skills, {searchMode !== "standard" ? searchMode.replace("_", " ") : cvVersion === "auto" ? "Auto CV" : cvVersion})</>
        )}
      </Button>

      {/* Follow-up button */}
      <Button
        variant="outline"
        className="gap-2 w-full"
        disabled={status === "running"}
        onClick={async () => {
          try {
            const result = await sendFollowUps();
            toast({ title: "Follow-ups sent", description: `${result.followUpsSent || 0} follow-up emails sent` });
            onUpdate();
          } catch (err) {
            toast({ title: "Error", description: String(err), variant: "destructive" });
          }
        }}
      >
        <Mail className="h-4 w-4" /> Send Follow-ups (3+ days old)
      </Button>

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
            Safe to switch tabs. The pipeline continues on the server.
          </p>
          {activeRun && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Started {new Date(activeRun.startedAt).toLocaleTimeString()} · {activeRun.skillCount} skills · {activeRun.location}
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearActiveRun}>
                Stop watching
              </Button>
            </div>
          )}
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
      {status === "idle" && results.length === 0 && !showConfig && (
        <div className="text-center py-6 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Configure your preferences above, then launch</p>
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
            {results.filter(r => r.status === "duplicate_skipped").length} duplicates skipped •{" "}
            {results.filter(r => r.status === "no_email").length} no email found
          </p>
        </div>
      )}
    </div>
  );
}
