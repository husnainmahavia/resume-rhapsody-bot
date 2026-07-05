import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_REQUEST_TIMEOUT_MS = 15_000;
const MAX_BULK_LEADS_PER_REQUEST = 3;
const MAX_ROUNDS = 3;

function safeJsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeDomain(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function emailDomain(email?: string | null): string {
  return (email?.split("@")[1] || "").trim().toLowerCase();
}

function isLikelyGenericBusinessEmail(email: string | null | undefined, domain: string): boolean {
  if (!email || emailDomain(email) !== domain) return false;
  const local = email.split("@")[0].toLowerCase();
  return ["info", "hello", "contact", "enquiries", "sales", "marketing", "careers", "hr", "support"]
    .includes(local);
}

const SYSTEM_PROMPT = `You are the AI Boss of the Visuosofts Email Engine — a B2B outreach system for an AR development and digital marketing agency based in Manchester, UK.

YOUR MISSION:
The engine discovers companies via AI and generates contact emails like info@company.com — but ~90% of these are undeliverable because they're guesses, not real addresses.
Your job is to FIX this by using AI intelligence to find real, verified email addresses for companies.

TOOLS AT YOUR DISPOSAL:
1. list_leads — see current leads, filter by status (bounced, failed, unsent, sent)
2. verify_email — use AI + DNS/MX checks to verify if an email is likely deliverable
3. find_company_email — use AI to research and find real email addresses for a company
4. fix_lead_email — update a lead with a verified email address
5. bulk_fix_emails — automatically verify & fix emails for multiple unsent leads

STRATEGY:
- When asked to fix emails: use bulk_fix_emails to batch-process leads
- When analyzing bounces: list failed leads, then verify their emails
- When investigating specific leads: verify_email → find_company_email → fix_lead_email
- Use AI research to find real contact pages, team pages, and public email addresses
- Prioritize decision-maker emails over generic (info@, hello@)

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
      description: "Verify if an email address is likely deliverable using AI analysis and DNS checks",
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
      description: "Use AI to find real verified email addresses for a company based on domain and company name",
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
      description: "Automatically verify and fix emails for unsent leads using AI. Checks current email validity and searches for better alternatives.",
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

// Use AI to verify/find emails instead of Hunter.io
async function aiEmailLookup(
  apiKey: string,
  prompt: string
): Promise<Record<string, unknown>> {
  const resp = await callGemini(apiKey, {
      messages: [
        {
          role: "system",
          content: `You are an email intelligence agent. You analyze company domains and email addresses to determine deliverability and find real contact emails.

RULES:
- For email verification: analyze the domain, check if it's a real company domain, assess the email pattern
- For email finding: suggest the most likely REAL email addresses based on common corporate patterns
- Common patterns: info@, hello@, contact@, careers@, hr@, marketing@, sales@
- For UK companies, also consider: enquiries@, recruitment@
- Rate confidence 0-100 based on how likely the email is real
- NEVER make up personal names or specific employee emails - only suggest pattern-based emails
- Always return valid JSON`,
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_result",
            description: "Return the email analysis result",
            parameters: {
              type: "object",
              properties: {
                result: {
                  type: "object",
                  description: "The analysis result as a JSON object",
                },
              },
              required: ["result"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_result" } },
      max_tokens: 800,
      timeout_ms: AI_REQUEST_TIMEOUT_MS,
      max_model_attempts: 2,
      max_lovable_attempts: 1,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "") || "";
    console.error("AI lookup error:", resp.status, errText);
    throw new Error(`AI lookup failed: ${resp.status}`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.result || parsed;
    } catch {
      return { error: "AI returned invalid JSON" };
    }
  }
  return { error: "No result from AI" };
}

// Simple DNS MX check via DNS-over-HTTPS
async function checkMX(domain: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: controller.signal,
    });
    const data = await resp.json();
    return (data.Answer?.length || 0) > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

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
        const email = args.email as string;
        const domain = emailDomain(email);
        
        // Check MX records
        const hasMX = await checkMX(domain);
        
        // Use AI to analyze
        const aiResult = await aiEmailLookup(OPENROUTER_API_KEY, 
          `Verify this email address: ${email}
Domain: ${domain}
MX Records exist: ${hasMX}

Analyze: Is this likely a real, deliverable business email? 
Return JSON with: email, status (valid/invalid/risky/unknown), score (0-100), reason, mx_records (boolean), is_generic (boolean), is_disposable (boolean)`
        );

        return JSON.stringify({ email, mx_records: hasMX, ...aiResult });
      }

      if (name === "find_company_email") {
        const domain = normalizeDomain(args.domain as string);
        const companyName = (args.company_name as string) || domain;
        
        // Check MX records first
        const hasMX = await checkMX(domain);
        
        // Use AI to find likely emails
        const aiResult = await aiEmailLookup(OPENROUTER_API_KEY,
          `Find real email addresses for this company:
Company: ${companyName}
Domain: ${domain}
MX Records exist: ${hasMX}

Research common email patterns for this domain. Return JSON with:
- domain: the domain
- organization: company name  
- mx_valid: boolean
- emails: array of objects with { email, type (generic/personal), confidence (0-100), department }
- suggested_best: the single best email to use for B2B outreach

Only suggest emails at the ${domain} domain. Prefer contact@, info@, hello@, careers@, marketing@ patterns.
Rate confidence based on how common that pattern is for companies.`
        );

        return JSON.stringify({ domain, organization: companyName, mx_valid: hasMX, ...aiResult });
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
        const requestedLeads = Number(args.max_leads || 10);
        const maxLeads = Math.min(
          Math.max(Number.isFinite(requestedLeads) ? Math.floor(requestedLeads) : 10, 1),
          MAX_BULK_LEADS_PER_REQUEST,
        );
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
            const domain = normalizeDomain(lead.website);
            if (!domain) {
              results.push({ company: lead.company_name, status: "no_domain" });
              continue;
            }

            // Check MX records
            const hasMX = await checkMX(domain);
            if (!hasMX) {
              results.push({ company: lead.company_name, domain, status: "no_mx_records", email: lead.contact_email });
              continue;
            }

            // Avoid long AI verification for already plausible generic same-domain inboxes.
            if (isLikelyGenericBusinessEmail(lead.contact_email, domain)) {
              results.push({
                company: lead.company_name,
                email: lead.contact_email,
                status: "already_valid",
                score: 70,
                reason: "Same-domain generic business inbox with MX records",
              });
              continue;
            }

            // Verify current non-generic email via AI.
            if (lead.contact_email) {
              const verifyResult = await aiEmailLookup(OPENROUTER_API_KEY,
                `Quick verify: Is "${lead.contact_email}" likely deliverable for company "${lead.company_name}" (domain: ${domain})?
MX records exist: true.
Return JSON: { status: "valid"|"invalid"|"risky", score: 0-100, reason: string }`
              );

              const status = (verifyResult as Record<string, unknown>).status;
              if (status === "valid") {
                results.push({
                  company: lead.company_name,
                  email: lead.contact_email,
                  status: "already_valid",
                  score: (verifyResult as Record<string, unknown>).score,
                });
                continue;
              }
            }

            // Find better email via AI
            const findResult = await aiEmailLookup(OPENROUTER_API_KEY,
              `Find the best B2B outreach email for company "${lead.company_name}" at domain "${domain}".
Current email "${lead.contact_email || 'none'}" may be invalid.
Return JSON: { suggested_email: string, confidence: number (0-100), reason: string }`
            );

            const suggested = (findResult as Record<string, string>).suggested_email;
            const confidence = Number((findResult as Record<string, unknown>).confidence) || 0;

            if (suggested && confidence >= 50 && suggested.includes("@") && suggested.endsWith(domain)) {
              await supabase
                .from("email_engine_leads")
                .update({ contact_email: suggested, send_error: null, bounced: false })
                .eq("id", lead.id);

              results.push({
                company: lead.company_name,
                old_email: lead.contact_email,
                new_email: suggested,
                confidence,
                status: "fixed",
                reason: (findResult as Record<string, string>).reason,
              });
            } else {
              results.push({
                company: lead.company_name,
                email: lead.contact_email,
                domain,
                status: "no_better_email_found",
                suggestion: suggested,
                confidence,
              });
            }
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
          requested: requestedLeads,
          limited: requestedLeads > maxLeads,
          note: requestedLeads > maxLeads
            ? `Processed ${maxLeads} leads now to avoid backend timeouts. Run the action again for the next batch.`
            : undefined,
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
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await callGemini(OPENROUTER_API_KEY, {
          messages: allMessages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 900,
          timeout_ms: AI_REQUEST_TIMEOUT_MS,
          max_model_attempts: 2,
          max_lovable_attempts: 1,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "") || "";
        console.error(`AI gateway error ${resp.status}:`, errText);
        if ([402, 429, 503, 504].includes(resp.status)) {
          return safeJsonResponse({
            message: resp.status === 402
              ? "AI credits are exhausted right now. No changes were made."
              : "AI providers are busy or rate-limited right now. I stopped early so the request does not time out — retry in a few minutes or run a smaller batch.",
            toolResults,
            temporary: true,
          });
        }
        throw new Error(`AI error: ${resp.status}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No AI response");

      const toolCalls = choice.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const finalContent = choice.message?.content || "Done — no further action needed.";
        return safeJsonResponse({ message: finalContent, toolResults });
      }

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

    return safeJsonResponse({
        message: "I reached the maximum processing rounds. Here's what I found so far — you can ask me to continue.",
        toolResults,
      });
  } catch (e) {
    console.error("email-engine-ai error:", e);
    return safeJsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
