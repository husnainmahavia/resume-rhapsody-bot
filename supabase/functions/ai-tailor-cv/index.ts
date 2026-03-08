import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_CV = `Husnain Mahavia
Manchester, UK | +44 7387 055617 | husnainmahavia.1@gmail.com

PROFILE
Dynamic and innovative Augmented Reality (AR) Developer with a Bachelor of Science in Software Engineering and over 5 years of dedicated hands-on experience leading AR projects at Visuosofts. Specializing in Unity-based AR/VR solutions, successfully delivered more than 100 immersive AR projects for industries including education, retail, construction, healthcare, and marketing.

SKILLS
- AR/VR Development: Unity, ARFoundation, ARKit, ARCore, Vuforia, 8th Wall, AR.js
- Programming: C#, PHP, JavaScript, Python
- 3D Modeling: Blender, 3D asset optimization
- Web AR: 8th Wall, AR.js, browser-based AR
- Social AR: Snapchat Lens Studio, TikTok Effect House, Instagram Spark AR
- UI/UX Design: Unity UI, user-centric design
- Backend: PHP web portals, REST APIs
- DevOps: Git, Agile, App Store/Play Store deployment
- Leadership: Team management (10+ developers), client relations

WORK EXPERIENCE
Founder & Lead AR Developer at Visuosofts, Islamabad (Jan 2020 – Aug 2025)
- Founded and scaled startup, leading team of 10+ developers
- Delivered 100+ AR projects across education, retail, construction, healthcare
- 50% year-on-year revenue growth
- Key Projects: AR Food Menu Visualizer (40% engagement increase), AI-Powered AR Workout Trainer (30% retention boost), Construction AR Walkthrough, AR Business Cards

EDUCATION
Bachelor of Science in Software Engineering
University of Gujrat (2016-2020)
- Final Year Project: AR Construction Walkthrough (78% project score)`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobTitle, company, jobDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert CV writer. Tailor the candidate's CV for the specific job. 
Restructure, reword, and emphasize relevant skills. Keep it professional, ATS-friendly, and under 2 pages.
Return the tailored CV as clean text with clear sections. Also generate a personalized cover letter.`,
          },
          {
            role: "user",
            content: `BASE CV:\n${BASE_CV}\n\nTARGET JOB:\nTitle: ${jobTitle}\nCompany: ${company}\nDescription: ${jobDescription}\n\nPlease tailor this CV for the job and write a cover letter.`,
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
                tailored_cv: { type: "string", description: "The tailored CV text" },
                cover_letter: { type: "string", description: "The personalized cover letter" },
                key_changes: { type: "string", description: "Summary of what was changed and why" },
              },
              required: ["tailored_cv", "cover_letter", "key_changes"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_documents" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { tailored_cv: "", cover_letter: "", key_changes: "" };
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
