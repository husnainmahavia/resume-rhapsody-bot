import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VISUOSOFTS_CONTEXT = `Visuosofts is a global AR development and digital marketing agency based in Manchester, UK.
Founded by Husnain Mahavia, CEO. Website: visuosofts.com | Email: info@visuosofts.com

SERVICES:
• Augmented Reality (AR) Apps — iOS & Android native AR apps using ARKit, ARCore, Unity, Vuforia
• WebAR Experiences — Browser-based AR (no app download), 8th Wall, model-viewer
• Social Media AR Filters — Snapchat Lenses, TikTok Effects, Instagram Filters
• Digital Marketing & SEO — Google Ads, Meta Ads, TikTok Ads, SEO, content marketing
• Web Development — Custom WordPress sites, React apps, e-commerce (Shopify, WooCommerce)
• AI Integration — ChatGPT, Gemini, custom LLM solutions for business automation
• Blockchain & Web3 — NFT marketplaces, smart contracts, DeFi platforms

NOTABLE CLIENTS: BAE Systems, Tommy Hilfiger, McAfee, Pizza Hut, Pepsi
KEY STATS: 150+ projects delivered, 100+ AR experiences, 50+ websites, clients across 12 countries
USP: One agency for AR + Marketing + Web — no need for multiple vendors`;

const INDUSTRIES = [
  "Retail & E-commerce",
  "Real Estate",
  "Healthcare & Medical",
  "Hospitality & Tourism",
  "Fashion & Apparel",
  "Education & EdTech",
  "Architecture & Interior Design",
  "Automotive",
  "Food & Beverage",
  "Finance & Banking",
];

const REGIONS = [
  "United Kingdom",
  "United States",
  "Australia",
  "Canada",
  "Ireland",
  "UAE",
  "Saudi Arabia",
  "Germany & Europe",
];

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEmailResult(value: unknown): { subject: string; body: string } | null {
  if (!value || typeof value !== "object") return null;
  const result = value as { subject?: unknown; body?: unknown };
  if (!hasText(result.subject) || !hasText(result.body)) return null;
  return {
    subject: result.subject.trim(),
    body: result.body.trim(),
  };
}

// Rotate through industry/region combos based on current hour
function getRotatingTarget(): { industry: string; region: string } {
  const now = new Date();
  const hourOfYear = (now.getMonth() * 30 * 24) + (now.getDate() * 24) + now.getHours();
  const combo = hourOfYear % (INDUSTRIES.length * REGIONS.length);
  const industryIdx = Math.floor(combo / REGIONS.length) % INDUSTRIES.length;
  const regionIdx = combo % REGIONS.length;
  return { industry: INDUSTRIES[industryIdx], region: REGIONS[regionIdx] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, industry, region, leadIds, batchId, force } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
    const VISUOSOFTS_EMAIL_PASSWORD = Deno.env.get("VISUOSOFTS_EMAIL_PASSWORD");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action !== "health") {
      await Promise.all([
        supabase
          .from("email_engine_leads")
          .update({ queued: false })
          .eq("sent", false)
          .eq("queued", true)
          .lt("queued_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
        supabase
          .from("email_engine_leads")
          .update({ email_generated: false, queued: false })
          .eq("sent", false)
          .eq("email_generated", true)
          .or("email_subject.is.null,email_body.is.null,email_subject.eq.,email_body.eq."),
      ]);
    }

    // === ACTION: HEALTH (lightweight ping to detect blob eviction) ===
    if (action === "health") {
      return new Response(JSON.stringify({
        status: "healthy",
        function: "email-engine",
        timestamp: new Date().toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // === ACTION: DISCOVER ===
    if (action === "discover") {
      const rotating = getRotatingTarget();
      const targetIndustry = industry || rotating.industry;
      const targetRegion = region || rotating.region;
      const campaignBatch = batchId || `${targetIndustry.slice(0, 10)}_${Date.now()}`;

      console.log(`🔍 Discovering companies: ${targetIndustry} in ${targetRegion}`);

      const discoverPrompt = `You are a B2B lead generation expert. Find 8-12 REAL companies in the ${targetIndustry} industry located in ${targetRegion}.

For each company, provide:
1. company_name — the REAL registered company name
2. website — their actual website URL
3. contact_email — a REAL business email (info@, hello@, contact@, marketing@ etc.) — NOT personal Gmail/Yahoo
4. description — 1 sentence about what they do
5. opportunity — 1 sentence explaining how Visuosofts services (AR, WebAR, digital marketing, web dev) could specifically help THIS company

CRITICAL RULES:
- Only return companies that ACTUALLY EXIST — do NOT invent companies
- The website must be a real, working domain
- The email must be a plausible business email at their domain (e.g., info@company.com)
- Focus on mid-size companies (50-500 employees) who would benefit from AR/digital marketing
- Avoid companies that are too small (freelancers) or too large (Fortune 500)
- Each opportunity should reference a specific Visuosofts service relevant to their business`;

      let searchResponse: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        searchResponse = await callGemini(OPENROUTER_API_KEY, {
            messages: [
              { role: "system", content: "You are a B2B lead researcher. Return only real, verified companies. Return valid JSON only." },
              { role: "user", content: discoverPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_leads",
                description: "Return discovered company leads",
                parameters: {
                  type: "object",
                  properties: {
                    leads: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          company_name: { type: "string" },
                          website: { type: "string" },
                          contact_email: { type: "string" },
                          description: { type: "string" },
                          opportunity: { type: "string" },
                        },
                        required: ["company_name", "website", "contact_email", "description", "opportunity"],
                      },
                    },
                  },
                  required: ["leads"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_leads" } },
        });
        if (searchResponse && searchResponse.status !== 429 && searchResponse.status !== 503) break;
        const waitMs = (attempt + 1) * 15000 + Math.random() * 5000;
        console.log(`⚠️ Discovery ${searchResponse?.status}, retry ${attempt + 1}/4 in ${Math.round(waitMs / 1000)}s`);
        await new Promise(r => setTimeout(r, waitMs));
      }

      if (!searchResponse || !searchResponse.ok) throw new Error(`Discovery failed: ${searchResponse?.status}`);
      const searchData = await searchResponse.json();
      const toolCall = searchData.choices?.[0]?.message?.tool_calls?.[0];
      const leads = toolCall?.function?.arguments
        ? JSON.parse(toolCall.function.arguments).leads || []
        : [];

      console.log(`✅ Discovered ${leads.length} raw leads — resolving REAL emails via find-email...`);

      const REAL_EMAIL_SOURCES = new Set(["mailto", "json-ld", "scrape", "smtp_verified"]);
      const extractDomain = (website: string | undefined): string | null => {
        if (!website || typeof website !== "string") return null;
        try {
          const withProto = /^https?:\/\//i.test(website) ? website : `https://${website}`;
          return new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
        } catch { return null; }
      };

      // Check for duplicates, resolve real email, and insert
      let inserted = 0;
      let droppedNoRealEmail = 0;
      for (const lead of leads) {
        const domain = extractDomain(lead.website);
        if (!domain) { droppedNoRealEmail++; continue; }

        let realEmail: string | null = null;
        try {
          const finderRes = await fetch(`${SUPABASE_URL}/functions/v1/find-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ companyDomain: domain, companyName: lead.company_name }),
          });
          if (finderRes.ok) {
            const finderData = await finderRes.json();
            const best = (finderData.emails || []).find((e: any) => e.confidence >= 70 || REAL_EMAIL_SOURCES.has(e.source));
            if (best) realEmail = best.email;
          }
        } catch (e) {
          console.warn(`find-email failed for ${domain}:`, e);
        }

        if (!realEmail) {
          droppedNoRealEmail++;
          console.log(`⏭ Dropped ${lead.company_name} — no verified real email for ${domain}`);
          continue;
        }

        const { data: existing } = await supabase
          .from("email_engine_leads")
          .select("id")
          .eq("contact_email", realEmail)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`⏭ Duplicate: ${lead.company_name} (${realEmail})`);
          continue;
        }

        await supabase.from("email_engine_leads").insert({
          company_name: lead.company_name,
          website: lead.website,
          contact_email: realEmail,
          industry: targetIndustry,
          region: targetRegion,
          description: lead.description,
          opportunity: lead.opportunity,
          campaign_batch: campaignBatch,
        });
        inserted++;
      }

      console.log(`📥 email-engine discover: kept ${inserted}, dropped ${droppedNoRealEmail} (no verified real email)`);

      return new Response(JSON.stringify({
        success: true,
        discovered: leads.length,
        inserted,
        droppedNoRealEmail,
        duplicatesSkipped: leads.length - inserted - droppedNoRealEmail,
        batch: campaignBatch,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: GENERATE EMAILS ===
    if (action === "generate") {
      const targetLeadIds = leadIds as string[] | undefined;
      const shouldForce = Boolean(force);

      // Repair older rows that were incorrectly marked generated even though
      // the AI response did not contain a complete subject/body.
      await supabase
        .from("email_engine_leads")
        .update({ email_generated: false })
        .eq("sent", false)
        .eq("email_generated", true)
        .or("email_subject.is.null,email_body.is.null,email_subject.eq.,email_body.eq.");

      let query = supabase
        .from("email_engine_leads")
        .select("*")
        .eq("sent", false);

      if (!shouldForce) {
        query = query.or("email_generated.eq.false,email_subject.is.null,email_body.is.null,email_subject.eq.,email_body.eq.");
      }

      if (targetLeadIds && targetLeadIds.length > 0) {
        query = query.in("id", targetLeadIds);
      }

      const { data: leads, error } = await query.limit(20);
      if (error) throw error;
      if (!leads || leads.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            generated: 0,
            message: shouldForce
              ? "No unsent leads to regenerate emails for"
              : "No leads to generate emails for",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log(`✉️ Generating emails for ${leads.length} leads`);
      let generated = 0;

      for (const lead of leads) {
        try {
          const emailPrompt = `Write a cold outreach email from Visuosofts to ${lead.company_name}.

VISUOSOFTS CONTEXT:
${VISUOSOFTS_CONTEXT}

TARGET COMPANY:
- Name: ${lead.company_name}
- Website: ${lead.website}
- Industry: ${lead.industry}
- Description: ${lead.description}
- Opportunity: ${lead.opportunity}

REQUIREMENTS:
1. Subject line must be compelling and specific to the company (not generic)
2. Body must be 150-200 words maximum
3. Reference their specific business and how AR/digital marketing can help THEM
4. Include a concrete benefit with a stat (e.g., "30% reduction in return rates")
5. End with a soft CTA (suggest a 15-min call, not a hard sell)
6. Sign off as: Husnain Mahavia, CEO, Visuosofts | info@visuosofts.com | visuosofts.com
7. Tone: professional, warm, knowledgeable — NOT salesy or pushy
8. Do NOT use "Dear Sir/Madam" — greet using the ACTUAL company name like "Dear ${lead.company_name} Team" (never use square brackets, never write the literal words "Company Name")
9. CRITICAL: Never output square brackets [ or ] anywhere. Use real values only.`;

          let emailResponse: Response | null = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            emailResponse = await callGemini(OPENROUTER_API_KEY, {
                messages: [
                  { role: "system", content: "You write professional B2B cold outreach emails. Every email must be unique and company-specific." },
                  { role: "user", content: emailPrompt },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "return_email",
                    description: "Return email subject and body",
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
                tool_choice: { type: "function", function: { name: "return_email" } },
            });
            if (emailResponse && emailResponse.status !== 429 && emailResponse.status !== 503) break;
            const waitMs = (attempt + 1) * 15000 + Math.random() * 5000;
            console.log(`⚠️ Email gen ${emailResponse?.status}, retry ${attempt + 1}/4 in ${Math.round(waitMs / 1000)}s`);
            await new Promise(r => setTimeout(r, waitMs));
          }

          if (!emailResponse || !emailResponse.ok) throw new Error(`Email gen failed: ${emailResponse?.status}`);
          const emailData = await emailResponse.json();
          const emailResult = emailData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
            ? JSON.parse(emailData.choices[0].message.tool_calls[0].function.arguments)
            : null;

          const normalizedEmail = normalizeEmailResult(emailResult);

          if (normalizedEmail) {
            await supabase.from("email_engine_leads").update({
              email_subject: normalizedEmail.subject,
              email_body: normalizedEmail.body,
              email_generated: true,
              send_error: null,
              queued: false,
            }).eq("id", lead.id);
            generated++;
            console.log(`  ✅ Email generated for: ${lead.company_name}`);
          } else {
            await supabase.from("email_engine_leads").update({
              email_generated: false,
              send_error: "Email generation returned incomplete content — retry generation",
              queued: false,
            }).eq("id", lead.id);
            console.warn(`  ⚠️ Incomplete email generated for: ${lead.company_name}`);
          }

          // Rate limit: 800ms between generations
          await new Promise(r => setTimeout(r, 800));
        } catch (e) {
          console.error(`  ❌ Failed for ${lead.company_name}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, generated, total: leads.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: SEND BULK (background) ===
    if (action === "send") {
      if (!VISUOSOFTS_EMAIL_PASSWORD) {
        return new Response(JSON.stringify({ error: "VISUOSOFTS_EMAIL_PASSWORD not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Previous interrupted runs can leave rows stuck as queued forever.
      await supabase
        .from("email_engine_leads")
        .update({ queued: false })
        .eq("sent", false)
        .eq("queued", true)
        .lt("queued_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

      // Keep sendability truth in sync before selecting rows.
      await supabase
        .from("email_engine_leads")
        .update({ email_generated: false, queued: false })
        .eq("sent", false)
        .eq("email_generated", true)
        .or("email_subject.is.null,email_body.is.null,email_subject.eq.,email_body.eq.");

      const targetLeadIds = leadIds as string[] | undefined;
      let query = supabase
        .from("email_engine_leads")
        .select("*")
        .eq("email_generated", true)
        .eq("sent", false)
        .eq("queued", false)
        .is("send_error", null)
        .not("contact_email", "is", null)
        .not("email_subject", "is", null)
        .not("email_body", "is", null)
        .neq("contact_email", "")
        .neq("email_subject", "")
        .neq("email_body", "");

      if (targetLeadIds && targetLeadIds.length > 0) {
        query = query.in("id", targetLeadIds);
      }

      const { data: leads, error } = await query.limit(10);
      if (error) throw error;
      const sendableLeads = (leads || []).filter((lead) =>
        hasText(lead.contact_email) && hasText(lead.email_subject) && hasText(lead.email_body)
      );

      if (leads && leads.length > 0 && sendableLeads.length < leads.length) {
        const invalidIds = leads
          .filter((lead) => !hasText(lead.contact_email) || !hasText(lead.email_subject) || !hasText(lead.email_body))
          .map((lead) => lead.id);
        if (invalidIds.length > 0) {
          await supabase
            .from("email_engine_leads")
            .update({ email_generated: false, send_error: "Email content incomplete — regenerate before sending" })
            .in("id", invalidIds);
        }
      }

      if (sendableLeads.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, queued: 0, message: "No emails ready to send" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`📧 Queuing ${sendableLeads.length} emails for background send`);

      // Immediately mark these leads as queued so the UI removes them from "Ready"
      const queuedIds = sendableLeads.map((l) => l.id);
      await supabase.from("email_engine_leads")
        .update({ queued: true, queued_at: new Date().toISOString() })
        .in("id", queuedIds);

      const transporter = nodemailer.createTransport({
        host: "mail.visuosofts.com",
        port: 465,
        secure: true,
        auth: { user: "info@visuosofts.com", pass: VISUOSOFTS_EMAIL_PASSWORD },
      });

      const HANDOFF_MS = 25_000;
      const runStartedAt = Date.now();
      let handoffScheduled = false;
      const scheduleHandoff = (reason: string) => {
        if (handoffScheduled) return;
        handoffScheduled = true;
        try {
          fetch(`${SUPABASE_URL}/functions/v1/email-engine`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ action: "send" }),
          }).catch((e) => console.warn("email-engine handoff fetch failed:", e));
          console.log(`🔁 email-engine send handoff scheduled (${reason})`);
        } catch (e) { console.warn("handoff error:", e); }
      };

      const sendJob = async () => {
        let sent = 0;
        let errors = 0;
        let skippedInvalid = 0;
        try {
          for (let i = 0; i < sendableLeads.length; i++) {
            const lead = sendableLeads[i];

            // Wall-time handoff: release still-queued leads and re-invoke.
            if (Date.now() - runStartedAt > HANDOFF_MS) {
              const remaining = sendableLeads.slice(i).map((l) => l.id);
              if (remaining.length > 0) {
                await supabase.from("email_engine_leads")
                  .update({ queued: false })
                  .in("id", remaining);
              }
              console.log(`⏸ handing off, released ${remaining.length} queued leads`);
              scheduleHandoff("wall-time");
              return;
            }

            try {
              const { data: alreadySent } = await supabase
                .from("sent_emails")
                .select("id")
                .eq("recipient_email", lead.contact_email!.toLowerCase())
                .eq("sender", "visuosofts")
                .limit(1);

              if (alreadySent && alreadySent.length > 0) {
                console.log(`⏭ Already sent to ${lead.contact_email} — marking sent`);
                await supabase.from("email_engine_leads").update({
                  sent: true,
                  sent_at: new Date().toISOString(),
                  send_error: null,
                  queued: false,
                }).eq("id", lead.id);
                continue;
              }

              // Pre-send verification (unchanged)
              let verifyPassed = true;
              let verifyReason = "";
              try {
                const verifyResp = await fetch(`${SUPABASE_URL}/functions/v1/email-verify`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({ email: lead.contact_email }),
                });
                if (verifyResp.ok) {
                  const vd = await verifyResp.json();
                  const r = vd.results?.[0];
                  if (r) {
                    verifyReason = r.reason || "";
                    if (!r.checks?.mxRecords || r.reason === "smtp_rejected" || r.reason === "invalid_format" || r.reason === "disposable_domain") {
                      verifyPassed = false;
                    }
                  }
                }
              } catch (ve) {
                console.warn(`  ⚠️ Verify failed for ${lead.contact_email}, proceeding anyway:`, ve);
              }

              if (!verifyPassed) {
                skippedInvalid++;
                const msg = `Skipped: address failed verification (${verifyReason})`;
                console.log(`  🚫 ${lead.contact_email} — ${msg}`);
                await supabase.from("email_engine_leads").update({
                  send_error: msg,
                  queued: false,
                }).eq("id", lead.id);
                continue;
              }

              const htmlBody = lead.email_body!.replace(/\n/g, "<br>");
              const info = await transporter.sendMail({
                from: "Visuosofts <info@visuosofts.com>",
                to: lead.contact_email,
                subject: lead.email_subject,
                text: lead.email_body,
                html: htmlBody,
              });

              await supabase.from("email_engine_leads").update({
                sent: true,
                sent_at: new Date().toISOString(),
                resend_message_id: info.messageId,
                send_error: null,
                queued: false,
              }).eq("id", lead.id);
              sent++;
              console.log(`  ✅ Sent to: ${lead.contact_email} — ${info.messageId}`);

              try {
                await supabase.from("sent_emails").upsert({
                  recipient_email: lead.contact_email!.toLowerCase(),
                  sender: "visuosofts",
                  subject: lead.email_subject,
                  lead_id: lead.id,
                  message_id: info.messageId,
                  sent_at: new Date().toISOString(),
                }, { onConflict: "recipient_email,sender" });
              } catch (dedupErr) {
                console.error("Dedup log error:", dedupErr);
              }

              // Human-like pacing — but bail before the sleep if handoff is due.
              const delay = 60000 + Math.floor(Math.random() * 60000);
              if (Date.now() - runStartedAt + delay > HANDOFF_MS) {
                const remaining = sendableLeads.slice(i + 1).map((l) => l.id);
                if (remaining.length > 0) {
                  await supabase.from("email_engine_leads")
                    .update({ queued: false })
                    .in("id", remaining);
                }
                console.log(`⏸ pacing exceeds handoff window, released ${remaining.length} leads`);
                scheduleHandoff("pre-sleep");
                return;
              }
              console.log(`  ⏱ Waiting ${Math.round(delay / 1000)}s...`);
              await new Promise(r => setTimeout(r, delay));
            } catch (e) {
              errors++;
              const errMsg = e instanceof Error ? e.message : String(e);
              console.error(`  ❌ Send error for ${lead.company_name}:`, errMsg);
              await supabase.from("email_engine_leads").update({ send_error: errMsg, queued: false }).eq("id", lead.id);
            }
          }
          // Safety net: clear any lead still queued from this batch
          await supabase.from("email_engine_leads")
            .update({ queued: false })
            .in("id", queuedIds)
            .eq("queued", true);
          console.log(`🏁 Background send batch done: ${sent} sent, ${skippedInvalid} skipped, ${errors} errors`);

          // If more leads remain unsent overall, chain another batch.
          const { count: moreCount } = await supabase
            .from("email_engine_leads")
            .select("*", { count: "exact", head: true })
            .eq("email_generated", true)
            .eq("sent", false)
            .eq("queued", false)
            .is("send_error", null)
            .not("contact_email", "is", null);
          if ((moreCount || 0) > 0) {
            console.log(`↪️ ${moreCount} more leads pending — chaining next batch`);
            scheduleHandoff("chain-next-batch");
          }
        } catch (fatal) {
          console.error("email-engine sendJob fatal:", fatal);
          // Release any still-queued leads so they aren't stuck.
          await supabase.from("email_engine_leads")
            .update({ queued: false, send_error: `Worker crash: ${fatal instanceof Error ? fatal.message : String(fatal)}` })
            .in("id", queuedIds)
            .eq("queued", true);
        }
      };


      // @ts-ignore EdgeRuntime is available in Supabase edge functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(sendJob());
      } else {
        sendJob();
      }

      return new Response(JSON.stringify({
        success: true,
        queued: sendableLeads.length,
        sent: 0,
        message: `Queued ${sendableLeads.length} emails — sending in background with auto-handoff. Safe to close tab.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // === ACTION: STATUS ===
    if (action === "status") {
      const { count: totalLeads } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true });
      const { count: generatedCount } = await supabase
        .from("email_engine_leads")
        .select("*", { count: "exact", head: true })
        .eq("email_generated", true)
        .eq("sent", false)
        .is("send_error", null)
        .not("contact_email", "is", null)
        .not("email_subject", "is", null)
        .not("email_body", "is", null)
        .neq("contact_email", "")
        .neq("email_subject", "")
        .neq("email_body", "");
      const { count: sentCount } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("sent", true);
      const { count: errorCount } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).not("send_error", "is", null);

      return new Response(JSON.stringify({
        totalLeads: totalLeads || 0,
        generated: generatedCount || 0,
        sent: sentCount || 0,
        errors: errorCount || 0,
        industries: INDUSTRIES,
        regions: REGIONS,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: LIST ===
    if (action === "list") {
      const [readyResult, processingResult, errorResult, pendingResult, sentResult] = await Promise.all([
        supabase
          .from("email_engine_leads")
          .select("*")
          .eq("email_generated", true)
          .eq("sent", false)
          .eq("queued", false)
          .is("send_error", null)
          .not("contact_email", "is", null)
          .not("email_subject", "is", null)
          .not("email_body", "is", null)
          .neq("contact_email", "")
          .neq("email_subject", "")
          .neq("email_body", "")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("email_engine_leads")
          .select("*")
          .eq("queued", true)
          .eq("sent", false)
          .is("send_error", null)
          .order("queued_at", { ascending: false })
          .limit(100),
        supabase
          .from("email_engine_leads")
          .select("*")
          .eq("sent", false)
          .not("send_error", "is", null)
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("email_engine_leads")
          .select("*")
          .eq("sent", false)
          .eq("email_generated", false)
          .is("send_error", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("email_engine_leads")
          .select("*")
          .eq("sent", true)
          .order("sent_at", { ascending: false })
          .limit(100),
      ]);

      const firstError = readyResult.error || processingResult.error || errorResult.error || pendingResult.error || sentResult.error;
      if (firstError) throw firstError;

      const seen = new Set<string>();
      const leads = [
        ...(readyResult.data || []),
        ...(processingResult.data || []),
        ...(errorResult.data || []),
        ...(pendingResult.data || []),
        ...(sentResult.data || []),
      ].filter((lead) => {
        if (seen.has(lead.id)) return false;
        seen.add(lead.id);
        return true;
      }).slice(0, 300);

      return new Response(JSON.stringify({ leads }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: LIST LEGACY FALLBACK ===
    if (action === "list-legacy") {
      const { data: leads, error } = await supabase
        .from("email_engine_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ leads: leads || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: discover, generate, send, status, list" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Email engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
