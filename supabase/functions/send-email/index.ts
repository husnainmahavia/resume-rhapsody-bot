import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOUNCE_BLACKLIST_THRESHOLD = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, body, hiringManagerName, attachments } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(JSON.stringify({ success: false, error: `Invalid email address: ${to}`, sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "GMAIL_APP_PASSWORD not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check domain blacklist
    const recipientDomain = to.split("@")[1]?.toLowerCase();
    if (recipientDomain) {
      const { data: blocked } = await supabase
        .from("domain_blacklist")
        .select("is_blacklisted, bounce_count")
        .eq("domain", recipientDomain)
        .eq("is_blacklisted", true)
        .limit(1);

      if (blocked && blocked.length > 0) {
        console.log(`🚫 Domain blacklisted: ${recipientDomain} (${blocked[0].bounce_count} bounces)`);
        return new Response(JSON.stringify({
          success: false,
          sent: false,
          error: `Domain ${recipientDomain} is blacklisted (${blocked[0].bounce_count} bounces)`,
          blacklisted: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const senderEmail = "husnainmahavia.1@gmail.com";
    const senderName = "Husnain Mahavia";

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: GMAIL_APP_PASSWORD },
    });

    const htmlBody = body.replace(/\n/g, "<br>");
    const mailOptions: any = {
      from: `${senderName} <${senderEmail}>`,
      to,
      subject,
      text: body,
      html: htmlBody,
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att: any) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || "text/html",
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email SENT to ${to} - Subject: ${subject} - MessageId: ${info.messageId}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Email sent to ${hiringManagerName || to}`,
      sent: true,
      messageId: info.messageId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Failed to send email";
    console.error("Email send error:", errorMsg);

    const isBounce = errorMsg.includes("550") || errorMsg.includes("553") ||
                     errorMsg.includes("mailbox not found") || errorMsg.includes("User unknown") ||
                     errorMsg.includes("does not exist") || errorMsg.includes("invalid recipient");

    // Track bounce in domain_blacklist
    if (isBounce) {
      try {
        const { to } = await req.clone().json().catch(() => ({ to: "" }));
        const bouncedDomain = to?.split("@")[1]?.toLowerCase();
        if (bouncedDomain) {
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );

          const { data: existing } = await supabase
            .from("domain_blacklist")
            .select("id, bounce_count")
            .eq("domain", bouncedDomain)
            .limit(1);

          if (existing && existing.length > 0) {
            const newCount = (existing[0].bounce_count || 0) + 1;
            await supabase.from("domain_blacklist").update({
              bounce_count: newCount,
              last_bounced_at: new Date().toISOString(),
              is_blacklisted: newCount >= BOUNCE_BLACKLIST_THRESHOLD,
              blacklisted_at: newCount >= BOUNCE_BLACKLIST_THRESHOLD ? new Date().toISOString() : null,
              reason: newCount >= BOUNCE_BLACKLIST_THRESHOLD ? `Auto-blacklisted after ${newCount} bounces` : null,
            }).eq("id", existing[0].id);
          } else {
            await supabase.from("domain_blacklist").insert({
              domain: bouncedDomain,
              bounce_count: 1,
              last_bounced_at: new Date().toISOString(),
              is_blacklisted: false,
            });
          }
          console.log(`📊 Bounce tracked for domain: ${bouncedDomain}`);
        }
      } catch (trackErr) {
        console.error("Bounce tracking error:", trackErr);
      }
    }

    return new Response(JSON.stringify({
      error: errorMsg,
      sent: false,
      bounce: isBounce,
    }), {
      status: isBounce ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
