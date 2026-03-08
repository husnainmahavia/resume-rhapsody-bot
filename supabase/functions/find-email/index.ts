import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HR_KEYWORDS = ["hr", "recruit", "talent", "hiring", "people", "human resources", "staffing", "careers"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { companyDomain } = await req.json();
    if (!companyDomain) {
      return new Response(JSON.stringify({ error: "companyDomain is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const HUNTER_KEY = Deno.env.get("HUNTER_API_KEY");
    if (!HUNTER_KEY) {
      return new Response(JSON.stringify({ error: "HUNTER_API_KEY not configured", emails: [] }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean domain
    const domain = companyDomain.toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    console.log(`🔍 Hunter.io lookup for domain: ${domain}`);

    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=10`
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Hunter.io error ${res.status}:`, errText);
      return new Response(JSON.stringify({ error: `Hunter.io error: ${res.status}`, emails: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data } = await res.json();
    const emails = (data?.emails || [])
      .map((e: any) => ({
        email: e.value,
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
        title: e.position || "",
        confidence: e.confidence || 0,
        isHR: HR_KEYWORDS.some(k => (e.position || "").toLowerCase().includes(k)),
      }))
      .sort((a: any, b: any) => (b.isHR ? 1 : 0) - (a.isHR ? 1 : 0) || b.confidence - a.confidence);

    console.log(`✅ Found ${emails.length} emails for ${domain}`);

    return new Response(JSON.stringify({
      domain,
      organization: data?.organization || domain,
      emails,
      totalFound: data?.total || 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("find-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", emails: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
