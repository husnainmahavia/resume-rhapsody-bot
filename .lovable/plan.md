# Build #1: Real UK leads (free) + Deliverability

Goal: replace AI-hallucinated leads with real UK businesses discovered from a free source, scored by actual website quality, and only then emailed — while making deliverability observable so we can ramp safely.

## 1. Real lead source — OpenStreetMap Overpass API (free, no key, no budget)

- New edge function `osm-lead-discovery` that queries the public Overpass API (`https://overpass-api.de/api/interpreter`) for businesses across the UK by category.
- Category → OSM tag map (examples):
  - `web-dev-new` / `web-dev-refresh` → `shop=*`, `office=*`, `craft=*`, `amenity=cafe|restaurant|pub|dentist|clinic`
  - `ar-menu` → `amenity=restaurant|cafe|pub|bar|hotel`
  - `ar-realestate` → `office=estate_agent`
  - `ar-business-card` → `office=consultant|lawyer|accountant`
- Geo strategy: iterate a fixed list of UK postcode-area centroids (Manchester, Leeds, Birmingham, London zones, Glasgow, Bristol, Liverpool, Sheffield, Edinburgh, Newcastle, Cardiff, Nottingham…) with a 5–10km radius each. One area per pipeline iteration to stay under the 30s function budget.
- Extract per business: name, address, phone (`contact:phone`), website (`website` / `contact:website`), OSM id (dedupe key).
- Persist raw hits to a new table `osm_raw_leads` with `(osm_id, category, area, seen_at)` unique constraint so we never re-process the same POI.

## 2. Website quality scoring (drives category assignment)

- New edge function `website-quality-score` (called per lead with a website):
  - `fetch` the site with a 6s timeout, follow redirects.
  - Score signals: HTTPS present, `<meta viewport>` present (mobile), page weight, presence of a known modern framework (`__NEXT_DATA__`, `data-reactroot`, `wp-content` = WordPress = usually OK, `FrontPage`/`Dreamweaver`/table-layout = stale), `Last-Modified` header age, absence of a copyright year >2 years old in footer text.
  - Output `{ score: 0-100, verdict: "none" | "refresh" | "ok" }`.
- Assignment rules:
  - No website field in OSM → `web-dev-new` (£500).
  - Website exists but fetch fails / verdict `refresh` (score < 45) → `web-dev-refresh` (£700).
  - Website OK (score ≥ 45) → skip for web-dev, but keep for AR categories where relevant (menus, business cards).
- Only after category is set do we call the hardened `find-email` on the domain.

## 3. Rewire `services-outreach-pipeline`

- Replace the current AI-based `discover` phase with:
  1. Pull next unprocessed batch from `osm_raw_leads` for selected categories/region.
  2. For each: score website → assign category → find-email (cached).
  3. Skip if no email found or already in dedupe set.
  4. Insert into `services_outreach_leads` with `source='osm'` and `website_score`.
- Keep existing pacing (45–90s), daily cap 40, review queue, bounce handling.

## 4. Deliverability instrumentation (Settings tab)

- New `DeliverabilityPanel` component with live checks:
  - DNS lookup (via a small edge function `dns-check`) for SPF, DKIM (`google._domainkey.visuosofts.com`), DMARC on `visuosofts.com` and the Gmail sending domain.
  - Traffic-light indicator per record with the exact TXT value expected if missing.
- Ramp schedule enforcement in `services-outreach-pipeline`:
  - Read `daily_cap` from a new `sender_config` row per mailbox (default 5, editable in UI).
  - Suggested progression shown in UI: 5 → 10 → 20 → 40 over 2 weeks.
- Open-tracking fix: verify `email-track` pixel is embedded on every send; surface per-lead `opened_at` in the recent-leads list.

## 5. Not in this build (deferred)

- Merging the two engines (build #3).
- Follow-up sequences (build #4).
- UI restructure (build #5).

## Technical notes

- Overpass has fair-use limits; we throttle to 1 request per 3s and cache the raw response per (area, category) for 30 days in `osm_raw_leads`.
- No new secrets required. No new paid APIs.
- New tables: `osm_raw_leads`, `sender_config`. New columns: `services_outreach_leads.source`, `services_outreach_leads.website_score`, `services_outreach_leads.opened_at`.
- All new tables get RLS + GRANTs per project rules.

## Deliverable order

1. Migration (tables + columns).
2. `osm-lead-discovery` + `website-quality-score` + `dns-check` edge functions.
3. Rewire `services-outreach-pipeline` discover phase.
4. `DeliverabilityPanel` UI + ramp controls.
5. Trigger one live batch, watch `services_outreach_leads` for real rows.

Approve and I'll build in that order.
