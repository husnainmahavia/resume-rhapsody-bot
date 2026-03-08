import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_DAILY_LIMIT = 80; // Stay well under Gmail's 500/day limit
const MIN_DELAY_MS = 45000; // 45 seconds minimum between emails (human-like)
const MAX_DELAY_MS = 120000; // 2 minutes max random delay
const BATCH_PAUSE_MS = 300000; // 5 min pause every 10 emails

function humanDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((r) => setTimeout(r, ms));
}

const CV_VERSIONS: Record<string, string> = {
  fullstack: `HUSNAIN MAHAVIA | Full-Stack Developer | WordPress & AI Integration Specialist | Tech Lead
8+ years in custom WordPress development, AI/ML integration, automation systems. 50+ WordPress sites, 15+ e-commerce platforms. ChatGPT, Gemini, MidJourney integration. Custom lead management, API integrations. Scaled team 1→10+, 50% YoY growth.
Skills: HTML5/CSS3, JavaScript, PHP, Python, SQL, WordPress, React, AI/ML, REST APIs, CRM`,

  aiSpecialist: `HUSNAIN MAHAVIA | AI & Technology Specialist
8+ years software engineering + applied AI. ML model development, AI algorithm optimization, large dataset analysis. Enterprise AI integration, cloud deployment, scalable architecture.
Skills: Python, SQL, Machine Learning, AI Automation, Flutter, Unity AR/VR, WordPress`,

  digitalMarketing: `HUSNAIN MAHAVIA | Digital Marketing Manager
5+ years digital marketing + software engineering background. AI-powered SEO, performance advertising, AR campaigns. 900%+ traffic growth, 30% ranking improvement.
Skills: SEO, Google Ads, Meta Ads, TikTok Ads, Analytics, WordPress, AI Content, CRM`,

  webDeveloper: `HUSNAIN MAHAVIA | Senior Web Developer | WordPress Specialist
8+ years custom WordPress development, HTML/CSS, landing pages. 50+ custom sites, 15+ e-commerce platforms, Core Web Vitals 90+.
Skills: HTML5/CSS3, JavaScript, PHP, WordPress, WooCommerce, Shopify, GTM, CRM Integration`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { location, skills, action, cvVersion, jobType } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const senderEmail = "husnainmahavia.1@gmail.com";
    const senderName = "Husnain Mahavia";

    // If action is "status", return current pipeline status
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check daily email count
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Search for jobs via AI
    console.log("🔍 Searching for jobs...");
    const searchPrompt = `Find 5-8 REAL job listings from REAL companies actively hiring in ${location || "Manchester, UK"} for someone with these skills: ${(skills || ["JavaScript", "React", "Python", "WordPress", "AI"]).join(", ")}.

CRITICAL: Only use REAL companies with REAL domains. Use actual recruitment email formats like careers@, jobs@, hr@, recruitment@ with the company's real domain.

Return JSON array with: title, company, location, salary_range, description, url, hiring_manager, hiring_email`;

    const searchResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Return only valid JSON arrays. No markdown." },
          { role: "user", content: searchPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_jobs",
            description: "Return job listings",
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

    if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const toolCall = searchData.choices?.[0]?.message?.tool_calls?.[0];
    const jobs = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments).jobs || [] : [];

    console.log(`Found ${jobs.length} jobs`);
    const results: any[] = [];
    let emailsSentThisRun = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      // Check daily limit
      if ((sentToday || 0) + emailsSentThisRun >= GMAIL_DAILY_LIMIT) {
        console.log("Daily limit reached, stopping.");
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

      // Human-like delay between applications
      if (i > 0) {
        console.log("⏳ Human-like delay...");
        await humanDelay();
      }

      // Batch pause every 10 emails
      if (emailsSentThisRun > 0 && emailsSentThisRun % 10 === 0) {
        console.log("☕ Batch pause (5 min)...");
        await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
      }

      try {
        // Save application
        const { data: saved, error: saveError } = await supabase
          .from("job_applications")
          .insert({
            job_title: job.title,
            company: job.company,
            location: job.location,
            salary_range: job.salary_range,
            job_description: job.description,
            job_url: job.url,
            hiring_manager_name: job.hiring_manager,
            hiring_manager_email: job.hiring_email,
            source: "auto_apply",
            status: "discovered",
          })
          .select()
          .single();

        if (saveError) throw saveError;
        console.log(`💾 Saved: ${job.title}`);

        // Tailor CV
        console.log(`📝 Tailoring CV for: ${job.title}`);
        const cvResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are an expert CV writer. Tailor the CV for the target job. Also write a cover letter (max 250 words). Use the candidate's REAL experience only.`,
              },
              {
                role: "user",
                content: `BASE CV:\n${CV_VERSIONS.fullstack}\n\nTARGET: ${job.title} at ${job.company}\nDescription: ${job.description}\n\nTailor CV and write cover letter.`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_documents",
                description: "Return tailored CV and cover letter",
                parameters: {
                  type: "object",
                  properties: {
                    tailored_cv: { type: "string" },
                    cover_letter: { type: "string" },
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

        // Generate email with CV and cover letter included
        console.log(`✉️ Generating email for: ${job.company}`);
        const emailResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You write cold outreach emails for job applications. The candidate is Husnain Mahavia, a Full-Stack Developer with 8+ years experience, 150+ projects, based in Manchester UK.
                
IMPORTANT: The email MUST include the full tailored CV and cover letter in the body. Structure:
1. Brief personalized intro (2-3 sentences, reference something specific about the company)
2. Cover letter section
3. Full CV section (formatted clearly)
4. Professional sign-off with contact details

Make it feel personal and genuine. The email should be complete — the recipient should have everything they need without attachments.`,
              },
              {
                role: "user",
                content: `Job: ${job.title} at ${job.company}
Hiring Manager: ${job.hiring_manager || "Hiring Team"}
Description: ${job.description}

COVER LETTER:\n${cvResult.cover_letter}

TAILORED CV:\n${cvResult.tailored_cv}

Write the full email with subject line, including the CV and cover letter in the body.`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_email",
                description: "Return the email",
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

        // Send email with CV in body
        if (job.hiring_email) {
          console.log(`🚀 Sending to: ${job.hiring_email}`);
          
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: senderEmail, pass: GMAIL_APP_PASSWORD },
          });

          const htmlBody = emailResult.body
            .replace(/\n/g, "<br>")
            .replace(/---/g, "<hr>")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

          await transporter.sendMail({
            from: `${senderName} <${senderEmail}>`,
            to: job.hiring_email,
            subject: emailResult.subject,
            text: emailResult.body,
            html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 700px;">${htmlBody}</div>`,
          });

          await supabase.from("job_applications").update({
            status: "applied",
            applied_at: new Date().toISOString(),
          }).eq("id", saved.id);

          emailsSentThisRun++;
          console.log(`✅ Email SENT to ${job.hiring_email} (${emailsSentThisRun} this run)`);
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
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Pipeline error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
