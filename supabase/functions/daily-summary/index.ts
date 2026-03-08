import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_EMAIL = "h.mahavia@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayISO = yesterday.toISOString();

    // === JOB APPLICATION STATS (husnainmahavia.1@gmail.com) ===
    const { count: totalApps } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true });

    const { count: appsSent24h } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "applied")
      .gte("applied_at", yesterdayISO);

    const { count: appsTotal } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "applied");

    const { count: appsDiscovered24h } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .gte("created_at", yesterdayISO);

    // Email tracking stats
    const { count: trackingOpened } = await supabase
      .from("email_tracking")
      .select("*", { count: "exact", head: true })
      .not("opened_at", "is", null);

    const { count: trackingReplied } = await supabase
      .from("email_tracking")
      .select("*", { count: "exact", head: true })
      .not("replied_at", "is", null);

    const { count: trackingBounced } = await supabase
      .from("email_tracking")
      .select("*", { count: "exact", head: true })
      .eq("bounced", true);

    // Review queue stats
    const { count: reviewPending } = await supabase
      .from("email_review_queue")
      .select("*", { count: "exact", head: true })
      .is("approved", null);

    const { count: reviewApproved } = await supabase
      .from("email_review_queue")
      .select("*", { count: "exact", head: true })
      .eq("approved", true);

    const { count: reviewRejected } = await supabase
      .from("email_review_queue")
      .select("*", { count: "exact", head: true })
      .eq("approved", false);

    // === EMAIL ENGINE STATS (info@visuosofts.com) ===
    const { count: engineTotal } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true });

    const { count: engineGenerated } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .eq("email_generated", true);

    const { count: engineSent } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .eq("sent", true);

    const { count: engineSent24h } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .eq("sent", true)
      .gte("sent_at", yesterdayISO);

    const { count: engineOpened } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .eq("opened", true);

    const { count: engineBounced } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .eq("bounced", true);

    const { count: engineErrors } = await supabase
      .from("email_engine_leads")
      .select("*", { count: "exact", head: true })
      .not("send_error", "is", null);

    // Scraped companies
    const { count: scrapedTotal } = await supabase
      .from("scraped_companies")
      .select("*", { count: "exact", head: true });

    const { count: scrapedEmailed } = await supabase
      .from("scraped_companies")
      .select("*", { count: "exact", head: true })
      .eq("email_sent", true);

    // Domain blacklist
    const { count: blacklistedDomains } = await supabase
      .from("domain_blacklist")
      .select("*", { count: "exact", head: true })
      .eq("is_blacklisted", true);

    // Recent errors (last 24h)
    const { data: recentErrors } = await supabase
      .from("email_engine_leads")
      .select("company_name, contact_email, send_error")
      .not("send_error", "is", null)
      .gte("updated_at", yesterdayISO)
      .limit(10);

    const { data: recentReplies } = await supabase
      .from("email_tracking")
      .select("application_id, reply_snippet, replied_at")
      .not("replied_at", "is", null)
      .gte("replied_at", yesterdayISO)
      .limit(10);

    // Best-performing subject lines (opened emails)
    const { data: openedApps } = await supabase
      .from("email_tracking")
      .select("application_id, open_count, opened_at")
      .not("opened_at", "is", null)
      .order("open_count", { ascending: false })
      .limit(20);

    // Fetch subject lines for opened apps
    let subjectPerformance: { subject: string; opens: number; company: string }[] = [];
    if (openedApps && openedApps.length > 0) {
      const openedIds = openedApps.map((o: any) => o.application_id);
      const openMap = new Map(openedApps.map((o: any) => [o.application_id, o.open_count]));
      const { data: apps } = await supabase
        .from("job_applications")
        .select("id, email_subject, company")
        .in("id", openedIds);
      if (apps) {
        subjectPerformance = apps
          .filter((a: any) => a.email_subject)
          .map((a: any) => ({ subject: a.email_subject, opens: openMap.get(a.id) || 0, company: a.company }))
          .sort((a: any, b: any) => b.opens - a.opens)
          .slice(0, 5);
      }
    }

    const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const errorRows = (recentErrors || []).map(e =>
      `<tr><td style="padding:6px;border:1px solid #ddd">${e.company_name}</td><td style="padding:6px;border:1px solid #ddd">${e.contact_email}</td><td style="padding:6px;border:1px solid #ddd;color:#e74c3c">${e.send_error}</td></tr>`
    ).join("");

    const replyRows = (recentReplies || []).map(r =>
      `<tr><td style="padding:6px;border:1px solid #ddd">${r.application_id}</td><td style="padding:6px;border:1px solid #ddd">${r.reply_snippet || "N/A"}</td><td style="padding:6px;border:1px solid #ddd">${new Date(r.replied_at!).toLocaleString()}</td></tr>`
    ).join("");

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;padding:25px;border-radius:10px 10px 0 0">
        <h1 style="margin:0;font-size:22px">📊 Daily Automation Summary</h1>
        <p style="margin:5px 0 0;opacity:0.8">${dateStr}</p>
      </div>

      <div style="background:white;padding:20px;border-radius:0 0 10px 10px">

        <!-- JOB APPLICATIONS -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #3498db;padding-bottom:8px">📧 Job Applications (husnainmahavia.1@gmail.com)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr><td style="padding:8px;font-weight:bold">Jobs Discovered (24h)</td><td style="padding:8px;text-align:right;font-size:18px;color:#3498db">${appsDiscovered24h || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Applications Sent (24h)</td><td style="padding:8px;text-align:right;font-size:18px;color:#27ae60">${appsSent24h || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Total Applications Sent</td><td style="padding:8px;text-align:right;font-size:18px">${appsTotal || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Emails Opened</td><td style="padding:8px;text-align:right;font-size:18px;color:#f39c12">${trackingOpened || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Replies Received</td><td style="padding:8px;text-align:right;font-size:18px;color:#27ae60">${trackingReplied || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Bounced</td><td style="padding:8px;text-align:right;font-size:18px;color:#e74c3c">${trackingBounced || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Review Queue (Pending/Approved/Rejected)</td><td style="padding:8px;text-align:right">${reviewPending || 0} / ${reviewApproved || 0} / ${reviewRejected || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Total Jobs in DB</td><td style="padding:8px;text-align:right">${totalApps || 0}</td></tr>
        </table>

        <!-- VISUOSOFTS EMAIL ENGINE -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #9b59b6;padding-bottom:8px;margin-top:25px">🚀 Visuosofts Outreach (info@visuosofts.com)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr><td style="padding:8px;font-weight:bold">Emails Sent (24h)</td><td style="padding:8px;text-align:right;font-size:18px;color:#27ae60">${engineSent24h || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Total Emails Sent</td><td style="padding:8px;text-align:right;font-size:18px">${engineSent || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Emails Generated</td><td style="padding:8px;text-align:right">${engineGenerated || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Opened</td><td style="padding:8px;text-align:right;font-size:18px;color:#f39c12">${engineOpened || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Bounced</td><td style="padding:8px;text-align:right;font-size:18px;color:#e74c3c">${engineBounced || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Errors</td><td style="padding:8px;text-align:right;color:#e74c3c">${engineErrors || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Total Leads</td><td style="padding:8px;text-align:right">${engineTotal || 0}</td></tr>
        </table>

        <!-- SCRAPED COMPANIES -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #e67e22;padding-bottom:8px;margin-top:25px">🔍 Scraped Companies</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr><td style="padding:8px;font-weight:bold">Total Scraped</td><td style="padding:8px;text-align:right">${scrapedTotal || 0}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px;font-weight:bold">Emailed</td><td style="padding:8px;text-align:right">${scrapedEmailed || 0}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Blacklisted Domains</td><td style="padding:8px;text-align:right;color:#e74c3c">${blacklistedDomains || 0}</td></tr>
        </table>

        ${replyRows ? `
        <h2 style="color:#27ae60;border-bottom:2px solid #27ae60;padding-bottom:8px;margin-top:25px">✅ Replies Received (24h)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr style="background:#1a1a2e;color:white"><th style="padding:8px;text-align:left">Application</th><th style="padding:8px;text-align:left">Snippet</th><th style="padding:8px;text-align:left">Time</th></tr>
          ${replyRows}
        </table>` : ""}

        ${errorRows ? `
        <h2 style="color:#e74c3c;border-bottom:2px solid #e74c3c;padding-bottom:8px;margin-top:25px">❌ Recent Errors (24h)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr style="background:#1a1a2e;color:white"><th style="padding:8px;text-align:left">Company</th><th style="padding:8px;text-align:left">Email</th><th style="padding:8px;text-align:left">Error</th></tr>
          ${errorRows}
        </table>` : ""}

        ${subjectPerformance.length > 0 ? `
        <h2 style="color:#f39c12;border-bottom:2px solid #f39c12;padding-bottom:8px;margin-top:25px">🏆 Best-Performing Subject Lines</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
          <tr style="background:#1a1a2e;color:white"><th style="padding:8px;text-align:left">#</th><th style="padding:8px;text-align:left">Subject Line</th><th style="padding:8px;text-align:left">Company</th><th style="padding:8px;text-align:center">Opens</th></tr>
          ${subjectPerformance.map((s, i) => `<tr${i % 2 ? ' style="background:#f8f9fa"' : ''}><td style="padding:6px;border:1px solid #ddd;font-weight:bold">${i + 1}</td><td style="padding:6px;border:1px solid #ddd">${s.subject}</td><td style="padding:6px;border:1px solid #ddd">${s.company}</td><td style="padding:6px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#f39c12">${s.opens}x</td></tr>`).join("")}
        </table>` : ""}

        <div style="margin-top:25px;padding:15px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:12px;color:#888">
          Auto-generated by Resume Rhapsody Bot • ${now.toISOString()}
        </div>
      </div>
    </div>`;

    // Send via Gmail
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "husnainmahavia.1@gmail.com", pass: GMAIL_APP_PASSWORD },
    });

    const info = await transporter.sendMail({
      from: "Automation Bot <husnainmahavia.1@gmail.com>",
      to: REPORT_EMAIL,
      subject: `📊 Daily Summary — ${dateStr}`,
      html,
    });

    console.log(`📊 Daily summary sent to ${REPORT_EMAIL} — MessageId: ${info.messageId}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Summary sent to ${REPORT_EMAIL}`,
      messageId: info.messageId,
      stats: {
        jobApps: { discovered24h: appsDiscovered24h, sent24h: appsSent24h, totalSent: appsTotal, opened: trackingOpened, replied: trackingReplied, bounced: trackingBounced },
        visuosofts: { sent24h: engineSent24h, totalSent: engineSent, opened: engineOpened, bounced: engineBounced, errors: engineErrors, totalLeads: engineTotal },
        scraped: { total: scrapedTotal, emailed: scrapedEmailed, blacklisted: blacklistedDomains },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Daily summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
