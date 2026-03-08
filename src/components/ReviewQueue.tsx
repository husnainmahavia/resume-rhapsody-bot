import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, ShieldX, Mail, CheckCircle2, XCircle,
  Loader2, RefreshCw, Eye, Ban, AlertTriangle, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { sendEmail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface QueueItem {
  id: string;
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

export default function ReviewQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const handleApprove = async (id: string) => {
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
      const validItems = queue.filter(q => q.domain_match);
      for (const item of validItems) {
        await supabase.from("email_review_queue").update({
          approved: true,
          approved_at: new Date().toISOString(),
          validation_status: "approved",
        }).eq("id", item.id);
      }
      setQueue(prev => prev.filter(q => !q.domain_match));
      toast({ title: "✅ Bulk Approved", description: `${validItems.length} domain-verified emails approved.` });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
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
    if (item.domain_match) {
      return <Badge className="bg-success/20 text-success text-[9px] gap-1"><ShieldCheck className="h-2.5 w-2.5" /> Domain verified</Badge>;
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
          {queue.filter(q => q.domain_match).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={handleApproveAll}
              disabled={processing === "all"}
            >
              <CheckCircle2 className="h-3 w-3" /> Approve All Verified ({queue.filter(q => q.domain_match).length})
            </Button>
          )}
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
            {queue.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: i * 0.03 }}
                className="glass rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.company}</p>
                      {validationBadge(item)}
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
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-success hover:text-success"
                      onClick={() => handleApprove(item.id)}
                      disabled={processing === item.id}
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

                <AnimatePresence>
                  {expandedId === item.id && item.email_body && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 p-2 rounded bg-secondary/50 border border-border overflow-hidden"
                    >
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {item.email_body}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
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
        Domains with 3+ bounces are auto-blacklisted. Blacklisted domains are excluded from all outreach.
      </p>
    </div>
  );
}
