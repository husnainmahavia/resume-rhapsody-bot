import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, Send, Loader2, CheckCircle2, XCircle,
  Globe, Mail, BarChart3, RefreshCw, ChevronDown, ChevronUp,
  Filter, Clock, AlertTriangle, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Lead {
  id: string;
  company_name: string;
  website: string;
  contact_email: string;
  industry: string;
  region: string;
  description: string;
  opportunity: string;
  email_subject: string | null;
  email_body: string | null;
  email_generated: boolean;
  sent: boolean;
  sent_at: string | null;
  send_error: string | null;
  campaign_batch: string | null;
  created_at: string;
}

interface EngineStats {
  totalLeads: number;
  generated: number;
  sent: number;
  errors: number;
  industries: string[];
  regions: string[];
}

type StatusFilter = "all" | "ready" | "sent" | "error" | "pending";

const DEFAULT_INDUSTRIES = [
  "Retail & E-commerce", "Real Estate", "Healthcare & Medical",
  "Hospitality & Tourism", "Fashion & Apparel", "Education & EdTech",
  "Architecture & Interior Design", "Automotive", "Food & Beverage", "Finance & Banking",
];

const DEFAULT_REGIONS = [
  "United Kingdom", "United States", "Australia",
  "Canada", "Ireland", "UAE", "Saudi Arabia", "Germany & Europe",
];

function getLeadStatus(lead: Lead): StatusFilter {
  if (lead.sent) return "sent";
  if (lead.send_error) return "error";
  if (lead.email_generated) return "ready";
  return "pending";
}

const FILTER_CONFIG: { key: StatusFilter; label: string; icon: React.ElementType; color: string }[] = [
  { key: "all", label: "All", icon: BarChart3, color: "text-foreground" },
  { key: "ready", label: "Ready", icon: Mail, color: "text-accent" },
  { key: "sent", label: "Sent", icon: CheckCircle2, color: "text-success" },
  { key: "error", label: "Errors", icon: XCircle, color: "text-destructive" },
  { key: "pending", label: "Pending", icon: Clock, color: "text-muted-foreground" },
];

export default function EmailEngineDashboard() {
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState("Retail & E-commerce");
  const [selectedRegion, setSelectedRegion] = useState("United Kingdom");
  const [discovering, setDiscovering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const { toast } = useToast();

  useEffect(() => {
    loadStats();
    loadLeads();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await supabase.functions.invoke("email-engine", { body: { action: "status" } });
      if (data) setStats(data);
    } catch (e) { console.error("Stats error:", e); }
  };

  const loadLeads = async () => {
    try {
      const { data } = await supabase.functions.invoke("email-engine", { body: { action: "list" } });
      if (data?.leads) setLeads(data.leads);
    } catch (e) { console.error("List error:", e); }
  };

  const filteredLeads = useMemo(() => {
    if (activeFilter === "all") return leads;
    return leads.filter(l => getLeadStatus(l) === activeFilter);
  }, [leads, activeFilter]);

  const filterCounts = useMemo(() => ({
    all: leads.length,
    ready: leads.filter(l => l.email_generated && !l.sent && !l.send_error).length,
    sent: leads.filter(l => l.sent).length,
    error: leads.filter(l => !!l.send_error).length,
    pending: leads.filter(l => !l.email_generated && !l.sent && !l.send_error).length,
  }), [leads]);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "discover", industry: selectedIndustry, region: selectedRegion },
      });
      toast({
        title: `🔍 Discovered ${data?.discovered || 0} companies`,
        description: `${data?.inserted || 0} new leads added, ${data?.duplicatesSkipped || 0} duplicates skipped`,
      });
      loadStats();
      loadLeads();
    } catch (e) {
      toast({ title: "Discovery failed", description: String(e), variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  };

  const handleGenerate = async () => {
    const ids = selectedLeads.size > 0 ? Array.from(selectedLeads) : undefined;

    const selectedLeadObjs: Lead[] = ids
      ? (ids
          .map((id) => leads.find((l) => l.id === id))
          .filter(Boolean) as Lead[])
      : [];

    const allSelectedSent = selectedLeadObjs.length > 0 && selectedLeadObjs.every((l) => l.sent);
    if (allSelectedSent) {
      toast({
        title: "Nothing to generate",
        description: "All selected leads are already sent.",
        variant: "destructive",
      });
      return;
    }

    const hasAnyPending = leads.some((l) => !l.email_generated && !l.sent && !l.send_error);
    if (!ids && !hasAnyPending) {
      toast({
        title: "0 emails generated",
        description: "All leads already have emails; use Send Bulk (or select leads to regenerate).",
      });
      return;
    }

    const force =
      selectedLeadObjs.length > 0 &&
      selectedLeadObjs.every((l) => l.email_generated) &&
      selectedLeadObjs.some((l) => !l.sent);

    setGenerating(true);
    try {
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "generate", leadIds: ids, force },
      });
      toast({
        title: `✉️ ${force ? "Regenerated" : "Generated"} ${data?.generated || 0} emails`,
        description: `Out of ${data?.total || 0} leads processed`,
      });
      loadStats();
      loadLeads();
      setSelectedLeads(new Set());
    } catch (e) {
      toast({ title: "Generation failed", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    // Filter out already-sent leads from selection
    const unsent = selectedLeads.size > 0
      ? Array.from(selectedLeads).filter(id => {
          const lead = leads.find(l => l.id === id);
          return lead && !lead.sent && lead.email_generated;
        })
      : undefined;

    if (selectedLeads.size > 0 && (!unsent || unsent.length === 0)) {
      toast({ title: "No unsent emails selected", description: "All selected leads have already been sent.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "send", leadIds: unsent },
      });
      toast({
        title: `📧 Sent ${data?.sent || 0} emails`,
        description: data?.errors ? `${data.errors} errors` : "All sent successfully",
      });
      loadStats();
      loadLeads();
      setSelectedLeads(new Set());
    } catch (e) {
      toast({ title: "Send failed", description: String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleRetryErrors = async () => {
    const errorLeads = leads.filter(l => !!l.send_error);
    if (errorLeads.length === 0) {
      toast({ title: "No errors to retry", variant: "destructive" });
      return;
    }
    setRetrying(true);
    try {
      // Clear errors first, then re-send
      for (const lead of errorLeads) {
        await supabase.from("email_engine_leads").update({
          send_error: null,
          sent: false,
        }).eq("id", lead.id);
      }
      // Now send them
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "send", leadIds: errorLeads.map(l => l.id) },
      });
      toast({
        title: `🔄 Retried ${data?.sent || 0} emails`,
        description: data?.errors ? `${data.errors} still failing` : "All retried successfully",
      });
      loadStats();
      loadLeads();
    } catch (e) {
      toast({ title: "Retry failed", description: String(e), variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const toggleLead = (id: string) => {
    const next = new Set(selectedLeads);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedLeads(next);
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredLeads.map(l => l.id);
    if (filteredIds.every(id => selectedLeads.has(id))) {
      const next = new Set(selectedLeads);
      filteredIds.forEach(id => next.delete(id));
      setSelectedLeads(next);
    } else {
      setSelectedLeads(new Set([...selectedLeads, ...filteredIds]));
    }
  };

  const industries = stats?.industries || DEFAULT_INDUSTRIES;
  const regions = stats?.regions || DEFAULT_REGIONS;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Leads Discovered", value: stats?.totalLeads || 0, icon: Search, color: "text-primary" },
          { label: "Emails Generated", value: stats?.generated || 0, icon: Sparkles, color: "text-accent" },
          { label: "Emails Sent", value: stats?.sent || 0, icon: Send, color: "text-success" },
          { label: "Errors", value: stats?.errors || 0, icon: XCircle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label} className="bg-secondary/30 border-border">
            <CardContent className="p-3">
              <s.icon className={`h-4 w-4 ${s.color} mb-1`} />
              <p className="text-2xl font-bold font-mono">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card className="bg-secondary/30 border-border">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Industry</label>
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger className="bg-background/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Region</label>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="bg-background/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleDiscover} disabled={discovering} className="w-full gap-2">
                {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Discover Companies
              </Button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Generate Emails {selectedLeads.size > 0 && `(${selectedLeads.size})`}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSend} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send Bulk {selectedLeads.size > 0 && `(${selectedLeads.size})`}
            </Button>
            {filterCounts.error > 0 && (
              <Button variant="outline" size="sm" onClick={handleRetryErrors} disabled={retrying} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Retry Errors ({filterCounts.error})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => { loadStats(); loadLeads(); }} className="gap-1.5">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
            {filteredLeads.length > 0 && (
              <Button variant="ghost" size="sm" onClick={selectAllFiltered} className="gap-1.5 ml-auto">
                {filteredLeads.every(l => selectedLeads.has(l.id)) ? "Deselect All" : "Select All"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_CONFIG.map(f => (
          <button
            key={f.key}
            onClick={() => { setActiveFilter(f.key); setSelectedLeads(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              activeFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <f.icon className="h-3 w-3" />
            {f.label}
            <span className={`ml-0.5 font-mono text-[10px] ${
              activeFilter === f.key ? "text-primary-foreground/80" : "text-muted-foreground/70"
            }`}>
              {filterCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Lead List */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {filteredLeads.map((lead) => {
            const status = getLeadStatus(lead);
            return (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                layout
                className="glass rounded-md"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={selectedLeads.has(lead.id)}
                    onCheckedChange={() => toggleLead(lead.id)}
                  />
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{lead.company_name}</p>
                      <Badge variant="outline" className="text-[9px] shrink-0">{lead.industry}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {lead.contact_email} • {lead.region}
                    </p>
                    {status === "sent" && lead.sent_at && (
                      <p className="text-[10px] text-success/70 mt-0.5">
                        Sent {new Date(lead.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {status === "sent" ? (
                      <Badge className="bg-success/20 text-success text-[9px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Sent</Badge>
                    ) : status === "error" ? (
                      <Badge className="bg-destructive/20 text-destructive text-[9px]"><XCircle className="h-3 w-3 mr-0.5" />Error</Badge>
                    ) : status === "ready" ? (
                      <Badge className="bg-accent/20 text-accent text-[9px]"><Mail className="h-3 w-3 mr-0.5" />Ready</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]"><Clock className="h-3 w-3 mr-0.5" />Pending</Badge>
                    )}
                    <button onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)} className="p-0.5">
                      {expandedLead === lead.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {expandedLead === lead.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="px-3 pb-3 border-t border-border">
                    <div className="pt-2 space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Website:</span>{" "}
                        <a href={lead.website} target="_blank" rel="noopener" className="text-primary hover:underline">{lead.website}</a>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Description:</span> {lead.description}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Opportunity:</span> {lead.opportunity}
                      </div>
                      {lead.email_subject && (
                        <div className="mt-2 p-2 bg-secondary/50 rounded">
                          <p className="font-medium text-[11px]">Subject: {lead.email_subject}</p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lead.email_body}</p>
                        </div>
                      )}
                      {lead.send_error && (
                        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 rounded">
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                          <p className="text-destructive text-[10px]">{lead.send_error}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredLeads.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {activeFilter === "all"
              ? "No leads yet. Select an industry and region, then click Discover."
              : `No ${activeFilter} emails found.`}
          </div>
        )}
      </div>
    </div>
  );
}
