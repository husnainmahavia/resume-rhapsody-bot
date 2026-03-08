import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find all no_email records
    const { data: noEmailApps, error } = await supabase
      .from("job_applications")
      .select("id, job_title, company, job_description, job_url")
      .eq("status", "no_email")
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!noEmailApps || noEmailApps.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No no_email records to retry", retried: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[retry-no-email] Found ${noEmailApps.length} no_email records to retry`);

    let resolved = 0;
    let stillFailed = 0;

    for (const app of noEmailApps) {
      try {
        // Extract domain from job_url or company name
        let companyDomain = "";
        if (app.job_url) {
          try {
            const url = new URL(app.job_url);
            companyDomain = url.hostname.replace(/^www\./, "");
            // Strip career subdomains
            companyDomain = companyDomain.replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
          } catch { /* ignore */ }
        }
        if (!companyDomain) {
          companyDomain = app.company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
        }

        console.log(`[retry] Retrying ${app.company} (${companyDomain})`);

        // Call the find-email function
        const findRes = await fetch(`${supabaseUrl}/functions/v1/find-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            companyDomain,
            companyName: app.company,
            hiringManagerName: null,
          }),
        });

        const emailResult = await findRes.json();
        const emails: string[] = emailResult?.emails || [];

        if (emails.length > 0) {
          const bestEmail = emails[0];
          // Update the application with the found email and move to discovered
          await supabase.from("job_applications").update({
            hiring_manager_email: bestEmail,
            status: "discovered",
            notes: `[Retry] Email found via retry: ${bestEmail} (${new Date().toISOString()})`,
          }).eq("id", app.id);

          resolved++;
          console.log(`[retry] ✅ Resolved ${app.company} → ${bestEmail}`);
        } else {
          stillFailed++;
          console.log(`[retry] ❌ Still no email for ${app.company}`);
        }

        // Small delay between lookups
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[retry] Error processing ${app.company}:`, e);
        stillFailed++;
      }
    }

    const summary = { success: true, total: noEmailApps.length, resolved, stillFailed };
    console.log(`[retry-no-email] Done:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[retry-no-email] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
