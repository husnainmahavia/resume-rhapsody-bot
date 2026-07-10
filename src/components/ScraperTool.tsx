import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Loader2, Mail, CheckCircle2, XCircle, Database,
  Play, Send, RefreshCw, Filter, BarChart3, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { runScraper, getScraperStatus, sendScraperEmails, listScrapedCompanies, stopScraper } from "@/lib/api";


const CATEGORIES = [
  { value: "web_development", label: "Web Development", color: "text-blue-400" },
  { value: "digital_marketing", label: "Digital Marketing", color: "text-green-400" },
  { value: "ai_ml", label: "AI / Machine Learning", color: "text-purple-400" },
  { value: "ar_vr", label: "AR / VR", color: "text-pink-400" },
  { value: "ecommerce", label: "E-Commerce", color: "text-orange-400" },
  { value: "software_development", label: "Software Dev", color: "text-cyan-400" },
];

interface ScrapedCompany {
  id: string;
  company_name: string;
  email: string;
  website: string;
  category: string;
  source: string;
  location: string;
  description: string;
  email_sent: boolean;
  email_opened: boolean;
  email_replied: boolean;
  status: string;
  created_at: string;
}

export default function ScraperTool() {
  const [scraping, setScraping] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(CATEGORIES.map(c => c.value));
  const [location, setLocation] = useState("UK");
  const [stats, setStats] = useState({ total: 0, sent: 0, opened: 0, replied: 0, categories: {} as Record<string, number> });
  const [companies, setCompanies] = useState<ScrapedCompany[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [statusData, listData] = await Promise.all([getScraperStatus(), listScrapedCompanies()]);
      setStats(statusData);
      setCompanies(listData.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleScrape = async () => {
    if (selectedCategories.length === 0) {
      toast({ title: "Select categories", description: "Pick at least one category to scrape.", variant: "destructive" });
      return;
    }
    setScraping(true);
    try {
      const result = await runScraper(selectedCategories, location);
      toast({
        title: "🔍 Scraping Complete",
        description: `Found ${result.totalScraped} companies, ${result.totalNew} new added to database`,
      });
      await loadData();
      setShowResults(true);
    } catch (e) {
      toast({ title: "Scraper Error", description: String(e), variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const handleSendEmails = async () => {
    setSending(true);
    try {
      const result = await sendScraperEmails(selectedCategories);
      toast({
        title: "📧 Emails Sent",
        description: `${result.sent}/${result.total} emails sent successfully`,
      });
      await loadData();
    } catch (e) {
      toast({ title: "Send Error", description: String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const filteredCompanies = filterCategory === "all"
    ? companies
    : companies.filter(c => c.category === filterCategory);

  const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Scraped", value: stats.total, icon: Database, color: "text-primary" },
          { label: "Emailed", value: stats.sent, icon: Mail, color: "text-info" },
          { label: "Opened", value: stats.opened, icon: CheckCircle2, color: "text-success" },
          { label: "Replied", value: stats.replied, icon: BarChart3, color: "text-warning" },
        ].map(s => (
          <div key={s.label} className="glass rounded-lg p-3 text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className="text-lg font-bold font-mono">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category per stats */}
      {Object.keys(stats.categories).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.categories).map(([cat, count]) => (
            <Badge key={cat} variant="outline" className="text-[10px]">
              {categoryLabel(cat)}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Location Input */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Target Location</label>
        <Input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="UK, Manchester, Remote..."
          className="bg-secondary border-border"
          disabled={scraping || sending}
        />
      </div>

      {/* Category Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted-foreground">Scrape Categories ({selectedCategories.length}/{CATEGORIES.length})</label>
          <div className="flex gap-2">
            <button onClick={() => setSelectedCategories(CATEGORIES.map(c => c.value))} className="text-[10px] text-primary hover:underline">All</button>
            <button onClick={() => setSelectedCategories([])} className="text-[10px] text-muted-foreground hover:underline">None</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => toggleCategory(cat.value)}
              disabled={scraping || sending}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                selectedCategories.includes(cat.value)
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              <Globe className={`h-3 w-3 ${cat.color}`} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button onClick={handleScrape} disabled={scraping || sending} className="gap-2" size="lg">
          {scraping ? <><Loader2 className="h-4 w-4 animate-spin" /> Scraping...</> : <><Play className="h-4 w-4" /> Scrape Companies</>}
        </Button>
        <Button onClick={handleSendEmails} disabled={scraping || sending || stats.total === 0} variant="outline" className="gap-2" size="lg">
          {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Emails ({stats.total - stats.sent} unsent)</>}
        </Button>
      </div>

      <Button variant="ghost" onClick={loadData} className="gap-2 w-full" size="sm">
        <RefreshCw className="h-3 w-3" /> Refresh Data
      </Button>

      {/* Running indicator */}
      {(scraping || sending) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          <Progress value={scraping ? 40 : 60} className="h-2 animate-pulse" />
          <p className="text-xs text-muted-foreground text-center">
            {scraping ? "🔍 AI searching across Google, Bing & more..." : "📧 Sending personalized emails with human-like pacing..."}
          </p>
        </motion.div>
      )}

      {/* Category Filter */}
      {companies.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <button
            onClick={() => setFilterCategory("all")}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${filterCategory === "all" ? "bg-primary/20 text-primary border-primary/40" : "border-border text-muted-foreground"}`}
          >
            All ({companies.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = companies.filter(c => c.category === cat.value).length;
            if (count === 0) return null;
            return (
              <button
                key={cat.value}
                onClick={() => setFilterCategory(cat.value)}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${filterCategory === cat.value ? "bg-primary/20 text-primary border-primary/40" : "border-border text-muted-foreground"}`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Scraped Companies List */}
      <AnimatePresence>
        {filteredCompanies.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {filteredCompanies.slice(0, 50).map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="glass rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.company_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[9px]">{categoryLabel(c.category)}</Badge>
                    {c.email_replied ? (
                      <Badge className="bg-success/20 text-success text-[9px]">Replied</Badge>
                    ) : c.email_opened ? (
                      <Badge className="bg-info/20 text-info text-[9px]">Opened</Badge>
                    ) : c.email_sent ? (
                      <Badge className="bg-primary/20 text-primary text-[9px]">Sent</Badge>
                    ) : c.status === "bounced" ? (
                      <Badge className="bg-destructive/20 text-destructive text-[9px]">Bounced</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">Queued</Badge>
                    )}
                  </div>
                </div>
                {c.description && (
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.description}</p>
                )}
              </motion.div>
            ))}
            {filteredCompanies.length > 50 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Showing 50 of {filteredCompanies.length} results
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {companies.length === 0 && !scraping && (
        <div className="text-center py-8 text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No companies scraped yet. Select categories and hit "Scrape Companies".</p>
        </div>
      )}
    </div>
  );
}
