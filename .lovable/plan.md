## Phase 1 — Compliance fix (this turn)

Landing page promises "no LinkedIn/Indeed automation" and "review before send," but the app currently ships a LinkedIn tab, a Scraper, and an Autonomous mode. Align product with promise.

1. **Assisted mode is the default.** In `AutoApplyPipeline.tsx` change the default mode toggle to Assisted (stop at Review Queue). Autonomous mode stays available but:
   - Requires an explicit checkbox: "I understand this sends emails without per-item review."
   - Shows a persistent warning banner with the daily cap.
2. **Hide LinkedIn & Scraper by default.** Add a Settings flag `showComplianceRiskTools` (localStorage, off by default). In `Index.tsx` sidebar, gate the `LinkedIn` and `Scraper` nav items behind that flag. Add a small toggle in Profile → Danger Zone: "Show compliance-risk tools (LinkedIn, Scraper) — may violate platform terms."
3. **Landing copy stays truthful** — no changes needed there once the tabs are gated.

## Phase 2 — Quick wins (next turn)

4. **Rebrand** to "AutoApply Copilot (by Visuosofts)": `index.html` title + meta, landing hero, sidebar header, README not touched.
5. **Daily-50 progress bar** on Dashboard: prepared (all apps today) / reviewed (approved in queue) / sent (sent_emails today) with a single horizontal bar and `X / 50` label.
6. **Risk flags in Review Queue**: detect at read-time from the email body/subject — salary mention, visa/work-authorisation keywords, sensitive PII asks. Show colored badges above the email preview. No schema change needed (pure client-side regex on `subject + body`).

## Phase 3 — Larger gaps (later turns)

7. **RSS/Atom discovery** — new `rss-ingest` edge function + `rss_sources` table + UI under Discovery to add feed URLs; scheduled cron ingests into `job_applications` with `source='rss'`.
8. **GDPR export/delete** in Profile → Danger Zone:
   - Export: zip of user's rows from all per-user tables as JSON.
   - Delete: cascade wipe + `supabase.auth.signOut()`.
9. **Gmail OAuth (multi-tenant prep)** — requires Google Cloud OAuth client + refresh-token storage per user. Larger; will scope separately when we get here.

## Technical notes

- No DB migration needed for Phase 1 or Phase 2 (all UI-layer).
- Phase 3 step 7 needs `rss_sources` table with RLS. Step 8 needs an edge function `gdpr-export`. Step 9 needs `user_google_tokens` table + `google-oauth-callback` function.
- Compliance flag lives in `localStorage` (single-user today); when multi-tenant lands it moves to `profiles.show_risk_tools`.

Confirm and I'll start Phase 1.