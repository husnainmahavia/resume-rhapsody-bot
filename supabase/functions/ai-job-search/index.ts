import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { skills, location, jobType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    // Retry with exponential backoff for rate limits
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 4000,
          messages: [
            { role: "system", content: "You are a job search API. Return ONLY a valid JSON object with a 'jobs' key containing an array. No markdown, no code fences, no explanation, no thinking. Example: {\"jobs\":[{\"title\":\"...\",\"company\":\"...\",\"location\":\"...\",\"description\":\"...\"}]}" },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response || (response.status !== 429 && response.status !== 503)) break;

      const waitMs = (attempt + 1) * 5000 + Math.random() * 3000;
      console.log(`Rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/3)`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait a minute and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response?.text() || "";
      console.error("OpenRouter error:", response?.status, t);
      throw new Error(`OpenRouter API error: ${response?.status}`);
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

    return new Response(JSON.stringify({ jobs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("job search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
