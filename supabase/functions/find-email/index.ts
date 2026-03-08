import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HR_KEYWORDS = ["hr", "recruit", "talent", "hiring", "people", "careers", "jobs"];

type FoundEmail = {
  email: string;
  name: string;
  title: string;
  confidence: number;
  isHR: boolean;
  source: "hunter" | "scrape" | "ai_verified" | "ai_pattern";
  verifiedStatus?: string;
};

function normalizeDomain(input: string): string {
  let d = input
    .toLowerCase()
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0]
    .replace(/\s+/g, "");

  // Strip common career/jobs subdomains to get the root company domain
  d = d.replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
  return d;
}

function deobfuscateEmails(text: string): string {
  return text
    .replace(/\[at\]|\(at\)|\sat\s/gi, "@")
    .replace(/\[dot\]|\(dot\)|\sdot\s/gi, ".")
    .replace(/&#64;/g, "@")
    .replace(/&#46;/g, ".");
}

function extractEmailsFromText(text: string, domain: string): string[] {
  const cleanText = deobfuscateEmails(text);
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = cleanText.match(emailRegex) || [];
  const normalizedDomain = normalizeDomain(domain);

  return [...new Set(matches
    .map((e) => e.toLowerCase().trim())
    .filter((email) => email.endsWith(`@${normalizedDomain}`) || email.endsWith(`.${normalizedDomain}`)))];
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableEmailFinder/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function scrapeDomainEmails(domain: string): Promise<string[]> {
  const urls = [
    `https://${domain}`,
    `https://${domain}/contact`,
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/about`,
  ];

  const pages = await Promise.all(urls.map((url) => fetchPage(url)));
  const found = new Set<string>();

  for (const html of pages) {
    if (!html) continue;
    const emails = extractEmailsFromText(html, domain);
    emails.forEach((e) => found.add(e));
  }

  return [...found];
}

async function verifyEmailWithHunter(email: string, hunterKey: string): Promise<{ ok: boolean; score: number; status: string }> {
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${hunterKey}`,
      { signal: AbortSignal.timeout(8000) },
    );

    if (!res.ok) return { ok: false, score: 0, status: "verify_failed" };

    const json = await res.json();
    const data = json?.data;
    const status = String(data?.status || "unknown");
    const score = Number(data?.score || 0);
    const acceptable = status === "valid" || status === "accept_all";

    return { ok: acceptable, score, status };
  } catch {
    return { ok: false, score: 0, status: "verify_error" };
  }
}

async function generateAiLocalParts(params: {
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
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Generate likely corporate recruiting mailbox local-parts only. Never include domains. Prioritize role-based inboxes and realistic patterns.",
          },
          {
            role: "user",
            content: `Company: ${companyName}\nDomain: ${domain}\nHiring manager: ${hiringManagerName || "unknown"}\nReturn 8-12 local parts likely used for hiring contact addresses.`,
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
                local_parts: {
                  type: "array",
                  items: { type: "string" },
                },
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
      .filter((p) => /^[a-z0-9._+-]{2,40}$/.test(p)))].slice(0, 12);
  } catch {
    return [];
  }
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
    const HUNTER_KEY = Deno.env.get("HUNTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    console.log(`🔍 Enhanced email lookup for domain: ${domain}`);

    const foundEmails = new Map<string, FoundEmail>();

    // 1) Hunter domain search (primary)
    if (HUNTER_KEY) {
      const hunterRes = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=10`,
        { signal: AbortSignal.timeout(10000) },
      );

      if (hunterRes.ok) {
        const { data } = await hunterRes.json();
        const hunterEmails = (data?.emails || []) as any[];

        for (const e of hunterEmails) {
          const email = String(e?.value || "").toLowerCase().trim();
          if (!email) continue;
          foundEmails.set(email, {
            email,
            name: `${e?.first_name || ""} ${e?.last_name || ""}`.trim(),
            title: e?.position || "",
            confidence: Number(e?.confidence || 0),
            isHR: HR_KEYWORDS.some((k) => String(e?.position || "").toLowerCase().includes(k) || email.includes(k)),
            source: "hunter",
            verifiedStatus: "valid",
          });
        }
      } else {
        const err = await hunterRes.text();
        console.error(`Hunter domain-search error: ${hunterRes.status}`, err);
      }
    }

    // 2) Scrape public pages for direct emails
    const scrapedEmails = await scrapeDomainEmails(domain);
    for (const email of scrapedEmails) {
      if (!foundEmails.has(email)) {
        foundEmails.set(email, {
          email,
          name: "",
          title: "",
          confidence: 70,
          isHR: HR_KEYWORDS.some((k) => email.includes(k)),
          source: "scrape",
        });
      }
    }

    // 3) AI-generated candidate patterns + Hunter verifier (only if we still have weak results)
    const strongCount = [...foundEmails.values()].filter((e) => e.confidence >= 80).length;
    if (strongCount < 2) {
      const basePatterns = ["hr", "careers", "jobs", "recruitment", "talent", "hiring", "people", "hello", "info"];
      const aiPatterns = await generateAiLocalParts({
        domain,
        companyName,
        hiringManagerName,
        lovableKey: LOVABLE_API_KEY,
      });

      const localParts = [...new Set([...basePatterns, ...aiPatterns])].slice(0, 16);

      if (localParts.length > 0) {
        const candidates = localParts.map((local) => `${local}@${domain}`);

        if (HUNTER_KEY) {
          const verifications = await Promise.all(
            candidates.map(async (candidate) => ({
              candidate,
              result: await verifyEmailWithHunter(candidate, HUNTER_KEY),
            })),
          );

          for (const { candidate, result } of verifications) {
            if (!result.ok || foundEmails.has(candidate)) continue;
            foundEmails.set(candidate, {
              email: candidate,
              name: "",
              title: "",
              confidence: Math.max(50, Math.min(95, result.score)),
              isHR: HR_KEYWORDS.some((k) => candidate.includes(k)),
              source: "ai_verified",
              verifiedStatus: result.status,
            });
          }
        } else {
          for (const candidate of candidates.slice(0, 5)) {
            if (foundEmails.has(candidate)) continue;
            foundEmails.set(candidate, {
              email: candidate,
              name: "",
              title: "",
              confidence: 45,
              isHR: HR_KEYWORDS.some((k) => candidate.includes(k)),
              source: "ai_pattern",
            });
          }
        }
      }
    }

    const emails = [...foundEmails.values()]
      .sort((a, b) => {
        const aHr = a.isHR ? 1 : 0;
        const bHr = b.isHR ? 1 : 0;
        if (bHr !== aHr) return bHr - aHr;
        return b.confidence - a.confidence;
      })
      .slice(0, 12);

    console.log(`✅ Enhanced lookup found ${emails.length} emails for ${domain}`);

    return new Response(JSON.stringify({
      domain,
      organization: companyName || domain,
      emails,
      totalFound: emails.length,
      strategy: "hunter + scrape + ai-pattern + verification",
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
