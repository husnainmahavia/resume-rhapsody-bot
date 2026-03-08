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

// Full CV content from the uploaded DOCX — used as base for tailoring
const FULL_CV_CONTENT = `HUSNAIN MAHAVIA
+44 7387 055617 • husnainmahavia.1@gmail.com • Manchester, United Kingdom
Full-Stack Developer | WordPress & AI Integration Specialist | Tech Lead

PROFESSIONAL PROFILE
Results-driven full-stack developer with 8+ years of hands-on expertise in custom WordPress development, AI/ML integration, and automation systems. Specialized in architecting and deploying AI-powered solutions alongside high-performance websites, with proven ability to integrate cutting-edge LLM technologies (ChatGPT, Gemini) into production environments. Expert in building sophisticated API integrations, custom lead management systems, and AI-driven automation pipelines for international clients across luxury hospitality, travel, and SaaS sectors. Experienced technical leader who has scaled operations from solo developer to managing cross-functional teams while maintaining code quality, security standards, and customer satisfaction.

CORE TECHNICAL COMPETENCIES
• WordPress & Web Development: Expert HTML5/CSS3, Custom WordPress theme development & customization, Landing page implementation, Responsive/mobile-first design, Cross-browser compatibility, 50+ custom WordPress sites
• AI Automation & LLM Integration: ChatGPT, Gemini, MidJourney, Jasper integration, Machine learning model development & deployment, AI-powered content generation, Automated lead scoring, AI-driven campaign analysis, LLM-based automation workflows, Prompt engineering & optimization
• API Integration & Custom Solutions: RESTful API design & integration, CRM integrations (HubSpot, Salesforce), Third-party API connectors, Webhook configuration, Custom backend development, Database optimization
• Programming Languages: Advanced HTML5/CSS3, JavaScript (jQuery, ES6+), PHP (WordPress, custom functions), Python (ML, automation scripts), SQL (MySQL), JSON/AJAX
• CRM & Marketing Automation: Lead management systems, Form builder implementation, CRM integration & automation, Lead scoring algorithms, Automated email workflows, Conversion tracking
• Performance & Security: Core Web Vitals optimization (90+ scores), Page speed optimization, Security hardening, SSL certificates, GDPR compliance
• Hosting & Infrastructure: cPanel/WHM administration, Linux server management, DNS configuration, Website migrations, Backup systems, CDN setup

PROFESSIONAL EXPERIENCE

Lead Full-Stack Developer & AI Integration Specialist
Visuosofts — Remote (International Clients) | January 2017 – August 2025

Led comprehensive web development and AI integration operations for digital agency serving international clients across luxury hospitality, travel, real estate, and SaaS sectors.

WordPress Development & Custom Web Solutions:
• Developed and maintained 50+ custom WordPress websites from scratch, including advanced theme customization, child theme development, and bespoke functionality
• Built 15+ e-commerce platforms using WordPress/WooCommerce and Shopify, achieving 25% revenue growth
• Created responsive, mobile-first designs with Core Web Vitals 90+ scores consistently
• Developed custom WordPress plugins and integrated third-party APIs

AI Automation & LLM Integration:
• Coordinated integration of multiple AI/LLM technologies (ChatGPT, Gemini, MidJourney, Jasper, Veo 3) into production environments
• Developed and deployed ML models for lead scoring, predictive analytics — 900%+ traffic growth, 50% average client growth
• Built AI-powered automation pipelines reducing manual processing time by 60%
• Implemented advanced prompt engineering strategies for business use cases

API Integration & Custom Backend:
• Designed sophisticated API integrations connecting WordPress with CRM platforms (HubSpot, Salesforce) using REST APIs and webhooks
• Built custom lead management system improving lead-to-customer conversion by 15%
• Configured Google Tag Manager with comprehensive tracking (UTM, GCLID, FBCLID)

Technical Leadership:
• Scaled technical operations from solo developer to leading team of 10+ engineers
• Managed complete project lifecycle for 50+ international projects
• Achieved 50% YoY revenue growth

Market Research Interviewer (Part-time)
NatCen Social Research — United Kingdom | October 2025 – Present
• GDPR-certified data handling, Professional safeguarding training, Advanced fieldwork protocols

TECHNICAL SKILLS SUMMARY
• WordPress & CMS: WordPress (Expert), Custom Themes, WooCommerce, Elementor, ACF, Multisite, REST API
• Web Technologies: HTML5/CSS3 (Flexbox, Grid), JavaScript (ES6+, jQuery), Responsive Design, Web Accessibility
• Programming: PHP, Python (ML, automation), SQL (MySQL), JSON/AJAX, Node.js
• AI/ML: ChatGPT API, Google Gemini, OpenAI, MidJourney, Jasper, ML models, Prompt engineering
• API & Integrations: REST APIs, CRM (HubSpot, Salesforce), Webhooks, Custom data pipelines
• Tracking: Google Tag Manager, GA4, UTM, Facebook Pixel, TikTok Pixel
• Tools: VS Code, Git/GitHub, Chrome DevTools, npm/Node.js, cPanel/WHM

EDUCATION
BSc Software Engineering — COMSATS University, Islamabad (January 2016 – May 2020)

CERTIFICATIONS
• AI & LLM Integration (ChatGPT, Gemini, Prompt Engineering) — 2024-2025
• Generative AI Content Creation & Automation — 2024
• Advanced WordPress Development — 2017-2025
• ML & Data Analysis for Business — 2023-2024
• Google Analytics IQ — 2023
• HubSpot Inbound Marketing — 2023
• ISDP GDPR Compliance — 2025
• Advanced AR Development Unity 3D — 2018

LANGUAGES: English (Fluent), Urdu (Native), Italian (Basic)
Work Authorization: UK citizen, eligible to work in UK and EU`;

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
    <p class="name">HUSNAIN MAHAVIA</p>
    <p class="contact">+44 7387 055617 • husnainmahavia.1@gmail.com • Manchester, United Kingdom</p>
    <p class="title">Full-Stack Developer | WordPress & AI Integration Specialist | Tech Lead</p>
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
    const senderEmail = "husnainmahavia.1@gmail.com";
    const senderName = "Husnain Mahavia";

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
    const targetSkills = (skills || ["JavaScript", "React", "Python", "WordPress", "AI"]).join(", ");
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

    const searchResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a UK recruitment specialist. Only return REAL companies with VERIFIED contact emails. Return valid JSON only." },
          { role: "user", content: searchPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_jobs",
            description: "Return real job listings",
            parameters: {
              type: "object",
              properties: {
                jobs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" }, company: { type: "string" },
                      location: { type: "string" }, salary_range: { type: "string" },
                      description: { type: "string" }, url: { type: "string" },
                      hiring_manager: { type: "string" }, hiring_email: { type: "string" },
                      sponsorship: { type: "boolean" }, careers_page_url: { type: "string" },
                    },
                    required: ["title", "company", "location", "description", "hiring_email"],
                  },
                },
              },
              required: ["jobs"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_jobs" } },
      }),
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

      // Check duplicate
      const { data: existing } = await supabase
        .from("job_applications")
        .select("id")
        .ilike("job_title", job.title)
        .ilike("company", job.company)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`⏭ Skipping duplicate: ${job.title} at ${job.company}`);
        results.push({ job: job.title, company: job.company, status: "duplicate_skipped" });
        continue;
      }

      const expectedDomains = getExpectedDomains({ url: job.url, careers_page_url: job.careers_page_url });
      const emailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
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
          notes: `Skipped unverified email (${emailValidation.reason || "unknown_reason"})`,
        });

        results.push({ job: job.title, company: job.company, status: "no_email" });
        continue;
      }

      job.hiring_email = emailValidation.normalized;

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
                content: `You write professional job application emails. The candidate is Husnain Mahavia, a Full-Stack Developer with 8+ years experience, 150+ projects, based in Manchester UK.

Write a SHORT, professional email (NOT the CV — the CV will be attached as a PDF separately).
Structure:
1. Address the hiring manager by name
2. State which role you're applying for  
3. 2-3 sentences highlighting your most relevant experience for THIS specific role
4. Mention that your tailored CV is attached
5. Professional sign-off with contact details (+44 7387 055617, husnainmahavia.1@gmail.com)

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

        // Send email with CV attached and tracking pixel
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
          console.log(`🚀 Sending to: ${job.hiring_email}`);

          // Create tracking record with pixel
          const { data: trackingRecord } = await supabase
            .from("email_tracking")
            .insert({ application_id: saved.id })
            .select()
            .single();

          const trackingPixelUrl = trackingRecord
            ? `${SUPABASE_URL}/functions/v1/email-track?id=${trackingRecord.tracking_pixel_id}`
            : "";

          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: senderEmail, pass: GMAIL_APP_PASSWORD },
          });

          const htmlBody = emailResult.body.replace(/\n/g, "<br>");
          const trackingPixel = trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />` : "";

          const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, "_");
          const cvFilename = `Husnain_Mahavia_CV_${safeCompany}.html`;

          await transporter.sendMail({
            from: `${senderName} <${senderEmail}>`,
            to: job.hiring_email,
            subject: emailResult.subject,
            text: emailResult.body,
            html: `<div style="font-family: 'Calibri', Arial, sans-serif; line-height: 1.6; max-width: 600px; color: #1a1a1a;">${htmlBody}${trackingPixel}</div>`,
            attachments: [
              {
                filename: cvFilename,
                content: cvHtml,
                contentType: "text/html",
              },
              {
                filename: `Cover_Letter_${safeCompany}.txt`,
                content: cvResult.cover_letter,
                contentType: "text/plain",
              },
            ],
          });

          await supabase.from("job_applications").update({
            status: "applied",
            applied_at: new Date().toISOString(),
            follow_up_scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          }).eq("id", saved.id);

          emailsSentThisRun++;
          console.log(`✅ Email SENT with CV + tracking to ${job.hiring_email} (${emailsSentThisRun} this run)`);
          results.push({ job: job.title, company: job.company, status: "applied", email: job.hiring_email });
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
