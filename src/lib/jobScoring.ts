import { USER_PROFILE } from "./user-profile";

// ----- CV profile picker -----
export type CvProfileKey = "fullstack" | "aiSpecialist" | "digitalMarketing" | "webDeveloper" | "ar" | "webar";

export interface RoleProfile {
  key: CvProfileKey;
  label: string;
  triggers: RegExp[];
  boostSkills: string[];
}

export const ROLE_PROFILES: RoleProfile[] = [
  { key: "ar", label: "AR / Unity Developer",
    triggers: [/\bunity\b/i, /\bar\s?kit\b/i, /\bar\s?core\b/i, /\baugmented reality\b/i, /\bvuforia\b/i, /\bar\/vr\b/i, /\bxr\b/i],
    boostSkills: ["Unity", "ARFoundation", "ARKit", "ARCore", "Vuforia", "8th Wall", "C#"] },
  { key: "webar", label: "WebAR / Lens / Filter",
    triggers: [/\bwebar\b/i, /\b8th\s?wall\b/i, /\blens\s?studio\b/i, /\bspark\s?ar\b/i, /\bsnap(chat)?\s+filter\b/i, /\binstagram\s+filter\b/i, /\btiktok\s+effect\b/i, /\bwebxr\b/i, /\bar\.js\b/i],
    boostSkills: ["8th Wall", "Snapchat Lens Studio", "TikTok Effect House", "JavaScript", "WebXR"] },
  { key: "aiSpecialist", label: "AI / ML / Automation",
    triggers: [/\b(ai|llm|gpt|gemini|openai|machine learning|ml engineer|prompt)\b/i, /\bautomation\b/i, /\bagents?\b/i],
    boostSkills: ["ChatGPT API", "Google Gemini", "OpenAI", "Python", "LLM Integration", "AI Automation", "Prompt Engineering"] },
  { key: "digitalMarketing", label: "Digital Marketing / SEO",
    triggers: [/\bseo\b/i, /\bppc\b/i, /\bgoogle ads\b/i, /\bmeta ads\b/i, /\bdigital marketing\b/i, /\bperformance marketing\b/i, /\bgrowth\b/i],
    boostSkills: ["SEO", "Google Ads", "Meta Ads", "Google Analytics", "Google Tag Manager", "Digital Marketing"] },
  { key: "webDeveloper", label: "WordPress / PHP / Web",
    triggers: [/\bwordpress\b/i, /\bwoocommerce\b/i, /\bphp\b/i, /\bshopify\b/i, /\blaravel\b/i],
    boostSkills: ["WordPress", "PHP", "JavaScript", "HTML5", "CSS3", "WooCommerce", "Shopify"] },
  { key: "fullstack", label: "Full-Stack Developer",
    triggers: [/\bfull[-\s]?stack\b/i, /\breact\b/i, /\bnode\.?js\b/i, /\btypescript\b/i, /\bfront[-\s]?end\b/i, /\bback[-\s]?end\b/i],
    boostSkills: ["React", "TypeScript", "Node.js", "JavaScript", "REST APIs"] },
];

export function pickRoleProfile(jobTitle: string, description: string): RoleProfile {
  const text = `${jobTitle}\n${description}`;
  let best = ROLE_PROFILES[ROLE_PROFILES.length - 1]; // fullstack default
  let bestHits = 0;
  for (const p of ROLE_PROFILES) {
    const hits = p.triggers.reduce((n, r) => n + (r.test(text) ? 1 : 0), 0);
    if (hits > bestHits) { best = p; bestHits = hits; }
  }
  return best;
}

// ----- ATS keyword extraction -----
const STOPWORDS = new Set([
  "the","and","for","with","you","your","our","are","this","that","from","have","has","will","not","but","all","any","can","who","what","when","where","why","how","been","being","was","were","into","out","about","over","under","also","per","via","use","using","used","must","should","would","could","may","might","its","their","there","these","those","them","they","than","then","onto","upon","such","each","every","other","another","more","most","less","least","some","many","much","few","own","new","non","one","two","three","end","top","key","role","team","work","working","years","year","week","day","time","full","part","time","level","strong","good","great","excellent","ability","skills","skill","experience","experienced","required","preferred","nice","have","desirable","essential","responsibilities","responsibility","include","includes","including","across","within","join","help","looking","seeking","offer","offers","job","jobs","company","companies","world","people","best","need","needs","make","makes","made","build","building","built","create","creating","created","develop","developing","developed","support","supporting","ensure","ensuring","deliver","delivering","delivered","drive","driving","driven","own","owning","owned","design","designing","designed","implement","implementing","implemented","manage","managing","managed","lead","leading","led","plus","hybrid","remote","office","salary","benefits","apply","applicant","candidate","candidates","department","location","based","uk","eu","us",
]);

// Whitelist of concrete tech/skill tokens we accept as ATS keywords (extendable)
const TECH_LEXICON = new Set([
  "javascript","typescript","html","css","html5","css3","react","reactjs","vue","angular","svelte","node","nodejs","express","nest","nestjs","php","python","java","kotlin","swift","dart","flutter","ruby","rails","go","golang","rust","c","c++","c#","dotnet",".net",
  "wordpress","woocommerce","shopify","laravel","symfony","drupal",
  "unity","unreal","arfoundation","arkit","arcore","vuforia","8thwall","webxr","webar","arjs","threejs","three.js","lens","spark","gltf","blender","maya",
  "sql","postgres","postgresql","mysql","mongodb","redis","supabase","firebase","dynamodb","bigquery","snowflake",
  "aws","azure","gcp","docker","kubernetes","terraform","ansible","linux","nginx","cpanel",
  "git","github","gitlab","agile","scrum","kanban","jira","ci","cd","ci/cd",
  "rest","graphql","api","apis","webhook","webhooks","oauth","jwt","saml",
  "seo","sem","ppc","gtm","ga4","analytics","hubspot","salesforce","mailchimp","klaviyo",
  "ai","ml","llm","gpt","gemini","openai","chatgpt","langchain","rag","embeddings","huggingface","tensorflow","pytorch","numpy","pandas","scikit-learn","opencv",
  "figma","adobe","photoshop","illustrator","xd",
]);

function normalizeToken(t: string) {
  return t.toLowerCase().replace(/[.,;:!?()[\]{}"']/g, "").trim();
}

export function extractAtsKeywords(text: string): string[] {
  if (!text) return [];
  const tokens = text.split(/[\s/,]+/).map(normalizeToken).filter(Boolean);
  // multi-word tech phrases
  const phrases = [
    "google ads","meta ads","tiktok ads","google analytics","google tag manager","tag manager",
    "8th wall","spark ar","lens studio","effect house","augmented reality","virtual reality",
    "prompt engineering","machine learning","full stack","front end","back end","ci cd",
    "rest api","rest apis","graphql api",
  ];
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const p of phrases) if (lower.includes(p)) found.add(p);
  for (const t of tokens) {
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    if (TECH_LEXICON.has(t)) found.add(t);
  }
  return [...found];
}

export interface AtsResult { present: string[]; missing: string[] }

export function analyzeAts(text: string, profileSkills: string[] = USER_PROFILE.skills): AtsResult {
  const jobKeys = extractAtsKeywords(text);
  const mine = new Set(profileSkills.map((s) => s.toLowerCase().replace(/\s+/g, "")));
  const present: string[] = [], missing: string[] = [];
  for (const k of jobKeys) {
    const norm = k.replace(/\s+/g, "");
    (mine.has(norm) || mine.has(k) || [...mine].some((m) => m.includes(norm) || norm.includes(m))
      ? present : missing).push(k);
  }
  return { present, missing };
}

// ----- Fit scoring -----
export interface ScoreBreakdown {
  skill: number;        // /30
  experience: number;   // /20
  location: number;     // /15
  salary: number;       // /10
  industry: number;     // /10
  company: number;      // /10
  effort: number;       // /5
}

export interface FitScore {
  total: number;                // 0-100
  breakdown: ScoreBreakdown;
  role: RoleProfile;
  ats: AtsResult;
  reasons: string[];
}

export interface ScoreInput {
  jobTitle: string;
  company?: string;
  description: string;
  location?: string;
  salaryRange?: string;
}

function scoreLocation(loc?: string): number {
  if (!loc) return 8;
  const s = loc.toLowerCase();
  if (/\bremote\b|\bwork from home\b|\banywhere\b/.test(s)) return 15;
  if (/\bmanchester\b/.test(s)) return 15;
  if (/\buk\b|united kingdom|england|london|birmingham|leeds|liverpool|glasgow|edinburgh/.test(s)) return 13;
  if (/\beu\b|europe|ireland|germany|netherlands|france|spain/.test(s)) return 9;
  return 4;
}

function scoreSalary(s?: string): number {
  if (!s) return 6; // unknown → neutral
  const m = s.match(/([£$€])?\s?(\d{2,3})(?:[.,]?(\d{3}))?/);
  if (!m) return 6;
  const n = parseInt(m[2] + (m[3] ?? ""), 10);
  if (n >= 60) return 10;
  if (n >= 40) return 8;
  if (n >= 25) return 5;
  return 2;
}

function scoreCompany(company?: string, description?: string): number {
  if (!company) return 5;
  const isRecruiter = /recruit|staffing|agency|talent partners/i.test(company);
  if (isRecruiter) return 4;
  const wordy = (description || "").length;
  if (wordy > 800) return 8; // detailed post signals real hiring
  return 6;
}

function scoreEffort(url?: string, jobTitle?: string): number {
  // Cheaper to apply if we have a URL / structured info
  if (!url && !jobTitle) return 2;
  return url ? 5 : 4;
}

export function scoreJob(input: ScoreInput, opts?: { url?: string; profileSkills?: string[] }): FitScore {
  const profileSkills = opts?.profileSkills ?? USER_PROFILE.skills;
  const role = pickRoleProfile(input.jobTitle, input.description);
  const ats = analyzeAts(`${input.jobTitle}\n${input.description}`, profileSkills);

  // Skill: 30 pts — fraction of ATS keywords present, boosted by role match
  const totalKeys = ats.present.length + ats.missing.length;
  const skillFrac = totalKeys === 0 ? 0.5 : ats.present.length / totalKeys;
  let skill = Math.round(skillFrac * 26);
  // role trigger bonus (up to +4)
  const roleHits = role.triggers.reduce((n, r) => n + (r.test(`${input.jobTitle} ${input.description}`) ? 1 : 0), 0);
  skill = Math.min(30, skill + Math.min(4, roleHits));

  // Experience: 20 pts — heuristic, match seniority signals
  const expText = `${input.jobTitle} ${input.description}`.toLowerCase();
  let experience = 14; // 8+ yrs base
  if (/\b(senior|lead|principal|staff)\b/.test(expText)) experience = 20;
  else if (/\bmid[-\s]?level\b|\b3\+?\s*years?\b|\b5\+?\s*years?\b/.test(expText)) experience = 18;
  else if (/\bjunior\b|\bentry[-\s]?level\b|\bgraduate\b|\bintern\b/.test(expText)) experience = 8;

  const location = scoreLocation(input.location);
  const salary = scoreSalary(input.salaryRange);
  const industry = /\b(luxury|hospitality|travel|real ?estate|saas|ecommerce|e-commerce|marketing|agency|creative|gaming|entertainment)\b/i.test(expText) ? 10 : 6;
  const company = scoreCompany(input.company, input.description);
  const effort = scoreEffort(opts?.url, input.jobTitle);

  const breakdown: ScoreBreakdown = { skill, experience, location, salary, industry, company, effort };
  const total = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  const reasons: string[] = [];
  if (skill >= 22) reasons.push("Strong skill overlap");
  else if (skill < 12) reasons.push("Weak skill overlap");
  if (ats.missing.length > 0 && ats.missing.length <= 3) reasons.push(`Missing: ${ats.missing.slice(0,3).join(", ")}`);
  if (location <= 4) reasons.push("Location not a fit");
  if (salary <= 2) reasons.push("Salary below target");
  if (roleHits > 0) reasons.push(`Role fit: ${role.label}`);

  return { total, breakdown, role, ats, reasons };
}

export function scoreBand(score: number): { label: string; tone: "success" | "warning" | "danger"; canAutoApply: boolean } {
  if (score >= 75) return { label: "Strong fit", tone: "success", canAutoApply: true };
  if (score >= 50) return { label: "Possible fit — review", tone: "warning", canAutoApply: false };
  return { label: "Weak fit — skip", tone: "danger", canAutoApply: false };
}
