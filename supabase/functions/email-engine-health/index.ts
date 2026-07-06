import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_WARM_ATTEMPTS = 3;
const WARM_ATTEMPT_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let source = "manual";
  let recentOnly = false;
  try {
    const body = await req.json();
    source = body?.source || source;
    recentOnly = Boolean(body?.recentOnly);
  } catch { /* GET or no body */ }

  // Recent-only mode: just return the latest log rows for the dashboard.
  if (recentOnly) {
    const { data: logs } = await supabase
      .from("email_engine_health_log")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(10);
    const latestFailure = (logs || []).find((l: any) => l.status !== "healthy");
    return new Response(JSON.stringify({
      latest: (logs || [])[0] || null,
      latestFailure: latestFailure || null,
      recent: logs || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const url = `${SUPABASE_URL}/functions/v1/email-engine`;
  let lastStatus = 0;
  let lastError = "";
  let lastCode = "";
  let healthy = false;
  let attempts = 0;

  for (let i = 0; i < MAX_WARM_ATTEMPTS; i++) {
    attempts++;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ action: "health" }),
      });
      lastStatus = resp.status;
      if (resp.ok) {
        healthy = true;
        break;
      }
      const text = await resp.text().catch(() => "");
      lastError = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        lastCode = j?.code || "";
      } catch { /* ignore */ }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      lastCode = "FETCH_ERROR";
    }
    if (i < MAX_WARM_ATTEMPTS - 1) await sleep(WARM_ATTEMPT_DELAY_MS);
  }

  try {
    await supabase.from("email_engine_health_log").insert({
      status: healthy ? "healthy" : "unhealthy",
      http_status: lastStatus || null,
      error_code: healthy ? null : (lastCode || null),
      error_message: healthy ? null : (lastError || null),
      source,
    });
  } catch (_) { /* ignore log failure */ }

  return new Response(JSON.stringify({
    healthy,
    attempts,
    httpStatus: lastStatus,
    errorCode: lastCode || null,
    errorMessage: healthy ? null : lastError,
    recoveredAfterEviction: healthy && attempts > 1,
  }), {
    status: healthy ? 200 : 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
