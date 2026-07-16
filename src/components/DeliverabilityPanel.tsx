import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Mail, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type RecordCheck = { ok: boolean; value: string | null; suggestion: string | null };
interface DnsResult {
  domain: string;
  spf: RecordCheck;
  dmarc: RecordCheck;
  dkim_google: RecordCheck;
  mx: { ok: boolean; records: string[] };
}

const RAMP_STEPS = [5, 10, 20, 40];

export default function DeliverabilityPanel() {
  const [domain, setDomain] = useState("visuosofts.com");
  const [dns, setDns] = useState<DnsResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [mailbox] = useState("info@visuosofts.com");
  const [dailyCap, setDailyCap] = useState<number>(5);
  const [savingCap, setSavingCap] = useState(false);

  const loadConfig = async () => {
    const { data } = await supabase.from("sender_config").select("daily_cap").eq("mailbox", mailbox).maybeSingle();
    if (data?.daily_cap) setDailyCap(Number(data.daily_cap));
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("dns-check", { body: { domain } });
      if (error) throw error;
      setDns(data as DnsResult);
    } catch (e) {
      toast({ title: "DNS check failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { loadConfig(); runCheck(); /* eslint-disable-next-line */ }, []);

  const saveCap = async (cap: number) => {
    setSavingCap(true);
    try {
      const { error } = await supabase.from("sender_config").upsert(
        { mailbox, daily_cap: cap },
        { onConflict: "mailbox" },
      );
      if (error) throw error;
      setDailyCap(cap);
      toast({ title: `Daily cap set to ${cap}` });
    } catch (e) {
      toast({ title: "Failed to save cap", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingCap(false);
    }
  };

  const Row = ({ label, check, name }: { label: string; check: RecordCheck; name: string }) => (
    <div className="p-3 rounded-md border border-border bg-secondary/30">
      <div className="flex items-center gap-2">
        {check.ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{name}</span>
      </div>
      {check.value && (
        <p className="mt-2 text-[11px] font-mono break-all text-muted-foreground">{check.value}</p>
      )}
      {!check.ok && check.suggestion && (
        <p className="mt-2 text-[11px] font-mono break-all text-yellow-500/90">Suggested: {check.suggestion}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">DNS Deliverability</p>
        <div className="flex gap-2">
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="max-w-xs" />
          <Button onClick={runCheck} disabled={checking} variant="outline" className="gap-2">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check
          </Button>
        </div>
        {dns && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <Row label="SPF" check={dns.spf} name={dns.domain} />
            <Row label="DMARC" check={dns.dmarc} name={`_dmarc.${dns.domain}`} />
            <Row label="DKIM (Google Workspace)" check={dns.dkim_google} name={`google._domainkey.${dns.domain}`} />
            <div className="p-3 rounded-md border border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                {dns.mx.ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                <span className="text-sm font-medium">MX</span>
              </div>
              {dns.mx.records.map((r, i) => (
                <p key={i} className="mt-1 text-[11px] font-mono break-all text-muted-foreground">{r}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-2">
          <Mail className="h-3 w-3" /> Sender Ramp — {mailbox}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Current daily cap: <span className="font-mono text-foreground">{dailyCap}</span>.
          Recommended progression over ~2 weeks: 5 → 10 → 20 → 40.
        </p>
        <div className="flex flex-wrap gap-2">
          {RAMP_STEPS.map((step) => (
            <Button
              key={step}
              size="sm"
              disabled={savingCap}
              variant={dailyCap === step ? "default" : "outline"}
              onClick={() => saveCap(step)}
              className="gap-2"
            >
              <Save className="h-3 w-3" />
              {step}/day
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
