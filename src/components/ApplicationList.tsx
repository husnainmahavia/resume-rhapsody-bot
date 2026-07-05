import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, MapPin, Building2, ChevronDown, FileText, Mail,
  Loader2, Check, Clock, X, Star, Send, ShieldCheck, ShieldAlert, UserSquare2,
  Download, GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JobApplication } from "@/lib/api";
import { tailorCV, generateEmail, sendEmail, updateApplication } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { scoreJob, ROLE_PROFILES, type FitScore, type CvProfileKey } from "@/lib/jobScoring";
import { ScoreBadge, AtsPanel } from "@/components/AtsPanel";
import { exportTextAsPdf } from "@/lib/pdfExport";
import CvDiff from "@/components/CvDiff";
import { supabase } from "@/integrations/supabase/client";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  discovered: { label: "Discovered", color: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  cv_tailored: { label: "CV Ready", color: "bg-info/20 text-info", icon: <FileText className="h-3 w-3" /> },
  email_sent: { label: "Email Sent", color: "bg-primary/20 text-primary", icon: <Send className="h-3 w-3" /> },
  applied: { label: "Applied", color: "bg-success/20 text-success", icon: <Check className="h-3 w-3" /> },
  interview: { label: "Interview", color: "bg-warning/20 text-warning", icon: <Star className="h-3 w-3" /> },
  rejected: { label: "Rejected", color: "bg-destructive/20 text-destructive", icon: <X className="h-3 w-3" /> },
  offer: { label: "Offer!", color: "bg-primary/30 text-primary", icon: <Star className="h-3 w-3" /> },
};

interface ApplicationListProps {
  applications: JobApplication[];
  onUpdate: () => void;
}

function computeFit(app: JobApplication): FitScore {
  return scoreJob(
    { jobTitle: app.job_title, company: app.company, description: app.job_description || "",
      location: app.location || undefined, salaryRange: app.salary_range || undefined },
    { url: app.job_url || undefined },
  );
}

export default function ApplicationList({ applications, onUpdate }: ApplicationListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [profileOverrides, setProfileOverrides] = useState<Record<string, CvProfileKey>>({});
  const [showDiff, setShowDiff] = useState<Record<string, boolean>>({});
  const [baseCv, setBaseCv] = useState<string>("");
  const [candidateName, setCandidateName] = useState<string>("Applicant");
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("applicant_profile").select("name, cv_content").limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBaseCv(data.cv_content || "");
          setCandidateName(data.name || "Applicant");
        }
      });
  }, []);

  const enriched = useMemo(() => applications.map((a) => ({
    app: a,
    fit: computeFit(a),
    score: (a as any).match_score ?? computeFit(a).total,
  })), [applications]);

  const filtered = enriched.filter((e) => {
    const pending = (e.app as any).pending_review !== false;
    if (filter === "pending") return pending;
    if (filter === "approved") return !pending;
    return true;
  });

  const pendingCount = enriched.filter((e) => (e.app as any).pending_review !== false).length;

  const handleApprove = async (app: JobApplication) => {
    setProcessing(`approve-${app.id}`);
    try {
      await updateApplication(app.id, { pending_review: false, approved_at: new Date().toISOString() } as any);
      toast({ title: "Approved", description: `${app.company} — ready to tailor & send` });
      onUpdate();
    } finally { setProcessing(null); }
  };

  const handleReject = async (app: JobApplication) => {
    const reason = window.prompt("Reject reason (optional):") ?? undefined;
    setProcessing(`reject-${app.id}`);
    try {
      await updateApplication(app.id, {
        pending_review: false, status: "rejected",
        rejected_at: new Date().toISOString(), rejected_reason: reason ?? "Manually rejected",
      } as any);
      onUpdate();
    } finally { setProcessing(null); }
  };

  const handleApproveAll = async () => {
    const pendingApps = enriched.filter((e) => (e.app as any).pending_review !== false).map((e) => e.app);
    if (pendingApps.length === 0) {
      toast({ title: "Nothing to approve", description: "No pending applications." });
      return;
    }
    if (!window.confirm(`Approve all ${pendingApps.length} pending application(s)?`)) return;
    setProcessing("approve-all");
    const now = new Date().toISOString();
    let ok = 0, failed = 0;
    await Promise.all(pendingApps.map(async (app) => {
      try {
        await updateApplication(app.id, { pending_review: false, approved_at: now } as any);
        ok++;
      } catch { failed++; }
    }));
    setProcessing(null);
    toast({
      title: "Bulk approval complete",
      description: `${ok} approved${failed ? `, ${failed} failed` : ""}.`,
      variant: failed ? "destructive" : "default",
    });
    onUpdate();
  };


  const getProfileKey = (app: JobApplication, fit: FitScore): CvProfileKey =>
    (profileOverrides[app.id] ?? ((app as any).cv_profile as CvProfileKey) ?? fit.role.key);

  const handleSelectProfile = async (app: JobApplication, key: CvProfileKey) => {
    setProfileOverrides((prev) => ({ ...prev, [app.id]: key }));
    try {
      await updateApplication(app.id, { cv_profile: key } as any);
      onUpdate();
    } catch {
      toast({ title: "Error", description: "Failed to save CV profile", variant: "destructive" });
    }
  };

  const handleTailorCV = async (app: JobApplication, fit: FitScore) => {
    setProcessing(`cv-${app.id}`);
    try {
      const cvVersion = getProfileKey(app, fit);
      const result = await tailorCV(app.job_title, app.company, app.job_description || "", cvVersion);
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return;
      }
      await updateApplication(app.id, {
        tailored_cv: result.tailored_cv,
        cover_letter: result.cover_letter,
        status: "cv_tailored",
        cv_profile: cvVersion,
      } as any);
      toast({ title: "CV Tailored!", description: `${app.company} — profile: ${ROLE_PROFILES.find(p => p.key === cvVersion)?.label ?? cvVersion}` });
      onUpdate();
    } catch {
      toast({ title: "Error", description: "Failed to tailor CV", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleGenerateEmail = async (app: JobApplication) => {
    setProcessing(`email-${app.id}`);
    try {
      const result = await generateEmail(
        app.job_title,
        app.company,
        app.hiring_manager_name || "Hiring Team",
        app.job_description || ""
      );
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return;
      }
      await updateApplication(app.id, {
        email_subject: result.subject,
        email_body: result.body,
        status: "email_sent",
      });
      toast({ title: "Email Generated!", description: `Ready to send to ${app.company}` });
      onUpdate();
    } catch {
      toast({ title: "Error", description: "Failed to generate email", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleSendEmail = async (app: JobApplication) => {
    if (!app.hiring_manager_email || !app.email_subject || !app.email_body) {
      toast({ title: "Cannot send", description: "Recipient, subject, and email body are required.", variant: "destructive" });
      return;
    }

    setProcessing(`send-${app.id}`);
    try {
      const result = await sendEmail(
        app.hiring_manager_email,
        app.email_subject,
        app.email_body,
        app.hiring_manager_name || undefined,
        app.id,
      );

      if (result?.error || result?.sent === false) {
        toast({ title: "Send blocked", description: result?.error || "Email was not sent.", variant: "destructive" });
        return;
      }

      await updateApplication(app.id, {
        status: "applied",
        applied_at: new Date().toISOString(),
        follow_up_scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      } as any);
      toast({ title: "Email sent", description: `${app.company} was updated without leaving the app.` });
      onUpdate();
    } catch (err) {
      toast({ title: "Send failed", description: String(err), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (applications.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p>No applications yet. Search for jobs to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-muted-foreground">Filter:</span>
        {(["all", "pending", "approved"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md border transition-colors ${
              filter === f ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"
            }`}>
            {f === "pending" ? `Pending review (${pendingCount})` : f === "approved" ? "Approved" : `All (${applications.length})`}
          </button>
        ))}
        {pendingCount > 0 && (
          <Button
            size="sm"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={handleApproveAll}
            disabled={processing === "approve-all"}
          >
            {processing === "approve-all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Approve all ({pendingCount})
          </Button>
        )}
      </div>

      {filtered.map(({ app, fit, score }, i) => {
        const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.discovered;
        const isExpanded = expanded === app.id;
        const pending = (app as any).pending_review !== false;
        const canSend = !pending;

        return (
          <motion.div key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`glass rounded-lg overflow-hidden ${pending ? "border-warning/30" : ""}`}>
            <button onClick={() => setExpanded(isExpanded ? null : app.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={`${status.color} gap-1 shrink-0`}>{status.icon} {status.label}</Badge>
                <ScoreBadge score={score} />
                {pending && (
                  <Badge className="bg-warning/20 text-warning gap-1 shrink-0">
                    <ShieldAlert className="h-3 w-3" /> Needs approval
                  </Badge>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{app.job_title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {app.company}</span>
                    {app.location && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {app.location}</span>)}
                  </div>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <AtsPanel fit={fit} />

                    {app.job_description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-sm text-secondary-foreground line-clamp-6">{app.job_description}</p>
                      </div>
                    )}

                    {/* Review gate */}
                    {pending && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
                        <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
                        <p className="text-xs text-warning flex-1">
                          Review the fit score, CV recommendation and ATS keywords above, then approve to enable tailoring & sending.
                        </p>
                        <Button size="sm" onClick={() => handleApprove(app)}
                          disabled={processing === `approve-${app.id}`} className="gap-1">
                          {processing === `approve-${app.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(app)}
                          disabled={processing === `reject-${app.id}`} className="gap-1">
                          <X className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    )}

                    {/* CV profile switcher */}
                    <div className="flex items-center gap-2 flex-wrap p-3 rounded-md bg-secondary/40 border border-border">
                      <UserSquare2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-xs font-medium">CV profile</p>
                        <p className="text-[11px] text-muted-foreground">
                          Recommended by scorer: <span className="text-foreground">{fit.role.label}</span>
                        </p>
                      </div>
                      <Select
                        value={getProfileKey(app, fit)}
                        onValueChange={(v) => handleSelectProfile(app, v as CvProfileKey)}
                      >
                        <SelectTrigger className="w-[220px] h-8 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_PROFILES.map((p) => (
                            <SelectItem key={p.key} value={p.key} className="text-xs">
                              {p.label}
                              {p.key === fit.role.key ? " · recommended" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {canSend && (
                        <Button size="sm" onClick={() => handleTailorCV(app, fit)}
                          disabled={processing === `cv-${app.id}`} className="gap-1">
                          {processing === `cv-${app.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                          {app.status === "cv_tailored" ? "Re-tailor CV" : "Tailor CV"}
                        </Button>
                      )}

                      {canSend && (app.status === "cv_tailored" || app.status === "discovered") && (
                        <Button size="sm" variant="outline" onClick={() => handleGenerateEmail(app)}
                          disabled={processing === `email-${app.id}`} className="gap-1">
                          {processing === `email-${app.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                          Generate Email
                        </Button>
                      )}

                      {canSend && app.email_body && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendEmail(app)}
                          disabled={processing === `send-${app.id}`}
                          className="gap-1"
                        >
                          {processing === `send-${app.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          {processing === `send-${app.id}` ? "Sending..." : "Send Email"}
                        </Button>
                      )}
                    </div>

                    {app.tailored_cv && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Tailored CV</p>
                          <div className="flex items-center gap-1">
                            {baseCv && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 gap-1 text-[10px]"
                                onClick={() => setShowDiff(d => ({ ...d, [app.id]: !d[app.id] }))}
                              >
                                <GitCompare className="h-3 w-3" />
                                {showDiff[app.id] ? "Hide diff" : "Compare vs original"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 text-[10px]"
                              onClick={() => exportTextAsPdf({
                                title: `${candidateName} — ${app.job_title}`,
                                body: app.tailored_cv || "",
                                filename: `CV_${candidateName.replace(/\s+/g, "_")}_${app.company.replace(/\s+/g, "_")}.pdf`,
                              })}
                            >
                              <Download className="h-3 w-3" /> PDF
                            </Button>
                          </div>
                        </div>
                        {showDiff[app.id] && baseCv ? (
                          <CvDiff original={baseCv} tailored={app.tailored_cv} />
                        ) : (
                          <pre className="text-xs bg-secondary/50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">{app.tailored_cv}</pre>
                        )}
                      </div>
                    )}

                    {app.cover_letter && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Cover Letter</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => exportTextAsPdf({
                              title: `Cover Letter — ${app.company}`,
                              body: app.cover_letter || "",
                              filename: `CoverLetter_${candidateName.replace(/\s+/g, "_")}_${app.company.replace(/\s+/g, "_")}.pdf`,
                            })}
                          >
                            <Download className="h-3 w-3" /> PDF
                          </Button>
                        </div>
                        <pre className="text-xs bg-secondary/50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">{app.cover_letter}</pre>
                      </div>
                    )}

                    {app.email_subject && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                        <div className="bg-secondary/50 rounded p-3 space-y-1">
                          <p className="text-xs font-medium">Subject: {app.email_subject}</p>
                          <pre className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">{app.email_body}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

