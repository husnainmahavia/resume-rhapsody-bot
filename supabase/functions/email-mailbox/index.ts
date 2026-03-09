import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const senderEmail = "husnainmahavia.1@gmail.com";
const senderName = "Husnain Mahavia";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;

    if (action === "send") return await handleSend(payload);
    if (action === "fetch_replies") return await handleFetchReplies();

    return json({ error: "Invalid action. Use 'send' or 'fetch_replies'" }, 400);
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

  const supabase = serviceClient();
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
        } catch {
          // best effort
        }

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

function serviceClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
