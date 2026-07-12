import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, ShieldX, Mail, CheckCircle2, XCircle,
  Loader2, RefreshCw, Eye, Ban, AlertTriangle, Send, FileText, AlertOctagon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { sendEmail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface QueueItem {
  id: string;
  application_id?: string | null;
  recipient_email: string;
  recipient_name: string | null;
  company: string;
  email_subject: string | null;
  email_body: string | null;
  source: string;
  validation_status: string;
  validation_reason: string | null;
  domain_match: boolean;
  approved: boolean | null;
  created_at: string;
}

interface BlacklistedDomain {
  id: string;
  domain: string;
  bounce_count: number;
  is_blacklisted: boolean;
  last_bounced_at: string;
  reason: string | null;
}

interface AttachmentPreview {
  tailored_cv: string | null;
  cover_letter: string | null;
  job_title: string;
  company: string;
}

// ─── Hard Validation ───────────────────────────────────────────────
const PLACEHOLDER_PATTERNS = [
  /\[.*?\]/,                          // [Company Name], [Your Name], etc.
  /\{.*?\}/,                          // {placeholder}
  /<<.*?>>/,                          // <<placeholder>>
  /INSERT\s+(YOUR|NAME|COMPANY|HERE)/i,
  /PLACEHOLDER/i,
  /REPLACE\s+THIS/i,
  /YOUR\s+NAME\s+HERE/i,
  /COMPANY\s+NAME\s+HERE/i,
];

const BANNED_PHRASES = [
  /calendly\.com/i,
  /calendar\s*link/i,
  /booking\s*link/i,
  /schedule\s*(?:a\s+)?link/i,
  /book\s+a\s+(?:call|meeting|time)/i,
  /click\s+here\s+to\s+schedule/i,
];

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

function validateEmailContent(item: QueueItem): ValidationResult {
  const issues: string[] = [];
  const body = item.email_body || "";
  const subject = item.email_subject || "";
  const combined = `${subject}\n${body}`;

  // Check placeholders
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = combined.match(pattern);
    if (match) {
      issues.push(`Placeholder found: "${match[0]}"`);
    }
  }

  // Check banned phrases
  for (const pattern of BANNED_PHRASES) {
    const match = combined.match(pattern);
    if (match) {
      issues.push(`Banned phrase: "${match[0]}"`);
    }
  }

  // Check company name is actually in the email
  if (item.company && body.length > 50) {
    const companyLower = item.company.toLowerCase().trim();
    if (companyLower.length > 2 && !body.toLowerCase().includes(companyLower)) {
      issues.push(`Company name "${item.company}" not found in email body`);
    }
  }

  // Check for empty/too-short body
  if (body.trim().length < 50) {
    issues.push("Email body is too short (< 50 chars)");
  }

  // Check for missing subject
  if (!subject.trim()) {
    issues.push("Email subject is empty");
  }

  return { valid: issues.length === 0, issues };
}

// ─── Risk Flags (client-side, non-blocking) ─────────────────────────
const RISK_PATTERNS: { label: string; pattern: RegExp; tone: "warn" | "info" }[] = [
  { label: "Salary mentioned", pattern: /\b(salary|compensation|£\s?\d|\$\s?\d|\d{2,3}\s?k\b|per\s+annum)\b/i, tone: "warn" },
  { label: "Visa / work auth", pattern: /\b(visa|sponsorship|work\s+authori[sz]ation|right\s+to\s+work|H-?1B|Tier\s?2)\b/i, tone: "warn" },
  { label: "Sensitive PII ask", pattern: /\b(date\s+of\s+birth|dob|national\s+insurance|nino|ssn|passport\s+number|bank\s+account)\b/i, tone: "warn" },
  { label: "Notice period", pattern: /\bnotice\s+period\b/i, tone: "info" },
];

function detectRiskFlags(item: QueueItem): { label: string; tone: "warn" | "info" }[] {
  const text = `${item.email_subject || ""}\n${item.email_body || ""}`;
  return RISK_PATTERNS.filter(r => r.pattern.test(text)).map(r => ({ label: r.label, tone: r.tone }));
}

// ─── Component ─────────────────────────────────────────────────────
export default function ReviewQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, AttachmentPreview>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [queueRes, blacklistRes] = await Promise.all([
        supabase.from("email_review_queue").select("*").is("approved", null).order("created_at", { ascending: false }).limit(100),
        supabase.from("domain_blacklist").select("*").order("bounce_count", { ascending: false }).limit(50),
      ]);
      setQueue((queueRes.data as QueueItem[]) || []);
      setBlacklist((blacklistRes.data as BlacklistedDomain[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadAttachmentPreview = async (item: QueueItem) => {
    if (!item.application_id) {
      toast({ title: "No application linked", description: "This email has no linked application — no CV/cover letter available.", variant: "destructive" });
      return;
    }
    if (attachmentPreviews[item.id]) {
      setPreviewId(previewId === item.id ? null : item.id);
      return;
    }
    setLoadingPreview(item.id);
    try {
      const { data, error } = await supabase
        .from("job_applications")
        .select("tailored_cv, cover_letter, job_title, company")
        .eq("id", item.application_id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setAttachmentPreviews(prev => ({ ...prev, [item.id]: data as AttachmentPreview }));
        setPreviewId(item.id);
      } else {
        toast({ title: "Application not found", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error loading preview", description: String(e), variant: "destructive" });
    } finally {
      setLoadingPreview(null);
    }
  };

  const handleApprove = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (item) {
      const validation = validateEmailContent(item);
      if (!validation.valid) {
        toast({
          title: "❌ Blocked — validation failed",
          description: validation.issues.join(" • "),
          variant: "destructive",
        });
        return;
      }
    }

    setProcessing(id);
    try {
      await supabase.from("email_review_queue").update({
        approved: true,
        approved_at: new Date().toISOString(),
        validation_status: "approved",
      }).eq("id", id);
      setQueue(prev => prev.filter(q => q.id !== id));
      toast({ title: "✅ Approved", description: "Email will be sent in the next batch." });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      await supabase.from("email_review_queue").update({
        approved: false,
        validation_status: "rejected",
        rejected_reason: "Manually rejected",
      }).eq("id", id);
      setQueue(prev => prev.filter(q => q.id !== id));
      toast({ title: "❌ Rejected", description: "Email will not be sent." });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveAll = async () => {
    setProcessing("all");
    try {
      const validItems = queue.filter(q => q.domain_match && validateEmailContent(q).valid);
      let blocked = 0;
      for (const item of queue.filter(q => q.domain_match)) {
        if (!validateEmailContent(item).valid) { blocked++; continue; }
        await supabase.from("email_review_queue").update({
          approved: true,
          approved_at: new Date().toISOString(),
          validation_status: "approved",
        }).eq("id", item.id);
      }
      setQueue(prev => prev.filter(q => !validItems.some(v => v.id === q.id)));
      toast({
        title: "✅ Bulk Approved",
        description: `${validItems.length} approved${blocked > 0 ? `, ${blocked} blocked by validation` : ""}.`,
      });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleSendApproved = async () => {
    setProcessing("sending");
    try {
      const { data: toSend } = await supabase
        .from("email_review_queue")
        .select("*")
        .eq("validation_status", "approved")
        .limit(20);

      let sent = 0;
      for (const item of (toSend || []) as QueueItem[]) {
        if (!item.email_subject || !item.email_body) continue;
        try {
          await sendEmail(
            item.recipient_email,
            item.email_subject,
            item.email_body,
            item.recipient_name || undefined,
            item.application_id || undefined,
          );
          if (item.application_id) {
            await supabase.from("job_applications").update({
              status: "applied",
              applied_at: new Date().toISOString(),
              follow_up_scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            }).eq("id", item.application_id);
          }
          await supabase.from("email_review_queue").delete().eq("id", item.id);
          sent++;
        } catch (e) {
          console.error(`Failed to send to ${item.recipient_email}:`, e);
        }
      }
      toast({ title: `📧 Sent ${sent} emails`, description: `${sent} approved emails dispatched.` });
      await loadData();
    } catch (e) {
      toast({ title: "Error sending", description: String(e), variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleUnblacklist = async (id: string) => {
    try {
      await supabase.from("domain_blacklist").update({
        is_blacklisted: false,
        bounce_count: 0,
      }).eq("id", id);
      await loadData();
      toast({ title: "Domain unblocked" });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const validationBadge = (item: QueueItem) => {
    const result = validateEmailContent(item);
    if (!result.valid) {
      return <Badge className="bg-destructive/20 text-destructive text-[9px] gap-1"><AlertOctagon className="h-2.5 w-2.5" /> {result.issues.length} issue{result.issues.length > 1 ? "s" : ""}</Badge>;
    }
    if (item.domain_match) {
      return <Badge className="bg-success/20 text-success text-[9px] gap-1"><ShieldCheck className="h-2.5 w-2.5" /> Verified</Badge>;
    }
    return <Badge className="bg-warning/20 text-warning text-[9px] gap-1"><AlertTriangle className="h-2.5 w-2.5" /> {item.validation_reason || "Unverified"}</Badge>;
  };

  const domainFromEmail = (email: string) => email.split("@")[1] || "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Queue Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Pending Review ({queue.length})</h3>
        </div>
        <div className="flex gap-2">
          {queue.filter(q => q.domain_match && validateEmailContent(q).valid).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={handleApproveAll}
              disabled={processing === "all"}
            >
              <CheckCircle2 className="h-3 w-3" /> Approve Valid ({queue.filter(q => q.domain_match && validateEmailContent(q).valid).length})
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            className="gap-1 text-xs"
            onClick={handleSendApproved}
            disabled={processing === "sending"}
          >
            <Send className="h-3 w-3" /> {processing === "sending" ? "Sending..." : "Send Approved"}
          </Button>
          <Button size="sm" variant="ghost" onClick={loadData} className="gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No emails pending review. Queue is empty.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          <AnimatePresence>
            {queue.map((item, i) => {
              const validation = validateEmailContent(item);
              const preview = attachmentPreviews[item.id];
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.03 }}
                  className={`glass rounded-md px-3 py-2 ${!validation.valid ? "border border-destructive/30" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{item.company}</p>
                        {validationBadge(item)}
                        {detectRiskFlags(item).map((r, i) => (
                          <Badge
                            key={i}
                            className={`text-[9px] gap-1 ${
                              r.tone === "warn"
                                ? "bg-warning/20 text-warning"
                                : "bg-accent/20 text-accent"
                            }`}
                          >
                            <AlertTriangle className="h-2.5 w-2.5" /> {r.label}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.recipient_email}
                        <span className="ml-2 text-[10px] opacity-70">({domainFromEmail(item.recipient_email)})</span>
                      </p>
                      {item.email_subject && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          📧 {item.email_subject}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        title="Preview email body"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-primary"
                        onClick={() => loadAttachmentPreview(item)}
                        disabled={loadingPreview === item.id}
                        title="Preview CV & cover letter"
                      >
                        {loadingPreview === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 w-7 p-0 ${validation.valid ? "text-success hover:text-success" : "text-muted-foreground cursor-not-allowed"}`}
                        onClick={() => handleApprove(item.id)}
                        disabled={processing === item.id}
                        title={validation.valid ? "Approve" : `Blocked: ${validation.issues[0]}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleReject(item.id)}
                        disabled={processing === item.id}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Validation issues inline */}
                  {!validation.valid && (
                    <div className="mt-1.5 space-y-0.5">
                      {validation.issues.map((issue, idx) => (
                        <p key={idx} className="text-[10px] text-destructive flex items-center gap-1">
                          <AlertOctagon className="h-2.5 w-2.5 shrink-0" /> {issue}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Email body preview */}
                  <AnimatePresence>
                    {expandedId === item.id && item.email_body && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 p-2 rounded bg-secondary/50 border border-border overflow-hidden"
                      >
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">📧 Email Body:</p>
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {item.email_body}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Attachment preview */}
                  <AnimatePresence>
                    {previewId === item.id && preview && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 space-y-2 overflow-hidden"
                      >
                        <div className="p-2 rounded bg-primary/5 border border-primary/20">
                          <p className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Tailored CV
                          </p>
                          {preview.tailored_cv ? (
                            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                              {preview.tailored_cv.slice(0, 800)}{preview.tailored_cv.length > 800 ? "…" : ""}
                            </p>
                          ) : (
                            <p className="text-[10px] text-destructive">⚠️ No tailored CV found — will NOT be attached</p>
                          )}
                        </div>
                        <div className="p-2 rounded bg-accent/30 border border-accent/40">
                          <p className="text-[10px] font-semibold text-accent-foreground mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Cover Letter
                          </p>
                          {preview.cover_letter ? (
                            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                              {preview.cover_letter.slice(0, 800)}{preview.cover_letter.length > 800 ? "…" : ""}
                            </p>
                          ) : (
                            <p className="text-[10px] text-destructive">⚠️ No cover letter found — will NOT be attached</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Domain Blacklist Section */}
      <Card className="bg-secondary/30 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            Domain Blacklist ({blacklist.filter(b => b.is_blacklisted).length} blocked)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blacklist.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No domains tracked yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {blacklist.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    {d.is_blacklisted ? (
                      <ShieldX className="h-3 w-3 text-destructive" />
                    ) : (
                      <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={d.is_blacklisted ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {d.domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {d.bounce_count} bounces
                    </span>
                    {d.is_blacklisted && (
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => handleUnblacklist(d.id)}>
                        Unblock
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Emails with placeholders, missing company names, or banned phrases are blocked from approval.
      </p>
    </div>
  );
}
