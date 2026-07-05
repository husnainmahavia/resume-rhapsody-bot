import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Globe, MessageSquare } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      </div>
      <div className="relative max-w-2xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Contact</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Product feedback, early-access requests, privacy questions, or security reports — pick the channel that fits.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="mailto:info@visuosofts.com"
            className="glass rounded-lg p-5 hover:border-primary/40 transition-colors"
          >
            <Mail className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">General & product</h3>
            <p className="text-xs text-muted-foreground break-all">info@visuosofts.com</p>
          </a>
          <a
            href="mailto:privacy@visuosofts.com"
            className="glass rounded-lg p-5 hover:border-primary/40 transition-colors"
          >
            <Mail className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Privacy & data requests</h3>
            <p className="text-xs text-muted-foreground break-all">privacy@visuosofts.com</p>
          </a>
          <a
            href="https://visuosofts.com"
            target="_blank"
            rel="noreferrer"
            className="glass rounded-lg p-5 hover:border-primary/40 transition-colors"
          >
            <Globe className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Company site</h3>
            <p className="text-xs text-muted-foreground">visuosofts.com</p>
          </a>
          <a
            href="mailto:security@visuosofts.com"
            className="glass rounded-lg p-5 hover:border-primary/40 transition-colors"
          >
            <Mail className="h-4 w-4 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">Security disclosure</h3>
            <p className="text-xs text-muted-foreground break-all">security@visuosofts.com</p>
          </a>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          We aim to reply to privacy and security reports within 5 working days.
        </p>

        <footer className="mt-10 text-center text-xs text-muted-foreground space-x-3">
          <Link to="/" className="hover:text-foreground underline">Home</Link>
          <Link to="/faq" className="hover:text-foreground underline">FAQ</Link>
          <Link to="/about" className="hover:text-foreground underline">About</Link>
          <Link to="/privacy" className="hover:text-foreground underline">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground underline">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
