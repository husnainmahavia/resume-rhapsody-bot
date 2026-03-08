import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, MapPin, Building2, ChevronDown, FileText, Mail,
  Loader2, Check, Clock, X, Star, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { JobApplication } from "@/lib/api";
import { tailorCV, generateEmail, updateApplication } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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

export default function ApplicationList({ applications, onUpdate }: ApplicationListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTailorCV = async (app: JobApplication) => {
    setProcessing(`cv-${app.id}`);
    try {
      const result = await tailorCV(app.job_title, app.company, app.job_description || "");
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return;
      }
      await updateApplication(app.id, {
        tailored_cv: result.tailored_cv,
        cover_letter: result.cover_letter,
        status: "cv_tailored",
      });
      toast({ title: "CV Tailored!", description: `CV customized for ${app.company}` });
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

  const handleSendEmail = (app: JobApplication) => {
    const email = app.hiring_manager_email || "";
    const subject = encodeURIComponent(app.email_subject || "");
    const body = encodeURIComponent(app.email_body || "");
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
    updateApplication(app.id, { status: "applied", applied_at: new Date().toISOString() });
    onUpdate();
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
    <div className="space-y-2">
      {applications.map((app, i) => {
        const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.discovered;
        const isExpanded = expanded === app.id;

        return (
          <motion.div
            key={app.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass rounded-lg overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : app.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={`${status.color} gap-1 shrink-0`}>
                  {status.icon} {status.label}
                </Badge>
                <div className="min-w-0">
                  <p className="font-medium truncate">{app.job_title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {app.company}
                    </span>
                    {app.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {app.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {app.job_description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-sm text-secondary-foreground">{app.job_description}</p>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {app.status === "discovered" && (
                        <Button
                          size="sm"
                          onClick={() => handleTailorCV(app)}
                          disabled={processing === `cv-${app.id}`}
                          className="gap-1"
                        >
                          {processing === `cv-${app.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          Tailor CV
                        </Button>
                      )}

                      {(app.status === "cv_tailored" || app.status === "discovered") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateEmail(app)}
                          disabled={processing === `email-${app.id}`}
                          className="gap-1"
                        >
                          {processing === `email-${app.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                          Generate Email
                        </Button>
                      )}

                      {app.email_body && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendEmail(app)}
                          className="gap-1"
                        >
                          <Send className="h-3 w-3" /> Send Email
                        </Button>
                      )}
                    </div>

                    {app.tailored_cv && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Tailored CV</p>
                        <pre className="text-xs bg-secondary/50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                          {app.tailored_cv}
                        </pre>
                      </div>
                    )}

                    {app.cover_letter && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Cover Letter</p>
                        <pre className="text-xs bg-secondary/50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                          {app.cover_letter}
                        </pre>
                      </div>
                    )}

                    {app.email_subject && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                        <div className="bg-secondary/50 rounded p-3 space-y-1">
                          <p className="text-xs font-medium">Subject: {app.email_subject}</p>
                          <pre className="text-xs max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                            {app.email_body}
                          </pre>
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
