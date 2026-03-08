import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_EMAIL = "h.mahavia@gmail.com";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

async function sendSlackMessage(text: string, blocks?: any[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  if (!LOVABLE_API_KEY || !SLACK_API_KEY) {
    console.log("⚠️ Slack not configured, skipping");
    return;
  }

  try {
    // Find a channel to post to - try #general
    const channelRes = await fetch(`${GATEWAY_URL}/conversations.list?types=public_channel&limit=100`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
      },
    });
    const channelData = await channelRes.json();
    const channel = channelData.channels?.find((c: any) => c.name === "general") || channelData.channels?.[0];
    
    if (!channel) {
      console.log("⚠️ No Slack channel found");
      return;
    }

    const body: any = {
      channel: channel.id,
      text,
      username: "Resume Rhapsody Bot",
      icon_emoji: ":robot_face:",
    };
    if (blocks) body.blocks = blocks;

    const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) console.error("Slack error:", data.error);
    else console.log("✅ Slack message sent");
  } catch (e) {
    console.error("Slack send error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const alerts: string[] = [];
    const slackAlerts: string[] = [];
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    // Check for new replies (last 30 min)
    const { data: newReplies } = await supabase
      .from("email_tracking")
      .select("application_id, reply_snippet, replied_at")
      .not("replied_at", "is", null)
      .gte("replied_at", thirtyMinAgo);

    if (newReplies && newReplies.length > 0) {
      for (const reply of newReplies) {
        const { data: app } = await supabase
          .from("job_applications")
          .select("company, job_title, hiring_manager_name")
          .eq("id", reply.application_id)
          .limit(1)
          .single();

        alerts.push(`✅ <b>REPLY RECEIVED</b> from ${app?.company || "Unknown"} (${app?.job_title || ""})<br>
          ${app?.hiring_manager_name ? `Manager: ${app.hiring_manager_name}<br>` : ""}
          Snippet: <i>"${reply.reply_snippet || "No preview"}"</i>`);

        slackAlerts.push(`✅ *REPLY RECEIVED* from *${app?.company || "Unknown"}* (${app?.job_title || ""})\n> _"${reply.reply_snippet || "No preview"}"_`);
      }
    }

    // Check for email engine errors (last 30 min)
    const { data: engineErrors } = await supabase
      .from("email_engine_leads")
      .select("company_name, contact_email, send_error")
      .not("send_error", "is", null)
      .gte("updated_at", thirtyMinAgo);

    if (engineErrors && engineErrors.length > 0) {
      for (const err of engineErrors) {
        alerts.push(`❌ <b>SEND ERROR</b> — ${err.company_name} (${err.contact_email})<br>Error: ${err.send_error}`);
        slackAlerts.push(`❌ *SEND ERROR* — ${err.company_name} (${err.contact_email})\nError: ${err.send_error}`);
      }
    }

    // Check for new bounces (last 30 min)
    const { data: newBounces } = await supabase
      .from("email_tracking")
      .select("application_id, bounce_reason")
      .eq("bounced", true)
      .gte("created_at", thirtyMinAgo);

    if (newBounces && newBounces.length > 0) {
      alerts.push(`🔴 <b>${newBounces.length} email(s) bounced</b> in last 30 min`);
      slackAlerts.push(`🔴 *${newBounces.length} email(s) bounced* in last 30 min`);
    }

    // Check for newly blacklisted domains
    const { data: newBlacklisted } = await supabase
      .from("domain_blacklist")
      .select("domain, bounce_count")
      .eq("is_blacklisted", true)
      .gte("blacklisted_at", thirtyMinAgo);

    if (newBlacklisted && newBlacklisted.length > 0) {
      for (const d of newBlacklisted) {
        alerts.push(`🚫 <b>DOMAIN BLACKLISTED</b>: ${d.domain} (${d.bounce_count} bounces)`);
        slackAlerts.push(`🚫 *DOMAIN BLACKLISTED*: ${d.domain} (${d.bounce_count} bounces)`);
      }
    }

    // Check for rejected review queue items
    const { data: recentRejected } = await supabase
      .from("email_review_queue")
      .select("company, recipient_email, rejected_reason")
      .eq("approved", false)
      .gte("updated_at", thirtyMinAgo);

    if (recentRejected && recentRejected.length > 0) {
      alerts.push(`⚠️ <b>${recentRejected.length} application(s) rejected</b> in review queue`);
      slackAlerts.push(`⚠️ *${recentRejected.length} application(s) rejected* in review queue`);
    }

    if (alerts.length === 0) {
      console.log("✅ No alerts to send");
      return new Response(JSON.stringify({ success: true, alerts: 0, message: "No alerts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send Slack notification
    const slackText = `🔔 *${slackAlerts.length} Alert(s)* — ${now.toLocaleString()}\n\n${slackAlerts.join("\n\n")}`;
    await sendSlackMessage(slackText);

    // Send email notification
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e74c3c;color:white;padding:15px;border-radius:10px 10px 0 0">
        <h2 style="margin:0">🔔 ${alerts.length} Alert(s) — Resume Rhapsody Bot</h2>
        <p style="margin:3px 0 0;opacity:0.8">${now.toLocaleString()}</p>
      </div>
      <div style="background:white;padding:20px;border:1px solid #ddd;border-radius:0 0 10px 10px">
        ${alerts.map(a => `<div style="padding:12px;margin:8px 0;background:#fef9e7;border-left:4px solid #f39c12;border-radius:4px">${a}</div>`).join("")}
      </div>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "husnainmahavia.1@gmail.com", pass: GMAIL_APP_PASSWORD },
    });

    const info = await transporter.sendMail({
      from: "Alert Bot <husnainmahavia.1@gmail.com>",
      to: ALERT_EMAIL,
      subject: `🔔 ${alerts.length} Alert(s) — Replies, Errors & More`,
      html,
    });

    console.log(`🔔 Alert sent: ${alerts.length} alerts — Email: ${info.messageId}`);

    return new Response(JSON.stringify({ success: true, alerts: alerts.length, messageId: info.messageId, slackSent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Alert notification error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
