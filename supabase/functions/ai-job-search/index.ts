import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { skills, location, jobType } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

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
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a job search API. Return only valid JSON arrays of job objects. No markdown formatting." },
            { role: "user", content: prompt },
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
                      },
                      required: ["title", "company", "location", "description"],
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

      if (!response || response.status !== 429) break;

      const waitMs = (attempt + 1) * 20000 + Math.random() * 10000;
      console.log(`Rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/4)`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited after retries. Please wait a minute and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response?.text() || "";
      console.error("Gemini error:", response?.status, t);
      throw new Error(`Gemini API error: ${response?.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let jobs = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      jobs = parsed.jobs || [];
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
