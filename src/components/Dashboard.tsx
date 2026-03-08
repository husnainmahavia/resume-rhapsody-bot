import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Mail, Eye, MessageSquare, TrendingUp,
  Send, Clock, AlertTriangle, RefreshCw, ArrowUpRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { checkInboxReplies, type JobApplication } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface DashboardProps {
  applications: JobApplication[];
}

interface TrackingStats {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  replyRate: number;
  todaySent: number;
  weekSent: number;
  followUpsPending: number;
}

export default function Dashboard({ applications }: DashboardProps) {
  const [stats, setStats] = useState<TrackingStats>({
    totalSent: 0, totalOpened: 0, totalReplied: 0, totalBounced: 0,
    openRate: 0, replyRate: 0, todaySent: 0, weekSent: 0, followUpsPending: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInbox, setCheckingInbox] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => {
    try {
      const applied = applications.filter(a => a.status === "applied");
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const todaySent = applied.filter(a => a.applied_at?.startsWith(today)).length;
      const weekSent = applied.filter(a => a.applied_at && a.applied_at >= weekAgo).length;

      // Fetch tracking data
      const { data: tracking } = await supabase
        .from("email_tracking")
        .select("*");

      const trackingData = tracking || [];
      const opened = trackingData.filter(t => (t as any).open_count > 0).length;
      const replied = trackingData.filter(t => (t as any).replied_at).length;
      const bounced = trackingData.filter(t => (t as any).bounced).length;

      const totalSent = applied.length;
      setStats({
        totalSent,
        totalOpened: opened,
        totalReplied: replied,
        totalBounced: bounced,
        openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
        replyRate: totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0,
        todaySent,
        weekSent,
        followUpsPending: applied.filter(a =>
          a.applied_at &&
          new Date(a.applied_at).getTime() < Date.now() - 3 * 86400000 &&
          !(a as any).follow_up_sent
        ).length,
      });

      // Recent activity from tracking
      const recent = trackingData
        .filter(t => (t as any).opened_at || (t as any).replied_at)
        .sort((a: any, b: any) => {
          const dateA = a.replied_at || a.opened_at;
          const dateB = b.replied_at || b.opened_at;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        })
        .slice(0, 10);

      setRecentActivity(recent);
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [applications]);

  // Subscribe to realtime tracking updates
  useEffect(() => {
    const channel = supabase
      .channel("email-tracking")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_tracking" }, () => {
        loadStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCheckInbox = async () => {
    setCheckingInbox(true);
    try {
      const result = await checkInboxReplies();
      toast({
        title: `📬 Inbox Check Complete`,
        description: `${result.repliesFound || 0} new replies found out of ${result.checkedApplications || 0} checked.`,
      });
      loadStats();
    } catch (err) {
      toast({ title: "Inbox check failed", description: String(err), variant: "destructive" });
    } finally {
      setCheckingInbox(false);
    }
  };

  const statCards = [
    { label: "Emails Sent", value: stats.totalSent, icon: Send, color: "text-primary" },
    { label: "Opened", value: stats.totalOpened, icon: Eye, sub: `${stats.openRate}%`, color: "text-accent" },
    { label: "Replied", value: stats.totalReplied, icon: MessageSquare, sub: `${stats.replyRate}%`, color: "text-success" },
    { label: "Bounced", value: stats.totalBounced, icon: AlertTriangle, color: "text-destructive" },
  ];

  const statusBreakdown = [
    { label: "Discovered", count: applications.filter(a => a.status === "discovered").length, color: "bg-muted-foreground" },
    { label: "CV Tailored", count: applications.filter(a => a.status === "cv_tailored").length, color: "bg-accent" },
    { label: "Applied", count: applications.filter(a => a.status === "applied").length, color: "bg-primary" },
    { label: "Interview", count: applications.filter(a => a.status === "interview").length, color: "bg-warning" },
    { label: "No Email", count: applications.filter(a => a.status === "no_email").length, color: "bg-destructive" },
  ];

  return (
    <div className="space-y-4">
      {/* Check Inbox Button */}
      <div className="flex gap-2">
        <Button
          onClick={handleCheckInbox}
          disabled={checkingInbox}
          variant="outline"
          className="gap-2"
        >
          {checkingInbox ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Checking Inbox...</>
          ) : (
            <><Mail className="h-4 w-4" /> Check Inbox for Replies</>
          )}
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          Scans Gmail for hiring manager replies
        </span>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-secondary/30 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  {stat.sub && (
                    <Badge variant="outline" className="text-[10px]">{stat.sub}</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold font-mono">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Activity Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pipeline Status */}
        <Card className="bg-secondary/30 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Pipeline Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusBreakdown.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${s.color}`} />
                <span className="text-xs text-muted-foreground flex-1">{s.label}</span>
                <span className="text-sm font-mono font-medium">{s.count}</span>
                <Progress value={applications.length > 0 ? (s.count / applications.length) * 100 : 0} className="w-20 h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Daily Activity */}
        <Card className="bg-secondary/30 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              Activity Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Today</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{stats.todaySent}</span>
                <span className="text-xs text-muted-foreground">/ 80</span>
              </div>
            </div>
            <Progress value={(stats.todaySent / 80) * 100} className="h-2" />

            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">This Week</span>
              <span className="font-mono text-sm font-medium">{stats.weekSent}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Follow-ups Pending</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-warning">{stats.followUpsPending}</span>
                {stats.followUpsPending > 0 && (
                  <Clock className="h-3 w-3 text-warning" />
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Open Rate</span>
              <span className="font-mono text-sm font-medium text-accent">{stats.openRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Reply Rate</span>
              <span className="font-mono text-sm font-medium text-primary">{stats.replyRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Opens/Replies */}
      {recentActivity.length > 0 && (
        <Card className="bg-secondary/30 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentActivity.map((activity: any) => (
                <div key={activity.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-0">
                  {activity.replied_at ? (
                    <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-accent shrink-0" />
                  )}
                  <span className="text-muted-foreground flex-1 truncate">
                    {activity.replied_at ? "Reply received" : `Opened ${activity.open_count}x`}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {new Date(activity.replied_at || activity.opened_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
