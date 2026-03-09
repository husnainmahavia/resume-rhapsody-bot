import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const CV_VERSIONS: Record<string, string> = {
  fullstack: `HUSNAIN MAHAVIA | Full-Stack Developer | WordPress & AI Integration Specialist | Tech Lead
8+ years in custom WordPress development, AI/ML integration, automation systems. 50+ WordPress sites, 15+ e-commerce platforms. ChatGPT, Gemini, MidJourney integration. Custom lead management, API integrations. Scaled team 1→10+, 50% YoY growth.
Skills: HTML5/CSS3, JavaScript, PHP, Python, SQL, WordPress, React, AI/ML, REST APIs, CRM (HubSpot, Salesforce)`,
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
    const { jobTitle, company, jobDescription, cvVersion } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const baseCV = CV_VERSIONS[cvVersion] || CV_VERSIONS.fullstack;

    const requestBody = JSON.stringify({
      model: "gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are an expert CV writer and career coach. Your job is to tailor the candidate's CV for a specific job.

RULES:
1. Restructure, reword, and emphasize the most relevant skills and experience
2. Keep it professional, ATS-friendly, and concise (max 2 pages worth of text)
3. Use the candidate's REAL experience - do not fabricate anything
4. Match keywords from the job description
5. Highlight quantifiable achievements
6. Also write a personalized cover letter (max 250 words)
7. The CV should follow this structure: Name/Contact → Profile → Skills → Experience → Education → Certifications`,
        },
        {
          role: "user",
          content: `BASE CV:\n${baseCV}\n\nFull candidate details:
Name: Husnain Mahavia
Location: Manchester, UK
Phone: +44 7387 055617
Email: husnainmahavia.1@gmail.com
Education: BSc Software Engineering, COMSATS University (2016-2020)
Current: Market Research Interviewer at NatCen (Oct 2025-Present, Part-time)
Previous: Lead at Visuosofts (Jan 2017-Aug 2025) - Full-service digital agency
Key achievements: 50+ websites, 15+ e-commerce, 100+ AR projects, 900%+ traffic growth, 50% YoY revenue growth, team scaled 1→10+
Languages: English (Fluent), Urdu (Native), Italian (Basic)
Status: UK citizen

TARGET JOB:
Title: ${jobTitle}
Company: ${company}
Description: ${jobDescription}

Tailor the CV and write a cover letter.`,
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
              tailored_cv: { type: "string", description: "The full tailored CV text, well-formatted" },
              cover_letter: { type: "string", description: "The personalized cover letter" },
              key_changes: { type: "string", description: "Brief summary of what was changed and why" },
              recommended_cv_type: { type: "string", description: "Which CV version was best suited: fullstack, aiSpecialist, digitalMarketing, or webDeveloper" },
            },
            required: ["tailored_cv", "cover_letter", "key_changes", "recommended_cv_type"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_documents" } },
    });

    // Retry with exponential backoff for rate limits
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.status !== 429) break;

      const waitMs = (attempt + 1) * 15000 + Math.random() * 5000;
      console.log(`Rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/3)`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) return new Response(JSON.stringify({ error: "Rate limited after retries. Please wait a minute and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Gemini error: ${response?.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { tailored_cv: "", cover_letter: "", key_changes: "", recommended_cv_type: "fullstack" };
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tailor cv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
