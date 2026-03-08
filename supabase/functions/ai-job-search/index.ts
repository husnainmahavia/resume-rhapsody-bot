import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { skills, location, jobType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a job search assistant. Find 5-8 REAL job listings from REAL companies that are actively hiring in ${location || "Manchester, UK"} for someone with these skills: ${skills.join(", ")}.

CRITICAL RULES:
- ONLY use REAL, well-known companies that actually exist (e.g., BBC, NHS, Booking.com, Amazon, THG, AO.com, Autotrader, etc.)
- Use REAL company career/HR email addresses. Look up the actual format used by each company (e.g., careers@company.com, recruitment@company.co.uk, jobs@company.com)
- If you don't know the real email, use the standard format: careers@companydomain.com or hr@companydomain.com using the company's REAL domain
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
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
