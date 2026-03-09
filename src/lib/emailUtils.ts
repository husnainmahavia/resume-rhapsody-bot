// RFC 5322-compliant email regex
export const EMAIL_REGEX =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;

// Expanded fake email blocklist per PDF strategy
const FAKE_EMAIL_PREFIXES = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "notification", "notifications", "alerts", "alert",
  "admin", "webmaster", "postmaster", "hostmaster",
  "automated", "mailer-daemon", "daemon", "bounce",
  "abuse", "root", "nobody", "null",
]);

const INVALID_PATTERNS = [
  /example\.com$/i, /test\.com$/i, /your-?email/i, /placeholder/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.css$/i, /\.js$/i,
  /noreply\.com$/i, /reply\.com$/i,
];

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
  "outlook.com", "live.com", "icloud.com", "aol.com", "protonmail.com",
  "proton.me", "gmx.com",
]);

// Updated scoring per PDF strategy — job-hunting optimized
export const EMAIL_SCORING: Record<string, number> = {
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
  "info": 40,
  "office": 40,
  "reception": 35,
  "marketing": 30,
  "sales": 30,
  "support": 20,
};

/**
 * Deobfuscate common email obfuscation patterns.
 */
export function deobfuscateEmail(raw: string): string | null {
  let text = raw
    .replace(/&#64;/g, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".")
    .replace(/\s*\[at\]\s*/gi, "@").replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".").replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s+at\s+/gi, "@").replace(/\s+dot\s+/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .trim();

  const match = text.match(EMAIL_REGEX);
  return match ? match[0] : null;
}

/**
 * Extract all valid emails from an HTML string,
 * filtering out fake emails, public mailboxes, and invalid patterns.
 */
export function extractEmails(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, " ");
  const cleaned = text
    .replace(/&#64;/g, "@").replace(/&#46;/g, ".")
    .replace(/\[at\]/gi, "@").replace(/\[dot\]/gi, ".")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  const matches = cleaned.match(EMAIL_REGEX) || [];

  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    const domain = lower.split("@")[1];
    const localPart = lower.split("@")[0];
    if (!domain) return false;
    if (PUBLIC_DOMAINS.has(domain)) return false;
    if (INVALID_PATTERNS.some(p => p.test(lower))) return false;
    if (FAKE_EMAIL_PREFIXES.has(localPart)) return false;
    if (FAKE_EMAIL_PREFIXES.has(localPart.replace(/-/g, ""))) return false;
    return true;
  });
}

/**
 * Validate an email address is a real company email.
 */
export function isValidCompanyEmail(email: string): { valid: boolean; reason?: string } {
  if (!email) return { valid: false, reason: "empty" };

  const lower = email.toLowerCase().trim();
  if (!EMAIL_REGEX.test(lower)) return { valid: false, reason: "invalid_format" };

  const domain = lower.split("@")[1];
  const localPart = lower.split("@")[0];
  if (PUBLIC_DOMAINS.has(domain)) return { valid: false, reason: "public_mailbox" };
  if (FAKE_EMAIL_PREFIXES.has(localPart) || FAKE_EMAIL_PREFIXES.has(localPart.replace(/-/g, ""))) {
    return { valid: false, reason: "fake_or_automated" };
  }
  if (INVALID_PATTERNS.some(p => p.test(lower))) return { valid: false, reason: "invalid_pattern" };

  return { valid: true };
}

/**
 * Score an email by likelihood of being monitored (per PDF strategy).
 */
export function scoreEmail(email: string): number {
  const localPart = email.toLowerCase().split("@")[0];
  return EMAIL_SCORING[localPart] || 10;
}

/**
 * Parse a CSV string into an array of row objects.
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];
  
  const headers = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return headers.reduce((obj, h, i) => {
      obj[h] = (values[i] || "").replace(/^["']|["']$/g, "").trim();
      return obj;
    }, {} as Record<string, string>);
  }).filter(row => Object.values(row).some(v => v.length > 0));
}
