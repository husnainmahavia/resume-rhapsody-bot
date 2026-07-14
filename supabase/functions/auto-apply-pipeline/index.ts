import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_DAILY_LIMIT = 80;
const MIN_DELAY_MS = 45000;
const MAX_DELAY_MS = 120000;
const BATCH_PAUSE_MS = 300000;
const DISCOVERY_RETRY_ATTEMPTS = 4;
const DISCOVERY_RETRY_BASE_MS = 15000;
const MAX_EMPTY_BATCHES = 8;

const FALLBACK_JOBS = [
  {
    title: "Full Stack Developer",
    company: "NHS Digital",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £60,000",
    description: "Build accessible healthcare web services with React, TypeScript, APIs, testing, and secure cloud delivery. Strong fit for full-stack engineering, public-sector data handling, and automation experience.",
    url: "https://digital.nhs.uk/careers",
    careers_page_url: "https://digital.nhs.uk/careers",
    hiring_manager: "Hiring Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Frontend Engineer",
    company: "Auto Trader UK",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £70,000",
    description: "Work on high-traffic marketplace interfaces using modern JavaScript, React, experimentation, analytics, and performance optimisation.",
    url: "https://careers.autotrader.co.uk",
    careers_page_url: "https://careers.autotrader.co.uk",
    hiring_manager: "Talent Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "AI Automation Developer",
    company: "Peak AI",
    location: "Manchester, UK",
    salary_range: "£50,000 - £75,000",
    description: "Develop AI workflow tooling, API integrations, data pipelines, and production automation for business users. Relevant skills include Python, prompt engineering, LLM integration, and full-stack delivery.",
    url: "https://peak.ai/careers",
    careers_page_url: "https://peak.ai/careers",
    hiring_manager: "People Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "WordPress / Web Developer",
    company: "Apadmi",
    location: "Salford, UK / Hybrid",
    salary_range: "£35,000 - £55,000",
    description: "Deliver responsive web products, integrations, and campaign platforms for client projects. Strong fit for WordPress, PHP, JavaScript, CRM integrations, and client-facing delivery.",
    url: "https://www.apadmi.com/careers/",
    careers_page_url: "https://www.apadmi.com/careers/",
    hiring_manager: "Recruitment Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Software Engineer",
    company: "BJSS",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £70,000",
    description: "Deliver production software for public and private sector clients using TypeScript, React, cloud services, APIs, testing, and agile delivery.",
    url: "https://www.bjss.com/careers/",
    careers_page_url: "https://www.bjss.com/careers/",
    hiring_manager: "Talent Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Full Stack Engineer",
    company: "AND Digital",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £65,000",
    description: "Build digital products across frontend, backend, cloud, and data workflows for client teams, with strong emphasis on React, TypeScript, APIs, and consulting delivery.",
    url: "https://www.and.digital/careers/",
    careers_page_url: "https://www.and.digital/careers/",
    hiring_manager: "People Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Frontend Developer",
    company: "Made Tech",
    location: "UK Remote / Manchester",
    salary_range: "£45,000 - £70,000",
    description: "Create accessible public-sector digital services with modern frontend tooling, TypeScript, cloud deployment, testing, and user-centred delivery.",
    url: "https://www.madetech.com/careers/",
    careers_page_url: "https://www.madetech.com/careers/",
    hiring_manager: "Recruitment Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "React Developer",
    company: "Softwire",
    location: "Manchester, UK / Hybrid",
    salary_range: "£40,000 - £65,000",
    description: "Develop high-quality web applications, integrations, and data-led products using React, TypeScript, backend APIs, and agile engineering practices.",
    url: "https://www.softwire.com/careers/",
    careers_page_url: "https://www.softwire.com/careers/",
    hiring_manager: "Hiring Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "AI Solutions Developer",
    company: "Kainos",
    location: "UK Remote / Manchester",
    salary_range: "£50,000 - £80,000",
    description: "Work on intelligent automation and cloud software projects involving APIs, data workflows, AI-assisted tooling, testing, and product delivery.",
    url: "https://www.kainos.com/careers/",
    careers_page_url: "https://www.kainos.com/careers/",
    hiring_manager: "Talent Acquisition",
    hiring_email: "",
    sponsorship: true,
  },
  {
    title: "Software Developer",
    company: "Equal Experts",
    location: "UK Remote / Manchester",
    salary_range: "£55,000 - £85,000",
    description: "Build reliable digital platforms with modern engineering practices, full-stack delivery, cloud-native APIs, automated testing, and client collaboration.",
    url: "https://www.equalexperts.com/careers/",
    careers_page_url: "https://www.equalexperts.com/careers/",
    hiring_manager: "Recruitment Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Digital Consultant Developer",
    company: "Thoughtworks",
    location: "Manchester, UK / Hybrid",
    salary_range: "£55,000 - £85,000",
    description: "Consult on product engineering, modern web platforms, cloud services, and AI-enabled delivery across complex client environments.",
    url: "https://www.thoughtworks.com/careers/jobs",
    careers_page_url: "https://www.thoughtworks.com/careers/jobs",
    hiring_manager: "Talent Team",
    hiring_email: "",
    sponsorship: true,
  },
  {
    title: "Full Stack Developer",
    company: "Zuhlke",
    location: "Manchester, UK / Hybrid",
    salary_range: "£50,000 - £78,000",
    description: "Create secure, scalable digital products with React, TypeScript, backend APIs, cloud deployment, and high-quality engineering methods.",
    url: "https://www.zuehlke.com/en/careers",
    careers_page_url: "https://www.zuehlke.com/en/careers",
    hiring_manager: "People Team",
    hiring_email: "",
    sponsorship: true,
  },
  {
    title: "Web Applications Developer",
    company: "Sage",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £70,000",
    description: "Build business software experiences, integrations, dashboards, and automation features using frontend engineering, APIs, analytics, and cloud services.",
    url: "https://www.sage.com/en-gb/company/careers/",
    careers_page_url: "https://www.sage.com/en-gb/company/careers/",
    hiring_manager: "Careers Team",
    hiring_email: "",
    sponsorship: false,
  },
  {
    title: "Frontend Software Engineer",
    company: "Roku",
    location: "Manchester, UK",
    salary_range: "£50,000 - £80,000",
    description: "Develop consumer-facing interfaces and platform tooling with JavaScript, TypeScript, performance optimisation, experimentation, and product analytics.",
    url: "https://www.weareroku.com/jobs",
    careers_page_url: "https://www.weareroku.com/jobs",
    hiring_manager: "Recruiting Team",
    hiring_email: "",
    sponsorship: true,
  },
  {
    title: "Software Engineer - Web Platforms",
    company: "Arm",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £75,000",
    description: "Build developer-facing web tools, platform services, and internal applications with modern JavaScript, APIs, cloud systems, and quality engineering.",
    url: "https://careers.arm.com/",
    careers_page_url: "https://careers.arm.com/",
    hiring_manager: "Talent Acquisition",
    hiring_email: "",
    sponsorship: true,
  },
];

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
]);

function humanDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((r) => setTimeout(r, ms));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class AICreditsError extends Error {
  status: number;
  constructor(status: number, msg?: string) {
    super(msg || "AI request failed");
    this.name = "AICreditsError";
    this.status = status;
  }
}

// Throttle: wait between AI calls to stay under rate limits
let lastAICallTime = 0;
const AI_CALL_INTERVAL_MS = 15000; // 15s between AI calls for free-tier safety

async function throttleAI(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastAICallTime;
  if (elapsed < AI_CALL_INTERVAL_MS) {
    const waitMs = AI_CALL_INTERVAL_MS - elapsed;
    console.log(`⏱ Throttling AI call: waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  lastAICallTime = Date.now();
}

// Parse JSON from free model responses (handles markdown fences, thinking tags, etc.)
function parseAIJson(content: string): any {
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object or array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* ignore */ }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

function sanitizeEmailText(text: string): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\[.*?\]/g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/(placeholder|replace this|insert .*link)/i.test(trimmed)) return false;
      if (/(calendly|calendar link|booking link|schedule link)/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

function comparable(value?: string | null): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getFallbackJobs(location?: string, limit = 8, excludedCompanies = new Set<string>()) {
  const fresh = FALLBACK_JOBS.filter((job) => !excludedCompanies.has(comparable(job.company)));
  const pool = fresh.length ? fresh : FALLBACK_JOBS;
  return pool.slice(0, limit).map((job) => ({
    ...job,
    location: location || job.location,
  }));
}

function fallbackTailoredCv(job: any): { tailored_cv: string; cover_letter: string } {
  const skills = APPLICANT_SKILLS.length ? APPLICANT_SKILLS.slice(0, 12).join(", ") : "React, TypeScript, WordPress, Python, APIs, AI automation";
  return {
    tailored_cv: `${APPLICANT_NAME}\n${APPLICANT_PHONE} • ${APPLICANT_EMAIL} • ${APPLICANT_LOCATION}\n${APPLICANT_TITLE}\n\nPROFESSIONAL PROFILE\n${APPLICANT_SUMMARY || "Full-stack developer with 8+ years across web platforms, AI automation, AR, APIs, WordPress, and client-facing delivery."}\n\nTARGET ROLE ALIGNMENT\nRole: ${job.title} at ${job.company}\nRelevant focus: ${skills}.\n\nCORE SKILLS\n${skills}\n\nEXPERIENCE HIGHLIGHTS\n• Delivered 50+ websites and 15+ e-commerce platforms with strong frontend/backend integration.\n• Built AI-powered automation and API workflows using modern JavaScript, Python, and LLM tooling.\n• Led Visuosofts from 2017 to 2025, scaling delivery across web, AR, and digital products.\n• Managed client communication, technical delivery, analytics, performance, and secure hosting.\n\nEDUCATION\nBSc Software Engineering — COMSATS University (2016-2020)`,
    cover_letter: `Dear Hiring Team,\n\nI am interested in the ${job.title} role at ${job.company}. I bring 8+ years of hands-on full-stack delivery across React, TypeScript, WordPress, APIs, Python, AI automation, analytics, and client-facing implementation.\n\nAt Visuosofts, I led 50+ website builds, 15+ e-commerce projects, and automation systems for international clients, combining technical execution with practical business results. I would welcome the opportunity to bring that delivery mindset to ${job.company}.\n\nKind regards,\n${APPLICANT_NAME}`,
  };
}

function fallbackEmail(job: any): { subject: string; body: string } {
  return {
    subject: `Application for ${job.title}`,
    body: `Dear ${job.hiring_manager || "Hiring Team"},\n\nI am applying for the ${job.title} role at ${job.company}. I bring 8+ years of full-stack development experience across React, TypeScript, WordPress, APIs, Python, AI automation, analytics, and client-facing delivery.\n\nAt Visuosofts, I led delivery of 50+ websites, 15+ e-commerce platforms, and automation projects for international clients. I have attached my CV for review and would welcome the opportunity to discuss how my experience fits your team.\n\nKind regards,\n${APPLICANT_NAME}\n${APPLICANT_PHONE}\n${APPLICANT_EMAIL}`,
  };
}

async function seedFreshDiscoveredJobs(
  supabase: any,
  location?: string,
): Promise<{ inserted: number; jobs: any[] }> {
  const { data: existingApplications } = await supabase
    .from("job_applications")
    .select("company, job_title");

  const existingCompanyCounts = new Map<string, number>();
  const existingExactJobs = new Set<string>();
  for (const app of existingApplications || []) {
    const companyKey = comparable((app as any).company);
    const titleKey = comparable((app as any).job_title);
    if (!companyKey) continue;
    existingCompanyCounts.set(companyKey, (existingCompanyCounts.get(companyKey) || 0) + 1);
    if (titleKey) existingExactJobs.add(`${companyKey}:${titleKey}`);
  }

  const saturatedCompanies = new Set(
    [...existingCompanyCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([company]) => company),
  );

  const seedJobs = getFallbackJobs(location, 5, saturatedCompanies).filter((job) => {
    const companyKey = comparable(job.company);
    const titleKey = comparable(job.title);
    return companyKey && titleKey && !existingExactJobs.has(`${companyKey}:${titleKey}`);
  });

  if (!seedJobs.length) return { inserted: 0, jobs: [] };

  const rows = seedJobs.map((job) => ({
    job_title: job.title,
    company: job.company,
    location: job.location,
    salary_range: job.salary_range,
    job_description: job.description,
    job_url: job.url,
    hiring_manager_name: job.hiring_manager,
    hiring_manager_email: null,
    source: "auto_apply",
    status: "discovered",
    pending_review: true,
    sponsorship_available: job.sponsorship || false,
    careers_page_url: job.careers_page_url || null,
    notes: "Fast-discovered at pipeline start. Email/CV can be prepared from the review queue.",
  }));

  const { data, error } = await supabase
    .from("job_applications")
    .insert(rows)
    .select("id, job_title, company");

  if (error) {
    console.error("Fast discovery insert failed:", error);
    return { inserted: 0, jobs: [] };
  }

  console.log(`⚡ Fast discovery saved ${data?.length || 0} fresh jobs before background processing.`);
  return { inserted: data?.length || 0, jobs: data || [] };
}

async function callFreeGemini(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  // Strip tool_choice and tools — not supported on free models
  const { tools, tool_choice, ...cleanBody } = body as any;
  
  for (let attempt = 0; attempt < DISCOVERY_RETRY_ATTEMPTS; attempt++) {
    await throttleAI();
    const resp = await callGemini(apiKey, {
      ...cleanBody,
      max_tokens: 3000,
      timeout_ms: 18000,
      max_model_attempts: 2,
      max_lovable_attempts: 1,
    });
    
    if (resp.status === 429 || resp.status === 503) {
      const waitMs = DISCOVERY_RETRY_BASE_MS * (attempt + 1) + Math.random() * 5000;
      console.log(`⚠️ ${resp.status === 429 ? 'Rate limited' : 'Server overloaded'} (attempt ${attempt + 1}/${DISCOVERY_RETRY_ATTEMPTS}), waiting ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      continue;
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new AICreditsError(resp.status, `Gemini API error (${resp.status}): ${errText.slice(0, 200)}`);
    }
    return resp;
  }
  throw new AICreditsError(429, "AI providers are busy. Using deterministic fallback where possible.");
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
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
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
      const { data: stateRow } = await supabase.from("auto_apply_pipeline_state").select("*").eq("id", 1).maybeSingle();
      const startedAtMs = stateRow?.started_at ? new Date(stateRow.started_at).getTime() : 0;
      const stuckAtStart = Boolean(
        stateRow?.running &&
        stateRow?.last_log === "Pipeline started" &&
        startedAtMs &&
        Date.now() - startedAtMs > 3 * 60 * 1000
      );
      if (stuckAtStart) {
        await supabase.from("auto_apply_pipeline_state").update({
          running: false,
          finished_at: new Date().toISOString(),
          last_log: "Previous start did not continue; ready to restart",
        }).eq("id", 1);
      }

      return new Response(JSON.stringify({
        total: totalCount || 0,
        applied: appliedCount || 0,
        today: todayCount || 0,
        dailyLimit: GMAIL_DAILY_LIMIT,
        running: stuckAtStart ? false : (stateRow?.running ?? false),
        startedAt: stateRow?.started_at ?? null,
        finishedAt: stateRow?.finished_at ?? null,
        lastLog: stuckAtStart ? "Previous start did not continue; ready to restart" : (stateRow?.last_log ?? null),
        updatedAt: stateRow?.updated_at ?? null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: currentState } = await supabase
      .from("auto_apply_pipeline_state")
      .select("running, started_at, last_log, location, updated_at")
      .eq("id", 1)
      .maybeSingle();

    const currentStartedMs = currentState?.started_at ? new Date(currentState.started_at).getTime() : 0;
    const currentUpdatedMs = currentState?.updated_at ? new Date(currentState.updated_at).getTime() : currentStartedMs;
    const currentStuckAtStart = Boolean(
      currentState?.running &&
      currentState?.last_log === "Pipeline started" &&
      currentStartedMs &&
      Date.now() - currentStartedMs > 3 * 60 * 1000
    );
    const isResume = action === "resume";
    // A pipeline that hasn't updated its heartbeat in >90s is considered dead
    // (edge isolate got reaped). Any invocation — resume OR fresh run — is
    // allowed to take over so a crash never leaves the pipeline permanently stuck.
    const staleRunningState = Boolean(
      currentState?.running &&
      currentUpdatedMs &&
      Date.now() - currentUpdatedMs > 90 * 1000
    );
    const effectiveLocation = location || currentState?.location || APPLICANT_LOCATION || "Manchester, UK";

    if (isResume && !currentState?.running) {
      // Resume triggered by cron/watchdog but nothing to resume — silently ok.
      return new Response(JSON.stringify({
        success: true,
        accepted: false,
        message: "Auto-apply is idle; nothing to resume.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (currentState?.running && !currentStuckAtStart && !staleRunningState) {
      return new Response(JSON.stringify({
        success: true,
        accepted: true,
        alreadyRunning: true,
        message: "Auto-apply is already running in the background.",
      }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark pipeline as running BEFORE any discovery work so status returns
    // running=true immediately and survives tab switches/refreshes.
    try {
      await supabase.from("auto_apply_pipeline_state").upsert({
        id: 1,
        running: true,
        started_at: new Date().toISOString(),
        finished_at: null,
        last_log: isResume ? "Pipeline resumed by background worker" : "Pipeline started",
        location: effectiveLocation,
      }, { onConflict: "id" });
    } catch (_) { /* ignore */ }

    let fastDiscovery = { inserted: 0, jobs: [] as any[] };
    try {
      fastDiscovery = await seedFreshDiscoveredJobs(supabase, effectiveLocation);
    } catch (seedErr) {
      console.warn("Fast discovery skipped:", seedErr);
    }

    // Long-running work runs in the background so we return before the 150s
    // edge idle timeout. Client should poll `?action=status` for progress.
    const runStartedAt = Date.now();
    const HANDOFF_MS = 25_000; // 25s — hand off well before edge isolate can be reaped mid-work
    let handoffScheduled = false;
    const scheduleHandoff = async (reason: string) => {
      if (handoffScheduled) return;
      handoffScheduled = true;
      try {
        const url = `${SUPABASE_URL}/functions/v1/auto-apply-pipeline`;
        // Fire-and-forget; a new isolate will pick up the `resume` action.
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ action: "resume" }),
        }).catch((e) => console.warn("handoff fetch failed:", e));
        console.log(`🔁 Handoff scheduled (${reason})`);
      } catch (e) {
        console.warn("handoff error:", e);
      }
    };
    const runPipeline = async () => {
      let emailsSentThisRun = 0;
     try {
    const today = new Date().toISOString().split("T")[0];
    const { count: sentToday } = await supabase
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "applied")
      .gte("applied_at", today);

    if ((sentToday || 0) >= GMAIL_DAILY_LIMIT) {
      console.log(`⛔ Daily limit reached (${sentToday}/${GMAIL_DAILY_LIMIT}) — background run aborting.`);
       return;
    }


    const { data: existingApplications } = await supabase
      .from("job_applications")
      .select("company, job_title");

    const existingCompanyCounts = new Map<string, number>();
    const existingExactJobs = new Set<string>();
    for (const app of existingApplications || []) {
      const companyKey = comparable((app as any).company);
      const titleKey = comparable((app as any).job_title);
      if (!companyKey) continue;
      existingCompanyCounts.set(companyKey, (existingCompanyCounts.get(companyKey) || 0) + 1);
      if (titleKey) existingExactJobs.add(`${companyKey}:${titleKey}`);
    }
    const saturatedCompanies = new Set(
      [...existingCompanyCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([company]) => company),
    );

    // Step 1: Search for REAL jobs with VERIFIED email addresses
    console.log("🔍 Starting continuous discovery + apply loop...");
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

    const results: any[] = [];
    let iteration = 0;
    let emptyBatches = 0;
    const MAX_ITERATIONS = 20;
    let consecutiveSearchFailures = 0;

    // Continuous loop: keep discovering + applying until daily limit reached
    // or no fresh jobs found across several attempts.
    while (
      (sentToday || 0) + emailsSentThisRun < GMAIL_DAILY_LIMIT &&
      iteration < MAX_ITERATIONS &&
      emptyBatches < MAX_EMPTY_BATCHES
    ) {
      if (Date.now() - runStartedAt > HANDOFF_MS) {
        console.log(`⏭ Wall-time approaching; handing off to fresh isolate.`);
        await supabase.from("auto_apply_pipeline_state").update({
          running: true,
          last_log: `Handing off to fresh worker to continue (iteration ${iteration})`,
        }).eq("id", 1);
        await scheduleHandoff("wall-time");
        return; // finally block will NOT set running=false because handoffScheduled=true
      }
      iteration++;
      console.log(`🔁 Discovery iteration ${iteration} — sent so far this run: ${emailsSentThisRun}`);
      await supabase.from("auto_apply_pipeline_state").update({
        running: true,
        last_log: `Searching jobs — iteration ${iteration}/${MAX_ITERATIONS}`,
      }).eq("id", 1);

      const excludedCompanyNames = [...new Set((existingApplications || []).map((app: any) => app.company).filter(Boolean))].slice(0, 60);

      const searchPrompt = `You are a UK job market expert. Find 10-15 REAL job openings at REAL companies in ${effectiveLocation || "Manchester, UK"} for: ${targetSkills}.
Job type: ${targetJobType}

${modeInstructions}

EXCLUDE THESE COMPANIES BECAUSE THEY ARE ALREADY IN THE DATABASE:
${excludedCompanyNames.length ? excludedCompanyNames.join(", ") : "None"}

ABSOLUTE REQUIREMENTS - FOLLOW STRICTLY:
1. ONLY use companies that ACTUALLY EXIST and are KNOWN UK employers.
2. The hiring_email MUST be a REAL, VERIFIED company email address tied to that company domain.
3. DO NOT invent, guess, or synthesize email addresses.
4. If a verified hiring email is not publicly known, set hiring_email to an empty string "".
5. The job URL must point to a real careers page (careers.company.com or company.com/careers)
6. DO NOT use fictional companies or made-up domains
7. Include whether the company offers visa sponsorship (sponsorship field: true/false)
8. Include the company's careers page URL if known

Return JSON with: title, company, location, salary_range, description, url, hiring_manager, hiring_email, sponsorship (boolean), careers_page_url`;

      let jobs: any[] = [];
      let discoveryFailed = false;
      let lastDiscoveryError = "";
      try {
        const searchResponse = await callFreeGemini(OPENROUTER_API_KEY, {
          messages: [
            { role: "system", content: "You are a job search API. Return ONLY a JSON object with a 'jobs' array. No markdown, no code fences, no thinking, no explanation." },
            { role: "user", content: searchPrompt },
          ],
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const content = searchData.choices?.[0]?.message?.content || "";
          const parsed = parseAIJson(content);
          jobs = Array.isArray(parsed) ? parsed : (parsed?.jobs || []);
        }
      } catch (searchErr) {
        discoveryFailed = true;
        lastDiscoveryError = errorMessage(searchErr);
        consecutiveSearchFailures++;
        console.warn(`AI search failed on iteration ${iteration}:`, searchErr);
      }

      if (discoveryFailed && consecutiveSearchFailures < DISCOVERY_RETRY_ATTEMPTS) {
        const waitMs = 60000 + consecutiveSearchFailures * 30000;
        await supabase.from("auto_apply_pipeline_state").update({
          running: true,
          last_log: `Job search temporarily failed; retrying in ${Math.round(waitMs / 1000)}s (${lastDiscoveryError.slice(0, 120)})`,
        }).eq("id", 1);
        await sleep(waitMs);
      } else if (!discoveryFailed) {
        consecutiveSearchFailures = 0;
      }

      jobs = jobs.filter((job) => {
        const companyKey = comparable(job.company);
        const titleKey = comparable(job.title);
        if (!companyKey || !titleKey) return false;
        if (saturatedCompanies.has(companyKey)) return false;
        if (existingExactJobs.has(`${companyKey}:${titleKey}`)) return false;
        return true;
      });

      if (!jobs.length) {
        jobs = getFallbackJobs(effectiveLocation, 8, saturatedCompanies).filter((job) => {
          const companyKey = comparable(job.company);
          const titleKey = comparable(job.title);
          return !existingExactJobs.has(`${companyKey}:${titleKey}`);
        });
        if (jobs.length) console.log(`Using fallback jobs on iteration ${iteration} (${jobs.length})`);
      }

      if (!jobs.length) {
        emptyBatches++;
        console.log(`⚠️ Iteration ${iteration} found no fresh jobs (empty batch ${emptyBatches}/${MAX_EMPTY_BATCHES}).`);
        await supabase.from("auto_apply_pipeline_state").update({
          running: true,
          last_log: `No fresh jobs found yet (${emptyBatches}/${MAX_EMPTY_BATCHES}); continuing search`,
        }).eq("id", 1);
        continue;
      }
      emptyBatches = 0;

      console.log(`Found ${jobs.length} jobs in iteration ${iteration}`);
      await supabase.from("auto_apply_pipeline_state").update({
        running: true,
        last_log: `Found ${jobs.length} jobs; preparing review items`,
      }).eq("id", 1);


    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      if ((sentToday || 0) + emailsSentThisRun >= GMAIL_DAILY_LIMIT) {
        results.push({ job: job.title, company: job.company, status: "skipped_limit" });
        continue;
      }

      const companyKey = comparable(job.company);
      const titleKey = comparable(job.title);
      const knownCompanyCount = existingCompanyCounts.get(companyKey) || 0;

      // Check duplicate - limit max 2 applications per company to avoid spam
      if (knownCompanyCount >= 2) {
        console.log(`⏭ Skipping ${job.company} — already ${knownCompanyCount} applications`);
        results.push({ job: job.title, company: job.company, status: "company_limit_reached" });
        continue;
      }

      // Also check exact title duplicate
      if (existingExactJobs.has(`${companyKey}:${titleKey}`)) {
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
              const REAL_EMAIL_SOURCES = new Set(["mailto", "json-ld", "scrape", "smtp_verified"]);
              const bestEmail = (finderData.emails || []).find((e: any) => e.confidence >= 70 || REAL_EMAIL_SOURCES.has(e.source));
              if (bestEmail) {
                console.log(`  ✅ Found verified email: ${bestEmail.email} (confidence: ${bestEmail.confidence}, source: ${bestEmail.source})`);
                job.hiring_email = bestEmail.email;
                job.hiring_manager = bestEmail.name || job.hiring_manager;
                emailValidation = validateHiringEmail(job.hiring_email, expectedDomains);
              } else if (finderData.emails?.length > 0) {
                console.log(`  ⏭ Skipped low-confidence email (${finderData.emails[0].email}, conf ${finderData.emails[0].confidence}) — falling through`);
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

        existingCompanyCounts.set(companyKey, knownCompanyCount + 1);
        existingExactJobs.add(`${companyKey}:${titleKey}`);

        results.push({ job: job.title, company: job.company, status: "no_email" });
        continue;
      }

      job.hiring_email = emailValidation.normalized;

      // Step: SMTP deliverability verification before proceeding (same rules as Email Engine)
      let deliverabilityScore = 50; // default if verification unavailable
      let hardBlock = false;
      let hardBlockReason = "";
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
            deliverabilityScore = result.score ?? deliverabilityScore;
            const reason = result.reason || "";
            console.log(`  📊 Score: ${result.score}/100 (${reason}) MX: ${result.checks?.mxRecords} SMTP: ${result.checks?.smtpRcptTo}`);

            // Hard block: high-confidence bad addresses (matches email-engine rules)
            if (!result.checks?.mxRecords ||
                reason === "smtp_rejected" ||
                reason === "invalid_format" ||
                reason === "disposable_domain" ||
                reason === "mailbox_not_found" ||
                reason === "no_mx_records" ||
                (typeof result.score === "number" && result.score < 30)) {
              hardBlock = true;
              hardBlockReason = reason || `low_score_${result.score}`;
            }
          }
        }
      } catch (verifyErr) {
        console.error("  Verify error (continuing):", verifyErr);
      }

      if (hardBlock) {
        console.log(`  🚫 Blocked ${job.hiring_email} — ${hardBlockReason}`);
        await supabase.from("job_applications").insert({
          job_title: job.title, company: job.company, location: job.location,
          salary_range: job.salary_range, job_description: job.description,
          job_url: job.url, hiring_manager_name: job.hiring_manager,
          hiring_manager_email: null, source: "auto_apply",
          status: "no_email", sponsorship_available: job.sponsorship || false,
          careers_page_url: job.careers_page_url || null,
          notes: `Skipped: email failed deliverability verification (${hardBlockReason}, score ${deliverabilityScore}/100)`,
        });
        existingCompanyCounts.set(companyKey, knownCompanyCount + 1);
        existingExactJobs.add(`${companyKey}:${titleKey}`);
        results.push({ job: job.title, company: job.company, status: "undeliverable", score: deliverabilityScore, reason: hardBlockReason });
        continue;
      }

      if (i > 0) {
        console.log("⏳ Short queue pacing...");
        await sleep(2000 + Math.random() * 3000);
      }

      if (emailsSentThisRun > 0 && emailsSentThisRun % 10 === 0) {
        console.log("☕ Queue batch pause...");
        await sleep(15000);
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
        existingCompanyCounts.set(companyKey, knownCompanyCount + 1);
        existingExactJobs.add(`${companyKey}:${titleKey}`);
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

Return the complete tailored CV text and cover letter as JSON: {"tailored_cv":"...","cover_letter":"..."}`;

        let cvResult = fallbackTailoredCv(job);
        try {
          const cvResponse = await callFreeGemini(OPENROUTER_API_KEY, {
            messages: [
              { role: "system", content: "You are a professional CV writer. Return ONLY a JSON object with 'tailored_cv' and 'cover_letter' keys. No markdown, no code fences, no thinking." },
              { role: "user", content: cvTailorPrompt },
            ],
          });

          if (cvResponse.ok) {
            const cvData = await cvResponse.json();
            const cvContent = cvData.choices?.[0]?.message?.content || "";
            const parsedCv = parseAIJson(cvContent);
            if (parsedCv?.tailored_cv && parsedCv?.cover_letter) cvResult = parsedCv;
          }
        } catch (cvErr) {
          console.warn(`CV AI unavailable for ${job.title}; using fallback CV`, cvErr);
        }

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
        const managerName = job.hiring_manager || "Hiring Team";
        let emailResult = fallbackEmail(job);
        try {
          const emailResponse = await callFreeGemini(OPENROUTER_API_KEY, {
            messages: [
              {
                role: "system",
                content: `You write job application emails. Return ONLY a JSON object: {"subject":"...","body":"..."}.
No markdown, no code fences, no thinking, no explanation.

CRITICAL RULES:
- NEVER use placeholder brackets like [Company Name] or [mention something] or [Link to...] or [Contact Person]
- NEVER include "[" or "]" anywhere in the email
- Use the ACTUAL names provided — address "${managerName}" directly
- Write the COMPLETE email — no blanks to fill in
- Do NOT mention Calendly or scheduling links
- Keep under 150 words. Professional but warm.`,
              },
              {
                role: "user",
                content: `Write a short application email for:
Job: ${job.title} at ${job.company}
Hiring Manager: ${managerName}
Description: ${job.description}

Candidate: ${APPLICANT_NAME}, ${APPLICANT_TITLE}. CV is attached as PDF.
Sign off with: ${APPLICANT_NAME}, ${APPLICANT_PHONE}, ${APPLICANT_EMAIL}`,
              },
            ],
          });

          if (emailResponse.ok) {
            const emailData = await emailResponse.json();
            const emailContent = emailData.choices?.[0]?.message?.content || "";
            const parsedEmail = parseAIJson(emailContent);
            if (parsedEmail?.subject && parsedEmail?.body) emailResult = parsedEmail;
          }
        } catch (emailErr) {
          console.warn(`Email AI unavailable for ${job.company}; using fallback email`, emailErr);
        }
        
        // Strip any remaining bracket placeholders
        emailResult.subject = (emailResult.subject || "").replace(/\[.*?\]/g, "").trim();
        emailResult.body = sanitizeEmailText((emailResult.body || "").replace(/\[.*?\]/g, "").trim());

        if (!emailResult.subject || !emailResult.body || /placeholder|insert .*link|calendly/i.test(emailResult.body)) {
          throw new Error("Generated email contained invalid placeholder content");
        }

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

          // Final pre-queue deliverability re-check (same rules as Email Engine).
          let finalVerifyOk = true;
          let finalVerifyReason = "";
          try {
            const vResp = await fetch(`${SUPABASE_URL}/functions/v1/email-verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
              body: JSON.stringify({ email: job.hiring_email }),
            });
            if (vResp.ok) {
              const vData = await vResp.json();
              const r = vData.results?.[0];
              if (r) {
                finalVerifyReason = r.reason || "";
                if (!r.checks?.mxRecords ||
                    r.reason === "smtp_rejected" ||
                    r.reason === "invalid_format" ||
                    r.reason === "disposable_domain" ||
                    r.reason === "mailbox_not_found" ||
                    r.reason === "no_mx_records") {
                  finalVerifyOk = false;
                }
              }
            }
          } catch (_) { /* soft-fail, allow */ }

          if (!finalVerifyOk) {
            await supabase.from("job_applications").update({
              status: "no_email",
              hiring_manager_email: null,
              notes: `Blocked before queue: address failed verification (${finalVerifyReason})`,
            }).eq("id", saved.id);
            results.push({ job: job.title, company: job.company, status: "undeliverable", reason: finalVerifyReason });
            continue;
          }

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
            validation_reason: `${finalEmailValidation.reason || "domain_verified"} | deliverability: ${deliverabilityScore}/100 | verified: ${finalVerifyReason || "ok"}`,
          });

          await supabase.from("job_applications").update({
            status: "queued_for_review",
          }).eq("id", saved.id);

          console.log(`📋 Queued for review: ${job.hiring_email} (${job.company})`);
            emailsSentThisRun++;
            results.push({ job: job.title, company: job.company, status: "queued_for_review", email: job.hiring_email });
        } else {
          await supabase.from("job_applications").update({ status: "no_email" }).eq("id", saved.id);
          results.push({ job: job.title, company: job.company, status: "no_email" });
        }

      } catch (err) {
        console.error(`Error processing ${job.title}:`, err);
        results.push({ job: job.title, company: job.company, status: "error", error: String(err) });
      }

      // Track this job so future iterations of the outer loop don't re-fetch it
      existingExactJobs.add(`${companyKey}:${titleKey}`);
      existingCompanyCounts.set(companyKey, (existingCompanyCounts.get(companyKey) || 0) + 1);
      if ((existingCompanyCounts.get(companyKey) || 0) >= 2) saturatedCompanies.add(companyKey);
    }
    } // end while (continuous discovery loop)

    console.log(`🏁 Continuous run ended. iterations=${iteration} emptyBatches=${emptyBatches} sentThisRun=${emailsSentThisRun}`);


      console.log(`✅ Background run finished. processed=${results.length} emailsSent=${emailsSentThisRun}`);
     } catch (bgErr) {
      console.error("Background pipeline error:", bgErr);
     } finally {
      if (handoffScheduled) {
        console.log("👋 Isolate exiting after handoff; keeping running=true.");
      } else {
        try {
          await supabase.from("auto_apply_pipeline_state").upsert({
            id: 1,
            running: false,
            finished_at: new Date().toISOString(),
            last_log: `Finished. emails=${emailsSentThisRun}`,
          }, { onConflict: "id" });
        } catch (_) { /* ignore */ }
      }
     }
    };

    const backgroundRun = runPipeline();
    // @ts-ignore -- EdgeRuntime is provided by Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundRun);
    }

    return new Response(JSON.stringify({
      success: true,
      accepted: true,
      fastDiscovered: fastDiscovery.inserted,
      message: "Pipeline started in background. Poll ?action=status for progress. Safe to close this tab.",
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Pipeline error:", e);
    const status = e instanceof AICreditsError ? e.status : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

