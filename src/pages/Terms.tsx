import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/"><Button variant="ghost" size="sm" className="gap-1 mb-6"><ArrowLeft className="h-3.5 w-3.5" /> Home</Button></Link>
        <h1 className="text-3xl font-bold mb-2">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Acceptable use</h2>
            <p className="mt-2">AutoApply Copilot is a decision-support tool. You are responsible for reviewing every application before it's sent and for the accuracy of information submitted on your behalf.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Platform compliance</h2>
            <p className="mt-2">The copilot does not automate activity on LinkedIn or Indeed. You must not use it to scrape, bulk-message, or bypass any third-party platform's Terms of Service. Discovery on those platforms is manual.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">No guarantees</h2>
            <p className="mt-2">AI-generated CVs, cover letters and answers are drafts. We make no warranty that a submitted application will result in a response, interview or offer. You are responsible for verifying visa, salary and equal-opportunities answers.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Prohibited uses</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Submitting knowingly false information to employers.</li>
              <li>Sending bulk unsolicited messages ("spam") to hiring managers.</li>
              <li>Applying to roles you are not legally authorised to work in without disclosure.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Liability</h2>
            <p className="mt-2">To the maximum extent permitted by law, Visuosofts is not liable for indirect or consequential loss arising from use of the copilot.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p className="mt-2"><a className="text-primary" href="mailto:info@visuosofts.com">info@visuosofts.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
