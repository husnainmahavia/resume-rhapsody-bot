import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_EMAIL = "h.mahavia@gmail.com";

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function bar(value: number, max: number, width = 20): string {
  const filled = max ? Math.round((value / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const weekAgoISO = oneWeekAgo.toISOString();
    const twoWeekAgoISO = twoWeeksAgo.toISOString();

    // ===== THIS WEEK: Job Applications =====
    const { count: appsThisWeek } = await supabase.from("job_applications").select("*", { count: "exact", head: true }).eq("status", "applied").gte("applied_at", weekAgoISO);
    const { count: appsLastWeek } = await supabase.from("job_applications").select("*", { count: "exact", head: true }).eq("status", "applied").gte("applied_at", twoWeekAgoISO).lt("applied_at", weekAgoISO);
    const { count: appsTotal } = await supabase.from("job_applications").select("*", { count: "exact", head: true }).eq("status", "applied");
    const { count: jobsDiscoveredWeek } = await supabase.from("job_applications").select("*", { count: "exact", head: true }).gte("created_at", weekAgoISO);

    // Tracking stats - all time
    const { count: trackTotal } = await supabase.from("email_tracking").select("*", { count: "exact", head: true });
    const { count: trackOpened } = await supabase.from("email_tracking").select("*", { count: "exact", head: true }).not("opened_at", "is", null);
    const { count: trackReplied } = await supabase.from("email_tracking").select("*", { count: "exact", head: true }).not("replied_at", "is", null);
    const { count: trackBounced } = await supabase.from("email_tracking").select("*", { count: "exact", head: true }).eq("bounced", true);

    // ===== THIS WEEK: Visuosofts Engine =====
    const { count: engineSentWeek } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("sent", true).gte("sent_at", weekAgoISO);
    const { count: engineSentLastWeek } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("sent", true).gte("sent_at", twoWeekAgoISO).lt("sent_at", weekAgoISO);
    const { count: engineTotal } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true });
    const { count: engineSent } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("sent", true);
    const { count: engineOpened } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("opened", true);
    const { count: engineBounced } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("bounced", true);
    const { count: engineErrors } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).not("send_error", "is", null);

    // Scraped companies
    const { count: scrapedTotal } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true });
    const { count: scrapedEmailed } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_sent", true);
    const { count: scrapedWeek } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).gte("created_at", weekAgoISO);

    // Domain blacklist
    const { count: blacklisted } = await supabase.from("domain_blacklist").select("*", { count: "exact", head: true }).eq("is_blacklisted", true);

    // Review queue
    const { count: reviewPending } = await supabase.from("email_review_queue").select("*", { count: "exact", head: true }).is("approved", null);

    // Compute rates
    const t = (v: number | null) => v || 0;
    const jobOpenRate = pct(t(trackOpened), t(trackTotal));
    const jobReplyRate = pct(t(trackReplied), t(trackTotal));
    const jobBounceRate = pct(t(trackBounced), t(trackTotal));
    const engineOpenRate = pct(t(engineOpened), t(engineSent));
    const engineBounceRate = pct(t(engineBounced), t(engineSent));
    const engineErrorRate = pct(t(engineErrors), t(engineTotal));

    // Trends
    const appsTrend = t(appsThisWeek) - t(appsLastWeek);
    const engineTrend = t(engineSentWeek) - t(engineSentLastWeek);
    const trendIcon = (v: number) => v > 0 ? `📈 +${v}` : v < 0 ? `📉 ${v}` : "➡️ 0";

    const dateRange = `${oneWeekAgo.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);color:white;padding:30px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:24px">📈 Weekly Performance Report</h1>
        <p style="margin:5px 0 0;opacity:0.8;font-size:14px">${dateRange}</p>
      </div>

      <div style="background:white;padding:25px;border-radius:0 0 12px 12px">

        <!-- TREND SUMMARY -->
        <div style="display:flex;gap:15px;margin-bottom:25px">
          <div style="flex:1;background:#eaf4fe;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#3498db">${t(appsThisWeek)}</div>
            <div style="font-size:12px;color:#666">Job Apps This Week</div>
            <div style="font-size:13px;margin-top:4px">${trendIcon(appsTrend)} vs last week</div>
          </div>
          <div style="flex:1;background:#f0e6ff;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#9b59b6">${t(engineSentWeek)}</div>
            <div style="font-size:12px;color:#666">Outreach Sent This Week</div>
            <div style="font-size:13px;margin-top:4px">${trendIcon(engineTrend)} vs last week</div>
          </div>
          <div style="flex:1;background:#e8f8e8;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#27ae60">${t(scrapedWeek)}</div>
            <div style="font-size:12px;color:#666">Companies Scraped</div>
          </div>
        </div>

        <!-- JOB APPLICATIONS PERFORMANCE -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #3498db;padding-bottom:8px">📧 Job Applications (Gmail)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0 20px">
          <tr><td style="padding:8px">Total Sent (All Time)</td><td style="padding:8px;text-align:right;font-weight:bold">${t(appsTotal)}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">Jobs Discovered This Week</td><td style="padding:8px;text-align:right">${t(jobsDiscoveredWeek)}</td></tr>
          <tr><td style="padding:8px">📬 Open Rate</td><td style="padding:8px;text-align:right;font-size:18px;font-weight:bold;color:#f39c12">${jobOpenRate}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">💬 Reply Rate</td><td style="padding:8px;text-align:right;font-size:18px;font-weight:bold;color:#27ae60">${jobReplyRate}</td></tr>
          <tr><td style="padding:8px">🔴 Bounce Rate</td><td style="padding:8px;text-align:right;font-size:18px;font-weight:bold;color:#e74c3c">${jobBounceRate}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">Pending Reviews</td><td style="padding:8px;text-align:right">${t(reviewPending)}</td></tr>
        </table>

        <!-- VISUOSOFTS PERFORMANCE -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #9b59b6;padding-bottom:8px">🚀 Visuosofts Outreach (SMTP)</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0 20px">
          <tr><td style="padding:8px">Total Sent (All Time)</td><td style="padding:8px;text-align:right;font-weight:bold">${t(engineSent)}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">Total Leads</td><td style="padding:8px;text-align:right">${t(engineTotal)}</td></tr>
          <tr><td style="padding:8px">📬 Open Rate</td><td style="padding:8px;text-align:right;font-size:18px;font-weight:bold;color:#f39c12">${engineOpenRate}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">🔴 Bounce Rate</td><td style="padding:8px;text-align:right;font-size:18px;font-weight:bold;color:#e74c3c">${engineBounceRate}</td></tr>
          <tr><td style="padding:8px">⚠️ Error Rate</td><td style="padding:8px;text-align:right;color:#e74c3c">${engineErrorRate}</td></tr>
        </table>

        <!-- SCRAPED COMPANIES -->
        <h2 style="color:#1a1a2e;border-bottom:2px solid #e67e22;padding-bottom:8px">🔍 Lead Pipeline</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0 20px">
          <tr><td style="padding:8px">Total Companies Scraped</td><td style="padding:8px;text-align:right;font-weight:bold">${t(scrapedTotal)}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">Companies Emailed</td><td style="padding:8px;text-align:right">${t(scrapedEmailed)}</td></tr>
          <tr><td style="padding:8px">Blacklisted Domains</td><td style="padding:8px;text-align:right;color:#e74c3c">${t(blacklisted)}</td></tr>
          <tr style="background:#f8f9fa"><td style="padding:8px">Email Coverage</td><td style="padding:8px;text-align:right">${pct(t(scrapedEmailed), t(scrapedTotal))}</td></tr>
        </table>

        <!-- HEALTH SCORE -->
        <div style="margin-top:20px;padding:20px;background:linear-gradient(135deg,#e8f8e8,#f0e6ff);border-radius:10px;text-align:center">
          <h3 style="margin:0 0 10px;color:#1a1a2e">🏥 System Health</h3>
          <div style="font-size:14px;color:#555">
            Deliverability: <b style="color:${t(trackBounced) / Math.max(t(trackTotal), 1) < 0.05 ? '#27ae60' : '#e74c3c'}">${t(trackBounced) / Math.max(t(trackTotal), 1) < 0.05 ? 'GOOD' : 'NEEDS ATTENTION'}</b> |
            Pipeline: <b style="color:#27ae60">ACTIVE</b> |
            Blacklisted: <b>${t(blacklisted)} domains</b>
          </div>
        </div>

        <div style="margin-top:20px;padding:12px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:11px;color:#888">
          Auto-generated Weekly Report • Resume Rhapsody Bot • ${now.toISOString()}
        </div>
      </div>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "husnainmahavia.1@gmail.com", pass: GMAIL_APP_PASSWORD },
    });

    const info = await transporter.sendMail({
      from: "Weekly Report <husnainmahavia.1@gmail.com>",
      to: REPORT_EMAIL,
      subject: `📈 Weekly Report — ${dateRange} | Open: ${jobOpenRate} Reply: ${jobReplyRate}`,
      html,
    });

    console.log(`📈 Weekly report sent — MessageId: ${info.messageId}`);

    return new Response(JSON.stringify({
      success: true,
      messageId: info.messageId,
      stats: {
        jobApps: { thisWeek: t(appsThisWeek), lastWeek: t(appsLastWeek), trend: appsTrend, openRate: jobOpenRate, replyRate: jobReplyRate, bounceRate: jobBounceRate },
        visuosofts: { thisWeek: t(engineSentWeek), lastWeek: t(engineSentLastWeek), trend: engineTrend, openRate: engineOpenRate, bounceRate: engineBounceRate },
        scraped: { total: t(scrapedTotal), emailed: t(scrapedEmailed), thisWeek: t(scrapedWeek) },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Weekly report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
