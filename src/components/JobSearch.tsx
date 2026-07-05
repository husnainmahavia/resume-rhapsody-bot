import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, MapPin, DollarSign, Building2, Plus, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { USER_PROFILE } from "@/lib/user-profile";
import { searchJobs, createApplication } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { scoreJob, scoreBand, type FitScore } from "@/lib/jobScoring";
import { ScoreBadge, AtsPanel } from "@/components/AtsPanel";

interface Job {
  title: string;
  company: string;
  location: string;
  salary_range?: string;
  description: string;
  url?: string;
  hiring_manager?: string;
  hiring_email?: string;
}

interface JobSearchProps { onJobAdded: () => void }

export default function JobSearch({ onJobAdded }: JobSearchProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState("Manchester, UK");
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(50);
  const { toast } = useToast();

  const scored = useMemo(
    () => jobs.map((j) => ({
      job: j,
      fit: scoreJob(
        { jobTitle: j.title, company: j.company, description: j.description, location: j.location, salaryRange: j.salary_range },
        { url: j.url },
      ),
    })).sort((a, b) => b.fit.total - a.fit.total),
    [jobs],
  );

  const visible = scored.filter((s) => s.fit.total >= minScore);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const result = await searchJobs(USER_PROFILE.skills, location);
      if (result.error) toast({ title: "Error", description: result.error, variant: "destructive" });
      else {
        setJobs(result.jobs || []);
        toast({ title: "Jobs Found", description: `Found ${result.jobs?.length || 0} — scored by fit` });
      }
    } catch { toast({ title: "Error", description: "Failed to search jobs", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleSaveJob = async (job: Job, fit: FitScore) => {
    const band = scoreBand(fit.total);
    if (band.tone === "danger") {
      const ok = window.confirm(`This role scored ${fit.total}/100 — a weak fit. Save anyway?`);
      if (!ok) return;
    }
    setSaving(job.title + job.company);
    try {
      await createApplication({
        job_title: job.title, company: job.company, location: job.location,
        salary_range: job.salary_range, job_description: job.description, job_url: job.url,
        hiring_manager_name: job.hiring_manager, hiring_manager_email: job.hiring_email,
        source: "ai_search", status: "discovered",
        match_score: fit.total,
        match_breakdown: fit.breakdown as unknown as Record<string, number>,
        ats_present: fit.ats.present, ats_missing: fit.ats.missing,
        pending_review: true,
      });
      toast({ title: "Saved to review queue", description: `${job.title} at ${job.company} — ${fit.total}/100` });
      onJobAdded();
    } catch { toast({ title: "Error", description: "Failed to save job", variant: "destructive" }); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={location} onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (e.g. Manchester, UK)" className="bg-secondary border-border" />
        <Button onClick={handleSearch} disabled={loading} className="gap-2 shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Searching..." : "AI Search"}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="text-muted-foreground truncate">
          Searching for: {USER_PROFILE.skills.slice(0, 5).join(", ")}...
        </p>
        {jobs.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-muted-foreground">Min fit:</label>
            <input type="range" min={0} max={100} step={5} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))} className="w-24" />
            <span className="font-mono w-10">{minScore}/100</span>
            <span className="text-muted-foreground">({visible.length} of {scored.length})</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {visible.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {visible.map(({ job, fit }, i) => {
              const key = job.title + job.company;
              const isOpen = expanded === key;
              return (
                <motion.div key={key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass rounded-lg p-4 space-y-2 hover:border-primary/30 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{job.title}</h3>
                        <ScoreBadge score={fit.total} />
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {job.company}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location}</span>
                        {job.salary_range && (
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {job.salary_range}</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleSaveJob(job, fit)}
                      disabled={saving === key} className="shrink-0">
                      {saving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-sm text-secondary-foreground line-clamp-2">{job.description}</p>
                  <button onClick={() => setExpanded(isOpen ? null : key)}
                    className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    {isOpen ? "Hide" : "Show"} fit breakdown & ATS keywords
                  </button>
                  {isOpen && <AtsPanel fit={fit} />}
                  {job.hiring_manager && (
                    <p className="text-xs text-muted-foreground">
                      Contact: {job.hiring_manager} {job.hiring_email && `(${job.hiring_email})`}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && jobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>Click "AI Search" to find jobs — each is scored on fit before you save.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && visible.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          All {scored.length} results scored below {minScore}. Lower the threshold to see them.
        </div>
      )}
    </div>
  );
}
