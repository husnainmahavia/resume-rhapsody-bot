import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const pixelId = url.searchParams.get("id");

    if (!pixelId) {
      return new Response(PIXEL, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update tracking record
    const { data: existing } = await supabase
      .from("email_tracking")
      .select("*")
      .eq("tracking_pixel_id", pixelId)
      .single();

    if (existing) {
      await supabase
        .from("email_tracking")
        .update({
          opened_at: existing.opened_at || new Date().toISOString(),
          open_count: (existing.open_count || 0) + 1,
        })
        .eq("tracking_pixel_id", pixelId);
    }

    return new Response(PIXEL, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    console.error("Tracking error:", e);
    return new Response(PIXEL, { headers: { "Content-Type": "image/gif" } });
  }
});
