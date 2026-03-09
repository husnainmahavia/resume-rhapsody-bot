import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Loader2, ChevronDown, ChevronUp, Wrench,
  ShieldCheck, Search, Zap, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolResults?: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> }[];
}

const QUICK_ACTIONS = [
  {
    label: "Fix All Emails",
    icon: Zap,
    message:
      "Run bulk_fix_emails on the top 10 unsent leads. Verify each current email and replace any that are invalid with real verified ones.",
  },
  {
    label: "Analyze Bounces",
    icon: ShieldCheck,
    message:
      "List all leads with send errors, verify their emails, and tell me which are fixable vs should be removed.",
  },
  {
    label: "Find Real Emails",
    icon: Search,
    message:
      "For the top 5 unsent leads, find real verified email addresses using AI and DNS checks, and update them.",
  },
  {
    label: "Health Report",
    icon: BarChart3,
    message:
      "Give me a full email health report: how many leads are sent vs unsent vs failed, and what percentage of unsent emails are likely fake.",
  },
];

export default function EmailEngineAI({ onDataChanged }: { onDataChanged?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 I'm your **AI Email Boss**. I use built-in AI + DNS/MX verification to find and verify **real business emails** — fixing the deliverability problem where ~90% of AI-generated emails bounce.\n\nTry a quick action below or ask me anything.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (expanded) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("email-engine-ai", {
        body: {
          messages: next
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        role: "assistant",
        content: data.message || "Done.",
        toolResults: data.toolResults,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (
        data.toolResults?.some(
          (t: { tool: string }) => t.tool === "fix_lead_email" || t.tool === "bulk_fix_emails"
        )
      ) {
        onDataChanged?.();
        toast({ title: "✅ Leads updated", description: "Email data refreshed with verified addresses" });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${errMsg}. Please try again.` },
      ]);
      toast({ title: "AI Error", description: errMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toolLabel = (name: string) => {
    const map: Record<string, string> = {
      list_leads: "📋 Listed leads",
      verify_email: "🔍 Verified email",
      find_company_email: "🏢 AI email search",
      fix_lead_email: "✏️ Updated lead",
      bulk_fix_emails: "⚡ Bulk verified & fixed",
    };
    return map[name] || name;
  };

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold">AI Email Boss</span>
            <span className="text-[9px] ml-2 bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
              AI Powered
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Quick Actions */}
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap border-t border-border/50 pt-2">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => sendMessage(a.message)}
                  disabled={loading}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors disabled:opacity-50 font-medium"
                >
                  <a.icon className="h-3 w-3" />
                  {a.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="px-3 pb-2 space-y-2.5 max-h-[400px] overflow-y-auto">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-xs max-w-none text-xs leading-relaxed [&>*]:my-1 [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_strong]:text-foreground [&_code]:text-[10px] [&_code]:bg-background/30 [&_code]:px-1 [&_code]:rounded">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="leading-relaxed">{msg.content}</p>
                    )}

                    {/* Tool results summary */}
                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                          Actions performed
                        </p>
                        {msg.toolResults.map((tr, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                          >
                            <Wrench className="h-2.5 w-2.5 shrink-0" />
                            <span>{toolLabel(tr.tool)}</span>
                            {tr.tool === "bulk_fix_emails" && (
                              <span className="text-primary font-medium ml-1">
                                {(tr.result as Record<string, number>)?.fixed || 0} fixed
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-secondary/60 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-[10px] text-muted-foreground">
                      Searching Hunter.io & analyzing...
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-3 pb-3 border-t border-border/50 pt-2">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Ask me to fix emails, verify leads, analyze bounces..."
                  className="flex-1 text-xs bg-background/50 border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                  disabled={loading}
                />
                <Button
                  size="sm"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
