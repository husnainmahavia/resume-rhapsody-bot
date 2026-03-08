import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type JobApplication = Tables<"job_applications">;

export async function fetchApplications() {
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function checkDuplicateApplication(jobTitle: string, company: string): Promise<boolean> {
  const { data } = await supabase
    .from("job_applications")
    .select("id")
    .ilike("job_title", jobTitle)
    .ilike("company", company)
    .limit(1);
  return (data && data.length > 0);
}

export async function createApplication(app: TablesInsert<"job_applications">) {
  const { data, error } = await supabase
    .from("job_applications")
    .insert(app)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateApplication(id: string, updates: Partial<JobApplication>) {
  const { data, error } = await supabase
    .from("job_applications")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function searchJobs(skills: string[], location?: string) {
  const { data, error } = await supabase.functions.invoke("ai-job-search", {
    body: { skills, location },
  });
  if (error) throw error;
  return data;
}

export async function tailorCV(jobTitle: string, company: string, jobDescription: string, cvVersion?: string) {
  const { data, error } = await supabase.functions.invoke("ai-tailor-cv", {
    body: { jobTitle, company, jobDescription, cvVersion: cvVersion || "fullstack" },
  });
  if (error) throw error;
  return data;
}

export async function generateEmail(
  jobTitle: string,
  company: string,
  hiringManager: string,
  jobDescription: string
) {
  const { data, error } = await supabase.functions.invoke("ai-generate-email", {
    body: { jobTitle, company, hiringManager, jobDescription },
  });
  if (error) throw error;
  return data;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  hiringManagerName?: string
) {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: { to, subject, body, hiringManagerName },
  });
  if (error) throw error;
  return data;
}

// Server-side pipeline - runs in background, won't stop when tab switches
export async function runServerPipeline(location: string, skills?: string[], cvVersion?: string, jobType?: string, searchMode?: string) {
  const { data, error } = await supabase.functions.invoke("auto-apply-pipeline", {
    body: { location, skills, cvVersion, jobType, searchMode, action: "run" },
  });
  if (error) throw error;
  return data;
}

export async function sendFollowUps() {
  const { data, error } = await supabase.functions.invoke("follow-up", {
    body: {},
  });
  if (error) throw error;
  return data;
}

export async function getPipelineStatus() {
  const { data, error } = await supabase.functions.invoke("auto-apply-pipeline", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data;
}

export async function checkInboxReplies() {
  const { data, error } = await supabase.functions.invoke("check-inbox-replies", {
    body: {},
  });
  if (error) throw error;
  return data;
}

// Scraper Tool APIs
export async function runScraper(categories: string[], location?: string) {
  const { data, error } = await supabase.functions.invoke("job-scraper", {
    body: { action: "scrape", categories, location },
  });
  if (error) throw error;
  return data;
}

export async function getScraperStatus() {
  const { data, error } = await supabase.functions.invoke("job-scraper", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data;
}

export async function sendScraperEmails(categories?: string[]) {
  const { data, error } = await supabase.functions.invoke("job-scraper", {
    body: { action: "send_emails", categories },
  });
  if (error) throw error;
  return data;
}

export async function listScrapedCompanies() {
  const { data, error } = await supabase.functions.invoke("job-scraper", {
    body: { action: "list" },
  });
  if (error) throw error;
  return data;
}

// LinkedIn Outreach APIs
export async function searchLinkedInJobs(location?: string, jobType?: string) {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", {
    body: { action: "search", location, jobType },
  });
  if (error) throw error;
  return data;
}

export async function generateLinkedInMessages(jobTitle: string, company: string, jobDescription: string, hiringManagerName: string) {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", {
    body: { action: "generate_messages", jobTitle, company, jobDescription, hiringManagerName },
  });
  if (error) throw error;
  return data;
}

export async function getLinkedInStatus() {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data;
}

export async function listLinkedInOutreach() {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", {
    body: { action: "list" },
  });
  if (error) throw error;
  return data;
}

export async function updateLinkedInOutreach(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", {
    body: { action: "update", id, updates },
  });
  if (error) throw error;
  return data;
}
