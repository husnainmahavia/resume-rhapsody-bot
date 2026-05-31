import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  { name: "web_development", queries: ["web development company hiring email contact", "WordPress agency careers email", "React developer agency contact email", "web design company UK email"] },
  { name: "digital_marketing", queries: ["digital marketing agency hiring email contact", "SEO company careers email UK", "performance marketing agency contact email", "social media marketing company email"] },
  { name: "ai_ml", queries: ["AI company hiring email contact UK", "machine learning startup careers email", "artificial intelligence company recruitment email", "AI automation company email"] },
  { name: "ar_vr", queries: ["augmented reality company hiring email UK", "AR VR studio careers contact email", "immersive technology company email", "XR development company recruitment email"] },
  { name: "ecommerce", queries: ["ecommerce agency hiring email contact UK", "Shopify development company careers email", "online retail technology company email"] },
  { name: "software_development", queries: ["software development company hiring email UK", "SaaS startup careers contact email", "tech company recruitment email Manchester", "software agency contact email"] },
];

const OPENROUTER_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CV_BASE = `HUSNAIN MAHAVIA | Full-Stack Developer & AI Specialist
8+ years in custom WordPress development, AI/ML integration, automation systems. 50+ WordPress sites, 15+ e-commerce platforms. ChatGPT, Gemini, MidJourney integration. Custom lead management, API integrations. Scaled team 1→10+, 50% YoY growth.
Contact: +44 7387 055617 | husnainmahavia.1@gmail.com | Manchester, UK
Education: BSc Software Engineering, COMSATS University (2016-2020)
Experience: Lead at Visuosofts (Jan 2017-Aug 2025), Market Research at NatCen (Oct 2025-Present)
Skills: HTML5/CSS3, JavaScript, PHP, Python, SQL, WordPress, React, AI/ML, REST APIs, Flutter, Unity AR/VR, SEO, Google Ads`;

function generateCvHtml(cvText: string, company: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Husnain Mahavia - CV</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:0 auto;padding:40px;color:#1a1a1a;line-height:1.6}
h1{font-size:22px;margin-bottom:4px;color:#0d1b2a}h2{font-size:14px;color:#415a77;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:20px}
p,li{font-size:13px}ul{padding-left:18px}</style></head>
<body>${cvText.replace(/\n/g,"<br>")}</body></html>`;
}

function generateCoverLetterHtml(text: string, company: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter - ${company}</title>
<style>body{font-family:Georgia,serif;max-width:650px;margin:0 auto;padding:40px;color:#1a1a1a;line-height:1.7}
p{font-size:13px;margin-bottom:12px}</style></head>
<body>${text.replace(/\n/g,"<br>")}</body></html>`;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
]);

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^www\./, "");
}

function extractDomainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return normalizeDomain(new URL(withProtocol).hostname);
  } catch {
    return null;
  }
}

function extractDomainFromEmail(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return null;
  return normalizeDomain(parts[1]);
}

function validateBusinessEmail(
  email?: string | null,
  website?: string | null,
): { valid: boolean; normalized: string | null; reason?: string } {
  if (!email) return { valid: false, normalized: null, reason: "missing_email" };

  const normalized = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, normalized: null, reason: "invalid_format" };
  }

  const localPart = normalized.split("@")[0];
  const emailDomain = extractDomainFromEmail(normalized);
  if (!emailDomain) {
    return { valid: false, normalized: null, reason: "invalid_domain" };
  }

  if (PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
    return { valid: false, normalized: null, reason: "public_mailbox_not_allowed" };
  }

  if (
    /^no-?reply/.test(localPart) ||
    /(test|fake|sample|example|demo)/i.test(localPart) ||
    /example\./i.test(emailDomain)
  ) {
    return { valid: false, normalized: null, reason: "placeholder_or_no_reply" };
  }

  const websiteDomain = extractDomainFromUrl(website);
  if (websiteDomain) {
    const matchesWebsite = emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`);
    if (!matchesWebsite) {
      return { valid: false, normalized: null, reason: "domain_mismatch_with_website" };
    }
  }

  return { valid: true, normalized };
}

async function generateCvAndCoverLetter(company: string, category: string, description: string, apiKey: string) {
  try {
    const categoryLabel = category.replace(/_/g, " ");
      const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `Tailor this CV for a cold outreach to ${company} (a ${categoryLabel} company: ${description || ""}).

BASE CV:
${CV_BASE}

Return ONLY a JSON object with:
- "tailored_cv": full tailored CV text (well structured, 1-2 pages, highlight relevant skills for ${categoryLabel})
- "cover_letter": a concise personalized cover letter (200 words max, mention ${company} by name, sound human)

No markdown, no code fences. JSON only.`
        }],
        temperature: 0.5,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) { console.error("CV gen failed:", res.status); return null; }
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { return null; }
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("CV generation error:", e);
    return null;
  }
}

async function aiSearchEmails(query: string, apiKey: string, retries = 3): Promise<Array<{ company: string; email: string; website: string; description: string; location: string }>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = (attempt * 15000) + Math.random() * 10000;
        console.log(`  ⏳ Rate limit retry ${attempt}/${retries}, waiting ${Math.round(backoff/1000)}s...`);
        await new Promise(r => setTimeout(r, backoff));
      }

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: `You are a job research assistant. Search for real companies matching: "${query}"

Return ONLY a JSON array of objects. Each object must have:
- "company": company name (real companies only)
- "email": VERIFIED business contact email tied to the same company domain (never guess)
- "website": company website URL
- "description": what the company does (1 sentence)
- "location": company location

Find 5-8 REAL companies with VERIFIED business email addresses.
If verified email is not publicly available, skip that company (do not fabricate).

CRITICAL: Only return companies you are confident are real. Return valid JSON array only, no markdown, no code fences.`
          }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (response.status === 429 || response.status === 503) {
        console.warn(`  ⚠️ OpenRouter ${response.status} on attempt ${attempt + 1}`);
        await response.text();
        continue;
      }

      if (!response.ok) {
        console.error("OpenRouter search error:", response.status);
        await response.text();
        return [];
      }

      const rawText = await response.text();
      console.log("OpenRouter response status:", response.status, "length:", rawText.length);
      
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error("Failed to parse OpenRouter response:", rawText.substring(0, 200));
        return [];
      }
      
      const content = data.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("No JSON array found in content:", content.substring(0, 200));
        return [];
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed) ? parsed.filter((r: any) => r.email && r.company) : [];
    } catch (e) {
      console.error("AI search error:", e);
      return [];
    }
  }
  console.error("  ❌ All retries exhausted for query:", query);
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, categories, location } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "status") {
      const { count: totalCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true });
      const { count: sentCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_sent", true);
      const { count: openedCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_opened", true);
      const { count: repliedCount } = await supabase.from("scraped_companies").select("*", { count: "exact", head: true }).eq("email_replied", true);
      
      const { data: catData } = await supabase.from("scraped_companies").select("category");
      const categoryCounts: Record<string, number> = {};
      (catData || []).forEach((r: any) => {
        categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
      });

      return new Response(JSON.stringify({
        total: totalCount || 0,
        sent: sentCount || 0,
        opened: openedCount || 0,
        replied: repliedCount || 0,
        categories: categoryCounts,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "scrape") {
      const targetCategories = categories || CATEGORIES.map(c => c.name);
      const locationFilter = location || "UK";
      let totalScraped = 0;
      let totalNew = 0;
      let totalRejected = 0;
      const results: Array<{ category: string; found: number; new: number; rejected: number }> = [];

      for (const cat of CATEGORIES) {
        if (!targetCategories.includes(cat.name)) continue;

        let catFound = 0;
        let catNew = 0;
        let catRejected = 0;

        for (const query of cat.queries) {
          const fullQuery = `${query} ${locationFilter}`;
          console.log(`Scraping: ${fullQuery}`);
          
          const companies = await aiSearchEmails(fullQuery, lovableKey);
          catFound += companies.length;

          for (const company of companies) {
            try {
              const validation = validateBusinessEmail(company.email, company.website);
              if (!validation.valid || !validation.normalized) {
                catRejected++;
                continue;
              }

              const { error } = await supabase.from("scraped_companies").upsert({
                company_name: company.company,
                email: validation.normalized,
                website: company.website,
                category: cat.name,
                source: "ai_search",
                location: company.location || locationFilter,
                description: company.description,
                status: "scraped",
              }, { onConflict: "email,category" });

              if (!error) catNew++;
              else console.error("Upsert error:", error.message);
            } catch (e) {
              console.error(`Insert error for ${company.email}:`, e);
            }
          }

          // Longer delay between searches to avoid rate limits
          await new Promise(r => setTimeout(r, 8000 + Math.random() * 7000));
        }

        results.push({ category: cat.name, found: catFound, new: catNew, rejected: catRejected });
        totalScraped += catFound;
        totalNew += catNew;
        totalRejected += catRejected;
      }

      return new Response(JSON.stringify({
        success: true,
        totalScraped,
        totalNew,
        totalRejected,
        results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send_emails") {
      const targetCategories = categories || CATEGORIES.map(c => c.name);
      
      let query = supabase
        .from("scraped_companies")
        .select("*")
        .eq("email_sent", false)
        .eq("status", "scraped")
        .limit(20);

      if (targetCategories.length > 0) {
        query = query.in("category", targetCategories);
      }

      const { data: companies } = await query;
      if (!companies || companies.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, total: 0, message: "No unsent companies found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let sent = 0;
      const sendResults: Array<{ company: string; email: string; status: string }> = [];

      for (const company of companies) {
        try {
          const validation = validateBusinessEmail(company.email, company.website);
          if (!validation.valid || !validation.normalized) {
            await supabase.from("scraped_companies").update({ status: "invalid_email" }).eq("id", company.id);
            sendResults.push({ company: company.company_name, email: company.email, status: "invalid_email" });
            continue;
          }

          const recipientEmail = validation.normalized;
          const categoryLabel = company.category.replace(/_/g, " ");
          const emailResponse = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{
                role: "user",
                content: `Write a professional cold outreach email from Husnain Mahavia (Full-Stack Developer & AI Specialist, 8+ years experience) to ${company.company_name} (${categoryLabel} company).

Company info: ${company.description || ""}

The email should:
- Be concise (3-4 paragraphs max)
- Mention relevant skills for their industry (${categoryLabel})
- Highlight value I can bring
- Include a clear CTA for a call/meeting
- Sound natural and human, NOT like AI

Return ONLY a JSON object with "subject" and "body" fields. No markdown, no code fences.`
              }],
              temperature: 0.7,
              max_tokens: 800,
            }),
          });

          const emailRaw = await emailResponse.text();
          let emailData;
          try { emailData = JSON.parse(emailRaw); } catch { 
            sendResults.push({ company: company.company_name, email: recipientEmail, status: "email_gen_parse_failed" });
            continue;
          }
          
          const emailContent = emailData.choices?.[0]?.message?.content || "";
          const cleaned = emailContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          
          if (!jsonMatch) {
            sendResults.push({ company: company.company_name, email: recipientEmail, status: "email_gen_failed" });
            continue;
          }

          const { subject, body } = JSON.parse(jsonMatch[0]);

          // Generate tailored CV and cover letter
          const cvData = await generateCvAndCoverLetter(company.company_name, company.category, company.description || "", lovableKey);
          
          const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
          if (cvData?.tailored_cv) {
            attachments.push({
              filename: `Husnain_Mahavia_CV_${company.company_name.replace(/[^a-zA-Z0-9]/g, "_")}.html`,
              content: generateCvHtml(cvData.tailored_cv, company.company_name),
              contentType: "text/html",
            });
          }
          if (cvData?.cover_letter) {
            attachments.push({
              filename: `Cover_Letter_${company.company_name.replace(/[^a-zA-Z0-9]/g, "_")}.html`,
              content: generateCoverLetterHtml(cvData.cover_letter, company.company_name),
              contentType: "text/html",
            });
          }

          const emailBody = body + "\n\nPlease find my CV and cover letter attached.\n\nBest regards,\nHusnain Mahavia\n+44 7387 055617\nhusnainmahavia.1@gmail.com";

          const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: recipientEmail,
              subject,
              body: emailBody,
              attachments,
            }),
          });

          const sendResult = await sendResponse.json();

          if (sendResult.success || sendResult.sent) {
            await supabase.from("scraped_companies").update({
              email_sent: true,
              email_sent_at: new Date().toISOString(),
              status: "emailed",
            }).eq("id", company.id);

            sent++;
            sendResults.push({ company: company.company_name, email: recipientEmail, status: "sent" });
          } else {
            sendResults.push({ company: company.company_name, email: recipientEmail, status: sendResult.bounce ? "bounced" : "failed" });
            if (sendResult.bounce) {
              await supabase.from("scraped_companies").update({ status: "bounced" }).eq("id", company.id);
            }
          }

          // Human-like delay between emails
          await new Promise(r => setTimeout(r, 45000 + Math.random() * 75000));
        } catch (e) {
          console.error(`Email error for ${company.email}:`, e);
          sendResults.push({ company: company.company_name, email: company.email, status: "error" });
        }
      }

      return new Response(JSON.stringify({ success: true, sent, total: companies.length, results: sendResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data } = await supabase
        .from("scraped_companies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      return new Response(JSON.stringify({ data: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Scraper error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
