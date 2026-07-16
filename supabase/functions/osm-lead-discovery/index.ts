// Free UK business discovery via OpenStreetMap Overpass API.
// Populates public.osm_raw_leads. No API key required.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UK area centroids (lat, lon). Broad coverage across nations & regions.
const UK_AREAS: Array<{ name: string; lat: number; lon: number; radius_m: number }> = [
  { name: "Manchester",    lat: 53.4808, lon: -2.2426, radius_m: 8000 },
  { name: "Leeds",         lat: 53.8008, lon: -1.5491, radius_m: 8000 },
  { name: "Birmingham",    lat: 52.4862, lon: -1.8904, radius_m: 8000 },
  { name: "London-Central",lat: 51.5074, lon: -0.1278, radius_m: 5000 },
  { name: "London-East",   lat: 51.5390, lon: -0.0300, radius_m: 6000 },
  { name: "London-West",   lat: 51.5100, lon: -0.2500, radius_m: 6000 },
  { name: "Liverpool",     lat: 53.4084, lon: -2.9916, radius_m: 6000 },
  { name: "Sheffield",     lat: 53.3811, lon: -1.4701, radius_m: 6000 },
  { name: "Bristol",       lat: 51.4545, lon: -2.5879, radius_m: 6000 },
  { name: "Newcastle",     lat: 54.9784, lon: -1.6178, radius_m: 6000 },
  { name: "Nottingham",    lat: 52.9548, lon: -1.1581, radius_m: 6000 },
  { name: "Glasgow",       lat: 55.8642, lon: -4.2518, radius_m: 6000 },
  { name: "Edinburgh",     lat: 55.9533, lon: -3.1883, radius_m: 6000 },
  { name: "Cardiff",       lat: 51.4816, lon: -3.1791, radius_m: 6000 },
  { name: "Belfast",       lat: 54.5973, lon: -5.9301, radius_m: 6000 },
  { name: "Southampton",   lat: 50.9097, lon: -1.4044, radius_m: 6000 },
  { name: "Brighton",      lat: 50.8225, lon: -0.1372, radius_m: 5000 },
  { name: "Cambridge",     lat: 52.2053, lon: 0.1218,  radius_m: 5000 },
  { name: "Oxford",        lat: 51.7520, lon: -1.2577, radius_m: 5000 },
  { name: "Reading",       lat: 51.4543, lon: -0.9781, radius_m: 5000 },
];

// Category -> Overpass filter (union of tags). Kept small per query to stay under the 30s budget.
const CATEGORY_FILTERS: Record<string, string> = {
  "web-dev-new":     `nwr["shop"](around:{r},{lat},{lon});nwr["craft"](around:{r},{lat},{lon});nwr["office"](around:{r},{lat},{lon});nwr["amenity"~"^(cafe|restaurant|pub|dentist|clinic|hairdresser|veterinary)$"](around:{r},{lat},{lon});`,
  "web-dev-refresh": `nwr["shop"](around:{r},{lat},{lon});nwr["office"](around:{r},{lat},{lon});nwr["amenity"~"^(cafe|restaurant|pub|dentist|clinic)$"](around:{r},{lat},{lon});`,
  "dashboard":       `nwr["office"](around:{r},{lat},{lon});nwr["shop"~"^(car_repair|furniture|wholesale)$"](around:{r},{lat},{lon});`,
  "ar-realestate":   `nwr["office"="estate_agent"](around:{r},{lat},{lon});`,
  "ar-menu":         `nwr["amenity"~"^(restaurant|cafe|pub|bar|fast_food)$"](around:{r},{lat},{lon});nwr["tourism"="hotel"](around:{r},{lat},{lon});`,
  "ar-business-card":`nwr["office"~"^(consultant|lawyer|accountant|estate_agent|financial)$"](around:{r},{lat},{lon});`,
  "ar-billboard":    `nwr["tourism"~"^(museum|gallery|attraction)$"](around:{r},{lat},{lon});nwr["amenity"~"^(theatre|cinema|events_venue|nightclub)$"](around:{r},{lat},{lon});`,
  "ar-generic":      `nwr["shop"](around:{r},{lat},{lon});nwr["tourism"~"^(museum|gallery|attraction)$"](around:{r},{lat},{lon});`,
};

function buildQuery(category: string, area: typeof UK_AREAS[number]): string {
  const tpl = CATEGORY_FILTERS[category] || CATEGORY_FILTERS["web-dev-new"];
  const body = tpl
    .replaceAll("{r}", String(area.radius_m))
    .replaceAll("{lat}", String(area.lat))
    .replaceAll("{lon}", String(area.lon));
  return `[out:json][timeout:25];(${body});out center tags 400;`;
}

interface OsmEl {
  type: string;
  id: number;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const category: string = body.category || "web-dev-new";
    const areaName: string | undefined = body.area;
    const maxAreas: number = Math.max(1, Math.min(3, Number(body.maxAreas) || 1));

    if (!CATEGORY_FILTERS[category]) {
      return new Response(JSON.stringify({ error: `unknown category: ${category}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick areas: explicit, else least-recently-fetched (rotate across UK).
    let areas: typeof UK_AREAS = [];
    if (areaName) {
      const match = UK_AREAS.find((a) => a.name.toLowerCase() === areaName.toLowerCase());
      if (match) areas = [match];
    }
    if (areas.length === 0) {
      // Rotate deterministically by time bucket to spread queries.
      const bucket = Math.floor(Date.now() / (30 * 60_000)) % UK_AREAS.length;
      areas = [];
      for (let i = 0; i < maxAreas; i++) areas.push(UK_AREAS[(bucket + i) % UK_AREAS.length]);
    }

    let totalInserted = 0;
    const perArea: Array<{ area: string; found: number; inserted: number }> = [];

    for (const area of areas) {
      const query = buildQuery(category, area);
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!resp.ok) {
        console.warn(`Overpass ${area.name} ${category}: HTTP ${resp.status}`);
        perArea.push({ area: area.name, found: 0, inserted: 0 });
        continue;
      }
      const json = await resp.json().catch(() => ({ elements: [] }));
      const elements: OsmEl[] = json.elements || [];

      const rows = elements
        .map((el) => {
          const t = el.tags || {};
          const name = t.name || t["name:en"];
          if (!name) return null;
          const website = t.website || t["contact:website"] || t.url || null;
          const phone = t.phone || t["contact:phone"] || null;
          const addr = [
            t["addr:housenumber"], t["addr:street"], t["addr:city"] || t["addr:town"], t["addr:postcode"],
          ].filter(Boolean).join(", ") || null;
          const lat = el.lat ?? el.center?.lat ?? null;
          const lon = el.lon ?? el.center?.lon ?? null;
          return {
            osm_id: `${el.type}/${el.id}`,
            category,
            area: area.name,
            business_name: String(name).slice(0, 500),
            address: addr,
            phone,
            website,
            lat,
            lon,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      let inserted = 0;
      // Batch upsert in chunks; ignore duplicates (unique on osm_id, category)
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error, count } = await supabase
          .from("osm_raw_leads")
          .upsert(chunk as any, { onConflict: "osm_id,category", ignoreDuplicates: true, count: "exact" });
        if (error) console.warn("osm insert error:", error.message);
        else inserted += count || 0;
      }
      totalInserted += inserted;
      perArea.push({ area: area.name, found: rows.length, inserted });
    }

    return new Response(JSON.stringify({
      ok: true, category, areas: perArea, totalInserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
