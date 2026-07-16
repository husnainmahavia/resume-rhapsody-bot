// DNS check for deliverability panel. No external deps; uses Google DoH.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function doh(name: string, type: string) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const r = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!r.ok) return { ok: false, records: [] as string[] };
  const j = await r.json();
  const records = (j.Answer || []).map((a: { data: string }) => a.data.replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
  return { ok: true, records };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const domain: string = String(body.domain || "visuosofts.com").toLowerCase().trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return new Response(JSON.stringify({ error: "invalid domain" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [spf, dmarc, dkimGoogle, mx] = await Promise.all([
      doh(domain, "TXT"),
      doh(`_dmarc.${domain}`, "TXT"),
      doh(`google._domainkey.${domain}`, "TXT"),
      doh(domain, "MX"),
    ]);

    const spfRec = spf.records.find((r) => r.toLowerCase().startsWith("v=spf1")) || null;
    const dmarcRec = dmarc.records.find((r) => r.toLowerCase().startsWith("v=dmarc1")) || null;
    const dkimRec = dkimGoogle.records.find((r) => r.toLowerCase().includes("v=dkim1")) || null;

    return new Response(JSON.stringify({
      domain,
      spf:   { ok: !!spfRec,   value: spfRec,   suggestion: spfRec ? null : `v=spf1 include:_spf.google.com include:visuosofts.com ~all` },
      dmarc: { ok: !!dmarcRec, value: dmarcRec, suggestion: dmarcRec ? null : `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` },
      dkim_google: { ok: !!dkimRec, value: dkimRec, suggestion: dkimRec ? null : "Add Google Workspace DKIM TXT at google._domainkey" },
      mx: { ok: mx.records.length > 0, records: mx.records },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
