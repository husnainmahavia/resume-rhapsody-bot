import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bot, ShieldCheck, Target, FileText, Mail, ClipboardCheck,
  Sparkles, ArrowRight, CheckCircle2, Lock, Users, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Target, title: "Job-fit scoring", body: "Every role is scored 0–100 on skills, experience, location, salary and industry fit before it enters your queue." },
  { icon: Layers, title: "Role-specific CVs", body: "Switch between AR, WebAR, Lens/Filter, Web, AI Automation and Marketing CV profiles — no one-size-fits-all applications." },
  { icon: FileText, title: "Evidence-based tailoring", body: "Bullet points are drawn from your real experience bank. The AI never invents skills you don't have." },
  { icon: Mail, title: "Company-specific letters", body: "Cover letters reference the company, role and why your background fits — not generic templates." },
  { icon: ClipboardCheck, title: "Review before send", body: "Nothing is submitted until you approve it. See the CV, letter and answers side by side, then send." },
  { icon: ShieldCheck, title: "Compliance-first", body: "No LinkedIn or Indeed automation. Discovery only, manual submission where platform terms require it." },
];

const steps = [
  { n: "01", t: "Discover", b: "Pull roles from safe sources: RSS feeds, email alerts, career pages and manual imports." },
  { n: "02", t: "Score", b: "Weighted fit-score filters out low-quality matches before they reach you." },
  { n: "03", t: "Tailor", b: "The right base CV is chosen, then tailored with real evidence and ATS keywords from the job." },
  { n: "04", t: "Review", b: "You approve the CV, cover letter and answers. Risk warnings surface for salary, visa, and sensitive fields." },
  { n: "05", t: "Track", b: "Applications, replies, interviews and follow-ups are tracked end-to-end." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[32rem] h-[32rem] bg-primary/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[32rem] h-[32rem] bg-accent/5 rounded-full blur-[140px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-6">
        {/* Nav */}
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-lg font-bold">
                <span className="text-gradient">AutoApply</span>
                <span className="text-muted-foreground font-normal text-sm ml-2">Copilot</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">by Visuosofts</div>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <a href="#how" className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground px-3 py-2">How it works</a>
            <a href="#features" className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground px-3 py-2">Features</a>
            <a href="#privacy" className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground px-3 py-2">Privacy</a>
            <Link to="/app">
              <Button size="sm" className="gap-1">Open app <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="pt-16 pb-20 text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/50 text-xs text-muted-foreground mb-6">
            <Sparkles className="h-3 w-3 text-primary" />
            AI Job Application Copilot — not an auto-spam bot
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Send <span className="text-gradient">fewer, stronger</span><br />job applications.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            AutoApply Copilot finds better-fit roles, chooses the right CV profile, tailors it with your real evidence,
            and drafts a company-specific letter. You review every application before it's sent.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/app">
              <Button size="lg" className="gap-2">Open the copilot <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">See how it works</Button>
            </a>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Review before send</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No LinkedIn/Indeed automation</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Evidence-based tailoring</span>
          </div>
        </motion.section>

        {/* Features */}
        <section id="features" className="py-16">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-primary font-mono">Features</p>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">Quality over volume</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Built around what actually gets interviews: match quality, tailored evidence and human review.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="glass rounded-lg p-5 hover:border-primary/30 transition-colors">
                <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center mb-3">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How */}
        <section id="how" className="py-16">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-primary font-mono">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">How it works</h2>
          </div>
          <div className="space-y-3">
            {steps.map((s) => (
              <div key={s.n} className="glass rounded-lg p-5 flex gap-5 items-start">
                <div className="text-2xl font-mono text-primary/70 shrink-0 w-12">{s.n}</div>
                <div>
                  <h3 className="font-semibold">{s.t}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section id="privacy" className="py-16">
          <div className="glass rounded-lg p-8 md:p-10">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <Lock className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Data minimisation</h3>
                <p className="text-sm text-muted-foreground mt-1">We only collect what's needed to apply: target roles, location, CV, salary range, work authorisation.</p>
              </div>
              <div>
                <ShieldCheck className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">UK GDPR aligned</h3>
                <p className="text-sm text-muted-foreground mt-1">Export or delete your data anytime. No CV content is used to train third-party models.</p>
              </div>
              <div>
                <Users className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Platform-safe</h3>
                <p className="text-sm text-muted-foreground mt-1">No scraping or automation on LinkedIn or Indeed. Discovery is manual or via permitted sources.</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Link to="/privacy"><Button variant="outline" size="sm">Privacy policy</Button></Link>
              <Link to="/terms"><Button variant="outline" size="sm">Terms of use</Button></Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Ready to apply smarter?</h2>
          <p className="mt-3 text-muted-foreground">Open the copilot and connect your first CV profile.</p>
          <div className="mt-6">
            <Link to="/app">
              <Button size="lg" className="gap-2">Open the copilot <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p className="font-mono">© {new Date().getFullYear()} AutoApply Copilot · a Visuosofts product</p>
          <nav className="flex gap-4 flex-wrap justify-center">
            <Link to="/faq" className="hover:text-foreground">FAQ</Link>
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/app" className="hover:text-foreground">App</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
