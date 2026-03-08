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
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function deobfuscateText(raw: string): string {
  return raw
    .replace(/&#64;/g, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".")
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s+at\s+/gi, "@").replace(/\s+dot\s+/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function extractEmails(html: string): string[] {
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

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function scrapeUrl(url: string): Promise<string[]> {
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

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return [];
      const html = await res.text();
      return extractEmails(html);
    }
  } catch {
    // Silent fail — move to next URL
  }

  // Retry with www. prefix if bare domain failed
  if (!url.includes("www.")) {
    try {
      const wwwUrl = url.replace("https://", "https://www.");
      const res = await fetch(wwwUrl, {
        headers: {
          "User-Agent": randomUA(),
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        return extractEmails(html);
      }
    } catch {
      // Silent fail
    }
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

    // Scrape in parallel batches of 4 for speed
    for (let i = 0; i < candidatePages.length; i += 4) {
      if (allEmails.length >= 5) break;

      const batch = candidatePages.slice(i, i + 4);
      const results = await Promise.all(batch.map(async (pageUrl) => {
        const emails = await scrapeUrl(pageUrl);
        return { pageUrl, emails };
      }));

      for (const { pageUrl, emails } of results) {
        if (emails.length > 0) {
          allEmails.push(...emails);
          pagesScraped.push(pageUrl);
          console.log(`  ✅ Found ${emails.length} emails on ${pageUrl}`);
        }
      }
    }

    const uniqueEmails = [...new Set(allEmails)];
    console.log(`📧 Total unique emails found for ${domain}: ${uniqueEmails.length} (no paid APIs used)`);

    return new Response(JSON.stringify({
      domain,
      emails: uniqueEmails,
      pagesScraped,
      strategy: "self-sustaining (User-Agent rotation, parallel scraping, no paid APIs)",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("scrape-careers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
