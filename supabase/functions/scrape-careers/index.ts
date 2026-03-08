import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// RFC 5322-compliant email regex
const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;

const INVALID_EMAIL_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /your-?email/i, /placeholder/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.css$/i, /\.js$/i,
  /wixpress\.com$/i, /sentry\.io$/i, /cloudflare/i, /webpack/i,
];

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "aol.com", "protonmail.com", "proton.me", "gmx.com",
]);

function deobfuscateText(raw: string): string {
  return raw
    .replace(/&#64;/g, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".")
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s+at\s+/gi, "@").replace(/\s+dot\s+/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function extractEmails(html: string): string[] {
  // Strip HTML tags
  const text = deobfuscateText(html.replace(/<[^>]*>/g, " "));
  const matches = text.match(EMAIL_REGEX) || [];

  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    if (PUBLIC_DOMAINS.has(lower.split("@")[1])) return false;
    if (INVALID_EMAIL_PATTERNS.some(p => p.test(lower))) return false;
    if (lower.startsWith("no-reply@") || lower.startsWith("noreply@")) return false;
    return true;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain, url } = await req.json();

    // If a direct URL is provided, scrape it
    if (url) {
      console.log(`🔍 Scraping URL: ${url}`);
      const emails = await scrapeUrl(url);
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
    console.log(`🌐 Discovering career pages for: ${domain}`);

    // Candidate pages ordered by likelihood of containing HR emails
    const candidatePages = [
      `https://${domain}/contact`,
      `https://${domain}/contact-us`,
      `https://${domain}/about`,
      `https://${domain}/about-us`,
      `https://${domain}/careers`,
      `https://${domain}/careers/contact`,
      `https://${domain}/jobs`,
      `https://${domain}/team`,
      `https://${domain}/hiring`,
      `https://www.${domain}/contact`,
      `https://www.${domain}/careers`,
      `https://careers.${domain}`,
    ];

    const allEmails: string[] = [];
    const pagesScraped: string[] = [];

    for (const pageUrl of candidatePages) {
      if (allEmails.length >= 5) break; // Enough emails found

      const emails = await scrapeUrl(pageUrl);
      if (emails.length > 0) {
        allEmails.push(...emails);
        pagesScraped.push(pageUrl);
        console.log(`  ✅ Found ${emails.length} emails on ${pageUrl}`);
      }
    }

    const uniqueEmails = [...new Set(allEmails)];
    console.log(`📧 Total unique emails found for ${domain}: ${uniqueEmails.length}`);

    return new Response(JSON.stringify({
      domain,
      emails: uniqueEmails,
      pagesScraped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("scrape-careers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function scrapeUrl(url: string): Promise<string[]> {
  // Step 1: Try basic fetch first (fast, free)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      const emails = extractEmails(html);
      if (emails.length > 0) return emails;
    }
  } catch {
    // Fall through to ScrapingBee
  }

  // Step 2: Fallback to ScrapingBee for JS-rendered content
  return scrapeWithScrapingBee(url);
}

async function scrapeWithScrapingBee(url: string): Promise<string[]> {
  const SCRAPINGBEE_KEY = Deno.env.get("SCRAPINGBEE_API_KEY");
  if (!SCRAPINGBEE_KEY) {
    console.log("⚠️ SCRAPINGBEE_API_KEY not set, skipping JS-rendered scrape");
    return [];
  }

  try {
    console.log(`🐝 ScrapingBee fallback for: ${url}`);
    const res = await fetch(
      `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_KEY}&url=${encodeURIComponent(url)}&render_js=true&premium_proxy=false`,
      { signal: AbortSignal.timeout(30000) }
    );

    if (!res.ok) {
      console.error(`ScrapingBee error ${res.status}`);
      return [];
    }

    const html = await res.text();
    const emails = extractEmails(html);
    if (emails.length > 0) {
      console.log(`🐝 ScrapingBee found ${emails.length} emails on ${url}`);
    }
    return emails;
  } catch (e) {
    console.error("ScrapingBee fetch failed:", e);
    return [];
  }
}
