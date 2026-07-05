import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/"><Button variant="ghost" size="sm" className="gap-1 mb-6"><ArrowLeft className="h-3.5 w-3.5" /> Home</Button></Link>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            AutoApply Copilot ("we", "the copilot") is a personal AI tool operated by Visuosofts to help you find and apply
            for jobs. This page explains what data we handle, why, and your rights under UK GDPR and the Data Protection Act 2018.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-foreground">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Profile you enter (name, contact details, target roles, salary range, work authorisation).</li>
              <li>CV content and role-specific CV profiles you upload.</li>
              <li>Jobs you save, applications you send, and their responses.</li>
              <li>Basic technical logs (request timestamps, error traces) for reliability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Why we process it</h2>
            <p className="mt-2">To score jobs against your profile, tailor CVs and cover letters, deliver applications from your accounts, and let you review outcomes. Lawful basis: consent and your legitimate interests in finding work.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Third-party processors</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Supabase (EU) — database, auth and edge functions.</li>
              <li>Google Gemini &amp; OpenRouter — AI model providers for tailoring and matching. CV content is sent as prompt input only.</li>
              <li>SMTP providers you connect (e.g. Gmail) — used to send emails you approve.</li>
            </ul>
            <p className="mt-2">We do not sell your data and do not permit any provider to use your CV to train their models.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Your rights</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Access, export or delete your data at any time from the Profile screen.</li>
              <li>Withdraw consent by deleting your account.</li>
              <li>Complain to the UK ICO if you believe your rights were breached.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Retention</h2>
            <p className="mt-2">Application history is retained until you delete it. Deleted data is purged from active systems within 30 days.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p className="mt-2">Questions? Email <a className="text-primary" href="mailto:info@visuosofts.com">info@visuosofts.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
