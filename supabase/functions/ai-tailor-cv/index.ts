import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  ar: `HUSNAIN MAHAVIA | AR / Unity Developer
8+ years building augmented reality and 3D experiences. 100+ AR projects delivered in Unity with ARFoundation, ARKit, ARCore, and Vuforia. Portfolio includes AR campaigns for Pepsi and McAfee. Comfortable across the full 3D pipeline: C# scripting, shaders, performance profiling, mobile deployment (iOS/Android), and integrating AR with backend APIs and analytics.
Skills: Unity, C#, ARFoundation, ARKit, ARCore, Vuforia, 8th Wall, Shader Graph, Blender, iOS/Android build pipelines`,
  webar: `HUSNAIN MAHAVIA | WebAR / Lens / Effect Developer
8+ years across immersive tech with 100+ AR builds. Deep hands-on with WebAR runtimes (8th Wall, WebXR, AR.js) and social AR platforms (Snapchat Lens Studio, TikTok Effect House, Meta Spark). Ships browser-first AR experiences that run on any modern phone — no app install — plus branded lenses/filters for social campaigns. Strong JavaScript/TypeScript, Three.js, GLTF asset optimization, and analytics integration.
Skills: 8th Wall, WebXR, AR.js, Three.js, Snapchat Lens Studio, TikTok Effect House, Meta Spark AR, JavaScript, TypeScript, GLTF/GLB optimization`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobTitle, company, jobDescription, cvVersion } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const baseCV = CV_VERSIONS[cvVersion] || CV_VERSIONS.fullstack;

    const requestBody = JSON.stringify({
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

Tailor the CV and write a cover letter. Return ONLY valid JSON with keys: tailored_cv, cover_letter, key_changes, recommended_cv_type.`,
        },
      ],
    });

    // Retry with exponential backoff for rate limits
    let response: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await callGemini(OPENROUTER_API_KEY, JSON.parse(requestBody));

      if (response.status !== 429 && response.status !== 503) break;

      const waitMs = (attempt + 1) * 20000 + Math.random() * 10000;
      console.log(`Rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/4)`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      if (response?.status === 429) return new Response(JSON.stringify({ error: "Rate limited after retries. Please wait a minute and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Gemini error: ${response?.status}`);
    }

    const data = await response.json();
    let result = { tailored_cv: "", cover_letter: "", key_changes: "", recommended_cv_type: "fullstack" };
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      result = JSON.parse(match[0]);
    }

    if (!result.tailored_cv || !result.cover_letter) {
      result = {
        tailored_cv: `${baseCV}\n\nTARGET ROLE ALIGNMENT\nRole: ${jobTitle} at ${company}\nRelevant focus: React, TypeScript, API integration, WordPress, AI automation, and full-stack delivery.\n\nEXPERIENCE HIGHLIGHTS\n• Delivered 50+ websites and 15+ e-commerce platforms with strong frontend and backend integration.\n• Built automation and AI-powered systems using Python, APIs, and modern JavaScript tooling.\n• Led Visuosofts from 2017 to 2025, scaling delivery across web, AR, and digital products.`,
        cover_letter: `Dear Hiring Team,\n\nI am writing to express my interest in the ${jobTitle} role at ${company}. I bring 8+ years of full-stack development experience across React, TypeScript, WordPress, API integrations, AI automation, and client-facing delivery.\n\nAt Visuosofts, I led delivery of 50+ websites, 15+ e-commerce platforms, and automation projects for international clients, combining strong engineering execution with practical business outcomes. I would welcome the opportunity to bring the same hands-on delivery mindset to ${company}.\n\nKind regards,\nHusnain Mahavia`,
        key_changes: "Generated a safe fallback CV and cover letter because the AI response was empty.",
        recommended_cv_type: cvVersion || "fullstack",
      };
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
