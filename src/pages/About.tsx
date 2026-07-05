import { Link } from "react-router-dom";
import { ArrowLeft, Bot, ShieldCheck, Sparkles, Users } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
      </div>
      <div className="relative max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">About AutoApply Copilot</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Built by an AR developer, for AR developers — and anyone else tired of copying and pasting their CV into 40 job forms a week.
          </p>
        </header>

        <section className="glass rounded-lg p-5 space-y-3 mb-4">
          <h2 className="text-base font-semibold">Why it exists</h2>
          <p className="text-sm text-muted-foreground">
            Generic job boards and mass-mailer tools ignore two things that matter most in specialist
            fields like AR/WebAR/Unity: <em>relevance</em> and <em>evidence</em>. AutoApply Copilot
            picks a role-specific CV profile per job, scores the match honestly against your real skills,
            and lets you approve every message before it goes out. No fake experience, no spam, no
            "click here to schedule" nonsense.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="glass rounded-lg p-4">
            <Sparkles className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Role-specific CVs</h3>
            <p className="text-xs text-muted-foreground">AR, WebAR, Unity, Lens/Effect, AI, Full-Stack, WordPress — pick per job.</p>
          </div>
          <div className="glass rounded-lg p-4">
            <ShieldCheck className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Human review</h3>
            <p className="text-xs text-muted-foreground">Every application passes through a validation gate you control. Nothing sends itself.</p>
          </div>
          <div className="glass rounded-lg p-4">
            <Users className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Built by Visuosofts</h3>
            <p className="text-xs text-muted-foreground">A small AR/WebAR studio using this tool on ourselves before anyone else touches it.</p>
          </div>
        </section>

        <section className="glass rounded-lg p-5 space-y-2 mb-8">
          <h2 className="text-base font-semibold">What it isn't</h2>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Not a LinkedIn scraper. LinkedIn actions are copy-paste only.</li>
            <li>Not a mass-mail tool. Daily and per-domain caps are enforced, always.</li>
            <li>Not a certification. Any privacy or security claims are our own commitments, not audited seals.</li>
          </ul>
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground space-x-3">
          <Link to="/" className="hover:text-foreground underline">Home</Link>
          <Link to="/faq" className="hover:text-foreground underline">FAQ</Link>
          <Link to="/contact" className="hover:text-foreground underline">Contact</Link>
          <Link to="/privacy" className="hover:text-foreground underline">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground underline">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
