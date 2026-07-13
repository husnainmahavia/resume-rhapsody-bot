import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const senderEmail = "husnainmahavia.1@gmail.com";
const senderName = "Husnain Mahavia";
const senderPhone = "+44 7387 055617";

// Rate limiting rules per PDF strategy (Layer 5)
const RATE_LIMITS = {
  maxEmailsPerDay: 50,
  maxEmailsPerDomain: 3,
  minDelayBetweenEmails: 5000, // 5 seconds minimum
  maxBouncesBeforePause: 5,
  verifyBeforeSending: true,
};

type ApplicationAttachmentSource = {
  company: string | null;
  job_title: string;
  tailored_cv: string | null;
  cover_letter: string | null;
};

type MailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeSafeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "application";
}

function stripTrailingSignature(body: string) {
  return body.replace(/\n+(?:best regards|kind regards|regards|warm regards|sincerely|thanks),?[\s\S]*$/i, "").trim();
}

function collapseBlankLines(body: string) {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeGeneratedEmail(body: string) {
  const withoutPlaceholders = body
    .replace(/\r\n/g, "\n")
    .replace(/\[.*?\]/g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/(placeholder|replace this|insert .*link)/i.test(trimmed)) return false;
      if (/(calendly|calendar link|booking link|schedule link)/i.test(trimmed)) return false;
      if (/please find my (cv|resume|cover letter).*attached/i.test(trimmed)) return false;
      return true;
    })
    .join("\n");

  const contentOnly = collapseBlankLines(stripTrailingSignature(withoutPlaceholders));
  return `${contentOnly}\n\nBest regards,\n${senderName}\n${senderPhone}\n${senderEmail}`;
}

// Spam trigger detector — blocks obvious spam-flagged phrasing before send.
const SPAM_TRIGGERS = [
  /\bfree\s+(money|gift|trial|offer)\b/i,
  /\b(100%|guarantee[d]?)\s+(free|risk[- ]free|satisfaction)\b/i,
  /\bact\s+now\b/i, /\blimited\s+time\b/i, /\burgent\s+response\b/i,
  /\bwork\s+from\s+home\b/i, /\bmake\s+\$?\d+\s+(a|per)\s+(day|week)\b/i,
  /\bviagra\b/i, /\bcasino\b/i, /\blottery\b/i, /\bcrypto\s+giveaway\b/i,
  /\bclick\s+here\b/i, /\bbuy\s+now\b/i, /\bcheap\s+meds\b/i,
  /\$\$\$/, /!!!+/, /\bearn\s+extra\s+cash\b/i,
];
function detectSpamContent(subject: string, body: string): string | null {
  const text = `${subject}\n${body}`;
  for (const re of SPAM_TRIGGERS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  // ALL CAPS shouting in subject
  if (subject.length > 8 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) {
    return "ALL_CAPS_SUBJECT";
  }
  // Excessive punctuation
  if ((subject.match(/[!?]/g) || []).length >= 3) return "EXCESSIVE_PUNCTUATION";
  return null;
}

// Hard authenticity gate — calls email-verify function; rejects on invalid MX / low score.
async function verifyRecipient(email: string): Promise<{ ok: boolean; score: number; reason: string }> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-verify`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    const r = data?.results?.[0];
    if (!r) return { ok: false, score: 0, reason: "verify_no_result" };
    // Block: no MX, disposable, or definitively rejected by SMTP.
    if (!r.checks?.mxRecords) return { ok: false, score: r.score, reason: "no_mx_records" };
    if (r.checks?.disposable) return { ok: false, score: r.score, reason: "disposable_domain" };
    if (r.checks?.smtpRcptTo === "rejected") return { ok: false, score: r.score, reason: "smtp_rejected" };
    if (r.score < 40) return { ok: false, score: r.score, reason: `low_score_${r.reason}` };
    return { ok: true, score: r.score, reason: r.reason };
  } catch (e) {
    return { ok: false, score: 0, reason: `verify_error:${e instanceof Error ? e.message : "unknown"}` };
  }
}

function generateCvHtml(cvText: string, jobTitle: string, company: string) {
  const lines = cvText.split("\n").map((line) => line.trim()).filter(Boolean);
  const formatted = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px 40px; line-height: 1.45; }
    .header { border-bottom: 2px solid #1e3a8a; margin-bottom: 18px; padding-bottom: 12px; }
    .name { font-size: 28px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    .meta { font-size: 13px; color: #475569; margin: 0; }
    .title { font-size: 14px; color: #1e3a8a; margin: 8px 0 0; }
    .context { font-size: 12px; color: #64748b; margin: 14px 0 18px; }
    p { font-size: 13px; margin: 0 0 8px; white-space: pre-wrap; }
  </style></head><body>
    <div class="header">
      <p class="name">${escapeHtml(senderName)}</p>
      <p class="meta">${escapeHtml(senderPhone)} • ${escapeHtml(senderEmail)}</p>
      <p class="title">Full-Stack Developer & AI Specialist</p>
    </div>
    <p class="context">Tailored CV for ${escapeHtml(jobTitle)} at ${escapeHtml(company)}</p>
    ${formatted}
  </body></html>`;
}

function generateCoverLetterHtml(coverLetter: string, company: string, jobTitle: string) {
  const paragraphs = coverLetter
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; padding: 36px 40px; line-height: 1.6; }
    .header { margin-bottom: 24px; }
    .name { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    .meta { font-size: 13px; color: #475569; margin: 0; }
    .subject { margin: 22px 0 18px; font-size: 13px; color: #1e3a8a; }
    p { font-size: 13px; margin: 0 0 14px; }
  </style></head><body>
    <div class="header">
      <p class="name">${escapeHtml(senderName)}</p>
      <p class="meta">${escapeHtml(senderPhone)} • ${escapeHtml(senderEmail)}</p>
    </div>
    <p class="subject">Cover letter for ${escapeHtml(jobTitle)} at ${escapeHtml(company)}</p>
    ${paragraphs}
  </body></html>`;
}

function buildApplicationAttachments(application: ApplicationAttachmentSource | null): MailAttachment[] {
  if (!application) return [];

  const company = application.company || "Company";
  const safeCompany = makeSafeFilePart(company);
  const attachments: MailAttachment[] = [];

  if (application.tailored_cv?.trim()) {
    attachments.push({
      filename: `Husnain_Mahavia_CV_${safeCompany}.html`,
      content: generateCvHtml(application.tailored_cv.trim(), application.job_title, company),
      contentType: "text/html",
    });
  }

  if (application.cover_letter?.trim()) {
    attachments.push({
      filename: `Husnain_Mahavia_Cover_Letter_${safeCompany}.html`,
      content: generateCoverLetterHtml(application.cover_letter.trim(), company, application.job_title),
      contentType: "text/html",
    });
  }

  return attachments;
}

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

  const { data: alreadySent } = await supabase
    .from("sent_emails")
    .select("id, sent_at")
    .eq("recipient_email", to.toLowerCase())
    .eq("sender", "gmail")
    .limit(1)
    .maybeSingle();

  if (alreadySent) {
    return json({
      success: false,
      sent: false,
      duplicate: true,
      error: `Already emailed ${to}`,
    });
  }

  // Rate limit check: daily limit
  const today = new Date().toISOString().split("T")[0];
  const { count: sentToday } = await supabase
    .from("job_applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "applied")
    .gte("applied_at", today);

  if ((sentToday || 0) >= RATE_LIMITS.maxEmailsPerDay) {
    return json({ success: false, sent: false, skipped: true, reason: "daily_limit", error: `Daily limit reached (${RATE_LIMITS.maxEmailsPerDay}). Resume tomorrow.` }, 200);
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
      return json({ success: false, sent: false, skipped: true, reason: "domain_limit", error: `Domain limit reached: max ${RATE_LIMITS.maxEmailsPerDomain} emails to ${recipientDomain}` }, 200);
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
      success: false, sent: false, skipped: true, reason: "bounce_pause",
      error: `Sending paused: ${recentBounces} bounces in last 24h. Review bounce list before resuming.`,
    }, 200);
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
      return json({ success: false, sent: false, skipped: true, reason: "blacklisted", error: `Domain ${recipientDomain} is blacklisted` }, 200);

    }
  }

  // Send via SMTP
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: senderEmail, pass: password },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });

  const appId = applicationId ?? (await findLatestApplicationByEmail(supabase, to));
  const applicationSource = appId ? await getApplicationAttachmentSource(supabase, appId) : null;
  const attachments = buildApplicationAttachments(applicationSource);
  const sanitizedBody = sanitizeGeneratedEmail(body);

  const mailOptions: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: MailAttachment[];
  } = {
    from: `${senderName} <${senderEmail}>`,
    to,
    subject,
    text: sanitizedBody,
    html: sanitizedBody.replace(/\n/g, "<br>"),
  };

  // === Pre-send authenticity + spam gate ===
  if (RATE_LIMITS.verifyBeforeSending) {
    const verdict = await verifyRecipient(to);
    if (!verdict.ok) {
      // Auto-blacklist domain on definitive SMTP rejection / no MX
      if (recipientDomain && (verdict.reason === "no_mx_records" || verdict.reason === "smtp_rejected")) {
        await supabase.from("domain_blacklist").upsert({
          domain: recipientDomain,
          is_blacklisted: true,
          blacklisted_at: new Date().toISOString(),
          reason: `Auto: ${verdict.reason} (score ${verdict.score})`,
          bounce_count: 1,
        }, { onConflict: "domain" });
      }
      console.log(`🚫 Blocked send to ${to}: ${verdict.reason} (score ${verdict.score})`);
      return json({
        success: false, sent: false, blocked: true,
        error: `Email not verified: ${verdict.reason} (score ${verdict.score}/100). Send blocked to protect deliverability.`,
        verification: verdict,
      });
    }
    console.log(`✅ Recipient verified: ${to} (score ${verdict.score}, ${verdict.reason})`);
  }

  const spamHit = detectSpamContent(subject, sanitizedBody);

  if (spamHit) {
    console.log(`🚫 Spam content blocked (${spamHit}) → ${to}`);
    return json({
      success: false, sent: false, blocked: true,
      error: `Email blocked — spam trigger detected: "${spamHit}". Rewrite and try again.`,
    });
  }

  const info = await transporter.sendMail(mailOptions);


  // Upsert tracking record
  if (appId) {
    await upsertTrackingRecord(supabase, appId);
  }

  await supabase.from("sent_emails").upsert({
    recipient_email: to.toLowerCase(),
    sender: "gmail",
    subject,
    application_id: appId,
    message_id: info.messageId,
    sent_at: new Date().toISOString(),
  }, { onConflict: "recipient_email,sender" });

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

async function getApplicationAttachmentSource(
  supabase: ReturnType<typeof serviceClient>,
  applicationId: string,
): Promise<ApplicationAttachmentSource | null> {
  const { data } = await supabase
    .from("job_applications")
    .select("company, job_title, tailored_cv, cover_letter")
    .eq("id", applicationId)
    .limit(1)
    .maybeSingle();

  return data ?? null;
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
