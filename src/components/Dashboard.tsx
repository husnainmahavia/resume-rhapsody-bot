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
import SenderHealthWidget from "@/components/SenderHealthWidget";

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
      <DailyFiftyBar applications={applications} sentToday={stats.todaySent} />

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

      {/* Sender Health Widget */}
      <SenderHealthWidget />

      {/* Bounce Rate Chart */}
      <BounceChart />

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

function BounceChart() {
  const [bounceData, setBounceData] = useState<{ domain: string; bounces: number; blacklisted: boolean }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("domain_blacklist")
        .select("domain, bounce_count, is_blacklisted")
        .gt("bounce_count", 0)
        .order("bounce_count", { ascending: false })
        .limit(15);
      setBounceData(
        (data || []).map((d: any) => ({ domain: d.domain, bounces: d.bounce_count, blacklisted: d.is_blacklisted }))
      );
    })();
  }, []);

  if (bounceData.length === 0) return null;

  return (
    <Card className="bg-secondary/30 border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Bounce Rate by Domain
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bounceData} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
              <XAxis
                dataKey="domain"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, _name: string, props: any) => [
                  `${value} bounce${value !== 1 ? "s" : ""}${props.payload.blacklisted ? " 🚫 blacklisted" : ""}`,
                  "Bounces",
                ]}
              />
              <Bar dataKey="bounces" radius={[4, 4, 0, 0]}>
                {bounceData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.blacklisted ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                    opacity={entry.blacklisted ? 1 : 0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1">
          Red bars = auto-blacklisted (3+ bounces). These domains are excluded from future outreach.
        </p>
      </CardContent>
    </Card>
  );
}

const DAILY_CAP = 50;

function DailyFiftyBar({ applications, sentToday }: { applications: JobApplication[]; sentToday: number }) {
  const [reviewedToday, setReviewedToday] = useState(0);
  const today = new Date().toISOString().split("T")[0];
  const preparedToday = applications.filter(a => a.created_at?.startsWith(today)).length;

  useEffect(() => {
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("email_review_queue")
        .select("id", { count: "exact", head: true })
        .eq("approved", true)
        .gte("approved_at", start.toISOString());
      setReviewedToday(count || 0);
    })();
  }, [today, sentToday]);

  const pct = Math.min(100, (sentToday / DAILY_CAP) * 100);
  const preparedPct = Math.min(100, (preparedToday / DAILY_CAP) * 100);
  const reviewedPct = Math.min(100, (reviewedToday / DAILY_CAP) * 100);

  return (
    <Card className="bg-secondary/30 border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Today's Daily-50</span>
          </div>
          <span className="font-mono text-sm">
            <span className="text-primary font-bold">{sentToday}</span>
            <span className="text-muted-foreground"> / {DAILY_CAP} sent</span>
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-secondary/60 overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-muted-foreground/30" style={{ width: `${preparedPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-accent/60" style={{ width: `${reviewedPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 mr-1" />Prepared {preparedToday}</span>
          <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60 mr-1" />Reviewed {reviewedToday}</span>
          <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-1" />Sent {sentToday}</span>
        </div>
      </CardContent>
    </Card>
  );
}

