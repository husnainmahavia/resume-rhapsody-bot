import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HR_KEYWORDS = ["hr", "recruit", "talent", "hiring", "people", "careers", "jobs"];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

type FoundEmail = {
  email: string;
  name: string;
  title: string;
  confidence: number;
  isHR: boolean;
  source: "scrape" | "ai_pattern" | "mx_verified" | "common_pattern";
  verifiedStatus?: string;
};

function normalizeDomain(input: string): string {
  let d = input
    .toLowerCase()
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0]
    .replace(/\s+/g, "");
  d = d.replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
  return d;
}

function deobfuscateEmails(text: string): string {
  return text
    .replace(/\[at\]|\(at\)|\sat\s/gi, "@")
    .replace(/\[dot\]|\(dot\)|\sdot\s/gi, ".")
    .replace(/&#64;/g, "@")
    .replace(/&#46;/g, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function extractEmailsFromText(text: string, domain: string): string[] {
  const cleanText = deobfuscateEmails(text);
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = cleanText.match(emailRegex) || [];
  const normalizedDomain = normalizeDomain(domain);

  return [...new Set(matches
    .map((e) => e.toLowerCase().trim())
    .filter((email) => {
      const emailDomain = email.split("@")[1];
      if (!emailDomain) return false;
      // Match exact domain or subdomain
      if (emailDomain === normalizedDomain || emailDomain.endsWith(`.${normalizedDomain}`)) return true;
      return false;
    })
    .filter((email) => {
      // Filter out noreply, test, image files etc.
      const local = email.split("@")[0];
      if (/^no-?reply/.test(local)) return false;
      if (/\.(png|jpg|gif|svg|css|js)$/i.test(email)) return false;
      if (/(example|test|fake|placeholder)/i.test(email)) return false;
      return true;
    }))];
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function scrapeDomainEmails(domain: string): Promise<string[]> {
  const urls = [
    `https://${domain}`,
    `https://${domain}/contact`,
    `https://${domain}/contact-us`,
    `https://${domain}/about`,
    `https://${domain}/about-us`,
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/team`,
    `https://www.${domain}/contact`,
    `https://www.${domain}/careers`,
  ];

  // Fetch in parallel batches of 4
  const found = new Set<string>();
  for (let i = 0; i < urls.length; i += 4) {
    const batch = urls.slice(i, i + 4);
    const pages = await Promise.all(batch.map((url) => fetchPage(url)));
    for (const html of pages) {
      if (!html) continue;
      const emails = extractEmailsFromText(html, domain);
      emails.forEach((e) => found.add(e));
    }
    if (found.size >= 5) break; // Early exit if we have enough
  }
  return [...found];
}

/** Check if domain has valid MX records (proves the domain accepts email) */
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Generate common corporate email patterns for a domain */
function generateCommonPatterns(domain: string, hiringManagerName?: string): string[] {
  const patterns = [
    "hr", "careers", "jobs", "recruitment", "talent", "hiring", "people",
    "hello", "info", "contact", "enquiries", "team", "apply",
    "admin", "office", "reception", "marketing",
  ];

  // Add name-based patterns if hiring manager name provided
  if (hiringManagerName) {
    const parts = hiringManagerName.toLowerCase().trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0].replace(/[^a-z]/g, "");
      const last = parts[parts.length - 1].replace(/[^a-z]/g, "");
      if (first && last) {
        patterns.push(
          `${first}.${last}`,
          `${first}${last}`,
          `${first[0]}${last}`,
          `${first}`,
          `${last}`,
          `${first[0]}.${last}`,
        );
      }
    }
  }

  return [...new Set(patterns)].map((p) => `${p}@${domain}`);
}

/** Use AI to generate smart email pattern guesses */
async function generateAiPatterns(params: {
  domain: string;
  companyName?: string;
  hiringManagerName?: string;
  lovableKey?: string | null;
}): Promise<string[]> {
  const { domain, companyName = "", hiringManagerName = "", lovableKey } = params;
  if (!lovableKey) return [];

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "Generate likely corporate email local-parts only (before the @). Focus on HR/recruiting/contact mailboxes and personal name patterns. Never include domains.",
          },
          {
            role: "user",
            content: `Company: ${companyName}\nDomain: ${domain}\nHiring manager: ${hiringManagerName || "unknown"}\nReturn 8-15 local parts likely used for hiring contact addresses at this specific company.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_candidates",
            description: "Return candidate local parts",
            parameters: {
              type: "object",
              properties: {
                local_parts: { type: "array", items: { type: "string" } },
              },
              required: ["local_parts"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_candidates" } },
      }),
    });

    if (!response.ok) return [];
    const json = await response.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return [];

    const parsed = JSON.parse(args);
    const parts = (parsed?.local_parts || []) as string[];

    return [...new Set(parts
      .map((p) => p.toLowerCase().trim())
      .filter((p) => /^[a-z0-9._+-]{2,40}$/.test(p)))].slice(0, 15);
  } catch {
    return [];
  }
}

/** Try to verify email exists by checking if domain has MX + applying heuristics */
async function scoreEmail(email: string, domain: string, mxValid: boolean): Promise<number> {
  if (!mxValid) return 10; // Domain doesn't even accept email

  const local = email.split("@")[0];

  // Higher confidence for role-based emails (these almost always exist)
  const roleAddresses = ["info", "hello", "contact", "hr", "careers", "jobs", "admin", "office", "team", "enquiries", "reception"];
  if (roleAddresses.includes(local)) return 80;

  // HR-related keywords get good scores
  if (HR_KEYWORDS.some((k) => local.includes(k))) return 75;

  // Marketing/business dev
  if (["marketing", "sales", "partnerships", "press"].includes(local)) return 65;

  // Name-based patterns (likely real if domain has MX)
  if (/^[a-z]+\.[a-z]+$/.test(local)) return 60; // firstname.lastname
  if (/^[a-z][a-z]+$/.test(local) && local.length > 3) return 50; // single name

  return 45;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain, companyName, hiringManagerName } = await req.json();
    if (!companyDomain) {
      return new Response(JSON.stringify({ error: "companyDomain is required", emails: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = normalizeDomain(companyDomain);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    console.log(`🔍 Self-sustaining email lookup for domain: ${domain}`);

    const foundEmails = new Map<string, FoundEmail>();

    // Step 1: Check MX records (proves domain accepts email)
    const mxValid = await hasMxRecords(domain);
    console.log(`📬 MX records for ${domain}: ${mxValid ? "VALID" : "NONE"}`);

    // Step 2: Scrape public pages for direct emails (FREE)
    const scrapedEmails = await scrapeDomainEmails(domain);
    for (const email of scrapedEmails) {
      const confidence = await scoreEmail(email, domain, mxValid);
      foundEmails.set(email, {
        email,
        name: "",
        title: "",
        confidence,
        isHR: HR_KEYWORDS.some((k) => email.includes(k)),
        source: "scrape",
        verifiedStatus: mxValid ? "mx_valid" : "mx_unknown",
      });
    }

    console.log(`🌐 Scraped ${scrapedEmails.length} emails from public pages`);

    // Step 3: Generate common patterns + AI patterns (FREE)
    const strongCount = [...foundEmails.values()].filter((e) => e.confidence >= 70).length;
    if (strongCount < 2) {
      const commonCandidates = generateCommonPatterns(domain, hiringManagerName);
      const aiLocalParts = await generateAiPatterns({
        domain,
        companyName,
        hiringManagerName,
        lovableKey: LOVABLE_API_KEY,
      });
      const aiCandidates = aiLocalParts.map((p) => `${p}@${domain}`);

      // Merge and deduplicate
      const allCandidates = [...new Set([...commonCandidates, ...aiCandidates])];

      for (const candidate of allCandidates) {
        if (foundEmails.has(candidate)) continue;
        const confidence = await scoreEmail(candidate, domain, mxValid);
        const source = aiCandidates.includes(candidate) ? "ai_pattern" : "common_pattern";
        foundEmails.set(candidate, {
          email: candidate,
          name: "",
          title: "",
          confidence: mxValid ? confidence : Math.min(confidence, 30),
          isHR: HR_KEYWORDS.some((k) => candidate.includes(k)),
          source: source as "ai_pattern" | "common_pattern",
          verifiedStatus: mxValid ? "mx_valid" : "mx_invalid",
        });
      }

      console.log(`🧠 Generated ${allCandidates.length} pattern candidates`);
    }

    // Sort: HR first, then by confidence
    const emails = [...foundEmails.values()]
      .sort((a, b) => {
        const aHr = a.isHR ? 1 : 0;
        const bHr = b.isHR ? 1 : 0;
        if (bHr !== aHr) return bHr - aHr;
        return b.confidence - a.confidence;
      })
      .slice(0, 12);

    console.log(`✅ Found ${emails.length} emails for ${domain} (MX: ${mxValid})`);

    return new Response(JSON.stringify({
      domain,
      organization: companyName || domain,
      emails,
      totalFound: emails.length,
      mxValid,
      strategy: "scrape + ai-pattern + mx-validation (self-sustaining, no paid APIs)",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("find-email error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
      emails: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
