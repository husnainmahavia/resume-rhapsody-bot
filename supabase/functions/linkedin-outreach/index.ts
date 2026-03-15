import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USER_PROFILE = {
  name: "Husnain Mahavia",
  title: "Full-Stack Developer | AI Specialist | Tech Lead",
  experience: "8+ years",
  location: "Manchester, UK",
  skills: "WordPress, React, Node.js, Python, AI/ML, AR/VR, SEO, Digital Marketing",
  summary: "Results-driven full-stack developer with 8+ years expertise in custom WordPress development, AI/ML integration, AR/VR development, and automation. Founded Visuosofts serving international clients. 50+ websites, 15+ e-commerce platforms, 100+ AR projects."
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, skills, location, jobType, jobTitle, company, jobDescription, hiringManagerName } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION: Search LinkedIn jobs
    if (action === "search") {
      const prompt = `You are a LinkedIn job search specialist. Find 8-10 REAL job listings that would be posted on LinkedIn in ${location || "Manchester, UK"} for someone with these skills: ${(skills || ["React", "WordPress", "AI"]).join(", ")}.

CRITICAL RULES:
- Use REAL companies that actually post on LinkedIn (BBC, NHS, Booking.com, Amazon, THG, AO.com, Autotrader, Deloitte, PwC, KPMG, Accenture, etc.)
- Generate realistic LinkedIn job URLs in format: https://www.linkedin.com/jobs/view/[job-title]-at-[company]-[random-id]
- Include realistic hiring manager names and their LinkedIn profile URLs
- Look for posts from these hiring managers that we could comment on
- Job type: ${jobType || "Full-time"}

For each job provide:
- title: Job title
- company: Real company name  
- location: Job location
- salary_range: Realistic UK salary range
- description: 2-3 sentence role description
- linkedin_url: Realistic LinkedIn job URL
- hiring_manager_name: Realistic name
- hiring_manager_linkedin: LinkedIn profile URL (format: https://www.linkedin.com/in/firstname-lastname)
- recent_post_topic: A realistic topic the hiring manager might have posted about on LinkedIn (tech trends, hiring, team updates, etc.)

Return ONLY valid JSON array.`;

      let response: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "Return only valid JSON arrays. No markdown." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_linkedin_jobs",
                description: "Return LinkedIn job listings",
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
                          linkedin_url: { type: "string" },
                          hiring_manager_name: { type: "string" },
                          hiring_manager_linkedin: { type: "string" },
                          recent_post_topic: { type: "string" },
                        },
                        required: ["title", "company", "location", "description"],
                      },
                    },
                  },
                  required: ["jobs"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_linkedin_jobs" } },
          }),
        });
        if (response && response.status !== 429 && response.status !== 503) break;
        const waitMs = (attempt + 1) * 15000 + Math.random() * 5000;
        console.log(`⚠️ LinkedIn search ${response?.status}, retry ${attempt + 1}/4`);
        await new Promise(r => setTimeout(r, waitMs));
      }

      if (!response.ok) {
        const t = await response.text();
        console.error("AI error:", response.status, t);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      let jobs: any[] = [];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        jobs = parsed.jobs || [];
      }

      // Save to database
      let saved = 0;
      for (const job of jobs) {
        const { data: existing } = await supabase
          .from("linkedin_outreach")
          .select("id")
          .ilike("job_title", job.title)
          .ilike("company", job.company)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("linkedin_outreach").insert({
          job_title: job.title,
          company: job.company,
          job_url: job.linkedin_url || null,
          job_description: job.description || null,
          location: job.location || null,
          salary_range: job.salary_range || null,
          hiring_manager_name: job.hiring_manager_name || null,
          hiring_manager_linkedin: job.hiring_manager_linkedin || null,
          source: "linkedin_search",
          status: "discovered",
        });
        saved++;
      }

      return new Response(JSON.stringify({ jobs, saved, total: jobs.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Generate messages (connection request, InMail, post comment)
    if (action === "generate_messages") {
      const prompt = `You are a LinkedIn outreach expert. Generate personalized, professional messages for reaching out to a hiring manager about a job opportunity.

CONTEXT:
- Applicant: ${USER_PROFILE.name}, ${USER_PROFILE.title}
- ${USER_PROFILE.experience} experience in ${USER_PROFILE.skills}
- Job: ${jobTitle} at ${company}
- Job Description: ${jobDescription || "Not provided"}
- Hiring Manager: ${hiringManagerName || "Hiring Manager"}

Generate THREE types of messages:

1. CONNECTION REQUEST (max 300 characters): Brief, warm, professional. Mention the specific role and a relevant skill. Don't be salesy.

2. INMAIL/DIRECT MESSAGE (150-250 words): Professional but conversational. Highlight 2-3 specific skills relevant to the role. Show genuine interest in the company. Include a soft call-to-action. Don't attach CV mention but reference availability to discuss.

3. POST COMMENT (2-3 sentences): A thoughtful, insightful comment that could be left on the hiring manager's LinkedIn post. Should demonstrate expertise relevant to the role without being self-promotional. Be genuine and add value.

Return JSON with keys: connection_message, inmail_message, post_comment`;

      let response: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "Return only valid JSON. No markdown." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_messages",
                description: "Return generated LinkedIn messages",
                parameters: {
                  type: "object",
                  properties: {
                    connection_message: { type: "string" },
                    inmail_message: { type: "string" },
                    post_comment: { type: "string" },
                  },
                  required: ["connection_message", "inmail_message", "post_comment"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_messages" } },
          }),
        });
        if (response && response.status !== 429 && response.status !== 503) break;
        const waitMs = (attempt + 1) * 15000 + Math.random() * 5000;
        console.log(`⚠️ LinkedIn msg gen ${response?.status}, retry ${attempt + 1}/4`);
        await new Promise(r => setTimeout(r, waitMs));
      }

      if (!response || !response.ok) throw new Error(`AI error: ${response?.status}`);

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      let messages = { connection_message: "", inmail_message: "", post_comment: "" };
      if (toolCall?.function?.arguments) {
        messages = JSON.parse(toolCall.function.arguments);
      }

      return new Response(JSON.stringify(messages), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Get status/stats
    if (action === "status") {
      const { data: all } = await supabase.from("linkedin_outreach").select("*");
      const items = all || [];
      return new Response(JSON.stringify({
        total: items.length,
        messaged: items.filter(i => i.message_sent).length,
        responded: items.filter(i => i.response_received).length,
        pending: items.filter(i => !i.message_sent && i.status === "discovered").length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: List all outreach items
    if (action === "list") {
      const { data } = await supabase
        .from("linkedin_outreach")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return new Response(JSON.stringify({ data: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Update status of an outreach item
    if (action === "update") {
      const { id, updates } = await req.json();
      const { error } = await supabase
        .from("linkedin_outreach")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("linkedin-outreach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
