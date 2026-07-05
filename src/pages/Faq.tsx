import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ArrowLeft, HelpCircle } from "lucide-react";

const FAQS = [
  {
    q: "What does AutoApply Copilot actually do?",
    a: "It discovers relevant roles, scores them against your CV, and drafts a tailored CV plus a company-specific cover letter for each one. Nothing is sent until you review and approve it.",
  },
  {
    q: "Does it apply to jobs automatically without me?",
    a: "No. Every outbound email sits in a Review Queue that blocks placeholders, banned phrases, and unverified domains. You approve each application before it's dispatched.",
  },
  {
    q: "How is my CV tailored — does the AI invent experience?",
    a: "The AI is instructed to use only the evidence in your saved CV and profile. Role-specific base CVs (AR, WebAR, AI, Full-Stack, WordPress) constrain what the model can output, and a validation gate rejects any draft that contains obvious placeholders.",
  },
  {
    q: "Is this compliant with LinkedIn / Indeed terms?",
    a: "We don't scrape or auto-submit on LinkedIn or Indeed. LinkedIn outreach is copy-paste only. Company outreach uses public email addresses via standard SMTP with strict daily and per-domain limits.",
  },
  {
    q: "Which AI models are used?",
    a: "Google Gemini for CV tailoring, cover letters, and job discovery. Requests are throttled and share a single adapter with retry and rate-limit handling.",
  },
  {
    q: "Where is my data stored?",
    a: "In an EU-region managed database (Supabase). Only signed-in users can read or write it. See the Privacy page for details and your rights under UK GDPR.",
  },
  {
    q: "Can I delete everything?",
    a: "Yes — the Profile tab has a Danger Zone that wipes all applications, review queue, tracking, sent emails, and outreach data in one click.",
  },
  {
    q: "Can I export a tailored CV as PDF?",
    a: "Yes — each approved application has a PDF export button for both the tailored CV and the cover letter.",
  },
  {
    q: "Is there a free trial?",
    a: "The app is currently in private testing. Contact us if you'd like early access.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      </div>
      <div className="relative max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
          </div>
          <p className="text-sm text-muted-foreground">Straight answers about how AutoApply Copilot works, what it doesn't do, and how your data is handled.</p>
        </header>
        <div className="space-y-2">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="glass rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-sm font-medium">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground border-t border-border pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <footer className="mt-10 text-center text-xs text-muted-foreground space-x-3">
          <Link to="/" className="hover:text-foreground underline">Home</Link>
          <Link to="/about" className="hover:text-foreground underline">About</Link>
          <Link to="/contact" className="hover:text-foreground underline">Contact</Link>
          <Link to="/privacy" className="hover:text-foreground underline">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground underline">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
