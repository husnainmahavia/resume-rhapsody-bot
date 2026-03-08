import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Linkedin, Loader2, Search, MessageSquare, UserPlus, ExternalLink,
  Copy, CheckCircle2, RefreshCw, Zap, Send, Eye, MessageCircle,
  ChevronDown, ChevronUp, Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  searchLinkedInJobs, generateLinkedInMessages,
  getLinkedInStatus, listLinkedInOutreach, updateLinkedInOutreach
} from "@/lib/api";

interface LinkedInJob {
  title: string;
  company: string;
  location: string;
  salary_range?: string;
  description: string;
  linkedin_url?: string;
  hiring_manager_name?: string;
  hiring_manager_linkedin?: string;
  recent_post_topic?: string;
}

interface OutreachItem {
  id: string;
  job_title: string;
  company: string;
  job_url: string | null;
  job_description: string | null;
  location: string | null;
  hiring_manager_name: string | null;
  hiring_manager_linkedin: string | null;
  connection_message: string | null;
  inmail_message: string | null;
  post_comment: string | null;
  status: string;
  message_sent: boolean;
  response_received: boolean;
  created_at: string;
}

interface GeneratedMessages {
  connection_message: string;
  inmail_message: string;
  post_comment: string;
}

export default function LinkedInTool() {
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [location, setLocation] = useState("Manchester, UK");
  const [jobType, setJobType] = useState("Full-time");
  const [stats, setStats] = useState({ total: 0, messaged: 0, responded: 0, pending: 0 });
  const [outreach, setOutreach] = useState<OutreachItem[]>([]);
  const [searchResults, setSearchResults] = useState<LinkedInJob[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, GeneratedMessages>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [statusData, listData] = await Promise.all([getLinkedInStatus(), listLinkedInOutreach()]);
      setStats(statusData);
      setOutreach(listData.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = async () => {
    setSearching(true);
    setSearchResults([]);
    try {
      const result = await searchLinkedInJobs(location, jobType);
      setSearchResults(result.jobs || []);
      toast({
        title: "🔍 LinkedIn Jobs Found",
        description: `${result.total} jobs found, ${result.saved} new saved to database`,
      });
      await loadData();
    } catch (e) {
      toast({ title: "Search Error", description: String(e), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleGenerateMessages = async (item: OutreachItem) => {
    setGenerating(item.id);
    try {
      const result = await generateLinkedInMessages(
        item.job_title,
        item.company,
        item.job_description || "",
        item.hiring_manager_name || "Hiring Manager"
      );
      setMessages(prev => ({ ...prev, [item.id]: result }));

      // Save messages to database
      await updateLinkedInOutreach(item.id, {
        connection_message: result.connection_message,
        inmail_message: result.inmail_message,
        post_comment: result.post_comment,
        status: "messages_ready",
      });
      await loadData();

      toast({ title: "✨ Messages Generated", description: "Connection request, InMail & post comment ready!" });
    } catch (e) {
      toast({ title: "Generation Error", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied!", description: "Message copied to clipboard — paste it on LinkedIn" });
  };

  const markAsSent = async (item: OutreachItem) => {
    await updateLinkedInOutreach(item.id, {
      message_sent: true,
      message_sent_at: new Date().toISOString(),
      status: "messaged",
    });
    await loadData();
    toast({ title: "✅ Marked as sent" });
  };

  const markAsResponded = async (item: OutreachItem) => {
    await updateLinkedInOutreach(item.id, {
      response_received: true,
      status: "responded",
    });
    await loadData();
    toast({ title: "🎉 Response tracked!" });
  };

  const getItemMessages = (item: OutreachItem): GeneratedMessages | null => {
    if (messages[item.id]) return messages[item.id];
    if (item.connection_message || item.inmail_message || item.post_comment) {
      return {
        connection_message: item.connection_message || "",
        inmail_message: item.inmail_message || "",
        post_comment: item.post_comment || "",
      };
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Discovered", value: stats.total, icon: Search, color: "text-primary" },
          { label: "Messaged", value: stats.messaged, icon: Send, color: "text-info" },
          { label: "Responded", value: stats.responded, icon: MessageCircle, color: "text-success" },
          { label: "Pending", value: stats.pending, icon: Briefcase, color: "text-warning" },
        ].map(s => (
          <div key={s.label} className="glass rounded-lg p-3 text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className="text-lg font-bold font-mono">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search Config */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Location</label>
          <Input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Manchester, UK"
            className="bg-secondary border-border"
            disabled={searching}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Job Type</label>
          <Select value={jobType} onValueChange={setJobType} disabled={searching}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Full-time">Full-time</SelectItem>
              <SelectItem value="Part-time">Part-time</SelectItem>
              <SelectItem value="Contract">Contract</SelectItem>
              <SelectItem value="Remote">Remote</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button onClick={handleSearch} disabled={searching} className="gap-2" size="lg">
          {searching ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Searching LinkedIn...</>
          ) : (
            <><Search className="h-4 w-4" /> Find LinkedIn Jobs</>
          )}
        </Button>
        <Button variant="outline" onClick={loadData} className="gap-2" size="lg">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Data
        </Button>
      </div>

      {/* How it works */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
        <Linkedin className="h-4 w-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">How it works:</span>{" "}
          AI finds jobs → generates personalized connection requests, InMails & post comments → you copy-paste to LinkedIn.
          <span className="block mt-1">
            💡 Mark messages as "sent" and track responses to measure your outreach success.
          </span>
        </div>
      </div>

      {/* Search Results (new finds) */}
      <AnimatePresence>
        {searchResults.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              New Jobs Found ({searchResults.length})
            </h3>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {searchResults.map((job, i) => (
                <motion.div
                  key={`${job.company}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass rounded-md px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.company} • {job.location}</p>
                    </div>
                    {job.linkedin_url && (
                      <a href={job.linkedin_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Badge variant="outline" className="text-[9px] gap-1 cursor-pointer hover:bg-primary/10">
                          <ExternalLink className="h-2.5 w-2.5" /> Apply
                        </Badge>
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Outreach Pipeline */}
      {outreach.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            Outreach Pipeline ({outreach.length})
          </h3>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {outreach.map((item, i) => {
              const isExpanded = expandedId === item.id;
              const itemMessages = getItemMessages(item);

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="glass rounded-md overflow-hidden"
                >
                  {/* Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full px-3 py-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.job_title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.company} {item.hiring_manager_name && `• ${item.hiring_manager_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.response_received ? (
                          <Badge className="bg-success/20 text-success text-[9px]">Responded</Badge>
                        ) : item.message_sent ? (
                          <Badge className="bg-info/20 text-info text-[9px]">Messaged</Badge>
                        ) : itemMessages ? (
                          <Badge className="bg-primary/20 text-primary text-[9px]">Ready</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">New</Badge>
                        )}
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                          {/* Quick Actions */}
                          <div className="flex flex-wrap gap-2">
                            {item.job_url && (
                              <a href={item.job_url} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                                  <ExternalLink className="h-3 w-3" /> Open on LinkedIn
                                </Button>
                              </a>
                            )}
                            {item.hiring_manager_linkedin && (
                              <a href={item.hiring_manager_linkedin} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                                  <UserPlus className="h-3 w-3" /> View Profile
                                </Button>
                              </a>
                            )}
                            {!itemMessages && (
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1.5 text-xs h-7"
                                disabled={generating === item.id}
                                onClick={() => handleGenerateMessages(item)}
                              >
                                {generating === item.id ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
                                ) : (
                                  <><Zap className="h-3 w-3" /> Generate Messages</>
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Generated Messages */}
                          {itemMessages && (
                            <div className="space-y-3">
                              {/* Connection Request */}
                              {itemMessages.connection_message && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                      <UserPlus className="h-3 w-3" /> CONNECTION REQUEST
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px]"
                                      onClick={() => copyToClipboard(itemMessages.connection_message, `conn-${item.id}`)}
                                    >
                                      {copiedField === `conn-${item.id}` ? (
                                        <CheckCircle2 className="h-3 w-3 text-success" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <p className="text-xs bg-secondary/50 rounded-md p-2 border border-border">
                                    {itemMessages.connection_message}
                                  </p>
                                </div>
                              )}

                              {/* InMail */}
                              {itemMessages.inmail_message && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" /> INMAIL / DIRECT MESSAGE
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px]"
                                      onClick={() => copyToClipboard(itemMessages.inmail_message, `inmail-${item.id}`)}
                                    >
                                      {copiedField === `inmail-${item.id}` ? (
                                        <CheckCircle2 className="h-3 w-3 text-success" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <p className="text-xs bg-secondary/50 rounded-md p-2 border border-border whitespace-pre-wrap">
                                    {itemMessages.inmail_message}
                                  </p>
                                </div>
                              )}

                              {/* Post Comment */}
                              {itemMessages.post_comment && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3" /> POST COMMENT
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px]"
                                      onClick={() => copyToClipboard(itemMessages.post_comment, `comment-${item.id}`)}
                                    >
                                      {copiedField === `comment-${item.id}` ? (
                                        <CheckCircle2 className="h-3 w-3 text-success" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <p className="text-xs bg-secondary/50 rounded-md p-2 border border-border">
                                    {itemMessages.post_comment}
                                  </p>
                                </div>
                              )}

                              {/* Status Actions */}
                              <div className="flex gap-2">
                                {!item.message_sent && (
                                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => markAsSent(item)}>
                                    <Send className="h-3 w-3" /> Mark as Sent
                                  </Button>
                                )}
                                {item.message_sent && !item.response_received && (
                                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => markAsResponded(item)}>
                                    <CheckCircle2 className="h-3 w-3" /> Got Response
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {outreach.length === 0 && !searching && searchResults.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Linkedin className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No LinkedIn outreach yet. Search for jobs to get started.</p>
        </div>
      )}
    </div>
  );
}
