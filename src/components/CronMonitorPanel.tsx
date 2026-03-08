import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Clock, RefreshCw, CheckCircle2, XCircle, Timer,
  Zap, Search, Mail, Send, MessageSquare, Globe, Inbox
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface CronJob {
  name: string;
  label: string;
  icon: typeof Clock;
  minute: number;
  description: string;
  color: string;
}

const CRON_JOBS: CronJob[] = [
  { name: "auto-apply-hourly", label: "Job Applications", icon: Send, minute: 0, description: "Search → Tailor CV → Apply", color: "text-primary" },
  { name: "check-inbox-hourly", label: "Inbox Check", icon: Inbox, minute: 10, description: "Scan for hiring manager replies", color: "text-accent" },
  { name: "follow-up-hourly", label: "Follow-ups", icon: MessageSquare, minute: 15, description: "Send follow-up emails", color: "text-warning" },
  { name: "scraper-hourly", label: "Company Scraper", icon: Search, minute: 20, description: "Discover companies via search", color: "text-primary" },
  { name: "scraper-send-hourly", label: "Scraper Outreach", icon: Mail, minute: 30, description: "Send cold emails to scraped leads", color: "text-accent" },
  { name: "email-engine-discover", label: "Engine: Discover", icon: Globe, minute: 35, description: "AI-discover B2B leads (rotating)", color: "text-primary" },
  { name: "email-engine-generate", label: "Engine: Generate", icon: Zap, minute: 45, description: "AI-generate personalized emails", color: "text-accent" },
  { name: "email-engine-send", label: "Engine: Send", icon: Send, minute: 55, description: "Send via SMTP (visuosofts.com)", color: "text-success" },
];

const INDUSTRIES = [
  "Retail & E-commerce", "Real Estate", "Healthcare & Medical",
  "Hospitality & Tourism", "Fashion & Apparel", "Education & EdTech",
  "Architecture & Interior Design", "Automotive", "Food & Beverage", "Finance & Banking",
];
const REGIONS = [
  "United Kingdom", "UAE & Kuwait", "Pakistan",
  "Saudi Arabia", "USA & Canada", "Germany & Europe",
];

function getRotatingTarget() {
  const now = new Date();
  const hourOfYear = (now.getMonth() * 30 * 24) + (now.getDate() * 24) + now.getHours();
  const combo = hourOfYear % (INDUSTRIES.length * REGIONS.length);
  const industryIdx = Math.floor(combo / REGIONS.length) % INDUSTRIES.length;
  const regionIdx = combo % REGIONS.length;
  return { industry: INDUSTRIES[industryIdx], region: REGIONS[regionIdx] };
}

function getNextRotatingTarget() {
  const now = new Date();
  const nextHour = (now.getMonth() * 30 * 24) + (now.getDate() * 24) + now.getHours() + 1;
  const combo = nextHour % (INDUSTRIES.length * REGIONS.length);
  const industryIdx = Math.floor(combo / REGIONS.length) % INDUSTRIES.length;
  const regionIdx = combo % REGIONS.length;
  return { industry: INDUSTRIES[industryIdx], region: REGIONS[regionIdx] };
}

function getNextRun(minute: number): { timeStr: string; minutesAway: number } {
  const now = new Date();
  const next = new Date(now);
  if (now.getMinutes() >= minute) {
    next.setHours(next.getHours() + 1);
  }
  next.setMinutes(minute, 0, 0);
  const diff = Math.round((next.getTime() - now.getTime()) / 60000);
  return {
    timeStr: next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    minutesAway: diff,
  };
}

function getLastRun(minute: number): string {
  const now = new Date();
  const last = new Date(now);
  if (now.getMinutes() < minute) {
    last.setHours(last.getHours() - 1);
  }
  last.setMinutes(minute, 0, 0);
  return last.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CronMonitorPanel() {
  const [now, setNow] = useState(new Date());
  const rotating = getRotatingTarget();
  const nextRotating = getNextRotatingTarget();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const currentMinute = now.getMinutes();

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <Card className="bg-secondary/30 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium">All Systems Running 24/7</span>
              <Badge variant="outline" className="text-[10px]">8 jobs/hour</Badge>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {now.toLocaleTimeString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Current Rotation */}
      <Card className="bg-secondary/30 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Industry/Region Rotation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current Target</span>
            <div className="flex gap-1.5">
              <Badge className="text-[9px]">{rotating.industry}</Badge>
              <Badge variant="outline" className="text-[9px]">{rotating.region}</Badge>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Next Hour</span>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="text-[9px]">{nextRotating.industry}</Badge>
              <Badge variant="secondary" className="text-[9px]">{nextRotating.region}</Badge>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Rotates through {INDUSTRIES.length} industries × {REGIONS.length} regions = {INDUSTRIES.length * REGIONS.length} unique combos
          </p>
        </CardContent>
      </Card>

      {/* Job Timeline */}
      <Card className="bg-secondary/30 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="h-4 w-4 text-accent" />
            Hourly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {CRON_JOBS.map((job) => {
            const next = getNextRun(job.minute);
            const lastRun = getLastRun(job.minute);
            const isRunningNow = Math.abs(currentMinute - job.minute) <= 1;
            const justRan = currentMinute > job.minute && currentMinute - job.minute <= 3;

            return (
              <motion.div
                key={job.name}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isRunningNow ? "bg-primary/10 border border-primary/30" : "bg-background/30"
                }`}
              >
                <div className="shrink-0 w-10 text-center">
                  <span className="text-xs font-mono text-muted-foreground">:{String(job.minute).padStart(2, "0")}</span>
                </div>
                <job.icon className={`h-3.5 w-3.5 shrink-0 ${job.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">{job.label}</span>
                    {isRunningNow && (
                      <Badge className="bg-success/20 text-success text-[8px] px-1">RUNNING</Badge>
                    )}
                    {justRan && !isRunningNow && (
                      <Badge variant="secondary" className="text-[8px] px-1">DONE</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{job.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-mono text-muted-foreground">Last: {lastRun}</p>
                  <p className="text-[10px] font-mono">
                    Next: {next.timeStr}{" "}
                    <span className="text-muted-foreground">({next.minutesAway}m)</span>
                  </p>
                </div>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>

      {/* Hour Progress */}
      <Card className="bg-secondary/30 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Hour Progress</span>
            <span className="text-xs font-mono">{currentMinute}/60 min</span>
          </div>
          <Progress value={(currentMinute / 60) * 100} className="h-2" />
          <div className="flex justify-between mt-1">
            {CRON_JOBS.map((job) => (
              <div
                key={job.name}
                className="relative"
                style={{ left: `${(job.minute / 60) * 100}%`, position: "absolute" }}
              >
                <div
                  className={`h-1.5 w-0.5 ${
                    currentMinute >= job.minute ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
