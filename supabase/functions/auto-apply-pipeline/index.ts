import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_DAILY_LIMIT = 80;
const MIN_DELAY_MS = 45000;
const MAX_DELAY_MS = 120000;
const BATCH_PAUSE_MS = 300000;

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
]);

function humanDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((r) => setTimeout(r, ms));
}

class AICreditsError extends Error {
  status: number;
  constructor(status: number) {
    const msg = status === 402
      ? "AI credits exhausted. Please add credits in Settings → Workspace → Usage."
      : "AI rate limit exceeded. Please wait a moment and try again.";
    super(msg);
    this.name = "AICreditsError";
    this.status = status;
  }
}

async function callAIGateway(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status === 402 || resp.status === 429) {
    throw new AICreditsError(resp.status);
  }
  return resp;
}

function normalizeDomain(domain: string): string {
  let d = domain.toLowerCase().trim().replace(/^www\./, "");
  d = d.replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
  return d;
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

function getExpectedDomains(job: {
  url?: string | null;
  careers_page_url?: string | null;
}): string[] {
  return [...new Set([
    extractDomainFromUrl(job.url),
    extractDomainFromUrl(job.careers_page_url),
  ].filter((d): d is string => Boolean(d)))];
}

function validateHiringEmail(
  email?: string | null,
  expectedDomains: string[] = [],
): { valid: boolean; normalized: string | null; reason?: string } {
  if (!email) return { valid: false, normalized: null, reason: "missing_email" };

  const normalizedEmail = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { valid: false, normalized: null, reason: "invalid_format" };
  }

  const localPart = normalizedEmail.split("@")[0];
  const emailDomain = extractDomainFromEmail(normalizedEmail);
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

  if (expectedDomains.length > 0) {
    const matchesExpected = expectedDomains.some(
      (expected) => emailDomain === expected || emailDomain.endsWith(`.${expected}`),
    );

    if (!matchesExpected) {
      return { valid: false, normalized: null, reason: "domain_mismatch_with_job_url" };
    }
  }

  return { valid: true, normalized: normalizedEmail };
}

// CV content will be loaded from DB at runtime
let FULL_CV_CONTENT = "";
let APPLICANT_NAME = "Husnain Mahavia";
let APPLICANT_EMAIL = "husnainmahavia.1@gmail.com";
let APPLICANT_PHONE = "+44 7387 055617";
let APPLICANT_TITLE = "Full-Stack Developer | AI Specialist | Tech Lead";
let APPLICANT_SKILLS: string[] = [];
let APPLICANT_SUMMARY = "";
let APPLICANT_LOCATION = "Manchester, UK";

// Generate a professional PDF-like HTML CV
function generateCvHtml(cvText: string, jobTitle: string, company: string): string {
  // Parse sections from tailored CV text
  const lines = cvText.split("\n");
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; padding: 30px 40px; line-height: 1.4; }
    .header { text-align: center; border-bottom: 2px solid #1a5276; padding-bottom: 10px; margin-bottom: 15px; }
    .name { font-size: 22pt; font-weight: bold; color: #1a5276; letter-spacing: 2px; margin: 0; }
    .contact { font-size: 9pt; color: #555; margin: 5px 0; }
    .title { font-size: 11pt; color: #2c3e50; font-style: italic; margin: 5px 0; }
    h2 { font-size: 12pt; color: #1a5276; border-bottom: 1px solid #1a5276; padding-bottom: 3px; margin: 15px 0 8px 0; text-transform: uppercase; letter-spacing: 1px; }
    h3 { font-size: 11pt; color: #2c3e50; margin: 10px 0 3px 0; }
    .job-title { font-weight: bold; }
    .job-company { color: #555; font-style: italic; }
    .job-date { color: #777; font-size: 9pt; float: right; }
    ul { margin: 3px 0 8px 0; padding-left: 20px; }
    li { margin-bottom: 2px; font-size: 10pt; }
    .skills-grid { display: flex; flex-wrap: wrap; gap: 3px 15px; }
    .skill-item { font-size: 10pt; }
    .section-content { font-size: 10pt; }
    p { margin: 3px 0; font-size: 10pt; }
  </style></head><body>`;

  html += `<div class="header">
    <p class="name">${APPLICANT_NAME.toUpperCase()}</p>
    <p class="contact">${APPLICANT_PHONE} • ${APPLICANT_EMAIL} • ${APPLICANT_LOCATION}</p>
    <p class="title">${APPLICANT_TITLE}</p>
  </div>`;

  // Convert CV text to HTML sections
  let currentSection = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers (all caps or starts with #)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("•") && !trimmed.startsWith("-")) {
      if (trimmed.includes("HUSNAIN") || trimmed.includes("+44") || trimmed.includes("Full-Stack")) continue;
      html += `<h2>${trimmed}</h2>`;
      currentSection = trimmed;
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      html += `<li>${trimmed.replace(/^[•\-]\s*/, "")}</li>`;
    } else if (trimmed.includes("|") && (trimmed.includes("2017") || trimmed.includes("2025") || trimmed.includes("2020"))) {
      html += `<h3>${trimmed}</h3>`;
    } else {
      html += `<p>${trimmed}</p>`;
    }
  }

  html += "</body></html>";
  return html;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { location, skills, action, cvVersion, jobType, searchMode } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load applicant profile from DB
    const { data: profileData } = await supabase
      .from("applicant_profile")
      .select("*")
      .limit(1)
      .single();

    if (profileData) {
      APPLICANT_NAME = (profileData as any).name || APPLICANT_NAME;
      APPLICANT_EMAIL = (profileData as any).email || APPLICANT_EMAIL;
      APPLICANT_PHONE = (profileData as any).phone || APPLICANT_PHONE;
      APPLICANT_TITLE = (profileData as any).title || APPLICANT_TITLE;
      APPLICANT_SKILLS = (profileData as any).skills || APPLICANT_SKILLS;
      APPLICANT_SUMMARY = (profileData as any).summary || APPLICANT_SUMMARY;
      APPLICANT_LOCATION = (profileData as any).location || APPLICANT_LOCATION;
      FULL_CV_CONTENT = (profileData as any).cv_content || FULL_CV_CONTENT;
    }

    const senderEmail = APPLICANT_EMAIL;
    const senderName = APPLICANT_NAME;

    if (action === "status") {
      const { count: totalCount } = await supabase.from("job_applications").select("*", { count: "exact", head: true });
      const { count: appliedCount } = await supabase.from("job_applications").select("*", { count: "exact", head: true }).eq("status", "applied");
      const { count: todayCount } = await supabase.from("job_applications").select("*", { count: "exact", head: true })
        .gte("applied_at", new Date().toISOString().split("T")[0]);

      return new Response(JSON.stringify({
        total: totalCount || 0,
        applied: appliedCount || 0,
        today: todayCount || 0,
        dailyLimit: GMAIL_DAILY_LIMIT,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const today = new Date().toISOString().split("T")[0];
    const { count: sentToday } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "applied")
      .gte("applied_at", today);

    if ((sentToday || 0) >= GMAIL_DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: "Daily email limit reached. Will resume tomorrow.",
        sentToday,
        limit: GMAIL_DAILY_LIMIT,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 1: Search for REAL jobs with VERIFIED email addresses
    console.log("🔍 Searching for jobs...");
    const targetSkills = (skills || (APPLICANT_SKILLS.length > 0 ? APPLICANT_SKILLS : ["JavaScript", "React", "Python", "WordPress", "AI"])).join(", ");
    const targetJobType = jobType || "Full-time";
    const mode = searchMode || "standard";

    // Build search prompt based on mode
    let modeInstructions = "";
    if (mode === "recent_24h") {
      modeInstructions = `CRITICAL: Only return jobs that have been POSTED WITHIN THE LAST 24 HOURS. These must be fresh listings from job boards, company career pages, or LinkedIn. Prioritize jobs with recent posting dates.`;
    } else if (mode === "sponsorship") {
      modeInstructions = `CRITICAL: Only return companies that are KNOWN TO PROVIDE VISA SPONSORSHIP in the UK. These must be companies on the UK Home Office sponsor register or companies known to sponsor Skilled Worker visas. Include companies like: Accenture, Amazon, Google, Microsoft, Deloitte, PwC, KPMG, EY, TCS, Infosys, Wipro, CGI, Capgemini, and other UK-licensed sponsors.`;
    } else if (mode === "careers_page") {
      modeInstructions = `CRITICAL: Focus on companies that have ACTIVE CAREERS PAGES with current job listings. For each company:
1. Find their actual careers page URL (e.g., careers.company.com or company.com/careers)
2. Look for ANY open position that matches the candidate's skills (${targetSkills})
3. Include the careers page URL in your response
4. Target companies in AR, AI, tech, and digital sectors that are actively hiring
5. The candidate can apply for ANY role that matches their skills, not just exact title matches`;
    }

    const searchPrompt = `You are a UK job market expert. Find 5-8 REAL job openings at REAL companies in ${location || "Manchester, UK"} for: ${targetSkills}.
Job type: ${targetJobType}

${modeInstructions}

ABSOLUTE REQUIREMENTS - FOLLOW STRICTLY:
1. ONLY use companies that ACTUALLY EXIST and are KNOWN UK employers (e.g., BBC, NHS Digital, Booking.com, AO.com, THG/The Hut Group, Autotrader, Boohoo, On The Beach, Peak AI, Manchester Airport Group, Kellogg's, Brother International, Missguided, N Brown Group, Co-op, JD Sports, Bet365, Apadmi, MediaCityUK companies, etc.)
2. The hiring_email MUST be a REAL, VERIFIED company email address tied to that company domain.
3. DO NOT invent, guess, or synthesize email addresses.
4. If a verified hiring email is not publicly known, set hiring_email to an empty string "".
5. The job URL must point to a real careers page (careers.company.com or company.com/careers)
6. DO NOT use fictional companies, startups you made up, or domains that don't exist
7. Include whether the company offers visa sponsorship (sponsorship field: true/false)
8. Include the company's careers page URL if known

VERIFICATION: Before returning each job, mentally verify:
- Is this company real? (Google it)
- Does this domain actually exist? (company website)
- Is this email format what they actually use?

Return JSON with: title, company, location, salary_range, description, url, hiring_manager, hiring_email, sponsorship (boolean), careers_page_url`;

    const searchResponse = await callAIGateway(LOVABLE_API_KEY, {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a job search assistant. Find real job listings matching the criteria. Return structured results." },
        { role: "user", content: searchPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_jobs",
          description: "Return found job listings",
          parameters: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    company: { type: "string" },
                    location: { type: "string" },
                    salary_range: { type: "string" },
                    description: { type: "string" },
                    url: { type: "string" },
                    hiring_manager: { type: "string" },
                    hiring_email: { type: "string" },
                    sponsorship: { type: "boolean" },
                    careers_page_url: { type: "string" },
                  },
                  required: ["title", "company", "location"],
                },
              },
            },
            required: ["jobs"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_jobs" } },
    });

    if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const toolCall = searchData.choices?.[0]?.message?.tool_calls?.[0];
    const jobs = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments).jobs || [] : [];

    console.log(`Found ${jobs.length} jobs`);
    const results: any[] = [];
    let emailsSentThisRun = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      if ((sentToday || 0) + emailsSentThisRun >= GMAIL_DAILY_LIMIT) {
        results.push({ job: job.title, company: job.company, status: "skipped_limit" });
        continue;
      }

      // Check duplicate - limit max 2 applications per company to avoid spam
      const { data: existingByCompany } = await supabase
        .from("job_applications")
        .select("id, job_title")
        .ilike("company", job.company);

      if (existingByCompany && existingByCompany.length >= 2) {
        console.log(`⏭ Skipping ${job.company} — already ${existingByCompany.length} applications`);
        results.push({ job: job.title, company: job.company, status: "company_limit_reached" });
        continue;
      }

      // Also check exact title duplicate
      const exactDupe = existingByCompany?.some(e => 
        e.job_title.toLowerCase().replace(/[^a-z]/g, "") === job.title.toLowerCase().replace(/[^a-z]/g, "")
      );
      if (exactDupe) {
        console.log(`⏭ Skipping exact duplicate: ${job.title} at ${job.company}`);
        results.push({ job: job.title, company: job.company, status: "duplicate_skipped" });
        continue;
      }

      const expectedDomains = getExpectedDomains({ url: job.url, careers_page_url: job.careers_page_url });
      let emailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
      
      // Fallback 1: If AI didn't find a valid email, try self-sustaining email finder
      if (!emailValidation.valid && (job.url || job.careers_page_url)) {
        const jobDomain = extractDomainFromUrl(job.url) || extractDomainFromUrl(job.careers_page_url);
        if (jobDomain) {
          console.log(`🔍 Email finder fallback for ${jobDomain}...`);
          try {
            const finderRes = await fetch(`${SUPABASE_URL}/functions/v1/find-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
              body: JSON.stringify({
                companyDomain: jobDomain,
                companyName: job.company,
                hiringManagerName: job.hiring_manager,
              }),
            });
            if (finderRes.ok) {
              const finderData = await finderRes.json();
              if (finderData.emails?.length > 0) {
                const bestEmail = finderData.emails[0];
                console.log(`  ✅ Found: ${bestEmail.email} (confidence: ${bestEmail.confidence})`);
                job.hiring_email = bestEmail.email;
                job.hiring_manager = bestEmail.name || job.hiring_manager;
                emailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
              }
            }
          } catch (finderErr) {
            console.error("  Email finder error:", finderErr);
          }
        }
      }

      // Fallback 2: If still no email, scrape career/contact pages
      if (!emailValidation.valid && (job.url || job.careers_page_url)) {
        const jobDomain = extractDomainFromUrl(job.url) || extractDomainFromUrl(job.careers_page_url);
        if (jobDomain) {
          console.log(`🌐 Scraping career pages for ${jobDomain}...`);
          try {
            const scrapeRes = await fetch(`${SUPABASE_URL}/functions/v1/scrape-careers`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
              body: JSON.stringify({ companyDomain: jobDomain }),
            });
            if (scrapeRes.ok) {
              const scrapeData = await scrapeRes.json();
              if (scrapeData.emails?.length > 0) {
                console.log(`  ✅ Scraped email: ${scrapeData.emails[0]}`);
                job.hiring_email = scrapeData.emails[0];
                emailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
              }
            }
          } catch (scrapeErr) {
            console.error("  Scrape error:", scrapeErr);
          }
        }
      }

      if (!emailValidation.valid) {
        await supabase.from("job_applications").insert({
          job_title: job.title,
          company: job.company,
          location: job.location,
          salary_range: job.salary_range,
          job_description: job.description,
          job_url: job.url,
          hiring_manager_name: job.hiring_manager,
          hiring_manager_email: null,
          source: "auto_apply",
          status: "no_email",
          sponsorship_available: job.sponsorship || false,
          careers_page_url: job.careers_page_url || null,
          notes: `No email found after AI + scraper + MX validation (${emailValidation.reason || "unknown"})`,
        });

        results.push({ job: job.title, company: job.company, status: "no_email" });
        continue;
      }

      job.hiring_email = emailValidation.normalized;

      // Step: SMTP deliverability verification before proceeding
      let deliverabilityScore = 50; // default if verification unavailable
      try {
        console.log(`🔬 Verifying deliverability: ${job.hiring_email}`);
        const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/email-verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ email: job.hiring_email }),
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          const result = verifyData.results?.[0];
          if (result) {
            deliverabilityScore = result.score;
            console.log(`  📊 Score: ${result.score}/100 (${result.reason}) SMTP: ${result.checks?.smtpRcptTo}`);
            if (result.score < 30) {
              await supabase.from("job_applications").insert({
                job_title: job.title, company: job.company, location: job.location,
                salary_range: job.salary_range, job_description: job.description,
                job_url: job.url, hiring_manager_name: job.hiring_manager,
                hiring_manager_email: job.hiring_email, source: "auto_apply",
                status: "no_email", sponsorship_available: job.sponsorship || false,
                careers_page_url: job.careers_page_url || null,
                notes: `Email failed deliverability check: score ${result.score}/100 (${result.reason})`,
              });
              results.push({ job: job.title, company: job.company, status: "undeliverable", score: result.score });
              continue;
            }
          }
        }
      } catch (verifyErr) {
        console.error("  Verify error (continuing):", verifyErr);
      }

      if (i > 0) {
        console.log("⏳ Human-like delay...");
        await humanDelay();
      }

      if (emailsSentThisRun > 0 && emailsSentThisRun % 10 === 0) {
        console.log("☕ Batch pause (5 min)...");
        await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
      }

      try {
        // Save application
        const { data: saved, error: saveError } = await supabase
          .from("job_applications")
          .insert({
            job_title: job.title, company: job.company, location: job.location,
            salary_range: job.salary_range, job_description: job.description,
            job_url: job.url, hiring_manager_name: job.hiring_manager,
            hiring_manager_email: job.hiring_email, source: "auto_apply", status: "discovered",
            sponsorship_available: job.sponsorship || false,
            careers_page_url: job.careers_page_url || null,
          })
          .select().single();

        if (saveError) throw saveError;
        console.log(`💾 Saved: ${job.title}`);

        // Tailor CV — AI replaces Visuosofts experience with new tailored experience for the target role
        console.log(`📝 Tailoring CV for: ${job.title}`);
        const cvTailorPrompt = `You are an expert CV writer. Take this base CV and tailor it for the target job.

BASE CV:
${FULL_CV_CONTENT}

TARGET JOB: ${job.title} at ${job.company}
JOB DESCRIPTION: ${job.description}

TAILORING INSTRUCTIONS:
1. Keep the same CV structure and format exactly
2. Rewrite the PROFESSIONAL PROFILE to emphasize skills matching the target job
3. In the Visuosofts experience section, re-emphasize and reorder bullet points to highlight the most relevant experience for THIS specific role
4. If the job requires skills the candidate has but aren't prominent, bring them to the top
5. Add a NEW experience entry ABOVE Visuosofts if the job is in a specific domain (e.g., for an AI role, add "AI Solutions Consultant — Freelance" with relevant project highlights from the existing experience)
6. Keep all facts TRUE — only restructure and re-emphasize, don't fabricate experience
7. The tailored CV should be the complete CV text, ready to be formatted as a PDF
8. Also write a personalized cover letter (max 250 words) referencing something specific about the company

Return the complete tailored CV text and cover letter.`;

        const cvResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a professional CV writer. Return tailored CV content maintaining the exact same professional format." },
              { role: "user", content: cvTailorPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_documents",
                description: "Return tailored CV and cover letter",
                parameters: {
                  type: "object",
                  properties: {
                    tailored_cv: { type: "string", description: "Complete tailored CV text" },
                    cover_letter: { type: "string", description: "Personalized cover letter" },
                  },
                  required: ["tailored_cv", "cover_letter"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_documents" } },
          }),
        });

        if (!cvResponse.ok) throw new Error("CV tailoring failed");
        const cvData = await cvResponse.json();
        const cvResult = cvData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
          ? JSON.parse(cvData.choices[0].message.tool_calls[0].function.arguments)
          : { tailored_cv: "", cover_letter: "" };

        await supabase.from("job_applications").update({
          tailored_cv: cvResult.tailored_cv,
          cover_letter: cvResult.cover_letter,
          status: "cv_tailored",
        }).eq("id", saved.id);

        console.log(`✅ CV tailored for: ${job.title}`);

        // Generate professional HTML CV for PDF attachment
        const cvHtml = generateCvHtml(cvResult.tailored_cv, job.title, job.company);

        // Generate email — short professional intro only (CV attached as file)
        console.log(`✉️ Generating email for: ${job.company}`);
        const emailResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You write professional job application emails. The candidate is ${APPLICANT_NAME}, ${APPLICANT_TITLE}${APPLICANT_SUMMARY ? `. ${APPLICANT_SUMMARY}` : ''}.

Write a SHORT, professional email (NOT the CV — the CV will be attached as a PDF separately).
Structure:
1. Address the hiring manager by name
2. State which role you're applying for  
3. 2-3 sentences highlighting your most relevant experience for THIS specific role
4. Mention that your tailored CV is attached
5. Professional sign-off with contact details (${APPLICANT_PHONE}, ${APPLICANT_EMAIL})

Keep it under 150 words. Professional but warm. NOT generic — reference something specific about the company.`,
              },
              {
                role: "user",
                content: `Job: ${job.title} at ${job.company}\nHiring Manager: ${job.hiring_manager || "Hiring Team"}\nDescription: ${job.description}\n\nWrite the email.`,
              },
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

        if (!emailResponse.ok) throw new Error("Email generation failed");
        const emailData = await emailResponse.json();
        const emailResult = emailData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
          ? JSON.parse(emailData.choices[0].message.tool_calls[0].function.arguments)
          : { subject: "", body: "" };

        await supabase.from("job_applications").update({
          email_subject: emailResult.subject,
          email_body: emailResult.body,
        }).eq("id", saved.id);

        // Queue email for review instead of sending directly
        if (job.hiring_email) {
          const expectedDomains = getExpectedDomains({ url: job.url, careers_page_url: job.careers_page_url });
          const finalEmailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
          if (!finalEmailValidation.valid || !finalEmailValidation.normalized) {
            await supabase.from("job_applications").update({
              status: "no_email",
              hiring_manager_email: null,
              notes: `Skipped before send: unverified email (${finalEmailValidation.reason || "unknown_reason"})`,
            }).eq("id", saved.id);
            results.push({ job: job.title, company: job.company, status: "no_email" });
            continue;
          }

          job.hiring_email = finalEmailValidation.normalized;

          // Insert into review queue for approval
          await supabase.from("email_review_queue").insert({
            recipient_email: job.hiring_email,
            recipient_name: job.hiring_manager || null,
            company: job.company,
            email_subject: emailResult.subject,
            email_body: emailResult.body,
            source: "auto_apply",
            application_id: saved.id,
            domain_match: finalEmailValidation.valid,
            validation_status: "pending",
            validation_reason: `${finalEmailValidation.reason || "domain_verified"} | deliverability: ${deliverabilityScore}/100`,
          });

          await supabase.from("job_applications").update({
            status: "queued_for_review",
          }).eq("id", saved.id);

          console.log(`📋 Queued for review: ${job.hiring_email} (${job.company})`);
          results.push({ job: job.title, company: job.company, status: "queued_for_review", email: job.hiring_email });
        } else {
          await supabase.from("job_applications").update({ status: "no_email" }).eq("id", saved.id);
          results.push({ job: job.title, company: job.company, status: "no_email" });
        }

      } catch (err) {
        console.error(`Error processing ${job.title}:`, err);
        results.push({ job: job.title, company: job.company, status: "error", error: String(err) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      emailsSent: emailsSentThisRun,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Pipeline error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
