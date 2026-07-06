import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2, Play, Square, RefreshCw, MapPin, Zap, Mail,
  CheckCircle2, XCircle, Sparkles, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CATEGORIES: { id: string; label: string; price?: string; desc: string }[] = [
  { id: "web-dev-new", label: "No website → Build (£500)", price: "£500", desc: "Local businesses with no website" },
  { id: "web-dev-refresh", label: "Old website → Refresh (£700)", price: "£700", desc: "Outdated websites needing a redesign" },
  { id: "dashboard", label: "Needs dashboard (£1,200)", price: "£1,200", desc: "Modern site, but running ops on spreadsheets" },
  { id: "ar-realestate", label: "AR for Real Estate", price: "£2,500+", desc: "UK developers & estate agents" },
  { id: "ar-menu", label: "AR Restaurant Menus", price: "£600", desc: "Restaurants, cafes, hotels F&B" },
  { id: "ar-business-card", label: "AR Business Cards", price: "£400", desc: "Consultants, agents, luxury brands" },
  { id: "ar-billboard", label: "AR Billboards", price: "£3,500+", desc: "Brands running OOH campaigns" },
  { id: "ar-generic", label: "Custom AR Solutions", desc: "Any business where AR adds value" },
];

interface StatusPayload {
  state: {
    running: boolean;
    status: string | null;
    iteration: number;
    discovered: number;
    emails_sent: number;
    errors: number;
    last_log: string | null;
    started_at: string | null;
    finished_at: string | null;
  } | null;
  total: number;
  sent: number;
  pending: number;
  recent: Array<{
    id: string;
    business_name: string;
    service_category: string;
    contact_email: string | null;
    sent: boolean;
    sent_at: string | null;
    send_error: string | null;
    created_at: string;
  }>;
}

export default function ServicesOutreachPipeline() {
  const [selected, setSelected] = useState<string[]>(CATEGORIES.map((c) => c.id));
  const [region, setRegion] = useState("United Kingdom");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "services-outreach-pipeline",
        { body: { action: "status" } },
      );
      if (error) throw error;
      setStatus(data as StatusPayload);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    if (selected.length === 0) {
      toast({ title: "Pick at least one service category", variant: "destructive" });
      return;
    }
    setLoadingAction("start");
    try {
      const { data, error } = await supabase.functions.invoke(
        "services-outreach-pipeline",
        { body: { action: "run", categories: selected, region } },
      );
      if (error) throw error;
      toast({ title: "Pipeline started", description: (data as { message?: string })?.message });
      refresh();
    } catch (e) {
      toast({
        title: "Failed to start",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const stop = async () => {
    setLoadingAction("stop");
    try {
      await supabase.functions.invoke("services-outreach-pipeline", {
        body: { action: "stop" },
      });
      toast({ title: "Stop requested" });
      refresh();
    } finally {
      setLoadingAction(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const running = status?.state?.running ?? false;
  const s = status?.state;

  const stats = useMemo(() => ([
    { label: "Discovered", value: s?.discovered ?? 0, icon: Building2 },
    { label: "Emails Sent", value: s?.emails_sent ?? 0, icon: Mail },
    { label: "Errors", value: s?.errors ?? 0, icon: XCircle },
    { label: "Total Leads", value: status?.total ?? 0, icon: Sparkles },
  ]), [s, status]);

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Autonomous B2B Services Outreach</p>
            <p className="text-xs text-muted-foreground mt-1">
              One click: AI discovers UK businesses per category → writes tailored pitch emails →
              sends from <span className="font-mono">info@visuosofts.com</span>. Runs continuously
              in the background with 45–90s human pacing. Daily cap 40 emails.
            </p>
          </div>
        </div>
      </div>

      {/* Region */}
      <div>
        <label className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
          <MapPin className="h-3 w-3" /> Region
        </label>
        <select
          className="mt-2 w-full bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          disabled={running}
        >
          {["United Kingdom", "United States", "Canada", "Australia", "Ireland", "UAE"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Categories */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
          Service categories to sell
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CATEGORIES.map((c) => {
            const active = selected.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => !running && toggle(c.id)}
                disabled={running}
                className={`text-left p-3 rounded-md border transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary/40 hover:border-primary/30"
                } ${running ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  <span className="text-sm font-medium">{c.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 ml-4">{c.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!running ? (
          <Button onClick={start} disabled={loadingAction === "start"} className="gap-2">
            {loadingAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start Outreach Pipeline
          </Button>
        ) : (
          <Button onClick={stop} disabled={loadingAction === "stop"} variant="destructive" className="gap-2">
            <Square className="h-4 w-4" /> Stop
          </Button>
        )}
        <Button onClick={refresh} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((st) => (
          <div key={st.label} className="glass rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <st.icon className="h-3 w-3" />
              {st.label}
            </div>
            <p className="text-2xl font-semibold mt-1">{st.value}</p>
          </div>
        ))}
      </div>

      {/* Live status */}
      <div className="glass rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-2 w-2 rounded-full ${running ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-xs uppercase tracking-widest font-mono">
            {running ? `Running — ${s?.status || "..."}` : (s?.status || "idle")}
          </span>
          {s?.iteration ? (
            <Badge variant="outline" className="ml-auto text-[10px]">iter {s.iteration}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground font-mono min-h-[1.5rem]">
          {s?.last_log || "No activity yet."}
        </p>
      </div>

      {/* Recent leads */}
      {status?.recent && status.recent.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Recent leads
          </p>
          <div className="space-y-1.5 max-h-96 overflow-auto">
            {status.recent.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-2 rounded-md bg-secondary/30 border border-border/50"
              >
                {r.sent ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : r.send_error ? (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{r.business_name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {r.contact_email || "no email"} · {r.service_category}
                  </p>
                </div>
                {r.sent_at && (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {new Date(r.sent_at).toLocaleTimeString()}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
