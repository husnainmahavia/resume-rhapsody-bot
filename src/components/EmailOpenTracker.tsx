import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Eye, EyeOff, Mail, MessageSquare, RefreshCw,
  AlertTriangle, Clock, TrendingUp, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

interface TrackedEmail {
  id: string;
  company: string;
  job_title: string;
  hiring_manager_email: string;
  applied_at: string;
  open_count: number;
  opened_at: string | null;
  replied_at: string | null;
  bounced: boolean;
  follow_up_count: number;
  tracking_pixel_id: string | null;
}

export default function EmailOpenTracker() {
  const [emails, setEmails] = useState<TrackedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTracking = useCallback(async () => {
    setLoading(true);
    try {
      // Get all applied applications with their tracking data
      const { data: apps } = await supabase
        .from("job_applications")
        .select("id, company, job_title, hiring_manager_email, applied_at")
        .eq("status", "applied")
        .not("hiring_manager_email", "is", null)
        .order("applied_at", { ascending: false })
        .limit(50);

      if (!apps || apps.length === 0) {
        setEmails([]);
        setLoading(false);
        return;
      }

      const appIds = apps.map(a => a.id);
      const { data: tracking } = await supabase
        .from("email_tracking")
        .select("*")
        .in("application_id", appIds);

      const trackMap = new Map((tracking || []).map((t: any) => [t.application_id, t]));

      const merged: TrackedEmail[] = apps.map(app => {
        const t: any = trackMap.get(app.id);
        return {
          id: app.id,
          company: app.company,
          job_title: app.job_title,
          hiring_manager_email: app.hiring_manager_email!,
          applied_at: app.applied_at!,
          open_count: t?.open_count || 0,
          opened_at: t?.opened_at || null,
          replied_at: t?.replied_at || null,
          bounced: t?.bounced || false,
          follow_up_count: t?.follow_up_count || 0,
          tracking_pixel_id: t?.tracking_pixel_id || null,
        };
      });

      setEmails(merged);
    } catch (e) {
      console.error("Tracking load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTracking(); }, [loadTracking]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("open-tracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_tracking" }, () => {
        loadTracking();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadTracking]);

  const totalSent = emails.length;
  const totalOpened = emails.filter(e => e.open_count > 0).length;
  const totalReplied = emails.filter(e => e.replied_at).length;
  const totalBounced = emails.filter(e => e.bounced).length;
  const totalUnopened = totalSent - totalOpened - totalBounced;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  const statusIcon = (email: TrackedEmail) => {
    if (email.replied_at) return <MessageSquare className="h-3.5 w-3.5 text-success" />;
    if (email.bounced) return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    if (email.open_count > 0) return <Eye className="h-3.5 w-3.5 text-accent" />;
    return <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const statusBadge = (email: TrackedEmail) => {
    if (email.replied_at) return <Badge className="bg-success/20 text-success text-[9px]">Replied</Badge>;
    if (email.bounced) return <Badge className="bg-destructive/20 text-destructive text-[9px]">Bounced</Badge>;
    if (email.open_count > 0) return <Badge className="bg-accent/20 text-accent text-[9px]">Opened {email.open_count}x</Badge>;
    return <Badge className="bg-muted text-muted-foreground text-[9px]">Not opened</Badge>;
  };

  const timeSince = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Sent", value: totalSent, color: "text-primary" },
          { label: "Opened", value: totalOpened, color: "text-accent" },
          { label: "Unopened", value: totalUnopened, color: "text-muted-foreground" },
          { label: "Replied", value: totalReplied, color: "text-success" },
          { label: "Bounced", value: totalBounced, color: "text-destructive" },
        ].map(s => (
          <Card key={s.label} className="bg-secondary/30 border-border">
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Open Rate Bar */}
      <Card className="bg-secondary/30 border-border">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium">Open Rate</span>
            </div>
            <span className="text-sm font-bold font-mono text-accent">{openRate}%</span>
          </div>
          <Progress value={openRate} className="h-2" />
        </CardContent>
      </Card>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={loadTracking} disabled={loading} className="gap-1 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Email List */}
      {emails.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No emails sent yet. Run the pipeline to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {emails.map((email, i) => (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`glass rounded-md px-3 py-2.5 border-l-2 ${
                email.replied_at ? "border-l-success" :
                email.bounced ? "border-l-destructive" :
                email.open_count > 0 ? "border-l-accent" :
                "border-l-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                {statusIcon(email)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{email.company}</span>
                    {statusBadge(email)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{email.job_title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{email.hiring_manager_email}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> {timeSince(email.applied_at)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {email.open_count > 0 && (
                    <p className="text-xs font-mono text-accent">{email.open_count}x opened</p>
                  )}
                  {email.opened_at && (
                    <p className="text-[10px] text-muted-foreground">
                      First: {timeSince(email.opened_at)}
                    </p>
                  )}
                  {email.follow_up_count > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {email.follow_up_count} follow-up{email.follow_up_count > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Opens are tracked via invisible 1×1 pixel embedded in each email. Some email clients block tracking pixels.
      </p>
    </div>
  );
}
