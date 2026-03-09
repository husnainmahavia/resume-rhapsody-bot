import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the AI Boss of the Visuosofts Email Engine — a B2B outreach system for an AR development and digital marketing agency based in Manchester, UK.

YOUR MISSION:
The engine discovers companies via AI and generates contact emails like info@company.com — but ~90% of these are undeliverable because they're guesses, not real addresses.
Your job is to FIX this by using Hunter.io to find and verify REAL email addresses.

TOOLS AT YOUR DISPOSAL:
1. list_leads — see current leads, filter by status (bounced, failed, unsent, sent)
2. verify_email — check if a specific email is deliverable via Hunter.io
3. find_company_email — search Hunter.io for real emails at a company domain
4. fix_lead_email — update a lead with a verified email address
5. bulk_fix_emails — automatically verify & fix emails for multiple unsent leads

STRATEGY:
- When asked to fix emails: use bulk_fix_emails to batch-process leads
- When analyzing bounces: list failed leads, then verify their emails
- When investigating specific leads: verify_email → find_company_email → fix_lead_email
- Always prefer emails with confidence >= 70 from Hunter.io
- Prioritize decision-maker emails (marketing, CEO, director) over generic (info@, hello@)

Be concise, actionable, and show results clearly. Use markdown formatting.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_leads",
      description: "List leads from the database with optional filters",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "bounced", "failed", "unsent", "sent"],
            description: "Filter leads by status",
          },
          limit: { type: "number", description: "Max results (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_email",
      description: "Verify if an email address is deliverable using Hunter.io",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email to verify" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_company_email",
      description:
        "Find verified email addresses for a company domain using Hunter.io domain search",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Company domain e.g. example.com" },
          company_name: { type: "string", description: "Company name for context" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fix_lead_email",
      description: "Update a lead's email address in the database with a verified one",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Lead ID to update" },
          new_email: { type: "string", description: "New verified email address" },
        },
        required: ["lead_id", "new_email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_fix_emails",
      description:
        "Automatically verify and fix emails for unsent leads using Hunter.io. Checks current email validity, then searches for better alternatives if invalid.",
      parameters: {
        type: "object",
        properties: {
          max_leads: { type: "number", description: "Max leads to process (default 10)" },
          filter: {
            type: "string",
            enum: ["unsent", "failed", "all_unsent"],
            description: "Which leads to target (default: unsent)",
          },
        },
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Tool Executors ──
    async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
      console.log(`🔧 Tool: ${name}`, JSON.stringify(args));

      if (name === "list_leads") {
        const filter = (args.filter as string) || "all";
        const limit = (args.limit as number) || 15;
        let query = supabase
          .from("email_engine_leads")
          .select(
            "id, company_name, contact_email, website, industry, region, sent, send_error, bounced, email_generated, sent_at"
          );

        if (filter === "bounced") query = query.eq("bounced", true);
        else if (filter === "failed") query = query.not("send_error", "is", null);
        else if (filter === "unsent") query = query.eq("sent", false).eq("email_generated", true);
        else if (filter === "sent") query = query.eq("sent", true);

        const { data } = await query.limit(limit).order("created_at", { ascending: false });
        return JSON.stringify({ leads: data || [], count: data?.length || 0 });
      }

      if (name === "verify_email") {
        if (!HUNTER_API_KEY) return JSON.stringify({ error: "Hunter.io API key not configured" });
        const email = args.email as string;
        const resp = await fetch(
          `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`
        );
        const data = await resp.json();
        const d = data.data || {};
        return JSON.stringify({
          email,
          status: d.status,
          score: d.score,
          result: d.result,
          smtp_check: d.smtp_check,
          mx_records: d.mx_records,
          disposable: d.disposable,
          webmail: d.webmail,
          accept_all: d.accept_all,
        });
      }

      if (name === "find_company_email") {
        if (!HUNTER_API_KEY) return JSON.stringify({ error: "Hunter.io API key not configured" });
        const domain = (args.domain as string).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const resp = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=5`
        );
        const data = await resp.json();
        const emails = (data.data?.emails || []).map((e: Record<string, unknown>) => ({
          email: e.value,
          type: e.type,
          confidence: e.confidence,
          first_name: e.first_name,
          last_name: e.last_name,
          position: e.position,
        }));
        return JSON.stringify({
          domain,
          organization: data.data?.organization,
          total_found: data.data?.total || 0,
          emails,
        });
      }

      if (name === "fix_lead_email") {
        const { lead_id, new_email } = args as { lead_id: string; new_email: string };
        const { error } = await supabase
          .from("email_engine_leads")
          .update({ contact_email: new_email, send_error: null, bounced: false })
          .eq("id", lead_id);
        if (error) return JSON.stringify({ success: false, error: error.message });
        return JSON.stringify({ success: true, lead_id, new_email });
      }

      if (name === "bulk_fix_emails") {
        if (!HUNTER_API_KEY) return JSON.stringify({ error: "Hunter.io API key not configured" });
        const maxLeads = (args.max_leads as number) || 10;
        const filter = (args.filter as string) || "unsent";

        let query = supabase
          .from("email_engine_leads")
          .select("id, company_name, contact_email, website, send_error")
          .eq("sent", false);

        if (filter === "failed") query = query.not("send_error", "is", null);

        const { data: leads } = await query.limit(maxLeads).order("created_at", { ascending: false });
        if (!leads || leads.length === 0)
          return JSON.stringify({ message: "No leads to process", fixed: 0, results: [] });

        const results: Record<string, unknown>[] = [];

        for (const lead of leads) {
          try {
            const domain = lead.website?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
            if (!domain) {
              results.push({ company: lead.company_name, status: "no_domain" });
              continue;
            }

            // Step 1: verify current email
            if (lead.contact_email) {
              const vResp = await fetch(
                `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(lead.contact_email)}&api_key=${HUNTER_API_KEY}`
              );
              const vData = await vResp.json();
              const status = vData.data?.status;

              if (status === "valid" || status === "accept_all") {
                results.push({
                  company: lead.company_name,
                  email: lead.contact_email,
                  status: "already_valid",
                  hunter_status: status,
                  score: vData.data?.score,
                });
                continue;
              }
            }

            // Step 2: find a real email via domain search
            const sResp = await fetch(
              `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=3`
            );
            const sData = await sResp.json();
            const topEmail = (sData.data?.emails || []).sort(
              (a: Record<string, number>, b: Record<string, number>) =>
                (b.confidence || 0) - (a.confidence || 0)
            )[0];

            if (topEmail && (topEmail.confidence as number) >= 50) {
              await supabase
                .from("email_engine_leads")
                .update({
                  contact_email: topEmail.value,
                  send_error: null,
                  bounced: false,
                })
                .eq("id", lead.id);

              results.push({
                company: lead.company_name,
                old_email: lead.contact_email,
                new_email: topEmail.value,
                confidence: topEmail.confidence,
                name: [topEmail.first_name, topEmail.last_name].filter(Boolean).join(" ") || undefined,
                position: topEmail.position || undefined,
                status: "fixed",
              });
            } else {
              results.push({
                company: lead.company_name,
                email: lead.contact_email,
                domain,
                status: "no_verified_email_found",
              });
            }

            // Rate limit Hunter.io
            await new Promise((r) => setTimeout(r, 600));
          } catch (e) {
            results.push({
              company: lead.company_name,
              status: "error",
              error: String(e),
            });
          }
        }

        const fixed = results.filter((r) => r.status === "fixed").length;
        const valid = results.filter((r) => r.status === "already_valid").length;
        return JSON.stringify({
          processed: results.length,
          fixed,
          already_valid: valid,
          not_found: results.length - fixed - valid,
          results,
        });
      }

      return JSON.stringify({ error: "Unknown tool" });
    }

    // ── AI Conversation Loop ──
    const allMessages: Record<string, unknown>[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const toolResults: Record<string, unknown>[] = [];
    const MAX_ROUNDS = 6;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: allMessages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`AI gateway error ${resp.status}:`, errText);
        if (resp.status === 429)
          return new Response(
            JSON.stringify({ error: "Rate limited — please try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        if (resp.status === 402)
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Top up in Settings → Workspace → Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        throw new Error(`AI error: ${resp.status}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No AI response");

      // If no tool calls, we're done
      const toolCalls = choice.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const finalContent = choice.message?.content || "Done — no further action needed.";
        return new Response(
          JSON.stringify({ message: finalContent, toolResults }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Execute tool calls
      allMessages.push(choice.message);

      for (const tc of toolCalls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeTool(tc.function.name, args);
        allMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
        toolResults.push({
          tool: tc.function.name,
          args,
          result: JSON.parse(result),
        });
      }
    }

    // If we exhausted rounds, return whatever we have
    return new Response(
      JSON.stringify({
        message: "I reached the maximum processing rounds. Here's what I found so far — you can ask me to continue.",
        toolResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("email-engine-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
