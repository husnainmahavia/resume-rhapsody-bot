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
];

const INVALID_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /\.png$/i, /\.jpg$/i, /\.gif$/i,
  /\.svg$/i, /\.css$/i, /\.js$/i, /schema\.org$/i, /w3\.org$/i,
  /googleapis\.com$/i, /gstatic\.com$/i, /wixpress\.com$/i,
];

const LOCAL_PART_PRIORITY: Record<string, number> = {
  "info": 100, "contact": 95, "enquiries": 90, "enquiry": 90,
  "hello": 85, "office": 80, "admin": 75, "reception": 70,
  "hr": 65, "careers": 65, "jobs": 60, "recruitment": 60,
  "talent": 55, "hiring": 55, "people": 50, "team": 45,
  "support": 40, "marketing": 35, "sales": 30,
};

type FoundEmail = {
  email: string; name: string; title: string;
  confidence: number; isHR: boolean;
  source: "mailto" | "json-ld" | "scrape" | "smtp_verified" | "common_pattern";
  verifiedStatus?: string;
};

type ScoredEmail = { email: string; score: number; source: string };

function normalizeDomain(input: string): string {
  return input.toLowerCase().trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].replace(/\s+/g, "")
    .replace(/^(careers|jobs|careerssearch|apply|talent|recruiting|hire|join|work)\./i, "");
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
  if (/^no-?reply/.test(local) || /mailer-daemon/.test(local)) return false;
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
      headers: { "User-Agent": randomUA(), "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(3000), // 3s max per page
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
    return await res.text();
  } catch { return ""; }
}

function extractMailto(html: string, domain: string): ScoredEmail[] {
  const regex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  const results: ScoredEmail[] = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const email = m[1].toLowerCase().trim();
    if (isValidEmail(email, domain)) {
      const local = email.split("@")[0];
      results.push({ email, score: 200 + (LOCAL_PART_PRIORITY[local] || 20), source: "mailto" });
    }
  }
  return results;
}

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
          if (isValidEmail(email, domain)) results.push({ email, score: 180, source: "json-ld" });
        }
        if (obj.contactPoint) (Array.isArray(obj.contactPoint) ? obj.contactPoint : [obj.contactPoint]).forEach(find);
        if (Array.isArray(obj)) obj.forEach(find);
      };
      find(data);
    } catch {}
  }
  return results;
}

function extractText(html: string, domain: string): ScoredEmail[] {
  const text = deobfuscateText(html.replace(/<[^>]*>/g, " "));
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches)].map(e => e.toLowerCase()).filter(e => isValidEmail(e, domain))
    .map(email => ({ email, score: LOCAL_PART_PRIORITY[email.split("@")[0]] || 10, source: "scrape" }));
}

async function scrapeDomainEmails(domain: string): Promise<ScoredEmail[]> {
  // Only scrape the 6 most likely pages — in parallel for speed
  const urls = [
    `https://${domain}/contact`, `https://${domain}/contact-us`,
    `https://${domain}`, `https://${domain}/about`,
    `https://www.${domain}/contact`, `https://www.${domain}`,
  ];

  const allScored: ScoredEmail[] = [];
  // Fetch ALL 6 in parallel (fast — 6s timeout each)
  const pages = await Promise.all(urls.map(url => fetchPage(url)));
  for (const html of pages) {
    if (!html) continue;
    allScored.push(...extractMailto(html, domain), ...extractJsonLd(html, domain), ...extractText(html, domain));
  }
  return allScored;
}

async function hasMxRecords(domain: string): Promise<boolean> {
  try { return (await Deno.resolveDns(domain, "MX")).length > 0; } catch { return false; }
}

async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    if (!records?.length) return null;
    return (records.sort((a: any, b: any) => a.preference - b.preference)[0] as any).exchange || null;
  } catch { return null; }
}

/** Fast SMTP RCPT TO — 4s timeout, single email check */
async function smtpVerify(email: string, mxHost: string): Promise<"accepted" | "rejected" | "catch_all" | "timeout"> {
  try {
    const conn = await Deno.connect({ hostname: mxHost, port: 25 });
    const dec = new TextDecoder(), enc = new TextEncoder();
    const read = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return n ? dec.decode(b.subarray(0, n)) : ""; };
    const write = async (c: string) => { await conn.write(enc.encode(c + "\r\n")); };

    const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), 3000));
    const verify = async (): Promise<"accepted" | "rejected" | "catch_all"> => {
      const banner = await read();
      if (!banner.startsWith("220")) { conn.close(); return "rejected"; }
      await write("EHLO verify.local"); await read();
      await write("MAIL FROM:<verify@verify.local>");
      if (!(await read()).startsWith("250")) { await write("QUIT"); conn.close(); return "rejected"; }
      await write(`RCPT TO:<${email}>`);
      const rcpt = await read();
      const rand = `xtest${Date.now()}`;
      await write(`RCPT TO:<${rand}@${email.split("@")[1]}>`);
      const catchR = await read();
      await write("QUIT"); conn.close();
      const rc = parseInt(rcpt.substring(0, 3)), cc = parseInt(catchR.substring(0, 3));
      if (rc === 250 && cc === 250) return "catch_all";
      if (rc === 250) return "accepted";
      return "rejected";
    };
    const result = await Promise.race([verify(), timeout]);
    if (result === "timeout") try { conn.close(); } catch {}
    return result;
  } catch { return "timeout"; }
}

function generatePatterns(domain: string, hiringManagerName?: string): string[] {
  const patterns = ["info", "contact", "enquiries", "hello", "office", "admin", "hr", "careers", "jobs", "recruitment", "talent", "hiring", "people", "team"];
  if (hiringManagerName) {
    const parts = hiringManagerName.toLowerCase().trim().split(/\s+/);
    if (parts.length >= 2) {
      const f = parts[0].replace(/[^a-z]/g, ""), l = parts[parts.length - 1].replace(/[^a-z]/g, "");
      if (f && l) patterns.push(`${f}.${l}`, `${f}${l}`, `${f[0]}${l}`);
    }
  }
  return [...new Set(patterns)].map(p => `${p}@${domain}`);
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

    // Step 1: MX + Scrape in parallel for speed
    const [mxValid, scraped] = await Promise.all([
      hasMxRecords(domain),
      scrapeDomainEmails(domain),
    ]);
    console.log(`📬 MX: ${mxValid ? "VALID" : "NONE"} | Scraped: ${scraped.length} candidates`);

    // Deduplicate keeping highest score
    const scoreMap = new Map<string, ScoredEmail>();
    for (const e of scraped) {
      const ex = scoreMap.get(e.email);
      if (!ex || e.score > ex.score) scoreMap.set(e.email, e);
    }

    for (const [email, scored] of scoreMap) {
      const local = email.split("@")[0];
      let confidence = scored.source === "mailto" ? 95 : scored.source === "json-ld" ? 90 : Math.min(scored.score + 20, 85);
      if (!mxValid) confidence = Math.min(confidence, 40);
      foundEmails.set(email, {
        email, name: "", title: "", confidence,
        isHR: HR_KEYWORDS.some(k => local.includes(k)),
        source: scored.source as any,
        verifiedStatus: mxValid ? "mx_valid" : "mx_unknown",
      });
    }

    // Step 2: If no scraped emails, try patterns + quick single SMTP check
    const strongCount = [...foundEmails.values()].filter(e => e.confidence >= 70).length;
    if (strongCount < 1 && mxValid) {
      const patterns = generatePatterns(domain, hiringManagerName);
      const mxHost = await getMxHost(domain);

      if (mxHost) {
        // Quick single SMTP check on info@domain (most universal)
        console.log(`🔬 Quick SMTP: info@${domain} via ${mxHost}`);
        const infoResult = await smtpVerify(`info@${domain}`, mxHost);

        if (infoResult === "accepted") {
          console.log(`  ✅ VERIFIED: info@${domain}`);
          foundEmails.set(`info@${domain}`, {
            email: `info@${domain}`, name: "", title: "", confidence: 92,
            isHR: false, source: "smtp_verified", verifiedStatus: "smtp_verified",
          });
        } else if (infoResult === "catch_all") {
          console.log(`  🔄 Catch-all domain`);
          for (const local of ["info", "contact", "hello"]) {
            foundEmails.set(`${local}@${domain}`, {
              email: `${local}@${domain}`, name: "", title: "",
              confidence: 75, isHR: false, source: "common_pattern", verifiedStatus: "catch_all",
            });
          }
        } else {
          console.log(`  ⏱ SMTP ${infoResult} — using pattern heuristics`);
        }

        // Add remaining patterns with appropriate confidence
        const smtpBonus = infoResult === "catch_all" ? 15 : 0;
        for (const candidate of patterns) {
          if (foundEmails.has(candidate)) continue;
          const local = candidate.split("@")[0];
          foundEmails.set(candidate, {
            email: candidate, name: "", title: "",
            confidence: Math.min((LOCAL_PART_PRIORITY[local] || 10) + smtpBonus, 60),
            isHR: HR_KEYWORDS.some(k => candidate.includes(k)),
            source: "common_pattern",
            verifiedStatus: infoResult === "catch_all" ? "catch_all" : "mx_valid_unverified",
          });
        }
      } else {
        for (const candidate of patterns) {
          const local = candidate.split("@")[0];
          foundEmails.set(candidate, {
            email: candidate, name: "", title: "",
            confidence: Math.min(LOCAL_PART_PRIORITY[local] || 10, 25),
            isHR: HR_KEYWORDS.some(k => candidate.includes(k)),
            source: "common_pattern", verifiedStatus: "no_mx_host",
          });
        }
      }
    }

    // Sort: real scraped first, then by confidence
    const emails = [...foundEmails.values()]
      .sort((a, b) => {
        const aReal = ["mailto", "json-ld", "scrape", "smtp_verified"].includes(a.source) ? 1 : 0;
        const bReal = ["mailto", "json-ld", "scrape", "smtp_verified"].includes(b.source) ? 1 : 0;
        if (bReal !== aReal) return bReal - aReal;
        return b.confidence - a.confidence;
      })
      .slice(0, 10);

    console.log(`✅ ${emails.length} emails for ${domain} | Best: ${emails[0]?.email || "none"} (${emails[0]?.confidence || 0}%, ${emails[0]?.source || "-"})`);

    return new Response(JSON.stringify({
      domain, organization: companyName || domain, emails,
      totalFound: emails.length, mxValid,
      strategy: "mailto-first + json-ld + text + smtp-verify (priority-scored)",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("find-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
