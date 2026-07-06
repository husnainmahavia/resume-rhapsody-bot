import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Services Outreach Pipeline
 * ---------------------------------------------------------------
 * Sister of the Auto-Apply pipeline, but for selling Visuosofts
 * services (AR + Web + Dashboards) to real businesses.
 *
 *   1. Discover businesses via Gemini in a chosen category:
 *        - web-dev-new      → businesses with NO website (£500)
 *        - web-dev-refresh  → old / outdated websites   (£700)
 *        - dashboard        → modern site, needs internal dashboard (£1,200)
 *        - ar-realestate    → UK real-estate AR visualisation
 *        - ar-business-card → AR business cards
 *        - ar-billboard     → AR outdoor / billboards
 *        - ar-menu          → AR restaurant menus
 *        - ar-generic       → any AR opportunity
 *   2. Generate a tailored cold email + subject.
 *   3. Send via info@visuosofts.com SMTP with human pacing.
 *   4. Repeat until daily cap reached OR no fresh leads found.
 */

const CATEGORIES: Record<string, {
  label: string;
  price?: number;
  discoveryHint: string;
  emailPitch: string;
}> = {
  "web-dev-new": {
    label: "Web development (no website)",
    price: 500,
    discoveryHint:
      "small to mid-size local UK businesses (tradespeople, salons, clinics, restaurants, shops) that DO NOT have a website. They must have a Google Business Profile / social listing but no website URL. Provide the phone or a public contact email if listed.",
    emailPitch:
      "Offer to build a professional 4-6 page website (mobile responsive, SEO ready) for a flat £500. Emphasise turnaround under 2 weeks and free 1 year hosting.",
  },
  "web-dev-refresh": {
    label: "Website refresh (old website)",
    price: 700,
    discoveryHint:
      "UK businesses whose website looks OLD (early-2010s design, not mobile responsive, slow, table layouts, dated fonts). Include the current website URL and a 1-line reason why it looks outdated.",
    emailPitch:
      "Offer a full modern website redesign — mobile responsive, fast, SEO-optimised — for £700. Migration + content included.",
  },
  "dashboard": {
    label: "Business dashboard / internal tool",
    price: 1200,
    discoveryHint:
      "growing UK SMEs with a modern website but likely running operations on spreadsheets — clinics, agencies, e-commerce, logistics, real estate. They would benefit from a custom admin dashboard.",
    emailPitch:
      "Offer a bespoke web dashboard (customers, jobs, invoices, analytics) starting at £1,200 — built on React + Supabase, delivered in 3-4 weeks.",
  },
  "ar-realestate": {
    label: "AR for real estate (UK)",
    price: 2500,
    discoveryHint:
      "UK real-estate developers, estate agents and architectural firms actively marketing new-build or off-plan projects. They benefit from AR visualisation of unbuilt properties.",
    emailPitch:
      "Offer WebAR / mobile AR property visualisation — buyers point their phone at a floor plan and walk through the 3D property. Packages from £2,500.",
  },
  "ar-business-card": {
    label: "AR business cards",
    price: 400,
    discoveryHint:
      "premium personal-brand professionals in the UK — consultants, coaches, luxury real-estate agents, financial advisors, luxury car dealers. They benefit from an AR business card.",
    emailPitch:
      "Offer AR business cards — scan the card with any phone to see a 3D intro video / product / portfolio. £400 setup + printing.",
  },
  "ar-billboard": {
    label: "AR billboards / outdoor",
    price: 3500,
    discoveryHint:
      "brands running out-of-home / billboard / event campaigns in the UK — retail chains, entertainment brands, sports clubs, museums, galleries.",
    emailPitch:
      "Offer AR billboards — passers-by scan a QR / image and see an interactive 3D activation. Packages from £3,500.",
  },
  "ar-menu": {
    label: "AR restaurant menus",
    price: 600,
    discoveryHint:
      "UK restaurants, fine dining, cafes, dessert bars, hotel F&B — especially independents with strong Instagram presence. They benefit from AR food menus so diners can see 3D dishes before ordering.",
    emailPitch:
      "Offer AR menus — customers scan the menu and see photo-real 3D models of each dish. £600 per venue including 10 dishes modelled.",
  },
  "ar-generic": {
    label: "Custom AR solutions",
    discoveryHint:
      "any UK business where an AR experience adds clear value — retailers wanting try-on, museums wanting interactive exhibits, manufacturers wanting AR product manuals, event organisers wanting AR activations.",
    emailPitch:
      "Offer bespoke AR solutions — try-on, AR manuals, AR activations, interactive exhibits. Quotes tailored to scope.",
  },
};

const DEFAULT_ROTATION = [
  "web-dev-new",
  "web-dev-refresh",
  "dashboard",
  "ar-realestate",
  "ar-menu",
  "ar-business-card",
  "ar-billboard",
  "ar-generic",
];

const DAILY_SEND_CAP = 40;
const MAX_ITERATIONS = 15;
const MAX_EMPTY_BATCHES = 8;
const DISCOVERY_RETRY_ATTEMPTS = 4;

function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function updateState(
  supabase: ReturnType<typeof createClient>,
  patch: Record<string, unknown>,
) {
  try {
    await supabase.from("services_outreach_state").update({
      ...patch,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
  } catch (e) {
    console.error("state update failed", e);
  }
}

async function log(
  supabase: ReturnType<typeof createClient>,
  msg: string,
  patch: Record<string, unknown> = {},
) {
  console.log(msg);
  await updateState(supabase, { last_log: msg, ...patch });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "run";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("OPENROUTER_API_KEY")!;
    const SMTP_PASS = Deno.env.get("VISUOSOFTS_EMAIL_PASSWORD");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "status") {
      const { data: state } = await supabase.from("services_outreach_state")
        .select("*").eq("id", 1).single();
      const { count: total } = await supabase.from("services_outreach_leads")
        .select("*", { count: "exact", head: true });
      const { count: sent } = await supabase.from("services_outreach_leads")
        .select("*", { count: "exact", head: true }).eq("sent", true);
      const { count: pending } = await supabase.from("services_outreach_leads")
        .select("*", { count: "exact", head: true }).eq("sent", false);
      const { data: recent } = await supabase.from("services_outreach_leads")
        .select("id, business_name, service_category, contact_email, sent, sent_at, send_error, created_at")
        .order("created_at", { ascending: false }).limit(20);
      return new Response(
        JSON.stringify({ state, total, sent, pending, recent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "stop") {
      await updateState(supabase, {
        running: false,
        status: "stopped",
        finished_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "run"
    if (!SMTP_PASS) {
      return new Response(
        JSON.stringify({ error: "VISUOSOFTS_EMAIL_PASSWORD not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prevent double-run
    const { data: existing } = await supabase
      .from("services_outreach_state").select("running").eq("id", 1).single();
    if (existing?.running) {
      return new Response(
        JSON.stringify({ ok: false, message: "Pipeline already running." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestedCategories: string[] = Array.isArray(body.categories) && body.categories.length
      ? body.categories.filter((c: string) => CATEGORIES[c])
      : DEFAULT_ROTATION;
    const region: string = body.region || "United Kingdom";

    await supabase.from("services_outreach_state").update({
      running: true,
      status: "starting",
      iteration: 0,
      discovered: 0,
      emails_sent: 0,
      errors: 0,
      started_at: new Date().toISOString(),
      finished_at: null,
      last_log: "Starting services outreach pipeline...",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const transporter = nodemailer.createTransport({
      host: "mail.visuosofts.com",
      port: 465,
      secure: true,
      auth: { user: "info@visuosofts.com", pass: SMTP_PASS },
    });

    const runJob = async () => {
      const batchId = `svc_${Date.now()}`;
      let totalSent = 0;
      let totalDiscovered = 0;
      let totalErrors = 0;
      let emptyBatches = 0;

      // Existing emails to avoid duplicates
      const { data: existingLeads } = await supabase
        .from("services_outreach_leads")
        .select("contact_email");
      const seenEmails = new Set<string>(
        (existingLeads || [])
          .map((r) => (r.contact_email || "").toLowerCase())
          .filter(Boolean),
      );
      const { data: alreadySentTable } = await supabase
        .from("sent_emails")
        .select("recipient_email")
        .eq("sender", "visuosofts")
        .limit(2000);
      for (const s of alreadySentTable || []) {
        if (s.recipient_email) seenEmails.add(s.recipient_email.toLowerCase());
      }

      // Today's send count (respect daily cap)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase
        .from("services_outreach_leads")
        .select("*", { count: "exact", head: true })
        .eq("sent", true)
        .gte("sent_at", startOfDay.toISOString());
      let dailySent = sentToday || 0;

      for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        if (dailySent >= DAILY_SEND_CAP) {
          await log(supabase, `🛑 Daily cap reached (${dailySent}/${DAILY_SEND_CAP}). Stopping.`);
          break;
        }
        const category = requestedCategories[(iter - 1) % requestedCategories.length];
        const catDef = CATEGORIES[category];

        await log(
          supabase,
          `🔍 Iteration ${iter}: discovering "${catDef.label}" in ${region}`,
          { iteration: iter, status: "discovering" },
        );

        // === DISCOVER ===
        const discoverPrompt = `You are a UK B2B lead researcher. Find 6-8 REAL businesses that match:

TARGET: ${catDef.discoveryHint}
REGION: ${region}

For each business return:
- business_name (real, registered)
- website (their current URL, or null if none)
- contact_email (a REAL business email at their domain if possible, otherwise a public info@ / hello@ / contact@; NEVER personal @gmail/@yahoo)
- phone (optional)
- location (city, region)
- industry (short label)
- website_status ("none" | "outdated" | "modern")
- opportunity (1 sentence — why THIS business specifically fits: ${catDef.label})

RULES:
- Only real businesses that a Google search would confirm.
- Diverse across cities, not all from one town.
- Skip anything you are uncertain about.`;

        let leads: any[] = [];
        let discoveryFailed = false;
        let lastDiscoveryError = "";
        for (let attempt = 1; attempt <= DISCOVERY_RETRY_ATTEMPTS; attempt++) {
          try {
            const resp = await callGemini(GEMINI_KEY, {
              messages: [
                { role: "system", content: "Return only real, verified UK businesses as valid JSON." },
                { role: "user", content: discoverPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "return_leads",
                  description: "Return discovered business leads",
                  parameters: {
                    type: "object",
                    properties: {
                      leads: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            business_name: { type: "string" },
                            website: { type: "string" },
                            contact_email: { type: "string" },
                            phone: { type: "string" },
                            location: { type: "string" },
                            industry: { type: "string" },
                            website_status: { type: "string" },
                            opportunity: { type: "string" },
                          },
                          required: ["business_name", "opportunity"],
                        },
                      },
                    },
                    required: ["leads"],
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "return_leads" } },
            });
            const raw = await resp.text();
            const parsed = JSON.parse(raw);
            const call = parsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
            if (call) {
              const args = typeof call === "string" ? JSON.parse(call) : call;
              leads = args.leads || [];
            }
            discoveryFailed = false;
            break;
          } catch (e) {
            lastDiscoveryError = e instanceof Error ? e.message : String(e);
            discoveryFailed = true;
            const backoff = 15000 * attempt + Math.floor(Math.random() * 5000);
            await log(
              supabase,
              `⚠️ Discovery attempt ${attempt}/${DISCOVERY_RETRY_ATTEMPTS} failed (${lastDiscoveryError.slice(0, 120)}) — retrying in ${Math.round(backoff / 1000)}s`,
            );
            await new Promise((r) => setTimeout(r, backoff));
          }
        }

        // Filter fresh + emailable
        const fresh = leads.filter((l) =>
          hasText(l.contact_email) &&
          !seenEmails.has(l.contact_email.toLowerCase())
        );

        if (fresh.length === 0) {
          if (discoveryFailed) {
            // Don't count as empty — API was unavailable. Long pause then try next category.
            await log(
              supabase,
              `⏸️ AI discovery unavailable (${lastDiscoveryError.slice(0, 120)}). Pausing 60s and continuing.`,
              { status: "waiting_for_ai" },
            );
            await new Promise((r) => setTimeout(r, 60000));
            continue;
          }
          emptyBatches++;
          await log(supabase, `↺ No fresh leads in "${catDef.label}" (empty batches ${emptyBatches}/${MAX_EMPTY_BATCHES}).`);
          if (emptyBatches >= MAX_EMPTY_BATCHES) {
            await log(supabase, `🛑 Stopping — ${MAX_EMPTY_BATCHES} consecutive empty batches across categories.`);
            break;
          }
          // Short pause before next category
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        emptyBatches = 0;

        // Insert
        const rows = fresh.map((l) => ({
          business_name: l.business_name,
          website: l.website || null,
          contact_email: l.contact_email.toLowerCase(),
          phone: l.phone || null,
          location: l.location || null,
          industry: l.industry || null,
          service_category: category,
          website_status: l.website_status || null,
          opportunity: l.opportunity || null,
          price_gbp: catDef.price ?? null,
          batch_id: batchId,
        }));
        const { data: inserted } = await supabase
          .from("services_outreach_leads")
          .upsert(rows, { onConflict: "contact_email", ignoreDuplicates: true })
          .select("*");
        const newRows = inserted || [];
        for (const r of newRows) seenEmails.add((r.contact_email || "").toLowerCase());
        totalDiscovered += newRows.length;
        await updateState(supabase, {
          discovered: totalDiscovered,
          status: "generating",
        });

        // === GENERATE EMAILS ===
        for (const lead of newRows) {
          if (dailySent >= DAILY_SEND_CAP) break;
          try {
            const emailPrompt = `Write a short cold outreach email (max 130 words, plain text, no markdown).

FROM: Husnain, Visuosofts (info@visuosofts.com) — AR + web + digital agency in Manchester.
TO: ${lead.business_name} (${lead.industry || "business"}, ${lead.location || "UK"})
WEBSITE STATUS: ${lead.website_status || "unknown"} — ${lead.website || "no website"}
SPECIFIC OPPORTUNITY: ${lead.opportunity}

PITCH: ${catDef.emailPitch}

RULES:
- Address the business by name.
- Reference the opportunity in 1 concrete sentence.
- Pitch the exact service and the price if given.
- End with ONE line asking for a 15-min call this week.
- Sign off:
Best,
Husnain
Visuosofts | info@visuosofts.com
- Return JSON only.`;
            const resp = await callGemini(GEMINI_KEY, {
              messages: [
                { role: "system", content: "You write short high-converting B2B outreach emails. Return JSON only." },
                { role: "user", content: emailPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "return_email",
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
            const raw = await resp.text();
            const parsed = JSON.parse(raw);
            const args = parsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
            if (!args) throw new Error("no email returned");
            const emailObj = typeof args === "string" ? JSON.parse(args) : args;
            const subject = String(emailObj.subject || "").trim();
            const bodyText = String(emailObj.body || "")
              .replace(/\[[^\]]+\]/g, "")
              .trim();
            if (!subject || !bodyText) throw new Error("blank email");

            await supabase.from("services_outreach_leads").update({
              email_subject: subject,
              email_body: bodyText,
              email_generated: true,
              send_error: null,
            }).eq("id", lead.id);

            // === SEND ===
            const info = await transporter.sendMail({
              from: "Visuosofts <info@visuosofts.com>",
              to: lead.contact_email,
              subject,
              text: bodyText,
              html: bodyText.replace(/\n/g, "<br>"),
            });

            await supabase.from("services_outreach_leads").update({
              sent: true,
              sent_at: new Date().toISOString(),
              message_id: info.messageId,
            }).eq("id", lead.id);

            await supabase.from("sent_emails").upsert({
              recipient_email: lead.contact_email,
              sender: "visuosofts",
              subject,
              message_id: info.messageId,
              sent_at: new Date().toISOString(),
            }, { onConflict: "recipient_email,sender" });

            totalSent++;
            dailySent++;
            await log(
              supabase,
              `✅ Sent "${catDef.label}" pitch to ${lead.business_name} <${lead.contact_email}>`,
              { emails_sent: totalSent, status: "sending" },
            );

            // Human pacing 45-90s
            const delay = 45000 + Math.floor(Math.random() * 45000);
            await new Promise((r) => setTimeout(r, delay));
          } catch (e) {
            totalErrors++;
            const msg = e instanceof Error ? e.message : String(e);
            await supabase.from("services_outreach_leads").update({
              send_error: msg,
            }).eq("id", lead.id);
            await log(supabase, `❌ ${lead.business_name}: ${msg}`, {
              errors: totalErrors,
            });
          }
        }
      }

      await updateState(supabase, {
        running: false,
        status: "finished",
        finished_at: new Date().toISOString(),
        last_log: `🏁 Done. Discovered ${totalDiscovered}, sent ${totalSent}, errors ${totalErrors}.`,
      });
    };

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runJob());
    } else {
      runJob();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Services outreach pipeline started. It will run in the background.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
