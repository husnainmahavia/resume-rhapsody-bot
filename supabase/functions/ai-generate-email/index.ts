import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobTitle, company, hiringManager, jobDescription } = await req.json();
    
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const managerName = hiringManager || "Hiring Team";

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await callGemini(OPENROUTER_API_KEY, {
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: `You write job application emails. Return ONLY a JSON object with "subject" and "body" keys. No markdown, no code fences, no thinking, no explanation.

CRITICAL RULES:
- NEVER use placeholder brackets like [Company Name] or [mention something] or [Link to...] or [Contact Person Name]
- NEVER include "[" or "]" anywhere in the email
- Use the ACTUAL company name, job title, and hiring manager name provided
- Write the COMPLETE email with real content — no blanks to fill in
- Do NOT mention Calendly or scheduling links
- Sign off as: Husnain Mahavia, Manchester, UK, +44 7387 055617, husnainmahavia.1@gmail.com`,
          },
          {
            role: "user",
            content: `Write a cold application email for:
Job: ${jobTitle} at ${company}
Hiring Manager: ${managerName}
Job Description: ${jobDescription}

The candidate is Husnain Mahavia, a Full-Stack Developer & AR Specialist with 8+ years experience, 150+ projects delivered, 100+ AR experiences. Based in Manchester UK. Skills: Unity, ARKit, ARCore, React, TypeScript, Python, AI/ML, WordPress.

Write a SHORT (under 150 words), professional email. Address "${managerName}" directly. Reference something specific about ${company} — do not use generic praise. Mention 2-3 relevant skills from the job description.

Return JSON: {"subject":"...","body":"..."}`,
          },
        ],
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
      console.error("Gemini error:", response?.status, t);
      throw new Error(`Gemini error: ${response?.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    
    let result = { subject: "", body: "" };
    try {
      // Try to find JSON object in content
      const jsonMatch = cleaned.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleaned);
      }
    } catch {
      console.error("Failed to parse email JSON:", cleaned.slice(0, 200));
      // Fallback: try to extract subject and body from text
      const subjectMatch = cleaned.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = cleaned.match(/"body"\s*:\s*"([\s\S]+?)"\s*\}/);
      if (subjectMatch) result.subject = subjectMatch[1];
      if (bodyMatch) result.body = bodyMatch[1].replace(/\\n/g, "\n");
    }

    // Strip any remaining bracket placeholders
    result.subject = result.subject.replace(/\[.*?\]/g, "").trim();
    result.body = result.body.replace(/\[.*?\]/g, "").trim();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email gen error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
