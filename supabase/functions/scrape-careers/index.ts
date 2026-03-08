import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;

const INVALID_EMAIL_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /your-?email/i, /placeholder/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.css$/i, /\.js$/i,
  /wixpress\.com$/i, /sentry\.io$/i, /cloudflare/i, /webpack/i,
  /schema\.org$/i, /w3\.org$/i, /googleapis\.com$/i, /gstatic\.com$/i,
];

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "aol.com", "protonmail.com", "proton.me", "gmx.com",
]);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

// Priority scoring for email local parts — higher = more likely to be the RIGHT contact
const EMAIL_PRIORITY: Record<string, number> = {
  "info": 100,
  "contact": 95,
  "enquiries": 90,
  "enquiry": 90,
  "hello": 85,
  "office": 80,
  "admin": 75,
  "reception": 70,
  "hr": 65,
  "careers": 65,
  "jobs": 60,
  "recruitment": 60,
  "talent": 55,
  "hiring": 55,
  "people": 50,
  "team": 45,
  "support": 40,
  "marketing": 35,
  "sales": 30,
};

function deobfuscateText(raw: string): string {
  return raw
    .replace(/&#64;/g, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".")
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

type ScoredEmail = { email: string; score: number; source: string };

/** Extract emails from mailto: links — these are the MOST reliable */
function extractMailtoEmails(html: string): ScoredEmail[] {
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  const results: ScoredEmail[] = [];
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = match[1].toLowerCase().trim();
    results.push({ email, score: 200, source: "mailto" }); // Highest priority
  }
  return results;
}

/** Extract emails from structured data (JSON-LD, schema.org) */
function extractStructuredEmails(html: string): ScoredEmail[] {
  const results: ScoredEmail[] = [];
  // JSON-LD blocks
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const findEmails = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        if (typeof obj.email === "string") {
          const email = obj.email.replace(/^mailto:/i, "").toLowerCase().trim();
          if (EMAIL_REGEX.test(email)) results.push({ email, score: 180, source: "json-ld" });
        }
        if (typeof obj.contactPoint === "object") findEmails(obj.contactPoint);
        if (Array.isArray(obj.contactPoint)) obj.contactPoint.forEach(findEmails);
        if (Array.isArray(obj)) obj.forEach(findEmails);
      };
      findEmails(data);
    } catch { /* ignore parse errors */ }
  }
  return results;
}

/** Extract emails from page text with priority scoring */
function extractTextEmails(html: string): ScoredEmail[] {
  const text = deobfuscateText(html.replace(/<[^>]*>/g, " "));
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches)].map(email => {
    const lower = email.toLowerCase();
    const localPart = lower.split("@")[0];
    const priority = EMAIL_PRIORITY[localPart] || 10;
    return { email: lower, score: priority, source: "text" };
  });
}

/** Filter out invalid emails */
function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1];
  if (!domain) return false;
  if (PUBLIC_DOMAINS.has(domain)) return false;
  if (INVALID_EMAIL_PATTERNS.some(p => p.test(lower))) return false;
  if (lower.startsWith("no-reply@") || lower.startsWith("noreply@")) return false;
  if (lower.startsWith("mailer-daemon@")) return false;
  return true;
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function scrapeUrl(url: string): Promise<ScoredEmail[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return [];
    const html = await res.text();

    // Extract from ALL sources, each with its own priority score
    const mailto = extractMailtoEmails(html);
    const structured = extractStructuredEmails(html);
    const text = extractTextEmails(html);

    return [...mailto, ...structured, ...text].filter(e => isValidEmail(e.email));
  } catch {
    // Silent fail
  }

  // Retry with www. prefix
  if (!url.includes("www.")) {
    try {
      const wwwUrl = url.replace("https://", "https://www.");
      const res = await fetch(wwwUrl, {
        headers: { "User-Agent": randomUA(), "Accept": "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const mailto = extractMailtoEmails(html);
        const structured = extractStructuredEmails(html);
        const text = extractTextEmails(html);
        return [...mailto, ...structured, ...text].filter(e => isValidEmail(e.email));
      }
    } catch { /* Silent fail */ }
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain, url } = await req.json();

    // If a direct URL is provided, scrape it
    if (url) {
      console.log(`🔍 Scraping URL: ${url}`);
      const scored = await scrapeUrl(url);
      // Deduplicate and sort by score
      const emailMap = new Map<string, ScoredEmail>();
      for (const e of scored) {
        const existing = emailMap.get(e.email);
        if (!existing || e.score > existing.score) emailMap.set(e.email, e);
      }
      const sorted = [...emailMap.values()].sort((a, b) => b.score - a.score);
      const emails = sorted.map(e => e.email);
      console.log(`📧 Found ${emails.length} emails, best: ${emails[0] || "none"} (source: ${sorted[0]?.source || "none"})`);
      return new Response(JSON.stringify({ url, emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!companyDomain) {
      return new Response(JSON.stringify({ error: "companyDomain or url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = companyDomain.toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    console.log(`🌐 Discovering emails for: ${domain}`);

    // Prioritize contact/about pages which are most likely to have official emails
    const candidatePages = [
      `https://${domain}/contact`,
      `https://${domain}/contact-us`,
      `https://${domain}`,              // Homepage often has mailto links
      `https://${domain}/about`,
      `https://${domain}/about-us`,
      `https://${domain}/careers`,
      `https://${domain}/careers/contact`,
      `https://${domain}/jobs`,
      `https://${domain}/team`,
      `https://www.${domain}/contact`,
      `https://www.${domain}`,
      `https://www.${domain}/about`,
    ];

    const allScored: ScoredEmail[] = [];
    const pagesScraped: string[] = [];

    // Scrape in parallel batches of 4
    for (let i = 0; i < candidatePages.length; i += 4) {
      const batch = candidatePages.slice(i, i + 4);
      const results = await Promise.all(batch.map(async (pageUrl) => {
        const emails = await scrapeUrl(pageUrl);
        return { pageUrl, emails };
      }));

      for (const { pageUrl, emails } of results) {
        if (emails.length > 0) {
          allScored.push(...emails);
          pagesScraped.push(pageUrl);
          console.log(`  ✅ Found ${emails.length} emails on ${pageUrl} (best: ${emails.sort((a, b) => b.score - a.score)[0]?.email})`);
        }
      }

      // If we have a high-confidence mailto email, we can stop early
      const hasMailto = allScored.some(e => e.source === "mailto");
      if (hasMailto && allScored.length >= 3) break;
    }

    // Deduplicate, keeping highest score per email
    const emailMap = new Map<string, ScoredEmail>();
    for (const e of allScored) {
      const existing = emailMap.get(e.email);
      if (!existing || e.score > existing.score) emailMap.set(e.email, e);
    }

    // Sort by score descending — best email first
    const sorted = [...emailMap.values()].sort((a, b) => b.score - a.score);
    const uniqueEmails = sorted.map(e => e.email);

    console.log(`📧 Total unique emails for ${domain}: ${uniqueEmails.length}`);
    if (sorted.length > 0) {
      console.log(`  🏆 Best: ${sorted[0].email} (score: ${sorted[0].score}, source: ${sorted[0].source})`);
    }

    return new Response(JSON.stringify({
      domain,
      emails: uniqueEmails,
      emailDetails: sorted.slice(0, 10).map(e => ({ email: e.email, score: e.score, source: e.source })),
      pagesScraped,
      strategy: "mailto-first + structured-data + text-extraction (priority-scored)",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("scrape-careers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
