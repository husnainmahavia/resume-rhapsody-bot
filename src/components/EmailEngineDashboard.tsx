import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, Send, Loader2, CheckCircle2, XCircle,
  Globe, Mail, BarChart3, RefreshCw, ChevronDown, ChevronUp
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

const DEFAULT_INDUSTRIES = [
  "Retail & E-commerce", "Real Estate", "Healthcare & Medical",
  "Hospitality & Tourism", "Fashion & Apparel", "Education & EdTech",
  "Architecture & Interior Design", "Automotive", "Food & Beverage", "Finance & Banking",
];

const DEFAULT_REGIONS = [
  "United Kingdom", "UAE & Kuwait", "Pakistan",
  "Saudi Arabia", "USA & Canada", "Germany & Europe",
];

export default function EmailEngineDashboard() {
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState("Retail & E-commerce");
  const [selectedRegion, setSelectedRegion] = useState("United Kingdom");
  const [discovering, setDiscovering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
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
    setGenerating(true);
    try {
      const ids = selectedLeads.size > 0 ? Array.from(selectedLeads) : undefined;
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "generate", leadIds: ids },
      });
      toast({
        title: `✉️ Generated ${data?.generated || 0} emails`,
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
    setSending(true);
    try {
      const ids = selectedLeads.size > 0 ? Array.from(selectedLeads) : undefined;
      const { data } = await supabase.functions.invoke("email-engine", {
        body: { action: "send", leadIds: ids },
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

  const toggleLead = (id: string) => {
    const next = new Set(selectedLeads);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedLeads(next);
  };

  const selectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
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
            <Button variant="ghost" size="sm" onClick={() => { loadStats(); loadLeads(); }} className="gap-1.5">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
            {leads.length > 0 && (
              <Button variant="ghost" size="sm" onClick={selectAll} className="gap-1.5 ml-auto">
                {selectedLeads.size === leads.length ? "Deselect All" : "Select All"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lead List */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
        <AnimatePresence>
          {leads.map((lead) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
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
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {lead.sent ? (
                    <Badge className="bg-success/20 text-success text-[9px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Sent</Badge>
                  ) : lead.send_error ? (
                    <Badge className="bg-destructive/20 text-destructive text-[9px]"><XCircle className="h-3 w-3 mr-0.5" />Error</Badge>
                  ) : lead.email_generated ? (
                    <Badge className="bg-accent/20 text-accent text-[9px]"><Mail className="h-3 w-3 mr-0.5" />Ready</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px]">Pending</Badge>
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
                      <p className="text-destructive text-[10px]">Error: {lead.send_error}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {leads.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No leads yet. Select an industry and region, then click Discover.
          </div>
        )}
      </div>
    </div>
  );
}
