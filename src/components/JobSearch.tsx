import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, MapPin, DollarSign, Building2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { USER_PROFILE } from "@/lib/user-profile";
import { searchJobs, createApplication } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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

interface JobSearchProps {
  onJobAdded: () => void;
}

export default function JobSearch({ onJobAdded }: JobSearchProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState("Manchester, UK");
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    setLoading(true);
    try {
      const result = await searchJobs(USER_PROFILE.skills, location);
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else {
        setJobs(result.jobs || []);
        toast({ title: "Jobs Found", description: `Found ${result.jobs?.length || 0} relevant jobs` });
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to search jobs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJob = async (job: Job) => {
    setSaving(job.title + job.company);
    try {
      await createApplication({
        job_title: job.title,
        company: job.company,
        location: job.location,
        salary_range: job.salary_range,
        job_description: job.description,
        job_url: job.url,
        hiring_manager_name: job.hiring_manager,
        hiring_manager_email: job.hiring_email,
        source: "ai_search",
        status: "discovered",
      });
      toast({ title: "Saved!", description: `${job.title} at ${job.company} added to tracker` });
      onJobAdded();
    } catch {
      toast({ title: "Error", description: "Failed to save job", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (e.g. Manchester, UK)"
          className="bg-secondary border-border"
        />
        <Button onClick={handleSearch} disabled={loading} className="gap-2 shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Searching..." : "AI Search"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Searching for: {USER_PROFILE.skills.slice(0, 5).join(", ")}...
      </p>

      <AnimatePresence>
        {jobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3 max-h-[500px] overflow-y-auto pr-1"
          >
            {jobs.map((job, i) => (
              <motion.div
                key={`${job.title}-${job.company}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-lg p-4 space-y-2 hover:border-primary/30 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{job.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {job.company}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.location}
                      </span>
                      {job.salary_range && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> {job.salary_range}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSaveJob(job)}
                    disabled={saving === job.title + job.company}
                    className="shrink-0"
                  >
                    {saving === job.title + job.company ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-secondary-foreground">{job.description}</p>
                {job.hiring_manager && (
                  <p className="text-xs text-muted-foreground">
                    Contact: {job.hiring_manager} {job.hiring_email && `(${job.hiring_email})`}
                  </p>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && jobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>Click "AI Search" to find jobs matching your skills</p>
        </div>
      )}
    </div>
  );
}
