import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HR_KEYWORDS = ["hr", "recruit", "talent", "hiring", "people", "careers", "jobs"];
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

const INVALID_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /\.png$/i, /\.jpg$/i, /\.gif$/i,
  /\.svg$/i, /\.css$/i, /\.js$/i, /schema\.org$/i, /w3\.org$/i,
  /googleapis\.com$/i, /gstatic\.com$/i, /wixpress\.com$/i,
];

// Priority for email local parts — higher = more likely the official contact
const LOCAL_PART_PRIORITY: Record<string, number> = {
  "info": 100, "contact": 95, "enquiries": 90, "enquiry": 90,
  "hello": 85, "office": 80, "admin": 75, "reception": 70,
  "hr": 65, "careers": 65, "jobs": 60, "recruitment": 60,
  "talent": 55, "hiring": 55, "people": 50, "team": 45,
  "support": 40, "marketing": 35, "sales": 30,
};

type FoundEmail = {
  email: string;
  name: string;
  title: string;
  confidence: number;
  isHR: boolean;
  source: "mailto" | "json-ld" | "scrape" | "ai_pattern" | "mx_verified" | "common_pattern";
  verifiedStatus?: string;
};

function normalizeDomain(input: string): string {
  let d = input.toLowerCase().trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].replace(/\s+/g, "");
  d = d.replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
  return d;
}

function deobfuscateText(text: string): string {
  return text
    .replace(/\[at\]|\(at\)/gi, "@").replace(/\[dot\]|\(dot\)/gi, ".")
    .replace(/&#64;/g, "@").replace(/&#46;/g, ".").replace(/&amp;/g, "&")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function isValidEmail(email: string, domain: string): boolean {
  const lower = email.toLowerCase();
  const emailDomain = lower.split("@")[1];
  if (!emailDomain) return false;
  if (emailDomain !== domain && !emailDomain.endsWith(`.${domain}`)) return false;
  const local = lower.split("@")[0];
  if (/^no-?reply/.test(local)) return false;
  if (/(test|fake|sample|example|demo|placeholder)/i.test(lower)) return false;
  if (INVALID_PATTERNS.some(p => p.test(lower))) return false;
  return true;
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
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
    return await res.text();
  } catch { return ""; }
}

type ScoredEmail = { email: string; score: number; source: string };

/** Extract mailto: links — most reliable source */
function extractMailto(html: string, domain: string): ScoredEmail[] {
  const regex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  const results: ScoredEmail[] = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const email = m[1].toLowerCase().trim();
    if (isValidEmail(email, domain)) {
      const local = email.split("@")[0];
      const basePriority = LOCAL_PART_PRIORITY[local] || 20;
      results.push({ email, score: 200 + basePriority, source: "mailto" });
    }
  }
  return results;
}

/** Extract from JSON-LD structured data */
function extractJsonLd(html: string, domain: string): ScoredEmail[] {
  const results: ScoredEmail[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const find = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        if (typeof obj.email === "string") {
          const email = obj.email.replace(/^mailto:/i, "").toLowerCase().trim();
          if (isValidEmail(email, domain)) {
            results.push({ email, score: 180, source: "json-ld" });
          }
        }
        if (obj.contactPoint) {
          if (Array.isArray(obj.contactPoint)) obj.contactPoint.forEach(find);
          else find(obj.contactPoint);
        }
        if (Array.isArray(obj)) obj.forEach(find);
      };
      find(data);
    } catch { /* ignore */ }
  }
  return results;
}

/** Extract from page text */
function extractText(html: string, domain: string): ScoredEmail[] {
  const text = deobfuscateText(html.replace(/<[^>]*>/g, " "));
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches)]
    .map(e => e.toLowerCase())
    .filter(e => isValidEmail(e, domain))
    .map(email => {
      const local = email.split("@")[0];
      const priority = LOCAL_PART_PRIORITY[local] || 10;
      return { email, score: priority, source: "scrape" };
    });
}

async function scrapeDomainEmails(domain: string): Promise<ScoredEmail[]> {
  const urls = [
    `https://${domain}/contact`,
    `https://${domain}/contact-us`,
    `https://${domain}`,
    `https://${domain}/about`,
    `https://${domain}/about-us`,
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/team`,
    `https://www.${domain}/contact`,
    `https://www.${domain}`,
    `https://www.${domain}/about`,
  ];

  const allScored: ScoredEmail[] = [];
  for (let i = 0; i < urls.length; i += 4) {
    const batch = urls.slice(i, i + 4);
    const pages = await Promise.all(batch.map(url => fetchPage(url)));
    for (const html of pages) {
      if (!html) continue;
      allScored.push(...extractMailto(html, domain));
      allScored.push(...extractJsonLd(html, domain));
      allScored.push(...extractText(html, domain));
    }
    // Early exit if we found a mailto email
    if (allScored.some(e => e.source === "mailto") && allScored.length >= 3) break;
  }
  return allScored;
}

async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    return records.length > 0;
  } catch { return false; }
}

function generateCommonPatterns(domain: string, hiringManagerName?: string): string[] {
  const patterns = [
    "info", "contact", "enquiries", "hello", "office", "admin", "reception",
    "hr", "careers", "jobs", "recruitment", "talent", "hiring", "people", "team",
  ];
  if (hiringManagerName) {
    const parts = hiringManagerName.toLowerCase().trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0].replace(/[^a-z]/g, "");
      const last = parts[parts.length - 1].replace(/[^a-z]/g, "");
      if (first && last) {
        patterns.push(`${first}.${last}`, `${first}${last}`, `${first[0]}${last}`, `${first}`, `${last}`);
      }
    }
  }
  return [...new Set(patterns)].map(p => `${p}@${domain}`);
}

/** SMTP RCPT TO probe to verify if a mailbox actually exists */
async function smtpVerifyEmail(email: string, mxHost: string): Promise<"accepted" | "rejected" | "catch_all" | "timeout" | "blocked"> {
  try {
    const conn = await Deno.connect({ hostname: mxHost, port: 25 });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const read = async (): Promise<string> => {
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : "";
    };
    const write = async (cmd: string) => {
      await conn.write(encoder.encode(cmd + "\r\n"));
    };

    const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), 10000));

    const verify = async (): Promise<"accepted" | "rejected" | "catch_all"> => {
      const banner = await read();
      if (!banner.startsWith("220")) { conn.close(); return "rejected"; }

      await write("EHLO verify.local");
      await read();

      await write("MAIL FROM:<verify@verify.local>");
      const mfResp = await read();
      if (!mfResp.startsWith("250")) { await write("QUIT"); conn.close(); return "rejected"; }

      await write(`RCPT TO:<${email}>`);
      const rcptResp = await read();

      // Catch-all detection
      const rand = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const domain = email.split("@")[1];
      await write(`RCPT TO:<${rand}@${domain}>`);
      const catchResp = await read();

      await write("QUIT");
      conn.close();

      const rcptCode = parseInt(rcptResp.substring(0, 3));
      const catchCode = parseInt(catchResp.substring(0, 3));

      if (rcptCode === 250 && catchCode === 250) return "catch_all";
      if (rcptCode === 250) return "accepted";
      return "rejected";
    };

    const result = await Promise.race([verify(), timeout]);
    if (result === "timeout") { try { conn.close(); } catch {} }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("permission") || msg.includes("denied")) return "blocked";
    return "timeout";
  }
}

/** Get MX host for a domain */
async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    if (!records || records.length === 0) return null;
    const sorted = records.sort((a: any, b: any) => a.preference - b.preference);
    return (sorted[0] as any).exchange || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain, companyName, hiringManagerName } = await req.json();
    if (!companyDomain) {
      return new Response(JSON.stringify({ error: "companyDomain is required", emails: [] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = normalizeDomain(companyDomain);
    console.log(`🔍 Finding real emails for: ${domain}`);

    const foundEmails = new Map<string, FoundEmail>();

    // Step 1: MX check
    const mxValid = await hasMxRecords(domain);
    console.log(`📬 MX for ${domain}: ${mxValid ? "VALID" : "NONE"}`);

    // Step 2: Scrape with priority scoring (mailto > JSON-LD > text)
    const scraped = await scrapeDomainEmails(domain);
    console.log(`🌐 Scraped ${scraped.length} email candidates`);

    // Deduplicate keeping highest score
    const scoreMap = new Map<string, ScoredEmail>();
    for (const e of scraped) {
      const existing = scoreMap.get(e.email);
      if (!existing || e.score > existing.score) scoreMap.set(e.email, e);
    }

    for (const [email, scored] of scoreMap) {
      const local = email.split("@")[0];
      // Map score to confidence: mailto=95, json-ld=90, high-priority text=80, etc.
      let confidence: number;
      if (scored.source === "mailto") confidence = 95;
      else if (scored.source === "json-ld") confidence = 90;
      else confidence = Math.min(scored.score + 20, 85);

      if (!mxValid) confidence = Math.min(confidence, 40);

      foundEmails.set(email, {
        email,
        name: "",
        title: "",
        confidence,
        isHR: HR_KEYWORDS.some(k => local.includes(k)),
        source: scored.source as any,
        verifiedStatus: mxValid ? "mx_valid" : "mx_unknown",
      });
    }

    // Step 3: If no high-confidence scraped emails, generate patterns
    const strongCount = [...foundEmails.values()].filter(e => e.confidence >= 70).length;
    if (strongCount < 1) {
      const commonCandidates = generateCommonPatterns(domain, hiringManagerName);
      for (const candidate of commonCandidates) {
        if (foundEmails.has(candidate)) continue;
        const local = candidate.split("@")[0];
        const priority = LOCAL_PART_PRIORITY[local] || 10;
        const confidence = mxValid ? Math.min(priority, 60) : Math.min(priority, 25);
        foundEmails.set(candidate, {
          email: candidate,
          name: "",
          title: "",
          confidence,
          isHR: HR_KEYWORDS.some(k => candidate.includes(k)),
          source: "common_pattern",
          verifiedStatus: mxValid ? "mx_valid" : "mx_invalid",
        });
      }
      console.log(`🧠 Added ${commonCandidates.length} pattern candidates`);
    }

    // Sort: scraped/mailto first, then by confidence
    const emails = [...foundEmails.values()]
      .sort((a, b) => {
        // Scraped real emails always come first
        const aReal = ["mailto", "json-ld", "scrape"].includes(a.source) ? 1 : 0;
        const bReal = ["mailto", "json-ld", "scrape"].includes(b.source) ? 1 : 0;
        if (bReal !== aReal) return bReal - aReal;
        return b.confidence - a.confidence;
      })
      .slice(0, 12);

    console.log(`✅ Found ${emails.length} emails for ${domain}`);
    if (emails.length > 0) {
      console.log(`  🏆 Best: ${emails[0].email} (confidence: ${emails[0].confidence}, source: ${emails[0].source})`);
    }

    return new Response(JSON.stringify({
      domain,
      organization: companyName || domain,
      emails,
      totalFound: emails.length,
      mxValid,
      strategy: "mailto-first + json-ld + text-scrape + mx-validation (priority-scored)",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("find-email error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
      emails: [],
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
