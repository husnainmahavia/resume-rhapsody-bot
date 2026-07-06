import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_JOBS = [
  {
    title: "Full Stack Developer",
    company: "NHS Digital",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £60,000",
    description: "Build accessible healthcare web services with React, TypeScript, APIs, testing, and secure cloud delivery.",
    url: "https://digital.nhs.uk/careers",
    hiring_manager: "Hiring Team",
    hiring_email: "",
  },
  {
    title: "Frontend Engineer",
    company: "Auto Trader UK",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £70,000",
    description: "Work on high-traffic marketplace interfaces using modern JavaScript, React, analytics, and performance optimisation.",
    url: "https://careers.autotrader.co.uk",
    hiring_manager: "Talent Team",
    hiring_email: "",
  },
  {
    title: "AI Automation Developer",
    company: "Peak AI",
    location: "Manchester, UK",
    salary_range: "£50,000 - £75,000",
    description: "Develop AI workflow tooling, API integrations, data pipelines, and production automation for business users.",
    url: "https://peak.ai/careers",
    hiring_manager: "People Team",
    hiring_email: "",
  },
  {
    title: "WordPress / Web Developer",
    company: "Apadmi",
    location: "Salford, UK / Hybrid",
    salary_range: "£35,000 - £55,000",
    description: "Deliver responsive web products, integrations, and campaign platforms for client projects.",
    url: "https://www.apadmi.com/careers/",
    hiring_manager: "Recruitment Team",
    hiring_email: "",
  },
  {
    title: "Software Engineer",
    company: "BJSS",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £70,000",
    description: "Deliver production software using TypeScript, React, cloud services, APIs, testing, and agile delivery.",
    url: "https://www.bjss.com/careers/",
    hiring_manager: "Talent Team",
    hiring_email: "",
  },
  {
    title: "Full Stack Engineer",
    company: "AND Digital",
    location: "Manchester, UK / Hybrid",
    salary_range: "£45,000 - £65,000",
    description: "Build digital products across frontend, backend, cloud, and data workflows for client teams.",
    url: "https://www.and.digital/careers/",
    hiring_manager: "People Team",
    hiring_email: "",
  },
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackJobs(location?: string) {
  return FALLBACK_JOBS.map((job) => ({ ...job, location: location || job.location }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { skills, location, jobType } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const prompt = `You are a job search assistant. Find 5-8 REAL job listings from REAL companies that are actively hiring in ${location || "Manchester, UK"} for someone with these skills: ${skills.join(", ")}.

CRITICAL RULES:
- ONLY use REAL, well-known companies that actually exist (e.g., BBC, NHS, Booking.com, Amazon, THG, AO.com, Autotrader, etc.)
- Use only VERIFIED company recruitment emails tied to the real company domain
- If a verified email cannot be confirmed, set hiring_email to an empty string "" (never guess)
- Job URLs should point to real career pages (e.g., https://careers.company.com/jobs/...)
- Hiring manager names should be realistic but you can make these up
- DO NOT invent fictional companies or domains

Job type preference: ${jobType || "Full-time"}

For each job, provide:
- title: Job title
- company: Real company name
- location: Job location
- salary_range: Realistic salary range for the UK market
- description: Brief 2-3 sentence description of the role
- url: Real company careers page URL
- hiring_manager: A realistic name
- hiring_email: The company's REAL recruitment/careers email address

Return ONLY valid JSON array. No markdown, no explanation.`;

    // Retry with exponential backoff for rate limits and temporary AI failures.
    let response: Response | null = null;
    let lastError = "";
    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      response = await callGemini(OPENROUTER_API_KEY, {
        max_tokens: 4000,
        timeout_ms: 8000,
        max_model_attempts: 2,
        max_lovable_attempts: 0,
        messages: [
          { role: "system", content: "You are a job search API. Return ONLY a valid JSON object with a 'jobs' key containing an array. No markdown, no code fences, no explanation, no thinking. Example: {\"jobs\":[{\"title\":\"...\",\"company\":\"...\",\"location\":\"...\",\"description\":\"...\"}]}" },
          { role: "user", content: prompt },
        ],
      });

      if (!response || (response.status !== 429 && response.status !== 503 && response.status !== 504)) break;

      lastError = `AI search temporarily unavailable (${response.status})`;
      if (attempt === maxAttempts - 1) break;
      const waitMs = 5000 + Math.random() * 2000;
      console.log(`${lastError}, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts})`);
      await wait(waitMs);
    }

    if (!response || !response.ok) {
      const t = await response?.text() || "";
      console.error("Gemini error:", response?.status, t);
      return new Response(JSON.stringify({
        jobs: fallbackJobs(location),
        warning: lastError || `AI search failed (${response?.status || "no response"}); showing safe fallback jobs.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let jobs = [];
    const content = data.choices?.[0]?.message?.content || "";
    // Try parsing content as JSON - handle markdown fences
    const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      jobs = Array.isArray(parsed) ? parsed : (parsed.jobs || []);
    } catch {
      // Try to find JSON array in content
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try { jobs = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    if (!jobs.length) jobs = fallbackJobs(location);

    return new Response(JSON.stringify({ jobs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("job search error:", e);
    return new Response(JSON.stringify({
      jobs: fallbackJobs(),
      warning: e instanceof Error ? e.message : "Search failed; showing fallback jobs.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
