import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, Search, FileText, Mail, Zap, Rocket } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatsBar from "@/components/StatsBar";
import JobSearch from "@/components/JobSearch";
import ApplicationList from "@/components/ApplicationList";
import ProfileCard from "@/components/ProfileCard";
import { fetchApplications, type JobApplication } from "@/lib/api";

const Index = () => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient glow effect */}
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
                <span className="text-muted-foreground font-normal text-sm ml-2">AI</span>
              </h1>
              <p className="text-xs text-muted-foreground">Autonomous Job Application Assistant</p>
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
          {/* Sidebar - Profile */}
          <div className="lg:col-span-1">
            <ProfileCard />
          </div>

          {/* Main Area */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="search" className="space-y-4">
              <TabsList className="bg-secondary/50 border border-border">
                <TabsTrigger value="search" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Search className="h-3.5 w-3.5" /> Find Jobs
                </TabsTrigger>
                <TabsTrigger value="applications" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <FileText className="h-3.5 w-3.5" /> Applications
                  {applications.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 rounded-full font-mono">
                      {applications.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="search">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass rounded-lg p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Rocket className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">AI Job Discovery</h2>
                    <span className="text-xs text-muted-foreground ml-auto font-mono">powered by AI</span>
                  </div>
                  <JobSearch onJobAdded={loadApplications} />
                </motion.div>
              </TabsContent>

              <TabsContent value="applications">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass rounded-lg p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">Application Pipeline</h2>
                    <span className="text-xs text-muted-foreground ml-auto font-mono">
                      {applications.length} total
                    </span>
                  </div>
                  <ApplicationList applications={applications} onUpdate={loadApplications} />
                </motion.div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <p className="font-mono">AutoApply AI • Workflow: Discover → Tailor CV → Generate Email → Send → Track</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
