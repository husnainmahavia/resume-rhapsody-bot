import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  { name: "web_development", queries: ["web development company hiring email contact", "WordPress agency careers email", "React developer agency contact email", "web design company UK email"] },
  { name: "digital_marketing", queries: ["digital marketing agency hiring email contact", "SEO company careers email UK", "performance marketing agency contact email", "social media marketing company email"] },
  { name: "ai_ml", queries: ["AI company hiring email contact UK", "machine learning startup careers email", "artificial intelligence company recruitment email", "AI automation company email"] },
  { name: "ar_vr", queries: ["augmented reality company hiring email UK", "AR VR studio careers contact email", "immersive technology company email", "XR development company recruitment email"] },
  { name: "ecommerce", queries: ["ecommerce agency hiring email contact UK", "Shopify development company careers email", "online retail technology company email"] },
  { name: "software_development", queries: ["software development company hiring email UK", "SaaS startup careers contact email", "tech company recruitment email Manchester", "software agency contact email"] },
];

const CV_BASE = `HUSNAIN MAHAVIA | Full-Stack Developer & AI Specialist
8+ years in custom WordPress development, AI/ML integration, automation systems. 50+ WordPress sites, 15+ e-commerce platforms. ChatGPT, Gemini, MidJourney integration. Custom lead management, API integrations. Scaled team 1→10+, 50% YoY growth.
Contact: +44 7387 055617 | husnainmahavia.1@gmail.com | Manchester, UK
Education: BSc Software Engineering, COMSATS University (2016-2020)
Experience: Lead at Visuosofts (Jan 2017-Aug 2025), Market Research at NatCen (Oct 2025-Present)
Skills: HTML5/CSS3, JavaScript, PHP, Python, SQL, WordPress, React, AI/ML, REST APIs, Flutter, Unity AR/VR, SEO, Google Ads`;

function generateCvHtml(cvText: string, company: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Husnain Mahavia - CV</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:0 auto;padding:40px;color:#1a1a1a;line-height:1.6}
h1{font-size:22px;margin-bottom:4px;color:#0d1b2a}h2{font-size:14px;color:#415a77;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:20px}
p,li{font-size:13px}ul{padding-left:18px}</style></head>
<body>${cvText.replace(/\n/g,"<br>")}</body></html>`;
}

function generateCoverLetterHtml(text: string, company: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter - ${company}</title>
<style>body{font-family:Georgia,serif;max-width:650px;margin:0 auto;padding:40px;color:#1a1a1a;line-height:1.7}
p{font-size:13px;margin-bottom:12px}</style></head>
<body>${text.replace(/\n/g,"<br>")}</body></html>`;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
]);

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^www\./, "");
}

function extractDomainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return normalizeDomain(new URL(withProtocol).hostname);
  } catch {
    return null;
  }
}

function extractDomainFromEmail(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return null;
  return normalizeDomain(parts[1]);
}

function validateBusinessEmail(
  email?: string | null,
  website?: string | null,
): { valid: boolean; normalized: string | null; reason?: string } {
  if (!email) return { valid: false, normalized: null, reason: "missing_email" };

  const normalized = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, normalized: null, reason: "invalid_format" };
  }

  const localPart = normalized.split("@")[0];
  const emailDomain = extractDomainFromEmail(normalized);
  if (!emailDomain) {
    return { valid: false, normalized: null, reason: "invalid_domain" };
  }

  if (PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
    return { valid: false, normalized: null, reason: "public_mailbox_not_allowed" };
  }

  if (
    /^no-?reply/.test(localPart) ||
    /(test|fake|sample|example|demo)/i.test(localPart) ||
    /example\./i.test(emailDomain)
  ) {
    return { valid: false, normalized: null, reason: "placeholder_or_no_reply" };
  }

  const websiteDomain = extractDomainFromUrl(website);
  if (websiteDomain) {
    const matchesWebsite = emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`);
    if (!matchesWebsite) {
      return { valid: false, normalized: null, reason: "domain_mismatch_with_website" };
    }
  }

  return { valid: true, normalized };
}

async function generateCvAndCoverLetter(company: string, category: string, description: string, apiKey: string) {
  try {
    const categoryLabel = category.replace(/_/g, " ");
      const res = await callGemini(apiKey, {
        messages: [{
          role: "user",
          content: `Tailor this CV for a cold outreach to ${company} (a ${categoryLabel} company: ${description || ""}).

BASE CV:
${CV_BASE}

Return ONLY a JSON object with:
- "tailored_cv": full tailored CV text (well structured, 1-2 pages, highlight relevant skills for ${categoryLabel})
- "cover_letter": a concise personalized cover letter (200 words max, mention ${company} by name, sound human)

No markdown, no code fences. JSON only.`
        }],
        temperature: 0.5,
        max_tokens: 2000,
      });
    if (!res.ok) { console.error("CV gen failed:", res.status); return null; }
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { return null; }
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("CV generation error:", e);
    return null;
  }
}

async function aiSearchEmails(query: string, apiKey: string, retries = 3): Promise<Array<{ company: string; email: string; website: string; description: string; location: string }>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = (attempt * 15000) + Math.random() * 10000;
        console.log(`  ⏳ Rate limit retry ${attempt}/${retries}, waiting ${Math.round(backoff/1000)}s...`);
        await new Promise(r => setTimeout(r, backoff));
      }

      const response = await callGemini(apiKey, {
          messages: [{
            role: "user",
            content: `You are a job research assistant. Search for real companies matching: "${query}"

Return ONLY a JSON array of objects. Each object must have:
- "company": company name (real companies only)
- "email": VERIFIED business contact email tied to the same company domain (never guess)
- "website": company website URL
- "description": what the company does (1 sentence)
- "location": company location

Find 5-8 REAL companies with VERIFIED business email addresses.
If verified email is not publicly available, skip that company (do not fabricate).

CRITICAL: Only return companies you are confident are real. Return valid JSON array only, no markdown, no code fences.`
          }],
          temperature: 0.3,
          max_tokens: 2000,
        });

      if (response.status === 429 || response.status === 503) {
        console.warn(`  ⚠️ Gemini ${response.status} on attempt ${attempt + 1}`);
        await response.text();
        continue;
      }

      if (!response.ok) {
        console.error("Gemini search error:", response.status);
        await response.text();
        return [];
      }

      const rawText = await response.text();
      console.log("Gemini response status:", response.status, "length:", rawText.length);
      
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error("Failed to parse Gemini response:", rawText.substring(0, 200));
        return [];
      }
      
      const content = data.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("No JSON array found in content:", content.substring(0, 200));
        return [];
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed) ? parsed.filter((r: any) => r.email && r.company) : [];
    } catch (e) {
      console.error("AI search error:", e);
      return [];
    }
  }
  console.error("  ❌ All retries exhausted for query:", query);
  return [];
}

// ---------- background-worker constants ----------
const HANDOFF_MS = 25_000;      // hand off before edge idle-timeout
const PER_ITEM_MS = 90_000;     // hard cap per queue item
const SCRAPE_DELAY_MS = 8_000;  // between scrape queries
const SEND_DELAY_MS = 45_000;   // between sent emails (min)

function jsonResp(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Exponential backoff with jitter for fetch-returning fns. Retries on 429/5xx/network.
async function withBackoff<T extends Response>(
  fn: () => Promise<T>,
  { retries = 4, baseMs = 1500, label = "call" }: { retries?: number; baseMs?: number; label?: string } = {},
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fn();
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt === retries) return res;
        const wait = baseMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`⏳ ${label} ${res.status}, backoff ${Math.round(wait)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === retries) throw e;
      const wait = baseMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`⏳ ${label} network error, backoff ${Math.round(wait)}ms:`, e);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr ?? new Error(`${label} exhausted retries`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, categories, location } = body || {};

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("OPENROUTER_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const readState = async () => {
      const { data } = await supabase.from("scraper_state").select("*").eq("id", 1).maybeSingle();
      return data;
    };
    const patchState = async (patch: Record<string, unknown>) =>
      supabase.from("scraper_state").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);

    const scheduleHandoff = (() => {
      let scheduled = false;
      return (reason: string) => {
        if (scheduled) return;
        scheduled = true;
        try {
          fetch(`${supabaseUrl}/functions/v1/job-scraper`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
              "apikey": supabaseKey,
            },
            body: JSON.stringify({ action: "resume" }),
          }).catch(e => console.warn("handoff fetch failed:", e));
          console.log(`🔁 job-scraper handoff scheduled (${reason})`);
        } catch (e) { console.warn("handoff error:", e); }
      };
    })();

    // ---------- read-only endpoints ----------
    if (action === "status") {
      const { count: totalCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true });
      const { count: sentCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_sent", true);
      const { count: openedCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_opened", true);
      const { count: repliedCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_replied", true);
      const { data: catData } = await supabase.from("scraped_companies").select("category");
      const categoryCounts: Record<string, number> = {};
      (catData || []).forEach((r: any) => { categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1; });
      const state = await readState();
      return jsonResp({
        total: totalCount || 0,
        sent: sentCount || 0,
        opened: openedCount || 0,
        replied: repliedCount || 0,
        categories: categoryCounts,
        worker: state || null,
      });
    }

    if (action === "progress") {
      return jsonResp({ state: await readState() });
    }

    if (action === "stop") {
      await patchState({ running: false, step: "Stopped by user" });
      return jsonResp({ stopped: true });
    }

    if (action === "list") {
      const { data } = await supabase
        .from("scraped_companies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return jsonResp({ data: data || [] });
    }

    // ---------- start scrape ----------
    if (action === "scrape") {
      const targetCategories = categories || CATEGORIES.map(c => c.name);
      const locationFilter = location || "UK";
      const queue: Array<{ kind: "scrape"; category: string; query: string }> = [];
      for (const cat of CATEGORIES) {
        if (!targetCategories.includes(cat.name)) continue;
        for (const q of cat.queries) queue.push({ kind: "scrape", category: cat.name, query: `${q} ${locationFilter}` });
      }
      const current = await readState();
      if (current?.running) {
        const updated = current.updated_at ? new Date(current.updated_at).getTime() : 0;
        if (Date.now() - updated < 2 * 60_000) {
          return jsonResp({ accepted: false, message: "Scraper already running." }, { status: 202 });
        }
      }
      await supabase.from("scraper_state").upsert({
        id: 1, running: queue.length > 0, action: "scrape",
        started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        done: 0, total: queue.length, sent: 0, skipped: 0, failed: 0,
        current_item: null, step: queue.length ? "Starting scrape…" : "Nothing to scrape",
        last_error: null, queue: queue as any,
      });
      if (queue.length === 0) return jsonResp({ accepted: false, message: "Nothing to scrape." });
      scheduleHandoff("scrape-start");
      return jsonResp({ accepted: true, total: queue.length, message: "Scrape started in background." }, { status: 202 });
    }

    // ---------- start send_emails ----------
    if (action === "send_emails") {
      const targetCategories = categories || CATEGORIES.map(c => c.name);
      let q = supabase.from("scraped_companies").select("id").eq("email_sent", false).eq("status", "scraped").limit(200);
      if (targetCategories.length > 0) q = q.in("category", targetCategories);
      const { data: rows } = await q;
      const queue = (rows || []).map((r: any) => ({ kind: "send", company_id: r.id }));
      const current = await readState();
      if (current?.running) {
        const updated = current.updated_at ? new Date(current.updated_at).getTime() : 0;
        if (Date.now() - updated < 2 * 60_000) {
          return jsonResp({ accepted: false, message: "Worker already running." }, { status: 202 });
        }
      }
      await supabase.from("scraper_state").upsert({
        id: 1, running: queue.length > 0, action: "send_emails",
        started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        done: 0, total: queue.length, sent: 0, skipped: 0, failed: 0,
        current_item: null, step: queue.length ? "Starting sends…" : "No unsent companies",
        last_error: null, queue: queue as any,
      });
      if (queue.length === 0) return jsonResp({ accepted: false, message: "No unsent companies." });
      scheduleHandoff("send-start");
      return jsonResp({ accepted: true, total: queue.length, message: `Sending ${queue.length} emails in background.` }, { status: 202 });
    }

    // ---------- resume: the actual worker loop ----------
    if (action === "resume") {
      const state = await readState();
      if (!state?.running) return jsonResp({ resumed: false, message: "Nothing to resume." });

      const runStartedAt = Date.now();
      let queue = Array.isArray(state.queue) ? [...(state.queue as any[])] : [];
      let { done, sent, skipped, failed } = state;

      const backgroundRun = async () => {
        try {
          while (queue.length > 0) {
            if (Date.now() - runStartedAt > HANDOFF_MS) {
              await patchState({
                queue: queue as any, done, sent, skipped, failed,
                step: `Handing off (${queue.length} remaining)`,
              });
              scheduleHandoff("wall-time");
              return;
            }
            const latest = await readState();
            if (!latest?.running) { console.log("job-scraper: stop detected"); return; }

            const item: any = queue[0];
            try {
              if (item.kind === "scrape") {
                await patchState({ current_item: item.query, step: "Searching…" });
                const results = await withTimeout(
                  aiSearchEmails(item.query, geminiKey),
                  PER_ITEM_MS,
                  `aiSearchEmails(${item.query})`,
                );
                for (const c of results) {
                  const v = validateBusinessEmail(c.email, c.website);
                  if (!v.valid || !v.normalized) { skipped++; continue; }
                  const { error } = await supabase.from("scraped_companies").upsert({
                    company_name: c.company, email: v.normalized, website: c.website,
                    category: item.category, source: "ai_search",
                    location: c.location || location || "UK",
                    description: c.description, status: "scraped",
                  }, { onConflict: "email,category" });
                  if (error) { failed++; console.error("Upsert:", error.message); }
                  else sent++; // reuse "sent" as "records saved" for scrape
                }
                await new Promise(r => setTimeout(r, SCRAPE_DELAY_MS + Math.random() * 4000));
              } else if (item.kind === "send") {
                const { data: company } = await supabase.from("scraped_companies").select("*").eq("id", item.company_id).maybeSingle();
                if (!company) { skipped++; }
                else {
                  await patchState({ current_item: company.company_name, step: "Drafting & sending…" });
                  const v = validateBusinessEmail(company.email, company.website);
                  if (!v.valid || !v.normalized) {
                    await supabase.from("scraped_companies").update({ status: "invalid_email" }).eq("id", company.id);
                    skipped++;
                  } else {
                    const categoryLabel = company.category.replace(/_/g, " ");
                    const emailResponse = await withBackoff(
                      () => callGemini(geminiKey, {
                        messages: [{ role: "user", content: `Write a professional cold outreach email from Husnain Mahavia (Full-Stack Developer & AI Specialist, 8+ years experience) to ${company.company_name} (${categoryLabel} company).\n\nCompany info: ${company.description || ""}\n\nThe email should:\n- Be concise (3-4 paragraphs max)\n- Mention relevant skills for their industry (${categoryLabel})\n- Highlight value I can bring\n- Include a clear CTA for a call/meeting\n- Sound natural and human, NOT like AI\n\nReturn ONLY a JSON object with "subject" and "body" fields. No markdown, no code fences.` }],
                        temperature: 0.7, max_tokens: 800,
                      }),
                      { label: "gemini-email" },
                    );
                    if (!emailResponse.ok) { failed++; await patchState({ last_error: `Gemini ${emailResponse.status} for ${company.company_name}` }); }
                    else {
                      const emailRaw = await emailResponse.text();
                      const emailData = JSON.parse(emailRaw);
                      const content = emailData.choices?.[0]?.message?.content || "";
                      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
                      const m = cleaned.match(/\{[\s\S]*\}/);
                      if (!m) { failed++; }
                      else {
                        const { subject, body: emailBodyText } = JSON.parse(m[0]);
                        const cvData = await generateCvAndCoverLetter(company.company_name, company.category, company.description || "", geminiKey);
                        const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
                        if (cvData?.tailored_cv) attachments.push({ filename: `Husnain_Mahavia_CV_${company.company_name.replace(/[^a-zA-Z0-9]/g, "_")}.html`, content: generateCvHtml(cvData.tailored_cv, company.company_name), contentType: "text/html" });
                        if (cvData?.cover_letter) attachments.push({ filename: `Cover_Letter_${company.company_name.replace(/[^a-zA-Z0-9]/g, "_")}.html`, content: generateCoverLetterHtml(cvData.cover_letter, company.company_name), contentType: "text/html" });
                        const finalBody = emailBodyText + "\n\nPlease find my CV and cover letter attached.\n\nBest regards,\nHusnain Mahavia\n+44 7387 055617\nhusnainmahavia.1@gmail.com";
                        const sendResp = await withBackoff(
                          () => fetch(`${supabaseUrl}/functions/v1/send-email`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ to: v.normalized, subject, body: finalBody, attachments }),
                          }),
                          { label: "send-email" },
                        );
                        const sendResult = await sendResp.json().catch(() => ({}));
                        if (sendResult.success || sendResult.sent) {
                          await supabase.from("scraped_companies").update({
                            email_sent: true, email_sent_at: new Date().toISOString(), status: "emailed",
                          }).eq("id", company.id);
                          sent++;
                          await new Promise(r => setTimeout(r, SEND_DELAY_MS + Math.random() * 30000));
                        } else if (sendResult.bounce) {
                          await supabase.from("scraped_companies").update({ status: "bounced" }).eq("id", company.id);
                          failed++;
                        } else { failed++; await patchState({ last_error: `send failed for ${company.company_name}` }); }
                      }
                    }
                  }
                }
              }
            } catch (err) {
              failed++;
              await patchState({ last_error: err instanceof Error ? err.message : String(err) });
              console.error("worker item error:", err);
            }
            queue.shift();
            done++;
            await patchState({ queue: queue as any, done, sent, skipped, failed, step: queue.length ? "Next…" : "Finishing…" });
          }
          await patchState({
            running: false, current_item: null, queue: [] as any,
            step: `Complete — ${sent} ok · ${skipped} skipped · ${failed} failed`,
          });
        } catch (fatal) {
          console.error("worker fatal:", fatal);
          await patchState({ running: false, step: "Errored", last_error: fatal instanceof Error ? fatal.message : String(fatal) });
        }
      };

      // @ts-ignore EdgeRuntime provided by Supabase
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(backgroundRun());
      } else {
        backgroundRun();
      }
      return jsonResp({ resumed: true, remaining: queue.length }, { status: 202 });
    }

    return jsonResp({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Scraper error:", e);
    return jsonResp({ error: String(e) }, { status: 500 });
  }
});

