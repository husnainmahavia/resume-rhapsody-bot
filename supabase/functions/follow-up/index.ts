import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const senderEmail = "husnainmahavia.1@gmail.com";

    // Find applications sent 3+ days ago with no reply and no follow-up
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    const { data: pendingFollowUps } = await supabase
      .from("job_applications")
      .select("*, email_tracking(*)")
      .eq("status", "applied")
      .eq("follow_up_sent", false)
      .lte("applied_at", threeDaysAgo)
      .not("hiring_manager_email", "is", null);

    if (!pendingFollowUps || pendingFollowUps.length === 0) {
      return new Response(JSON.stringify({ message: "No follow-ups needed", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out those that have already replied
    const toFollowUp = pendingFollowUps.filter(app => {
      const tracking = (app as any).email_tracking;
      if (Array.isArray(tracking)) {
        return !tracking.some((t: any) => t.replied_at);
      }
      return true;
    }).slice(0, 20); // Max 20 follow-ups per run

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: GMAIL_APP_PASSWORD },
    });

    let sent = 0;

    for (const app of toFollowUp) {
      try {
        // Generate follow-up email via AI
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Write a brief, polite follow-up email (under 100 words). Reference the original application. Be warm but professional. Sign off as Husnain Mahavia, +44 7387 055617." },
              { role: "user", content: `Following up on my application for ${app.job_title} at ${app.company}. Original email subject: ${app.email_subject}. Hiring manager: ${app.hiring_manager_name || "Hiring Team"}.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_followup",
                description: "Return follow-up email",
                parameters: {
                  type: "object",
                  properties: {
                    subject: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["subject", "body"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_followup" } },
          }),
        });

        const data = await response.json();
        const result = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
          ? JSON.parse(data.choices[0].message.tool_calls[0].function.arguments)
          : null;

        if (!result) continue;

        await transporter.sendMail({
          from: `Husnain Mahavia <${senderEmail}>`,
          to: app.hiring_manager_email,
          subject: result.subject,
          text: result.body,
          html: `<div style="font-family: Calibri, Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">${result.body.replace(/\n/g, "<br>")}</div>`,
        });

        await supabase.from("job_applications").update({
          follow_up_sent: true,
          follow_up_scheduled_at: new Date().toISOString(),
        }).eq("id", app.id);

        // Update tracking
        const { data: trackingRecord } = await supabase
          .from("email_tracking")
          .select("id")
          .eq("application_id", app.id)
          .single();

        if (trackingRecord) {
          await supabase.from("email_tracking").update({
            follow_up_sent_at: new Date().toISOString(),
            follow_up_count: 1,
          }).eq("id", trackingRecord.id);
        }

        sent++;
        // Human delay between follow-ups
        await new Promise(r => setTimeout(r, 30000 + Math.random() * 60000));
      } catch (err) {
        console.error(`Follow-up error for ${app.company}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, followUpsSent: sent, total: toFollowUp.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Follow-up error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
