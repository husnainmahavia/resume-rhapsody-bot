import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyResult {
  email: string;
  deliverable: boolean;
  score: number; // 0-100
  checks: {
    format: boolean;
    mxRecords: boolean;
    mxHost: string | null;
    smtpConnect: boolean;
    smtpRcptTo: "accepted" | "rejected" | "catch_all" | "timeout" | "blocked" | "skipped";
    disposable: boolean;
    roleAccount: boolean;
  };
  reason: string;
}

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "throwaway.email", "guerrillamail.com", "mailinator.com",
  "yopmail.com", "10minutemail.com", "trashmail.com", "fakeinbox.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "dispostable.com",
  "maildrop.cc", "temp-mail.org", "emailondeck.com", "getairmail.com",
]);

const ROLE_ACCOUNTS = new Set([
  "info", "hello", "contact", "admin", "support", "sales", "hr",
  "careers", "jobs", "recruitment", "talent", "hiring", "people",
  "office", "reception", "enquiries", "team", "marketing", "press",
  "media", "billing", "accounts", "feedback", "help", "service",
  "webmaster", "postmaster", "abuse", "hostmaster",
]);

/** Resolve MX records for a domain */
async function getMxRecords(domain: string): Promise<{ valid: boolean; host: string | null; priority: number }> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    if (!records || records.length === 0) return { valid: false, host: null, priority: 999 };
    // Sort by priority (lowest = preferred)
    const sorted = records.sort((a: any, b: any) => a.preference - b.preference);
    const best = sorted[0] as any;
    return { valid: true, host: best.exchange || null, priority: best.preference || 0 };
  } catch {
    return { valid: false, host: null, priority: 999 };
  }
}

/** Attempt SMTP RCPT TO verification */
async function smtpVerify(
  email: string,
  mxHost: string,
): Promise<"accepted" | "rejected" | "catch_all" | "timeout" | "blocked"> {
  try {
    // Connect to MX server on port 25
    const conn = await Deno.connect({ hostname: mxHost, port: 25 });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const read = async (): Promise<string> => {
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : "";
    };

    const write = async (cmd: string): Promise<void> => {
      await conn.write(encoder.encode(cmd + "\r\n"));
    };

    // Set a timeout for the entire operation
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 12000));

    const verify = async (): Promise<"accepted" | "rejected" | "catch_all"> => {
      // Read banner
      const banner = await read();
      if (!banner.startsWith("220")) {
        conn.close();
        return "rejected";
      }

      // EHLO
      await write("EHLO verify.local");
      await read();

      // MAIL FROM
      await write("MAIL FROM:<verify@verify.local>");
      const mailFromResp = await read();
      if (!mailFromResp.startsWith("250")) {
        await write("QUIT");
        conn.close();
        return "rejected";
      }

      // RCPT TO - the key check
      await write(`RCPT TO:<${email}>`);
      const rcptResp = await read();

      // Also test a random address for catch-all detection
      const randomLocal = `verify_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const domain = email.split("@")[1];
      await write(`RCPT TO:<${randomLocal}@${domain}>`);
      const catchAllResp = await read();

      await write("QUIT");
      conn.close();

      const rcptCode = parseInt(rcptResp.substring(0, 3));
      const catchAllCode = parseInt(catchAllResp.substring(0, 3));

      // If random address also accepted, it's a catch-all
      if (rcptCode === 250 && catchAllCode === 250) return "catch_all";
      // Target accepted, random rejected = verified
      if (rcptCode === 250) return "accepted";
      // Target rejected
      return "rejected";
    };

    const result = await Promise.race([verify(), timeout]);
    if (result === "timeout") {
      try { conn.close(); } catch { /* ignore */ }
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("permission") || msg.includes("denied") || msg.includes("blocked")) {
      return "blocked";
    }
    return "timeout";
  }
}

/** Calculate deliverability score */
function calculateScore(checks: VerifyResult["checks"]): number {
  let score = 0;

  if (!checks.format) return 0;
  score += 15; // valid format

  if (checks.mxRecords) score += 25; // domain accepts mail
  else return score; // no MX = very low score

  if (checks.disposable) return Math.min(score, 10); // disposable = trash

  // SMTP results
  switch (checks.smtpRcptTo) {
    case "accepted": score += 45; break;
    case "catch_all": score += 25; break; // exists but can't confirm individual
    case "blocked": score += 20; break; // server blocked us, assume valid if MX exists
    case "timeout": score += 15; break;
    case "skipped": score += 10; break;
    case "rejected": return Math.max(score - 10, 5); // definitively rejected
  }

  // Role accounts are less risky (they almost always exist)
  if (checks.roleAccount) score += 10;

  return Math.min(score, 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, emails } = await req.json();

    // Support single or batch verification
    const toVerify: string[] = emails || (email ? [email] : []);
    if (toVerify.length === 0) {
      return new Response(JSON.stringify({ error: "email or emails[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit batch size
    const batch = toVerify.slice(0, 20);
    const results: VerifyResult[] = [];

    // Group by domain to reuse MX lookups
    const domainMx = new Map<string, { valid: boolean; host: string | null }>();

    for (const addr of batch) {
      const lower = addr.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const formatValid = emailRegex.test(lower);

      if (!formatValid) {
        results.push({
          email: lower,
          deliverable: false,
          score: 0,
          checks: {
            format: false, mxRecords: false, mxHost: null,
            smtpConnect: false, smtpRcptTo: "skipped",
            disposable: false, roleAccount: false,
          },
          reason: "invalid_format",
        });
        continue;
      }

      const domain = lower.split("@")[1];
      const localPart = lower.split("@")[0];

      // Check disposable
      const isDisposable = DISPOSABLE_DOMAINS.has(domain);
      const isRole = ROLE_ACCOUNTS.has(localPart);

      // MX lookup (cached per domain)
      if (!domainMx.has(domain)) {
        const mx = await getMxRecords(domain);
        domainMx.set(domain, { valid: mx.valid, host: mx.host });
      }
      const mx = domainMx.get(domain)!;

      // SMTP RCPT TO probe
      let smtpResult: VerifyResult["checks"]["smtpRcptTo"] = "skipped";
      if (mx.valid && mx.host && !isDisposable) {
        smtpResult = await smtpVerify(lower, mx.host);
      }

      const checks: VerifyResult["checks"] = {
        format: true,
        mxRecords: mx.valid,
        mxHost: mx.host,
        smtpConnect: smtpResult !== "timeout" && smtpResult !== "blocked" && smtpResult !== "skipped",
        smtpRcptTo: smtpResult,
        disposable: isDisposable,
        roleAccount: isRole,
      };

      const score = calculateScore(checks);

      let reason = "unknown";
      if (isDisposable) reason = "disposable_domain";
      else if (!mx.valid) reason = "no_mx_records";
      else if (smtpResult === "rejected") reason = "smtp_rejected";
      else if (smtpResult === "catch_all") reason = "catch_all_domain";
      else if (smtpResult === "accepted") reason = "verified";
      else if (smtpResult === "blocked") reason = "smtp_blocked_mx_valid";
      else if (smtpResult === "timeout") reason = "smtp_timeout_mx_valid";
      else reason = "mx_valid_unverified";

      results.push({
        email: lower,
        deliverable: score >= 50,
        score,
        checks,
        reason,
      });
    }

    console.log(`📧 Verified ${results.length} emails: ${results.filter(r => r.deliverable).length} deliverable`);

    return new Response(JSON.stringify({
      results,
      summary: {
        total: results.length,
        deliverable: results.filter(r => r.deliverable).length,
        risky: results.filter(r => r.score >= 30 && r.score < 50).length,
        undeliverable: results.filter(r => r.score < 30).length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("email-verify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
