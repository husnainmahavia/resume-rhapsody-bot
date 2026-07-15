// Cross-system dedupe: is this email already known to any of our outreach
// systems (email_engine_leads, services_outreach_leads, sent_emails,
// job_applications, domain_blacklist)? Used at discovery time to avoid
// double-emailing the same business from two different pipelines.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type DedupeReason =
  | "already_sent"
  | "in_email_engine"
  | "in_services_outreach"
  | "in_job_applications"
  | "domain_blacklisted"
  | null;

export async function checkDuplicate(
  supabase: SupabaseClient,
  email: string,
): Promise<DedupeReason> {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  const domain = lower.split("@")[1];

  // 1. Already sent (either sender)
  const { data: s } = await supabase
    .from("sent_emails")
    .select("id")
    .eq("recipient_email", lower)
    .limit(1);
  if (s && s.length > 0) return "already_sent";

  // 2. Already in email_engine_leads
  const { data: ee } = await supabase
    .from("email_engine_leads")
    .select("id")
    .eq("contact_email", lower)
    .limit(1);
  if (ee && ee.length > 0) return "in_email_engine";

  // 3. Already in services_outreach_leads
  const { data: so } = await supabase
    .from("services_outreach_leads")
    .select("id")
    .eq("contact_email", lower)
    .limit(1);
  if (so && so.length > 0) return "in_services_outreach";

  // 4. Already targeted by job applications
  const { data: ja } = await supabase
    .from("job_applications")
    .select("id")
    .eq("hiring_manager_email", lower)
    .limit(1);
  if (ja && ja.length > 0) return "in_job_applications";

  // 5. Blacklisted domain
  if (domain) {
    const { data: bl } = await supabase
      .from("domain_blacklist")
      .select("is_blacklisted")
      .eq("domain", domain)
      .eq("is_blacklisted", true)
      .limit(1);
    if (bl && bl.length > 0) return "domain_blacklisted";
  }

  return null;
}
