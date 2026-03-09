import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";

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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
    const VISUOSOFTS_EMAIL_PASSWORD = Deno.env.get("VISUOSOFTS_EMAIL_PASSWORD");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

      const searchResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
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
        }),
      });

      if (!searchResponse.ok) throw new Error(`Discovery failed: ${searchResponse.status}`);
      const searchData = await searchResponse.json();
      const toolCall = searchData.choices?.[0]?.message?.tool_calls?.[0];
      const leads = toolCall?.function?.arguments
        ? JSON.parse(toolCall.function.arguments).leads || []
        : [];

      console.log(`✅ Discovered ${leads.length} leads`);

      // Check for duplicates and insert
      let inserted = 0;
      for (const lead of leads) {
        const { data: existing } = await supabase
          .from("email_engine_leads")
          .select("id")
          .eq("contact_email", lead.contact_email)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`⏭ Duplicate: ${lead.company_name}`);
          continue;
        }

        await supabase.from("email_engine_leads").insert({
          company_name: lead.company_name,
          website: lead.website,
          contact_email: lead.contact_email,
          industry: targetIndustry,
          region: targetRegion,
          description: lead.description,
          opportunity: lead.opportunity,
          campaign_batch: campaignBatch,
        });
        inserted++;
      }

      return new Response(JSON.stringify({
        success: true,
        discovered: leads.length,
        inserted,
        duplicatesSkipped: leads.length - inserted,
        batch: campaignBatch,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: GENERATE EMAILS ===
    if (action === "generate") {
      const targetLeadIds = leadIds as string[] | undefined;
      const shouldForce = Boolean(force);

      let query = supabase
        .from("email_engine_leads")
        .select("*")
        .eq("sent", false);

      if (!shouldForce) {
        query = query.eq("email_generated", false);
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
8. Do NOT use "Dear Sir/Madam" — use "Dear [Company Name] Team" or find a better greeting`;

          const emailResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
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
            }),
          });

          if (!emailResponse.ok) throw new Error(`Email gen failed: ${emailResponse.status}`);
          const emailData = await emailResponse.json();
          const emailResult = emailData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
            ? JSON.parse(emailData.choices[0].message.tool_calls[0].function.arguments)
            : null;

          if (emailResult) {
            await supabase.from("email_engine_leads").update({
              email_subject: emailResult.subject,
              email_body: emailResult.body,
              email_generated: true,
            }).eq("id", lead.id);
            generated++;
            console.log(`  ✅ Email generated for: ${lead.company_name}`);
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

    // === ACTION: SEND BULK ===
    if (action === "send") {
      if (!VISUOSOFTS_EMAIL_PASSWORD) {
        return new Response(JSON.stringify({ error: "VISUOSOFTS_EMAIL_PASSWORD not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetLeadIds = leadIds as string[] | undefined;
      let query = supabase
        .from("email_engine_leads")
        .select("*")
        .eq("email_generated", true)
        .eq("sent", false);

      if (targetLeadIds && targetLeadIds.length > 0) {
        query = query.in("id", targetLeadIds);
      }

      const { data: leads, error } = await query.limit(10);
      if (error) throw error;
      if (!leads || leads.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, message: "No emails ready to send" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`📧 Sending ${leads.length} emails via SMTP (mail.visuosofts.com)`);

      const transporter = nodemailer.createTransport({
        host: "mail.visuosofts.com",
        port: 465,
        secure: true,
        auth: {
          user: "info@visuosofts.com",
          pass: VISUOSOFTS_EMAIL_PASSWORD,
        },
      });

      let sent = 0;
      let errors = 0;

      for (const lead of leads) {
        try {
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
          }).eq("id", lead.id);
          sent++;
          console.log(`  ✅ Sent to: ${lead.contact_email} — MessageId: ${info.messageId}`);

          // Human-like pacing: random 3-5 minute delay between sends
          const delay = 180000 + Math.floor(Math.random() * 120000); // 180s-300s (3-5 min)
          console.log(`  ⏱ Waiting ${Math.round(delay / 1000)}s before next send...`);
          await new Promise(r => setTimeout(r, delay));
        } catch (e) {
          errors++;
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`  ❌ Send error for ${lead.company_name}:`, errMsg);
          await supabase.from("email_engine_leads").update({
            send_error: errMsg,
          }).eq("id", lead.id);
        }
      }

      return new Response(JSON.stringify({ success: true, sent, errors, total: leads.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: STATUS ===
    if (action === "status") {
      const { count: totalLeads } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true });
      const { count: generated } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("email_generated", true);
      const { count: sentCount } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).eq("sent", true);
      const { count: errorCount } = await supabase.from("email_engine_leads").select("*", { count: "exact", head: true }).not("send_error", "is", null);

      return new Response(JSON.stringify({
        totalLeads: totalLeads || 0,
        generated: generated || 0,
        sent: sentCount || 0,
        errors: errorCount || 0,
        industries: INDUSTRIES,
        regions: REGIONS,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: LIST ===
    if (action === "list") {
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
