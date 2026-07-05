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
    const { to, subject, body, hiringManagerName, attachments, applicationId } = await req.json();

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
          success: false, sent: false,
          error: `Domain ${recipientDomain} is blacklisted (${blocked[0].bounce_count} bounces)`,
          blacklisted: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Check if we already sent to this recipient (dedup)
    const { data: alreadySent } = await supabase
      .from("sent_emails")
      .select("id, sent_at")
      .eq("recipient_email", to.toLowerCase())
      .eq("sender", "gmail")
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      console.log(`⏭ Already sent to ${to} on ${alreadySent[0].sent_at} — skipping duplicate`);
      return new Response(JSON.stringify({
        success: false, sent: false, duplicate: true,
        error: `Already emailed ${to} on ${new Date(alreadySent[0].sent_at).toLocaleDateString()}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find or create application_id for tracking
    let appId = applicationId;
    if (!appId) {
      const { data: matchApp } = await supabase
        .from("job_applications")
        .select("id")
        .eq("hiring_manager_email", to)
        .order("created_at", { ascending: false })
        .limit(1);
      if (matchApp && matchApp.length > 0) {
        appId = matchApp[0].id;
      }
    }

    // === Human review gate ===
    // If linked to an application still pending review, block the send.
    if (appId) {
      const { data: reviewCheck } = await supabase
        .from("job_applications")
        .select("pending_review, match_score, company")
        .eq("id", appId)
        .maybeSingle();
      if (reviewCheck?.pending_review) {
        console.log(`🛑 Blocked send to ${to}: application ${appId} pending review`);
        return new Response(JSON.stringify({
          success: false, sent: false, blocked: true, pending_review: true,
          error: `Application for ${reviewCheck.company ?? "role"} is pending your approval (match score ${reviewCheck.match_score ?? "n/a"}/100). Approve it in the Pipeline before sending.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    // Generate tracking pixel ID
    const trackingPixelId = crypto.randomUUID();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const trackingPixelUrl = `${SUPABASE_URL}/functions/v1/email-track?id=${trackingPixelId}`;

    // === Pre-send authenticity + spam gate ===
    const SPAM_TRIGGERS = [
      /\bfree\s+(money|gift|trial|offer)\b/i, /\b100%\s+(free|guaranteed)\b/i,
      /\bact\s+now\b/i, /\blimited\s+time\b/i, /\bviagra\b/i, /\bcasino\b/i,
      /\blottery\b/i, /\bclick\s+here\b/i, /\bbuy\s+now\b/i, /\$\$\$/, /!!!+/,
    ];
    const spamText = `${subject}\n${body}`;
    const spamHit = SPAM_TRIGGERS.find((r) => r.test(spamText));
    if (spamHit) {
      return new Response(JSON.stringify({
        success: false, sent: false, blocked: true,
        error: `Spam trigger detected: ${spamHit}. Rewrite email.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const verifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-verify`;
      const vResp = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ email: to }),
      });
      const vData = await vResp.json();
      const r = vData?.results?.[0];
      const blocked = !r || !r.checks?.mxRecords || r.checks?.disposable
        || r.checks?.smtpRcptTo === "rejected" || r.score < 40;
      if (blocked) {
        const reason = !r ? "verify_no_result"
          : !r.checks?.mxRecords ? "no_mx_records"
          : r.checks?.disposable ? "disposable_domain"
          : r.checks?.smtpRcptTo === "rejected" ? "smtp_rejected"
          : `low_score_${r.reason}`;
        console.log(`🚫 Blocked ${to}: ${reason}`);
        // Auto-blacklist definitive failures
        if ((reason === "no_mx_records" || reason === "smtp_rejected") && recipientDomain) {
          await supabase.from("domain_blacklist").upsert({
            domain: recipientDomain, is_blacklisted: true,
            blacklisted_at: new Date().toISOString(),
            reason: `Auto: ${reason}`, bounce_count: 1,
          }, { onConflict: "domain" });
        }
        return new Response(JSON.stringify({
          success: false, sent: false, blocked: true,
          error: `Email not verified (${reason}, score ${r?.score ?? 0}/100). Send blocked.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log(`✅ Verified ${to} (score ${r.score})`);
    } catch (e) {
      console.log(`⚠️ Verify failed for ${to}: ${e instanceof Error ? e.message : "unknown"} — blocking to be safe`);
      return new Response(JSON.stringify({
        success: false, sent: false, blocked: true,
        error: `Verification failed. Send blocked.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const senderEmail = "husnainmahavia.1@gmail.com";
    const senderName = "Husnain Mahavia";

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: GMAIL_APP_PASSWORD },
    });

    // Embed tracking pixel in HTML
    let htmlBody = body.replace(/\n/g, "<br>");
    htmlBody += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />`;

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
    console.log(`📧 Email SENT to ${to} - Subject: ${subject} - MessageId: ${info.messageId} - Tracking: ${trackingPixelId}`);

    // Log to sent_emails for dedup
    await supabase.from("sent_emails").upsert({
      recipient_email: to.toLowerCase(),
      sender: "gmail",
      subject,
      application_id: appId || null,
      message_id: info.messageId,
      sent_at: new Date().toISOString(),
    }, { onConflict: "recipient_email,sender" }).then(() => {
      console.log(`📋 Dedup record saved for ${to}`);
    }).catch((e: any) => console.error("Dedup log error:", e));

    // Create tracking record if we have an application_id
    if (appId) {
      try {
        // Check if tracking already exists for this application
        const { data: existingTrack } = await supabase
          .from("email_tracking")
          .select("id")
          .eq("application_id", appId)
          .limit(1);

        if (!existingTrack || existingTrack.length === 0) {
          await supabase.from("email_tracking").insert({
            application_id: appId,
            tracking_pixel_id: trackingPixelId,
            open_count: 0,
            bounced: false,
          });
          console.log(`📊 Tracking record created for ${to} (pixel: ${trackingPixelId})`);
        } else {
          // Update existing tracking with new pixel
          await supabase.from("email_tracking").update({
            tracking_pixel_id: trackingPixelId,
          }).eq("id", existingTrack[0].id);
          console.log(`📊 Tracking record updated for ${to}`);
        }
      } catch (trackErr) {
        console.error("Tracking creation error:", trackErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Email sent to ${hiringManagerName || to}`,
      sent: true,
      messageId: info.messageId,
      trackingPixelId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Failed to send email";
    console.error("Email send error:", errorMsg);

    const isBounce = errorMsg.includes("550") || errorMsg.includes("553") ||
                     errorMsg.includes("mailbox not found") || errorMsg.includes("User unknown") ||
                     errorMsg.includes("does not exist") || errorMsg.includes("invalid recipient");

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
      error: errorMsg, sent: false, bounce: isBounce,
    }), {
      status: isBounce ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
