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
export async function runServerPipeline(location: string, skills?: string[]) {
  const { data, error } = await supabase.functions.invoke("auto-apply-pipeline", {
    body: { location, skills, action: "run" },
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
