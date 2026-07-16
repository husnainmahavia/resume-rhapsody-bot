import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES: Record<string, {
  label: string;
  price?: number;
  discoveryHint: string;
  emailPitch: string;
}> = {
  "web-dev-new": {
    label: "Web development (no website)",
    price: 500,
    discoveryHint: "small to mid-size local businesses (tradespeople, salons, clinics, restaurants, shops) that do not have a website but do have a public business listing",
    emailPitch: "Offer a professional 4-6 page mobile responsive website for a flat £500, with SEO setup and fast delivery.",
  },
  "web-dev-refresh": {
    label: "Website refresh (old website)",
    price: 700,
    discoveryHint: "businesses with an old, slow, dated, or non-mobile-friendly website that would benefit from a redesign",
    emailPitch: "Offer a modern website refresh for £700 with improved speed, mobile design, and SEO basics.",
  },
  dashboard: {
    label: "Business dashboard / internal tool",
    price: 1200,
    discoveryHint: "growing SMEs likely running operations on spreadsheets, bookings, invoices, leads, jobs, or stock manually",
    emailPitch: "Offer a bespoke business dashboard starting at £1,200 for customers, jobs, invoices, reporting, and workflow automation.",
  },
  "ar-realestate": {
    label: "AR for real estate",
    price: 2500,
    discoveryHint: "real-estate developers, estate agents, property marketers, and architecture firms that could use AR property visualisation",
    emailPitch: "Offer WebAR property visualisation packages from £2,500 so buyers can inspect spaces interactively from their phone.",
  },
  "ar-menu": {
    label: "AR restaurant menus",
    price: 600,
    discoveryHint: "restaurants, dessert bars, cafes, hotels, and hospitality brands with visual menus or strong social presence",
    emailPitch: "Offer AR menus from £600 so guests can preview dishes in 3D before ordering.",
  },
  "ar-business-card": {
    label: "AR business cards",
    price: 400,
    discoveryHint: "premium consultants, estate agents, advisors, coaches, and sales-led professionals who benefit from memorable networking",
    emailPitch: "Offer AR business cards from £400 with an interactive intro, portfolio, or product showcase.",
  },
  "ar-billboard": {
    label: "AR billboards / outdoor",
    price: 3500,
    discoveryHint: "brands, venues, retail campaigns, museums, galleries, entertainment companies, and event organisers running outdoor or experiential campaigns",
    emailPitch: "Offer AR billboard and event activations from £3,500 with scan-to-launch interactive 3D experiences.",
  },
  "ar-generic": {
    label: "Custom AR solutions",
    discoveryHint: "retailers, museums, manufacturers, training providers, or event companies where AR creates a practical product, training, or marketing advantage",
    emailPitch: "Offer bespoke AR solutions including try-on, manuals, interactive exhibits, launch campaigns, and training experiences.",
  },
};

const DEFAULT_ROTATION = Object.keys(CATEGORIES);
const DEFAULT_DAILY_SEND_CAP = 40;
const MAX_ITERATIONS = 2;
const MAX_SENDS_PER_INVOCATION = 8;
const OSM_BATCH_SIZE = 12;

async function getDailyCap(supabase: Client, mailbox: string): Promise<number> {
  const { data } = await supabase.from("sender_config").select("daily_cap").eq("mailbox", mailbox).maybeSingle();
  const cap = Number(data?.daily_cap);
  return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_SEND_CAP;
}

// Inline website quality scoring. Returns 0-100. Fetch failure = 0 (treat as refresh candidate).
async function scoreWebsite(website: string): Promise<number> {
  try {
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 VisuosoftsBot" } });
    clearTimeout(t);
    if (!resp.ok) return 0;
    const html = (await resp.text()).slice(0, 200_000);
    let score = 40;
    if (url.toLowerCase().startsWith("https://")) score += 15;
    if (/<meta[^>]+name=["']viewport["']/i.test(html)) score += 20;
    if (/(__NEXT_DATA__|data-reactroot|data-nuxt|ng-version|svelte-)/i.test(html)) score += 15;
    if (/wp-content|wordpress/i.test(html)) score += 10; // WP OK
    if (/FrontPage|Dreamweaver|<font\s|<center>|<marquee/i.test(html)) score -= 30;
    const yearMatch = html.match(/©\s*(?:copyright\s*)?(20\d{2})/i);
    if (yearMatch) {
      const y = Number(yearMatch[1]);
      const nowYear = new Date().getFullYear();
      if (nowYear - y >= 3) score -= 20;
    }
    return Math.max(0, Math.min(100, score));
  } catch {
    return 0;
  }
}

function categoryForWebsite(website: string | null, score: number, requested: string[]): string | null {
  // web-dev-new preferred: no website
  if (!website && requested.includes("web-dev-new")) return "web-dev-new";
  if (website && score < 45 && requested.includes("web-dev-refresh")) return "web-dev-refresh";
  return null;
}


const REAL_EMAIL_SOURCES = new Set(["mailto", "json-ld", "scrape", "smtp_verified"]);

function extractDomainFromWebsite(website: unknown): string | null {
  if (!hasText(website)) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function findRealEmailForDomain(
  SUPABASE_URL: string,
  SERVICE_KEY: string,
  domain: string,
  companyName?: string,
): Promise<{ email: string; confidence: number; source: string } | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/find-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ companyDomain: domain, companyName }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const emails: Array<{ email: string; confidence: number; source: string }> = data?.emails || [];
    const best = emails.find(e => e.confidence >= 70 || REAL_EMAIL_SOURCES.has(e.source));
    return best ? { email: best.email, confidence: best.confidence, source: best.source } : null;
  } catch {
    return null;
  }
}
const DISCOVERY_RETRY_ATTEMPTS = 3;
const MAX_SENDS_PER_DOMAIN_PER_DAY = 3;
const STALE_RUNNING_MS = 6 * 60_000;

type Client = ReturnType<typeof createClient>;

function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function cleanEmail(email: unknown): string | null {
  if (!hasText(email)) return null;
  const cleaned = email.trim().toLowerCase().replace(/^mailto:/, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  if (/@(gmail|yahoo|hotmail|outlook|icloud|aol)\./i.test(cleaned)) return null;
  if (/^(noreply|no-reply|donotreply|do-not-reply)@/i.test(cleaned)) return null;
  return cleaned;
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/calendly\.com\/\S+/gi, "")
    .replace(/https?:\/\/calendly\.com\/\S+/gi, "")
    .trim();
}

function isFatalSmtpError(message: string) {
  return /invalid login|authentication failed|535|bad credentials|auth/i.test(message);
}

function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() || "";
}

async function updateState(supabase: Client, patch: Record<string, unknown>) {
  const { error } = await supabase.from("services_outreach_state").update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) console.error("services outreach state update failed", error.message);
}

async function log(supabase: Client, msg: string, patch: Record<string, unknown> = {}) {
  console.log(msg);
  await updateState(supabase, { last_log: msg, ...patch });
}

async function verifyAddress(SUPABASE_URL: string, SERVICE_KEY: string, email: string) {
  try {
    const verifyResp = await fetch(`${SUPABASE_URL}/functions/v1/email-verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ email }),
    });
    if (!verifyResp.ok) return { ok: true, reason: "verification_unavailable" };
    const data = await verifyResp.json();
    const result = data.results?.[0];
    if (!result) return { ok: true, reason: "verification_unavailable" };
    const reason = result.reason || "unknown";
    const hardBad = !result.checks?.mxRecords || ["smtp_rejected", "invalid_format", "disposable_domain"].includes(reason);
    return { ok: !hardBad, reason };
  } catch (error) {
    console.warn("email verification unavailable", error);
    return { ok: true, reason: "verification_unavailable" };
  }
}

async function discoverLeads(apiKey: string, category: string, region: string) {
  const catDef = CATEGORIES[category];
  const prompt = `You are a careful B2B lead researcher. Find 4-6 real businesses matching this target.

TARGET: ${catDef.discoveryHint}
REGION: ${region}

Return:
- business_name
- website (or null)
- contact_email (real business email only, never personal webmail)
- phone (optional)
- location
- industry
- website_status (none | outdated | modern)
- opportunity (one specific sentence explaining why this business fits ${catDef.label})

Rules: only real businesses; skip uncertain entries; use diverse locations; return JSON only.`;

  let lastError = "";
  for (let attempt = 1; attempt <= DISCOVERY_RETRY_ATTEMPTS; attempt++) {
    const resp = await callGemini(apiKey, {
      model: "qwen/qwen3-next-80b-a3b-instruct:free",
      messages: [
        { role: "system", content: "Return valid JSON only. Do not invent fake businesses." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_leads",
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
      timeout_ms: 25_000,
      max_model_attempts: 3,
    });

    if (resp.ok) {
      const parsed = await resp.json();
      const call = parsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const args = typeof call === "string" ? JSON.parse(call) : call;
      return Array.isArray(args?.leads) ? args.leads : [];
    }

    lastError = `${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 180)}`;
    await new Promise((r) => setTimeout(r, attempt * 10_000));
  }
  throw new Error(`AI discovery failed: ${lastError}`);
}

async function generateEmail(apiKey: string, lead: Record<string, unknown>, category: string) {
  const catDef = CATEGORIES[category];
  const prompt = `Write a short plain-text cold outreach email. Return JSON with subject and body.

FROM: Husnain, Visuosofts, Manchester. Email: info@visuosofts.com.
TO: ${lead.business_name} (${lead.industry || "business"}, ${lead.location || "UK"})
WEBSITE: ${lead.website || "not listed"}
OPPORTUNITY: ${lead.opportunity}
PITCH: ${catDef.emailPitch}

Rules:
- max 130 words
- reference the business by name
- one specific opportunity sentence
- include the exact price if provided
- no placeholders, no square brackets, no Calendly links
- sign off: Best, Husnain, Visuosofts | info@visuosofts.com`;

  const resp = await callGemini(apiKey, {
    messages: [
      { role: "system", content: "You write concise B2B outreach emails. Return JSON only." },
      { role: "user", content: prompt },
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
    timeout_ms: 18_000,
    max_model_attempts: 2,
  });
  if (!resp.ok) throw new Error(`email generation failed: ${resp.status}`);
  const parsed = await resp.json();
  const call = parsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const args = typeof call === "string" ? JSON.parse(call) : call;
  const subject = cleanText(args?.subject);
  const body = cleanText(args?.body);
  if (!subject || !body || /\[[^\]]+\]|company name|recipient name/i.test(`${subject}\n${body}`)) {
    console.warn("⚠️ Safety-check failure. Raw AI output:", JSON.stringify(args)?.slice(0, 500));
    const reason = !subject ? "empty_subject" : !body ? "empty_body" : "placeholder_leftover";
    throw new Error(`email content failed safety checks (${reason})`);
  }
  return { subject, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const AI_KEY = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
  const SMTP_PASS = Deno.env.get("VISUOSOFTS_EMAIL_PASSWORD") || "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "run";

    if (action === "health") {
      return new Response(JSON.stringify({ ok: true, function: "services-outreach-pipeline", timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const { data: state } = await supabase.from("services_outreach_state").select("*").eq("id", 1).single();
      const { count: total } = await supabase.from("services_outreach_leads").select("*", { count: "exact", head: true });
      const { count: sent } = await supabase.from("services_outreach_leads").select("*", { count: "exact", head: true }).eq("sent", true);
      const { count: pending } = await supabase.from("services_outreach_leads").select("*", { count: "exact", head: true }).eq("sent", false).is("send_error", null);
      const { count: errors } = await supabase.from("services_outreach_leads").select("*", { count: "exact", head: true }).not("send_error", "is", null);
      const { data: recent } = await supabase.from("services_outreach_leads")
        .select("id, business_name, service_category, contact_email, sent, sent_at, send_error, created_at")
        .order("updated_at", { ascending: false }).limit(20);
      return new Response(JSON.stringify({ state, total, sent, pending, errors, recent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "mailbox-health") {
      if (!SMTP_PASS) throw new Error("Visuosofts mailbox password is not configured");
      const transporter = nodemailer.createTransport({
        host: "mail.visuosofts.com",
        port: 465,
        secure: true,
        auth: { user: "info@visuosofts.com", pass: SMTP_PASS },
      });
      try {
        await transporter.verify();
        await updateState(supabase, { status: "mailbox_healthy", last_log: "Mailbox login verified successfully." });
        return new Response(JSON.stringify({ ok: true, status: "mailbox_healthy" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await updateState(supabase, { status: "mailbox_auth_failed", last_log: `Mailbox login failed: ${msg}` });
        return new Response(JSON.stringify({ ok: false, status: "mailbox_auth_failed", error: msg }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "stop") {
      await updateState(supabase, { running: false, status: "stopped", finished_at: new Date().toISOString(), last_log: "Stopped by user." });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!AI_KEY) throw new Error("AI key is not configured");
    if (!SMTP_PASS) throw new Error("Visuosofts mailbox password is not configured");

    const isResume = action === "resume";
    const { data: existing } = await supabase.from("services_outreach_state").select("running, updated_at").eq("id", 1).single();
    const stale = existing?.running && existing.updated_at && (Date.now() - new Date(existing.updated_at).getTime()) > STALE_RUNNING_MS;
    if (!isResume && existing?.running && !stale) {
      return new Response(JSON.stringify({ ok: true, message: "Services outreach is already running." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isResume && !existing?.running) {
      return new Response(JSON.stringify({ ok: true, message: "Nothing to resume." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestedCategories = Array.isArray(body.categories) && body.categories.length
      ? body.categories.filter((c: string) => CATEGORIES[c])
      : DEFAULT_ROTATION;
    const region = hasText(body.region) ? body.region : "United Kingdom";

    if (!isResume) {
      await updateState(supabase, {
        running: true,
        status: stale ? "recovering" : "starting",
        iteration: 0,
        discovered: 0,
        emails_sent: 0,
        errors: 0,
        started_at: new Date().toISOString(),
        finished_at: null,
        last_log: stale ? "Recovered stale outreach run; starting a fresh batch." : "Starting services outreach batch...",
      });
    } else {
      await updateState(supabase, { status: "resuming", last_log: "Resumed by background handoff." });
    }

    const HANDOFF_MS = 25_000;
    const jobStartedAt = Date.now();
    let handoffScheduled = false;
    const scheduleHandoff = (reason: string) => {
      if (handoffScheduled) return;
      handoffScheduled = true;
      try {
        fetch(`${SUPABASE_URL}/functions/v1/services-outreach-pipeline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ action: "resume", categories: requestedCategories, region }),
        }).catch((e) => console.warn("services-outreach handoff fetch failed:", e));
        console.log(`🔁 services-outreach handoff scheduled (${reason})`);
      } catch (e) { console.warn("handoff error:", e); }
    };


    const runJob = async () => {
      const batchId = `svc_${Date.now()}`;
      let totalSent = 0;
      let totalDiscovered = 0;
      let totalErrors = 0;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase.from("services_outreach_leads")
        .select("*", { count: "exact", head: true }).eq("sent", true).gte("sent_at", startOfDay.toISOString());
      let dailySent = sentToday || 0;
      const { data: todaySentRows } = await supabase.from("services_outreach_leads")
        .select("contact_email")
        .eq("sent", true)
        .gte("sent_at", startOfDay.toISOString());
      const domainCounts = new Map<string, number>();
      for (const row of todaySentRows || []) {
        const email = cleanEmail(row.contact_email);
        const domain = email ? emailDomain(email) : "";
        if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      }

      const transporter = nodemailer.createTransport({
        host: "mail.visuosofts.com",
        port: 465,
        secure: true,
        auth: { user: "info@visuosofts.com", pass: SMTP_PASS },
      });

      try {
        await transporter.verify();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await updateState(supabase, {
          running: false,
          status: "mailbox_auth_failed",
          errors: 1,
          finished_at: new Date().toISOString(),
          last_log: `Mailbox login failed: ${msg}`,
        });
        return;
      }

      try {
        const { data: existingLeads } = await supabase.from("services_outreach_leads").select("contact_email");
        const seenEmails = new Set((existingLeads || []).map((r) => cleanEmail(r.contact_email)).filter(Boolean) as string[]);
        const { data: sentRows } = await supabase.from("sent_emails").select("recipient_email").limit(5000);
        for (const row of sentRows || []) {
          const email = cleanEmail(row.recipient_email);
          if (email) seenEmails.add(email);
        }
        // Cross-dedupe: also skip anything already targeted by the other pipelines
        const { data: engineRows } = await supabase.from("email_engine_leads").select("contact_email").limit(10000);
        for (const row of engineRows || []) {
          const email = cleanEmail(row.contact_email);
          if (email) seenEmails.add(email);
        }
        const { data: appRows } = await supabase.from("job_applications").select("hiring_manager_email").not("hiring_manager_email", "is", null);
        for (const row of appRows || []) {
          const email = cleanEmail(row.hiring_manager_email);
          if (email) seenEmails.add(email);
        }
        const { data: blacklistedDomains } = await supabase.from("domain_blacklist").select("domain").eq("is_blacklisted", true);
        const blacklistDomainSet = new Set((blacklistedDomains || []).map((r) => (r.domain || "").toLowerCase()).filter(Boolean));
        console.log(`🔎 Cross-dedupe: ${seenEmails.size} known recipients, ${blacklistDomainSet.size} blacklisted domains`);


        const DAILY_SEND_CAP = await getDailyCap(supabase, "info@visuosofts.com");
        await log(supabase, `Daily send cap for this mailbox: ${DAILY_SEND_CAP}.`, { status: "starting" });

        // Ensure the OSM cache has fresh candidates for the requested categories.
        // Trigger discovery for the first requested category if the pending pool is thin.
        for (const cat of requestedCategories) {
          const { count } = await supabase.from("osm_raw_leads")
            .select("*", { count: "exact", head: true })
            .eq("category", cat).eq("processed", false);
          if ((count || 0) < 20) {
            await log(supabase, `OSM cache low for ${cat} (${count || 0}); fetching more.`, { status: "osm_fetch" });
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/osm-lead-discovery`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  "apikey": SUPABASE_SERVICE_ROLE_KEY,
                },
                body: JSON.stringify({ category: cat, maxAreas: 2 }),
              });
            } catch (e) { console.warn("osm-lead-discovery invoke failed", e); }
            break; // only refill one per invocation to protect the wall-clock budget
          }
        }

        for (let iter = 1; iter <= MAX_ITERATIONS && totalSent < MAX_SENDS_PER_INVOCATION; iter++) {
          if (Date.now() - jobStartedAt > HANDOFF_MS) {
            await log(supabase, `Handing off (iter ${iter}, sent ${totalSent}).`, { status: "handing_off" });
            scheduleHandoff("wall-time-outer");
            return;
          }
          if (dailySent >= DAILY_SEND_CAP) {
            await log(supabase, `Daily cap reached (${dailySent}/${DAILY_SEND_CAP}).`, { status: "daily_cap_reached" });
            break;
          }

          await log(supabase, `Pulling OSM candidates for [${requestedCategories.join(", ")}] in ${region}.`, { status: "discovering", iteration: iter });

          // Pull a batch of unprocessed OSM rows that have a website (needed for find-email).
          const { data: osmBatch } = await supabase.from("osm_raw_leads")
            .select("*")
            .in("category", requestedCategories)
            .eq("processed", false)
            .not("website", "is", null)
            .order("seen_at", { ascending: true })
            .limit(OSM_BATCH_SIZE);

          if (!osmBatch || osmBatch.length === 0) {
            await log(supabase, `No OSM candidates ready. Discovery running in background.`, { status: "no_osm_candidates" });
            break;
          }

          const newRows: any[] = [];
          for (const osm of osmBatch) {
            if (Date.now() - jobStartedAt > HANDOFF_MS) {
              scheduleHandoff("wall-time-osm-scoring");
              return;
            }
            const website = String(osm.website || "");
            const domain = extractDomainFromWebsite(website);
            // Always mark processed so we don't retry the same POI
            await supabase.from("osm_raw_leads").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", osm.id);

            if (!domain) continue;
            if (blacklistDomainSet.has(domain)) continue;

            const score = await scoreWebsite(website);
            const category = categoryForWebsite(website, score, requestedCategories);
            if (!category) continue; // site is fine → not a web-dev opportunity in this build

            const catDef = CATEGORIES[category];
            const real = await findRealEmailForDomain(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, domain, String(osm.business_name));
            if (!real) continue;
            const cleaned = cleanEmail(real.email);
            if (!cleaned || seenEmails.has(cleaned)) continue;
            seenEmails.add(cleaned);

            const row = {
              business_name: cleanText(osm.business_name),
              website,
              contact_email: cleaned,
              phone: hasText(osm.phone) ? String(osm.phone) : null,
              location: hasText(osm.address) ? String(osm.address) : osm.area,
              industry: null,
              service_category: category,
              website_status: score === 0 ? "unreachable" : score < 45 ? "outdated" : "modern",
              opportunity: category === "web-dev-new"
                ? `${osm.business_name} has no working website in our checks — offer £${catDef.price} launch package.`
                : `${osm.business_name}'s site scored ${score}/100 — offer £${catDef.price} modern refresh.`,
              price_gbp: catDef.price ?? null,
              batch_id: batchId,
              source: "osm",
              website_score: score,
            };

            const { data: insertedRow, error: insertError } = await supabase
              .from("services_outreach_leads")
              .insert(row)
              .select("*")
              .single();
            if (insertError) {
              if (/duplicate key|unique constraint/i.test(insertError.message || "")) continue;
              console.warn("insert error:", insertError.message);
              continue;
            }
            if (insertedRow) newRows.push(insertedRow);
          }

          if (newRows.length === 0) {
            await log(supabase, `Iter ${iter}: no new sendable leads from ${osmBatch.length} OSM rows.`, { status: "no_fresh_leads" });
            continue;
          }
          totalDiscovered += newRows.length;
          await updateState(supabase, { discovered: totalDiscovered, status: "validating" });


          for (const lead of newRows) {
            if (Date.now() - jobStartedAt > HANDOFF_MS) {
              await log(supabase, `Handing off mid-batch (sent ${totalSent}).`, { status: "handing_off" });
              scheduleHandoff("wall-time-inner");
              return;
            }
            if (totalSent >= MAX_SENDS_PER_INVOCATION || dailySent >= DAILY_SEND_CAP) break;

            try {
              const verification = await verifyAddress(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, lead.contact_email);
              if (!verification.ok) {
                await supabase.from("services_outreach_leads").update({ send_error: `Skipped: address failed verification (${verification.reason})` }).eq("id", lead.id);
                totalErrors++;
                await updateState(supabase, { errors: totalErrors, status: "skipped_bad_address" });
                continue;
              }
              const domain = emailDomain(lead.contact_email);
              if ((domainCounts.get(domain) || 0) >= MAX_SENDS_PER_DOMAIN_PER_DAY) {
                await supabase.from("services_outreach_leads").update({ send_error: `Skipped: daily domain cap reached (${domain})` }).eq("id", lead.id);
                await log(supabase, `Skipped ${lead.business_name}: daily domain cap reached for ${domain}.`, { status: "domain_cap" });
                continue;
              }

              await log(supabase, `Generating checked email for ${lead.business_name}.`, { status: "generating" });
              const leadCategory = String(lead.service_category);
              const leadCatDef = CATEGORIES[leadCategory];
              const generated = await generateEmail(AI_KEY, lead, leadCategory);

              await supabase.from("services_outreach_leads").update({
                email_subject: generated.subject,
                email_body: generated.body,
                email_generated: true,
                send_error: null,
              }).eq("id", lead.id);

              await log(supabase, `Sending to ${lead.business_name} <${lead.contact_email}>.`, { status: "sending" });
              const info = await transporter.sendMail({
                from: "Visuosofts <info@visuosofts.com>",
                to: lead.contact_email,
                subject: generated.subject,
                text: generated.body,
                html: generated.body.replace(/\n/g, "<br>"),
              });

              await supabase.from("services_outreach_leads").update({
                sent: true,
                sent_at: new Date().toISOString(),
                message_id: info.messageId,
                send_error: null,
              }).eq("id", lead.id);
              await supabase.from("sent_emails").upsert({
                recipient_email: lead.contact_email,
                sender: "visuosofts",
                subject: generated.subject,
                message_id: info.messageId,
                sent_at: new Date().toISOString(),
              }, { onConflict: "recipient_email,sender" });

              totalSent++;
              dailySent++;
              domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
              await log(supabase, `Sent ${catDef.label} pitch to ${lead.business_name}.`, { emails_sent: totalSent, status: "sent" });
            } catch (error) {
              totalErrors++;
              const msg = error instanceof Error ? error.message : String(error);
              // Detect SMTP hard-bounce (invalid recipient) and mark `bounced=true`.
              const isBounce = /\b(550|553|554)\b|mailbox not found|user unknown|does not exist|invalid recipient|no such user/i.test(msg);
              await supabase.from("services_outreach_leads").update({
                send_error: msg,
                bounced: isBounce ? true : undefined,
              }).eq("id", lead.id);
              await log(supabase, `${lead.business_name}: ${msg}`, { errors: totalErrors, status: isFatalSmtpError(msg) ? "mailbox_auth_failed" : (isBounce ? "bounced" : "error") });
              if (isFatalSmtpError(msg)) throw error;
            }
          }
        }

        await updateState(supabase, {
          running: false,
          status: "finished",
          finished_at: new Date().toISOString(),
          last_log: `Batch complete. Discovered ${totalDiscovered}, sent ${totalSent}, errors/skips ${totalErrors}.`,
          discovered: totalDiscovered,
          emails_sent: totalSent,
          errors: totalErrors,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await updateState(supabase, {
          running: false,
          status: isFatalSmtpError(msg) ? "mailbox_auth_failed" : "failed",
          finished_at: new Date().toISOString(),
          last_log: `Batch failed: ${msg}`,
          errors: Math.max(totalErrors, 1),
        });
      }
    };

    // @ts-ignore EdgeRuntime is available in Lovable Cloud functions.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runJob());
    } else {
      runJob();
    }

    return new Response(JSON.stringify({
      ok: true,
      message: "Services outreach batch started. Autopilot schedule can continue it without the browser tab.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateState(supabase, { running: false, status: "failed", finished_at: new Date().toISOString(), last_log: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});