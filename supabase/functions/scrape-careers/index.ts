import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;

// Expanded fake email blocklist per PDF strategy
const FAKE_EMAIL_PREFIXES = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "notification", "notifications", "alerts", "alert",
  "admin", "webmaster", "postmaster", "hostmaster",
  "automated", "mailer-daemon", "daemon", "bounce",
  "abuse", "root", "nobody", "null",
]);

const INVALID_EMAIL_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /your-?email/i, /placeholder/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.css$/i, /\.js$/i,
  /wixpress\.com$/i, /sentry\.io$/i, /cloudflare/i, /webpack/i,
  /schema\.org$/i, /w3\.org$/i, /googleapis\.com$/i, /gstatic\.com$/i,
  /noreply\.com$/i, /reply\.com$/i,
];

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "aol.com", "protonmail.com", "proton.me", "gmx.com",
  "googlemail.com", "yahoo.co.uk",
]);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

// Updated scoring per PDF — job-hunting optimized priorities
const EMAIL_PRIORITY: Record<string, number> = {
  "careers": 90,
  "hiring": 90,
  "hr": 85,
  "jobs": 85,
  "talent": 85,
  "recruitment": 85,
  "people": 60,
  "team": 55,
  "contact": 50,
  "hello": 50,
  "enquiries": 45,
  "enquiry": 45,
  "info": 40,    // PDF: often unmonitored
  "office": 40,
  "reception": 35,
  "marketing": 30,
  "sales": 30,
  "support": 20, // PDF: wrong department
};

function deobfuscateText(raw: string): string {
  return raw
    .replace(/&#64;/g, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".")
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

type ScoredEmail = { email: string; score: number; source: string };

/** Extract emails from mailto: links — highest reliability */
function extractMailtoEmails(html: string): ScoredEmail[] {
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  const results: ScoredEmail[] = [];
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = match[1].toLowerCase().trim();
    results.push({ email, score: 200, source: "mailto" });
  }
  return results;
}

/** Extract emails from structured data (JSON-LD, schema.org) */
function extractStructuredEmails(html: string): ScoredEmail[] {
  const results: ScoredEmail[] = [];
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
    } catch { /* ignore */ }
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

/** Filter out invalid/fake emails per PDF strategy */
function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1];
  const localPart = lower.split("@")[0];
  if (!domain) return false;
  if (PUBLIC_DOMAINS.has(domain)) return false;
  if (INVALID_EMAIL_PATTERNS.some(p => p.test(lower))) return false;
  if (FAKE_EMAIL_PREFIXES.has(localPart)) return false;
  // Also check prefixes with hyphens stripped
  if (FAKE_EMAIL_PREFIXES.has(localPart.replace(/-/g, ""))) return false;
  return true;
}

/** Generate pattern-guessed emails for a domain (Layer 4C from PDF) */
function generatePatternEmails(domain: string): ScoredEmail[] {
  const patterns = ["hr", "careers", "hiring", "jobs", "talent", "recruitment"];
  return patterns.map(prefix => ({
    email: `${prefix}@${domain}`,
    score: EMAIL_PRIORITY[prefix] || 50,
    source: "pattern_guess",
  }));
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

    const mailto = extractMailtoEmails(html);
    const structured = extractStructuredEmails(html);
    const text = extractTextEmails(html);

    return [...mailto, ...structured, ...text].filter(e => isValidEmail(e.email));
  } catch { /* Silent fail */ }

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

/** Verify email via DNS MX lookup (self-sustaining, no API needed) */
async function verifyMxRecord(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    return records && records.length > 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain, url } = await req.json();

    // Direct URL scrape
    if (url) {
      console.log(`🔍 Scraping URL: ${url}`);
      const scored = await scrapeUrl(url);
      const emailMap = new Map<string, ScoredEmail>();
      for (const e of scored) {
        const existing = emailMap.get(e.email);
        if (!existing || e.score > existing.score) emailMap.set(e.email, e);
      }
      const sorted = [...emailMap.values()].sort((a, b) => b.score - a.score);
      const emails = sorted.map(e => e.email);
      console.log(`📧 Found ${emails.length} emails, best: ${emails[0] || "none"}`);
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

    // Layer 1: Scrape priority pages (contact, careers, about, homepage)
    const candidatePages = [
      `https://${domain}/contact`,
      `https://${domain}/contact-us`,
      `https://${domain}`,
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
          console.log(`  ✅ Found ${emails.length} emails on ${pageUrl}`);
        }
      }

      // Early exit if high-confidence mailto found
      const hasMailto = allScored.some(e => e.source === "mailto");
      if (hasMailto && allScored.length >= 3) break;
    }

    // Layer 4C: Pattern guessing fallback if no emails found
    if (allScored.length === 0) {
      console.log(`🔮 No emails found, trying pattern guessing for ${domain}...`);
      const hasMx = await verifyMxRecord(domain);
      if (hasMx) {
        const guessed = generatePatternEmails(domain);
        // Verify each guessed email via MX (domain already verified)
        for (const g of guessed) {
          allScored.push({ ...g, score: g.score - 10 }); // Slightly lower score for guesses
        }
        console.log(`  🎯 Generated ${guessed.length} pattern emails (MX verified for ${domain})`);
      } else {
        console.log(`  ❌ Domain ${domain} has no MX records, skipping pattern guessing`);
      }
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
      strategy: "pdf-strategy: mailto-first + structured-data + text-extraction + pattern-guessing (priority-scored)",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("scrape-careers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
