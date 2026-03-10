import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobTitle, company, hiringManager, jobDescription } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai-gateway.lovable.dev/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are an expert at writing cold outreach emails to hiring managers. 
Write personalized, concise, compelling emails that get responses. 
The candidate is Husnain Mahavia, a Full-Stack Developer with 8+ years experience, 150+ projects, based in Manchester UK.

IMPORTANT: Include the tailored CV summary and cover letter highlights in the email body so the recipient has everything they need without attachments.
Make the email feel personal and genuine, not templated.

CRITICAL: You MUST respond with valid JSON in this exact format:
{"subject": "your subject line", "body": "your email body"}
Do NOT include any other text, markdown, or code blocks. Just the raw JSON object.`,
          },
          {
            role: "user",
            content: `Write a cold email to apply for this job:
Job: ${jobTitle} at ${company}
Hiring Manager: ${hiringManager || "Hiring Team"}
Description: ${jobDescription}

Respond with JSON: {"subject": "...", "body": "..."}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Lovable AI error: ${response.status} - ${errText}`);
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let result = { subject: "", body: "" };
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: extract subject and body from text
      const subjectMatch = content.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = content.match(/"body"\s*:\s*"([\s\S]+?)"\s*}/);
      if (subjectMatch) result.subject = subjectMatch[1];
      if (bodyMatch) result.body = bodyMatch[1].replace(/\\n/g, "\n");
    }

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
