import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const senderEmail = "husnainmahavia.1@gmail.com";

    // Get all applications that were sent but haven't received a reply yet
    const { data: pendingApps } = await supabase
      .from("job_applications")
      .select("id, company, job_title, email_subject, hiring_manager_email, email_tracking(id, replied_at)")
      .eq("status", "applied")
      .not("hiring_manager_email", "is", null);

    if (!pendingApps || pendingApps.length === 0) {
      return new Response(JSON.stringify({ message: "No pending applications to check", repliesFound: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to only those without replies
    const unreplied = pendingApps.filter(app => {
      const tracking = (app as any).email_tracking;
      if (Array.isArray(tracking)) {
        return !tracking.some((t: any) => t.replied_at);
      }
      return true;
    });

    if (unreplied.length === 0) {
      return new Response(JSON.stringify({ message: "All applications have been checked", repliesFound: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect to Gmail via IMAP
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: senderEmail,
        pass: GMAIL_APP_PASSWORD,
      },
      logger: false,
    });

    await client.connect();
    console.log("📬 Connected to Gmail IMAP");

    let repliesFound = 0;
    const results: any[] = [];

    // Check inbox for replies from hiring managers
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for emails from the last 14 days
      const since = new Date(Date.now() - 14 * 86400000);

      for (const app of unreplied) {
        if (!app.hiring_manager_email) continue;

        try {
          // Search for emails from this hiring manager's domain or exact email
          const senderDomain = app.hiring_manager_email.split("@")[1];
          
          // Search by sender domain to catch replies from any person at the company
          const searchResults = await client.search({
            since,
            or: [
              { from: app.hiring_manager_email },
              { from: `@${senderDomain}` },
            ],
          });

          if (searchResults.length === 0) continue;

          // Fetch the most recent matching email
          for await (const msg of client.fetch(searchResults.slice(-3), {
            envelope: true,
            bodyParts: ["1"],
            bodyStructure: true,
          })) {
            const subject = msg.envelope?.subject || "";
            const fromAddress = msg.envelope?.from?.[0]?.address || "";
            const date = msg.envelope?.date;

            // Check if this is likely a reply to our application
            const isReply = 
              subject.toLowerCase().includes("re:") ||
              subject.toLowerCase().includes(app.job_title?.toLowerCase().slice(0, 20) || "") ||
              subject.toLowerCase().includes(app.company?.toLowerCase() || "") ||
              fromAddress.includes(senderDomain);

            if (!isReply) continue;

            // Extract a snippet from the body
            let snippet = "";
            try {
              const bodyPart = msg.bodyParts?.get("1");
              if (bodyPart) {
                const textContent = await streamToString(bodyPart);
                // Get first 200 chars as snippet, strip HTML
                snippet = textContent
                  .replace(/<[^>]*>/g, "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 200);
              }
            } catch (e) {
              // Body extraction is best-effort
            }

            // Update tracking record
            const tracking = (app as any).email_tracking;
            const trackingId = Array.isArray(tracking) && tracking.length > 0 ? tracking[0].id : null;

            if (trackingId) {
              await supabase.from("email_tracking").update({
                replied_at: date?.toISOString() || new Date().toISOString(),
                reply_snippet: snippet || `Reply from ${fromAddress}: ${subject}`,
              }).eq("id", trackingId);
            }

            // Update application status
            await supabase.from("job_applications").update({
              status: "interview",
              notes: `📬 Reply received from ${fromAddress} on ${date?.toLocaleDateString() || "recently"}: "${subject}"${snippet ? `\n\nSnippet: ${snippet}` : ""}`,
            }).eq("id", app.id);

            repliesFound++;
            results.push({
              company: app.company,
              job: app.job_title,
              from: fromAddress,
              subject,
              snippet: snippet.slice(0, 100),
              date: date?.toISOString(),
            });

            console.log(`✅ Reply detected from ${fromAddress} for ${app.job_title} at ${app.company}`);
            break; // Only need one reply per application
          }
        } catch (searchErr) {
          console.error(`Search error for ${app.company}:`, searchErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`📬 Inbox check complete: ${repliesFound} replies found`);

    return new Response(JSON.stringify({
      success: true,
      repliesFound,
      results,
      checkedApplications: unreplied.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Inbox check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function streamToString(stream: ReadableStream | any): Promise<string> {
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
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}
