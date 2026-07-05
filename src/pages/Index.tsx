import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bot, Search, FileText, Zap, Rocket, BarChart3, Globe, Linkedin,
  ShieldCheck, Upload, UserCog, Mail, Timer, ChevronRight, Eye
} from "lucide-react";
import StatsBar from "@/components/StatsBar";
import JobSearch from "@/components/JobSearch";
import ApplicationList from "@/components/ApplicationList";
import ProfileCard from "@/components/ProfileCard";
import AutoApplyPipeline from "@/components/AutoApplyPipeline";
import Dashboard from "@/components/Dashboard";
import ScraperTool from "@/components/ScraperTool";
import LinkedInTool from "@/components/LinkedInTool";
import ReviewQueue from "@/components/ReviewQueue";
import CSVUpload from "@/components/CSVUpload";
import ApplicantProfileForm from "@/components/ApplicantProfileForm";
import AuthGate from "@/components/AuthGate";
import EmailEngineDashboard from "@/components/EmailEngineDashboard";
import CronMonitorPanel from "@/components/CronMonitorPanel";
import EmailOpenTracker from "@/components/EmailOpenTracker";
import { fetchApplications, type JobApplication } from "@/lib/api";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: string;
  badge?: string;
}

const Index = () => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("auto");

  const loadApplications = async () => {
    try {
      const data = await fetchApplications();
      setApplications(data || []);
    } catch (e) {
      console.error("Failed to load applications:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const navItems: NavItem[] = [
    { id: "auto", label: "Auto-Apply", icon: Rocket, group: "Core" },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, group: "Core" },
    { id: "applications", label: "Pipeline", icon: FileText, group: "Core", badge: applications.length > 0 ? String(applications.length) : undefined },
    { id: "search", label: "Manual Search", icon: Search, group: "Discovery" },
    { id: "linkedin", label: "LinkedIn", icon: Linkedin, group: "Discovery" },
    { id: "scraper", label: "Scraper", icon: Globe, group: "Discovery" },
    { id: "email-engine", label: "Email Engine", icon: Mail, group: "Outreach" },
    { id: "review", label: "Review Queue", icon: ShieldCheck, group: "Outreach" },
    { id: "tracking", label: "Open Tracking", icon: Eye, group: "Outreach" },
    { id: "csv", label: "CSV Import", icon: Upload, group: "Tools" },
    { id: "profile", label: "Profile", icon: UserCog, group: "Tools" },
    { id: "cron", label: "Cron Monitor", icon: Timer, group: "Tools" },
  ];

  const groups = ["Core", "Discovery", "Outreach", "Tools"];

  const renderContent = () => {
    const contentMap: Record<string, { icon: React.ElementType; title: string; subtitle: string; description?: string; component: React.ReactNode }> = {
      auto: {
        icon: Zap, title: "Autonomous Auto-Apply", subtitle: "fully autonomous",
        description: "One click: AI searches jobs → tailors your CV → generates personalized emails → sends them from your Gmail. All automatic.",
        component: <AutoApplyPipeline onUpdate={loadApplications} />,
      },
      dashboard: {
        icon: BarChart3, title: "Email Analytics & Tracking", subtitle: "real-time",
        component: <Dashboard applications={applications} />,
      },
      applications: {
        icon: Zap, title: "Application Pipeline", subtitle: `${applications.length} total`,
        component: <ApplicationList applications={applications} onUpdate={loadApplications} />,
      },
      search: {
        icon: Rocket, title: "Manual Job Discovery", subtitle: "AI search",
        component: <JobSearch onJobAdded={loadApplications} />,
      },
      linkedin: {
        icon: Linkedin, title: "LinkedIn Outreach", subtitle: "AI-powered",
        description: "AI finds LinkedIn jobs → generates personalized connection requests, InMails & post comments → copy-paste to LinkedIn.",
        component: <LinkedInTool />,
      },
      scraper: {
        icon: Globe, title: "Company Scraper & Email Tool", subtitle: "24/7 scraping",
        description: "AI scrapes Google, Bing & search engines for company emails by category, stores them in a database, and sends personalized outreach emails.",
        component: <ScraperTool />,
      },
      "email-engine": {
        icon: Mail, title: "Visuosofts Email Engine", subtitle: "bulk outreach",
        description: "AI discovers companies by industry → generates personalized cold outreach emails → sends from info@visuosofts.com via SMTP.",
        component: <EmailEngineDashboard />,
      },
      review: {
        icon: ShieldCheck, title: "Email Review Queue & Bounce Analytics", subtitle: "pre-send review",
        description: "Review pending emails before they're sent. Approve verified domains in bulk or reject suspicious ones.",
        component: <ReviewQueue />,
      },
      tracking: {
        icon: Eye, title: "Email Open Tracking", subtitle: "real-time",
        description: "See which companies opened your application emails, how many times, and when. Powered by invisible tracking pixels.",
        component: <EmailOpenTracker />,
      },
      csv: {
        icon: Upload, title: "CSV Job Import", subtitle: "bulk upload",
        description: "Upload a CSV with company names, domains, job titles, and emails. Jobs are imported into the pipeline for processing.",
        component: <CSVUpload onImported={loadApplications} />,
      },
      profile: {
        icon: UserCog, title: "Applicant Profile", subtitle: "editable",
        description: "Edit your name, skills, experience, and CV content. The auto-apply pipeline uses this profile for personalized emails and CV tailoring.",
        component: <AuthGate><ApplicantProfileForm /></AuthGate>,
      },
      cron: {
        icon: Timer, title: "Cron Job Monitor", subtitle: "24/7 automation",
        description: "Real-time view of all 8 hourly cron jobs — job applications, email engine, scraper, follow-ups, and inbox checks.",
        component: <CronMonitorPanel />,
      },
    };

    const content = contentMap[activeTab];
    if (!content) return null;

    return (
      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="glass rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <content.icon className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{content.title}</h2>
          <span className="text-xs text-muted-foreground ml-auto font-mono">{content.subtitle}</span>
        </div>
        {content.description && (
          <p className="text-sm text-muted-foreground mb-4">{content.description}</p>
        )}
        {content.component}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-gradient">AutoApply</span>
                <span className="text-muted-foreground font-normal text-sm ml-2">Copilot</span>
              </h1>
              <p className="text-xs text-muted-foreground">AI Job Application Copilot — you review, you approve, you send</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground font-mono">ONLINE</span>
          </div>
        </motion.header>

        {/* Stats */}
        <StatsBar applications={applications} />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 space-y-4">
            <ProfileCard />

            {/* Navigation */}
            <nav className="glass rounded-lg p-2 space-y-3">
              {groups.map(group => {
                const items = navItems.filter(n => n.group === group);
                return (
                  <div key={group}>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-2 mb-1">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all group ${
                              isActive
                                ? "bg-primary/15 text-primary font-medium shadow-sm"
                                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                            }`}
                          >
                            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                            <span className="flex-1 text-left truncate">{item.label}</span>
                            {item.badge && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                                isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                              }`}>
                                {item.badge}
                              </span>
                            )}
                            {isActive && (
                              <ChevronRight className="h-3 w-3 text-primary/60 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Main Area */}
          <div className="lg:col-span-3">
            {renderContent()}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border space-x-3">
          <span className="font-mono">AutoApply Copilot · Discover → Score → Tailor → Review → Send · You approve every application</span>
          <a href="/" className="hover:text-foreground underline">Home</a>
          <a href="/faq" className="hover:text-foreground underline">FAQ</a>
          <a href="/about" className="hover:text-foreground underline">About</a>
          <a href="/contact" className="hover:text-foreground underline">Contact</a>
          <a href="/privacy" className="hover:text-foreground underline">Privacy</a>
          <a href="/terms" className="hover:text-foreground underline">Terms</a>
        </footer>
      </div>
    </div>
  );
};

export default Index;
