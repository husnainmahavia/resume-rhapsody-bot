import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, Loader2, Search, FileText, Mail, Send, CheckCircle2,
  XCircle, Clock, Zap, Pause, Play, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { USER_PROFILE } from "@/lib/user-profile";
import {
  searchJobs, createApplication, tailorCV, generateEmail,
  sendEmail, updateApplication, checkDuplicateApplication
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type PipelineStep = "idle" | "searching" | "processing" | "complete" | "paused" | "error";

interface JobLog {
  id: string;
  jobTitle: string;
  company: string;
  steps: {
    search: "done" | "pending";
    saved: "done" | "pending" | "processing" | "error";
    cv: "done" | "pending" | "processing" | "error";
    email: "done" | "pending" | "processing" | "error";
    sent: "done" | "pending" | "processing" | "error";
  };
  error?: string;
}

interface AutoApplyPipelineProps {
  onUpdate: () => void;
}

export default function AutoApplyPipeline({ onUpdate }: AutoApplyPipelineProps) {
  const [status, setStatus] = useState<PipelineStep>("idle");
  const [location, setLocation] = useState("Manchester, UK");
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentAction, setCurrentAction] = useState("");
  const [totalJobs, setTotalJobs] = useState(0);
  const [processedJobs, setProcessedJobs] = useState(0);
  const pauseRef = useRef(false);
  const { toast } = useToast();

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const updateLog = (index: number, update: Partial<JobLog>) => {
    setLogs((prev) =>
      prev.map((log, i) => (i === index ? { ...log, ...update } : log))
    );
  };

  const updateLogStep = (index: number, step: keyof JobLog["steps"], value: "done" | "processing" | "error") => {
    setLogs((prev) =>
      prev.map((log, i) =>
        i === index ? { ...log, steps: { ...log.steps, [step]: value } } : log
      )
    );
  };

  const runPipeline = useCallback(async () => {
    setStatus("searching");
    setLogs([]);
    setProgress(0);
    setProcessedJobs(0);
    pauseRef.current = false;

    try {
      // Step 1: Search for jobs
      setCurrentAction("🔍 Searching for relevant jobs...");
      const result = await searchJobs(USER_PROFILE.skills.slice(0, 15), location);

      if (result.error) {
        toast({ title: "Search Error", description: result.error, variant: "destructive" });
        setStatus("error");
        return;
      }

      const jobs = result.jobs || [];
      if (jobs.length === 0) {
        toast({ title: "No jobs found", description: "Try a different location", variant: "destructive" });
        setStatus("error");
        return;
      }

      setTotalJobs(jobs.length);
      setStatus("processing");

      // Initialize logs
      const initialLogs: JobLog[] = jobs.map((job: any, i: number) => ({
        id: `job-${i}`,
        jobTitle: job.title,
        company: job.company,
        steps: {
          search: "done" as const,
          saved: "pending" as const,
          cv: "pending" as const,
          email: "pending" as const,
          sent: "pending" as const,
        },
      }));
      setLogs(initialLogs);
      setProgress(10);

      // Step 2: Process each job
      for (let i = 0; i < jobs.length; i++) {
        // Check pause
        while (pauseRef.current) {
          await delay(500);
        }

        const job = jobs[i];
        const jobProgress = 10 + ((i + 1) / jobs.length) * 85;

        try {
          // 2a: Save to database
          setCurrentAction(`💾 Saving: ${job.title} at ${job.company}`);
          updateLogStep(i, "saved", "processing");

          const saved = await createApplication({
            job_title: job.title,
            company: job.company,
            location: job.location,
            salary_range: job.salary_range,
            job_description: job.description,
            job_url: job.url,
            hiring_manager_name: job.hiring_manager,
            hiring_manager_email: job.hiring_email,
            source: "auto_apply",
            status: "discovered",
          });
          updateLogStep(i, "saved", "done");
          await delay(500);

          // 2b: Tailor CV
          setCurrentAction(`📝 Tailoring CV for: ${job.title}`);
          updateLogStep(i, "cv", "processing");

          const cvResult = await tailorCV(job.title, job.company, job.description || "");
          if (cvResult.error) {
            updateLogStep(i, "cv", "error");
            updateLog(i, { error: cvResult.error });
            continue;
          }

          await updateApplication(saved.id, {
            tailored_cv: cvResult.tailored_cv,
            cover_letter: cvResult.cover_letter,
            status: "cv_tailored",
          });
          updateLogStep(i, "cv", "done");
          await delay(500);

          // 2c: Generate email
          setCurrentAction(`✉️ Crafting email for: ${job.hiring_manager || job.company}`);
          updateLogStep(i, "email", "processing");

          const emailResult = await generateEmail(
            job.title,
            job.company,
            job.hiring_manager || "Hiring Team",
            job.description || ""
          );
          if (emailResult.error) {
            updateLogStep(i, "email", "error");
            updateLog(i, { error: emailResult.error });
            continue;
          }

          await updateApplication(saved.id, {
            email_subject: emailResult.subject,
            email_body: emailResult.body,
          });
          updateLogStep(i, "email", "done");
          await delay(500);

          // 2d: Send email (opens mailto or tracks)
          if (job.hiring_email) {
            setCurrentAction(`🚀 Preparing email to: ${job.hiring_email}`);
            updateLogStep(i, "sent", "processing");

            try {
              const sendResult = await sendEmail(
                job.hiring_email,
                emailResult.subject,
                emailResult.body,
                job.hiring_manager
              );

              if (sendResult.mailto_url) {
                // Auto-open mailto link
                window.open(sendResult.mailto_url, "_blank");
              }

              updateLogStep(i, "sent", "done");
              await updateApplication(saved.id, {
                status: "applied",
                applied_at: new Date().toISOString(),
              });
            } catch {
              updateLogStep(i, "sent", "error");
              updateLog(i, { error: "Email send failed" });
              await updateApplication(saved.id, { status: "email_sent" });
            }
          } else {
            // No email available, skip sending
            updateLogStep(i, "sent", "error");
            updateLog(i, { error: "No hiring email found" });
            await updateApplication(saved.id, { status: "email_sent" });
          }

          setProcessedJobs(i + 1);
          setProgress(jobProgress);
          await delay(1000); // Rate limit protection

        } catch (err) {
          console.error(`Error processing ${job.title}:`, err);
          updateLog(i, { error: String(err) });
        }
      }

      setProgress(100);
      setStatus("complete");
      setCurrentAction("✅ All jobs processed!");
      onUpdate();
      toast({
        title: "Auto-Apply Complete!",
        description: `Processed ${jobs.length} jobs`,
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

  const togglePause = () => {
    pauseRef.current = !pauseRef.current;
    setStatus(pauseRef.current ? "paused" : "processing");
  };

  const stepIcon = (state: string) => {
    switch (state) {
      case "done": return <CheckCircle2 className="h-3 w-3 text-success" />;
      case "processing": return <Loader2 className="h-3 w-3 text-info animate-spin" />;
      case "error": return <XCircle className="h-3 w-3 text-destructive" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Manchester, UK"
            className="bg-secondary border-border"
            disabled={status === "processing" || status === "searching"}
          />
        </div>
        <div className="flex gap-2">
          {status === "idle" || status === "complete" || status === "error" ? (
            <Button onClick={runPipeline} className="gap-2 glow-primary">
              <Rocket className="h-4 w-4" />
              Auto-Apply All
            </Button>
          ) : (
            <Button onClick={togglePause} variant="outline" className="gap-2">
              {status === "paused" ? (
                <><Play className="h-4 w-4" /> Resume</>
              ) : (
                <><Pause className="h-4 w-4" /> Pause</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      {status !== "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono">{currentAction}</span>
            <Badge variant={
              status === "complete" ? "default" :
              status === "error" ? "destructive" :
              status === "paused" ? "secondary" : "outline"
            }>
              {status === "searching" && "Searching..."}
              {status === "processing" && `${processedJobs}/${totalJobs} jobs`}
              {status === "paused" && "Paused"}
              {status === "complete" && "Complete!"}
              {status === "error" && "Error"}
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
        </motion.div>
      )}

      {/* Job Logs */}
      <AnimatePresence>
        {logs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1"
          >
            {logs.map((log, i) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{log.jobTitle}</p>
                    <p className="text-xs text-muted-foreground">{log.company}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-0.5" title="Found">
                      <Search className="h-2.5 w-2.5 text-muted-foreground" />
                      {stepIcon(log.steps.search)}
                    </div>
                    <div className="flex items-center gap-0.5" title="CV Tailored">
                      <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                      {stepIcon(log.steps.cv)}
                    </div>
                    <div className="flex items-center gap-0.5" title="Email Generated">
                      <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                      {stepIcon(log.steps.email)}
                    </div>
                    <div className="flex items-center gap-0.5" title="Sent">
                      <Send className="h-2.5 w-2.5 text-muted-foreground" />
                      {stepIcon(log.steps.sent)}
                    </div>
                  </div>
                </div>
                {log.error && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    <p className="text-xs text-warning">{log.error}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle State */}
      {status === "idle" && logs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click <span className="text-primary font-medium">"Auto-Apply All"</span> to start</p>
          <p className="text-xs mt-1">
            The AI will search → tailor CV → generate email → send — all automatically
          </p>
        </div>
      )}
    </div>
  );
}
