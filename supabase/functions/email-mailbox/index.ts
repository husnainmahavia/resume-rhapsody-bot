import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const senderEmail = "husnainmahavia.1@gmail.com";
const senderName = "Husnain Mahavia";

// Rate limiting rules per PDF strategy (Layer 5)
const RATE_LIMITS = {
  maxEmailsPerDay: 50,
  maxEmailsPerDomain: 3,
  minDelayBetweenEmails: 5000, // 5 seconds minimum
  maxBouncesBeforePause: 5,
  verifyBeforeSending: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;

    if (action === "send") return await handleSend(payload);
    if (action === "fetch_replies") return await handleFetchReplies();
    if (action === "health") return await handleHealthCheck();

    return json({ error: "Invalid action. Use 'send', 'fetch_replies', or 'health'" }, 400);
  } catch (error) {
    console.error("email-mailbox error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function handleSend(payload: Record<string, unknown>) {
  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const hiringManagerName = String(payload.hiringManagerName || "").trim();
  const applicationId = payload.applicationId ? String(payload.applicationId) : null;

  if (!to || !subject || !body) {
    return json({ success: false, sent: false, error: "Missing required fields: to, subject, body" }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return json({ success: false, sent: false, error: `Invalid email: ${to}` }, 400);
  }

  const password = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!password) {
    return json({ success: false, sent: false, error: "GMAIL_APP_PASSWORD not configured" }, 500);
  }

  const supabase = serviceClient();

  // Rate limit check: daily limit
  const today = new Date().toISOString().split("T")[0];
  const { count: sentToday } = await supabase
    .from("job_applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "applied")
    .gte("applied_at", today);

  if ((sentToday || 0) >= RATE_LIMITS.maxEmailsPerDay) {
    return json({ success: false, sent: false, error: `Daily limit reached (${RATE_LIMITS.maxEmailsPerDay}). Resume tomorrow.` }, 429);
  }

  // Rate limit check: per-domain limit
  const recipientDomain = to.split("@")[1]?.toLowerCase();
  if (recipientDomain) {
    const { count: domainCount } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "applied")
      .ilike("hiring_manager_email", `%@${recipientDomain}`);

    if ((domainCount || 0) >= RATE_LIMITS.maxEmailsPerDomain) {
      return json({ success: false, sent: false, error: `Domain limit reached: max ${RATE_LIMITS.maxEmailsPerDomain} emails to ${recipientDomain}` }, 429);
    }
  }

  // Bounce pause check: if 5+ recent bounces, pause sending
  const { count: recentBounces } = await supabase
    .from("email_tracking")
    .select("*", { count: "exact", head: true })
    .eq("bounced", true)
    .gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString());

  if ((recentBounces || 0) >= RATE_LIMITS.maxBouncesBeforePause) {
    return json({
      success: false, sent: false,
      error: `Sending paused: ${recentBounces} bounces in last 24h. Review bounce list before resuming.`,
    }, 429);
  }

  // Check domain blacklist
  if (recipientDomain) {
    const { data: blacklisted } = await supabase
      .from("domain_blacklist")
      .select("id")
      .eq("domain", recipientDomain)
      .eq("is_blacklisted", true)
      .limit(1)
      .maybeSingle();

    if (blacklisted) {
      return json({ success: false, sent: false, error: `Domain ${recipientDomain} is blacklisted` }, 400);
    }
  }

  // Send via SMTP
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: senderEmail, pass: password },
  });

  const info = await transporter.sendMail({
    from: `${senderName} <${senderEmail}>`,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });

  // Upsert tracking record
  const appId = applicationId ?? (await findLatestApplicationByEmail(supabase, to));
  if (appId) {
    await upsertTrackingRecord(supabase, appId);
  }

  console.log(`📧 SMTP sent to ${to} (${info.messageId})`);
  return json({
    success: true,
    sent: true,
    messageId: info.messageId,
    message: `Email sent to ${hiringManagerName || to}`,
    rateLimits: { sentToday: (sentToday || 0) + 1, dailyLimit: RATE_LIMITS.maxEmailsPerDay },
  });
}

async function handleFetchReplies() {
  const password = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!password) return json({ success: false, error: "GMAIL_APP_PASSWORD not configured" }, 500);

  const supabase = serviceClient();
  const { data: pendingApps, error } = await supabase
    .from("job_applications")
    .select("id, company, job_title, hiring_manager_email, email_tracking(id, replied_at)")
    .eq("status", "applied")
    .not("hiring_manager_email", "is", null);

  if (error) throw error;
  if (!pendingApps?.length) return json({ success: true, repliesFound: 0, checkedApplications: 0, results: [] });

  const unreplied = pendingApps.filter((app) => {
    const tracking = (app as Record<string, unknown>).email_tracking;
    if (Array.isArray(tracking)) return !tracking.some((t) => (t as Record<string, unknown>).replied_at);
    return true;
  });

  if (!unreplied.length) return json({ success: true, repliesFound: 0, checkedApplications: 0, results: [] });

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: senderEmail, pass: password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  let repliesFound = 0;
  const results: Array<Record<string, string | null>> = [];

  try {
    const since = new Date(Date.now() - 14 * 86400000);

    for (const app of unreplied) {
      const appRow = app as Record<string, unknown>;
      const hiringEmail = String(appRow.hiring_manager_email || "");
      if (!hiringEmail.includes("@")) continue;

      const senderDomain = hiringEmail.split("@")[1];
      const ids = await client.search({
        since,
        or: [{ from: hiringEmail }, { from: `@${senderDomain}` }],
      });

      if (!ids.length) continue;

      for await (const msg of client.fetch(ids.slice(-3), { envelope: true, bodyParts: ["1"], bodyStructure: true })) {
        const subject = msg.envelope?.subject || "";
        const fromAddress = msg.envelope?.from?.[0]?.address || "";
        const date = msg.envelope?.date;

        const isReply =
          subject.toLowerCase().includes("re:") ||
          subject.toLowerCase().includes(String(appRow.job_title || "").toLowerCase().slice(0, 20)) ||
          subject.toLowerCase().includes(String(appRow.company || "").toLowerCase()) ||
          fromAddress.includes(senderDomain);

        if (!isReply) continue;

        let snippet = "";
        try {
          const bodyPart = msg.bodyParts?.get("1");
          if (bodyPart) {
            const text = await streamToString(bodyPart);
            snippet = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
          }
        } catch { /* best effort */ }

        const tracking = appRow.email_tracking;
        const trackingId = Array.isArray(tracking) && tracking.length > 0
          ? String((tracking[0] as Record<string, unknown>).id || "")
          : "";

        if (trackingId) {
          await supabase.from("email_tracking").update({
            replied_at: date?.toISOString() || new Date().toISOString(),
            reply_snippet: snippet || `Reply from ${fromAddress}: ${subject}`,
          }).eq("id", trackingId);
        }

        await supabase.from("job_applications").update({
          status: "interview",
          notes: `📬 Reply received from ${fromAddress} on ${date?.toLocaleDateString() || "recently"}: "${subject}"${snippet ? `\n\nSnippet: ${snippet}` : ""}`,
        }).eq("id", String(appRow.id));

        repliesFound += 1;
        results.push({
          company: String(appRow.company || ""),
          job: String(appRow.job_title || ""),
          from: fromAddress,
          subject,
          snippet: snippet.slice(0, 100),
          date: date?.toISOString() || null,
        });

        break;
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return json({ success: true, repliesFound, checkedApplications: unreplied.length, results });
}

/** Layer 6: Sender health monitoring per PDF strategy */
async function handleHealthCheck() {
  const supabase = serviceClient();

  const { count: totalSent } = await supabase
    .from("job_applications").select("*", { count: "exact", head: true }).eq("status", "applied");

  const { count: totalBounced } = await supabase
    .from("email_tracking").select("*", { count: "exact", head: true }).eq("bounced", true);

  const { count: totalOpened } = await supabase
    .from("email_tracking").select("*", { count: "exact", head: true }).gt("open_count", 0);

  const { count: totalReplied } = await supabase
    .from("email_tracking").select("*", { count: "exact", head: true }).not("replied_at", "is", null);

  const sent = totalSent || 0;
  const bounced = totalBounced || 0;
  const opened = totalOpened || 0;
  const replied = totalReplied || 0;
  const delivered = sent - bounced;

  const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(1) : "0";
  const openRate = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : "0";
  const replyRate = delivered > 0 ? ((replied / delivered) * 100).toFixed(1) : "0";

  // PDF targets: bounce <3%, open 15-25%, reply 2-5%
  const reputation = parseFloat(bounceRate) < 3 ? "good" : parseFloat(bounceRate) < 5 ? "warning" : "critical";

  return json({
    success: true,
    stats: { sent, delivered, bounced, opened, replied },
    rates: { bounceRate: `${bounceRate}%`, openRate: `${openRate}%`, replyRate: `${replyRate}%` },
    reputation,
    targets: { bounceRate: "<3%", openRate: "15-25%", replyRate: "2-5%" },
  });
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function findLatestApplicationByEmail(supabase: ReturnType<typeof serviceClient>, email: string) {
  const { data } = await supabase
    .from("job_applications")
    .select("id")
    .eq("hiring_manager_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function upsertTrackingRecord(supabase: ReturnType<typeof serviceClient>, applicationId: string) {
  const trackingPixelId = crypto.randomUUID();
  const { data: existing } = await supabase
    .from("email_tracking")
    .select("id")
    .eq("application_id", applicationId)
    .limit(1)
    .maybeSingle();

  if (!existing?.id) {
    await supabase.from("email_tracking").insert({
      application_id: applicationId,
      tracking_pixel_id: trackingPixelId,
      open_count: 0,
      bounced: false,
    });
    return;
  }

  await supabase.from("email_tracking").update({
    tracking_pixel_id: trackingPixelId,
  }).eq("id", existing.id);
}

async function streamToString(stream: ReadableStream | Uint8Array | string | { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }): Promise<string> {
  if (typeof stream === "string") return stream;
  if (stream instanceof Uint8Array) return new TextDecoder().decode(stream);
  const reader = stream.getReader?.();
  if (!reader) return String(stream);
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
