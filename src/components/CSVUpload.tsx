import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { parseCSV } from "@/lib/emailUtils";
import { createApplication, checkDuplicateApplication } from "@/lib/api";

interface ParsedJob {
  company_name: string;
  domain: string;
  job_url: string;
  job_title: string;
  hiring_email: string;
  hiring_manager: string;
  status: "pending" | "imported" | "duplicate" | "error";
  errorMsg?: string;
}

interface CSVUploadProps {
  onImported?: () => void;
}

export default function CSVUpload({ onImported }: CSVUploadProps) {
  const [jobs, setJobs] = useState<ParsedJob[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);

      const parsed: ParsedJob[] = rows.map(row => ({
        company_name: row["company_name"] || row["company"] || row["name"] || "",
        domain: row["domain"] || row["website"] || "",
        job_url: row["job_url"] || row["url"] || row["link"] || "",
        job_title: row["job_title"] || row["title"] || row["role"] || row["position"] || "Software Engineer",
        hiring_email: row["hiring_email"] || row["email"] || row["contact_email"] || "",
        hiring_manager: row["hiring_manager"] || row["contact"] || row["manager"] || "",
        status: "pending",
      })).filter(j => j.company_name.length > 0);

      setJobs(parsed);
      toast({
        title: "CSV Parsed",
        description: `Found ${parsed.length} jobs from ${file.name}`,
      });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (jobs.length === 0) return;
    setImporting(true);

    let imported = 0;
    let duplicates = 0;
    const updated = [...jobs];

    for (let i = 0; i < updated.length; i++) {
      const job = updated[i];
      if (job.status !== "pending") continue;

      try {
        const isDup = await checkDuplicateApplication(job.job_title, job.company_name);
        if (isDup) {
          updated[i] = { ...job, status: "duplicate" };
          duplicates++;
          continue;
        }

        await createApplication({
          job_title: job.job_title,
          company: job.company_name,
          job_url: job.job_url || undefined,
          hiring_manager_name: job.hiring_manager || undefined,
          hiring_manager_email: job.hiring_email || undefined,
          source: "csv_upload",
          status: job.hiring_email ? "discovered" : "no_email",
          careers_page_url: job.domain ? `https://${job.domain}` : undefined,
        });

        updated[i] = { ...job, status: "imported" };
        imported++;
      } catch (err) {
        updated[i] = { ...job, status: "error", errorMsg: String(err) };
      }

      setJobs([...updated]);
    }

    toast({
      title: "Import Complete",
      description: `${imported} imported, ${duplicates} duplicates skipped`,
    });
    setImporting(false);
    onImported?.();
  };

  const handleClear = () => {
    setJobs([]);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
        />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {fileName ? `📄 ${fileName}` : "Click to upload a CSV file"}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Columns: company_name, domain, job_title, job_url, hiring_email, hiring_manager
        </p>
      </div>

      {/* Preview */}
      <AnimatePresence>
        {jobs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{jobs.length} jobs parsed</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1">
                  <Trash2 className="h-3 w-3" /> Clear
                </Button>
                <Button size="sm" onClick={handleImport} disabled={importing} className="gap-1">
                  {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Import All
                </Button>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
              {jobs.map((job, i) => (
                <div key={i} className="glass rounded-md px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{job.job_title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.company_name} {job.hiring_email && `• ${job.hiring_email}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {job.status === "imported" ? (
                      <Badge className="bg-success/20 text-success text-[9px]"><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>
                    ) : job.status === "duplicate" ? (
                      <Badge variant="secondary" className="text-[9px]">Duplicate</Badge>
                    ) : job.status === "error" ? (
                      <Badge className="bg-destructive/20 text-destructive text-[9px]"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px]"><FileText className="h-3 w-3 mr-1" />Pending</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
