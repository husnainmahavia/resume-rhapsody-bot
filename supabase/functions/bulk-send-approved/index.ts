// Server-side background worker that processes "approved" job applications:
// tailors CV (if missing) → drafts email (if missing) → sends email.
// Uses EdgeRuntime.waitUntil + self-handoff every ~25s to survive the
// edge idle timeout, so the UI can close/switch tabs and still make progress.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HANDOFF_MS = 25_000;
const PER_ITEM_MS = 60_000; // per-app hard cap so a stuck call doesn't wedge the loop
const RETRY_BASE_MS = 4_000;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let action = "status";
  try {
    const body = await req.json();
    action = body?.action || "status";
  } catch { /* GET / empty body */ }

  // ---- status ---------------------------------------------------------
  if (action === "status") {
    const { data } = await supabase
      .from("bulk_send_state").select("*").eq("id", 1).maybeSingle();
    return jsonResponse({ state: data || null });
  }

  // ---- stop -----------------------------------------------------------
  if (action === "stop") {
    await supabase.from("bulk_send_state").update({
      running: false,
      step: "Stopped by user",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return jsonResponse({ stopped: true });
  }

  // ---- run / resume ---------------------------------------------------
  const isResume = action === "resume";
  const { data: current } = await supabase
    .from("bulk_send_state").select("*").eq("id", 1).maybeSingle();

  if (!isResume && current?.running) {
    // Guard: only refuse if the state is not stale.
    const updated = current.updated_at ? new Date(current.updated_at).getTime() : 0;
    if (Date.now() - updated < 2 * 60 * 1000) {
      return jsonResponse({ accepted: false, message: "Bulk send already running." }, { status: 202 });
    }
  }

  let queueIds: string[] = [];

  if (isResume) {
    if (!current?.running) {
      return jsonResponse({ resumed: false, message: "Nothing to resume." });
    }
    queueIds = Array.isArray(current.queue_ids) ? [...current.queue_ids] : [];
  } else {
    // Fresh run: build queue from approved-but-not-sent applications that have
    // a hiring email (skipping those without recipients is deterministic).
    const { data: apps, error } = await supabase
      .from("job_applications")
      .select("id, company, hiring_manager_email, status, pending_review")
      .eq("pending_review", false)
      .not("status", "in", "(applied,rejected)")
      .not("hiring_manager_email", "is", null)
      .neq("hiring_manager_email", "")
      .order("created_at", { ascending: true });

    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    queueIds = (apps || []).map((a: any) => a.id);

    await supabase.from("bulk_send_state").upsert({
      id: 1,
      running: queueIds.length > 0,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      done: 0,
      total: queueIds.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      current_company: null,
      step: queueIds.length > 0 ? "Starting…" : "Nothing to send",
      last_error: null,
      queue_ids: queueIds,
    });

    if (queueIds.length === 0) {
      return jsonResponse({ accepted: false, message: "No approved applications with a recipient." });
    }
  }

  // Background loop with wall-time handoff.
  const runStartedAt = Date.now();
  let handoffScheduled = false;
  const scheduleHandoff = async (reason: string) => {
    if (handoffScheduled) return;
    handoffScheduled = true;
    try {
      const url = `${SUPABASE_URL}/functions/v1/bulk-send-approved`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ action: "resume" }),
      }).catch((e) => console.warn("handoff fetch failed:", e));
      console.log(`🔁 bulk-send handoff scheduled (${reason})`);
    } catch (e) {
      console.warn("handoff error:", e);
    }
  };

  const callSibling = async (fnName: string, payload: unknown, timeoutMs = 90_000) => {
    const resp = await withTimeout(
      fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify(payload),
      }),
      timeoutMs,
      `${fnName} fetch`,
    );
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data };
  };

  const backgroundRun = async () => {
    let stateSnapshot = current || { done: 0, sent: 0, skipped: 0, failed: 0 };
    let done = stateSnapshot.done || 0;
    let sent = stateSnapshot.sent || 0;
    let skipped = stateSnapshot.skipped || 0;
    let failed = stateSnapshot.failed || 0;

    try {
      while (queueIds.length > 0) {
        // Wall-time check — hand off cleanly.
        if (Date.now() - runStartedAt > HANDOFF_MS) {
          await supabase.from("bulk_send_state").update({
            running: true,
            updated_at: new Date().toISOString(),
            step: `Handing off to fresh worker (${queueIds.length} remaining)`,
            queue_ids: queueIds,
            done, sent, skipped, failed,
          }).eq("id", 1);
          await scheduleHandoff("wall-time");
          return;
        }

        // Bail out if user asked to stop.
        const { data: latest } = await supabase
          .from("bulk_send_state").select("running").eq("id", 1).maybeSingle();
        if (!latest?.running) {
          console.log("bulk-send: stop signal detected, exiting loop");
          return;
        }

        const appId = queueIds[0];
        // Load the current row (data may have changed since queue was built).
        const { data: app } = await supabase
          .from("job_applications")
          .select("*")
          .eq("id", appId)
          .maybeSingle();

        if (!app) {
          queueIds.shift();
          skipped++;
          done++;
          await supabase.from("bulk_send_state").update({
            queue_ids: queueIds, done, sent, skipped, failed,
            updated_at: new Date().toISOString(),
            step: "Row missing, skipped",
          }).eq("id", 1);
          continue;
        }

        await supabase.from("bulk_send_state").update({
          running: true,
          current_company: app.company,
          step: "Starting…",
          updated_at: new Date().toISOString(),
        }).eq("id", 1);

        try {
          // 1. Tailor CV if missing
          if (!app.tailored_cv) {
            await supabase.from("bulk_send_state").update({
              step: "Tailoring CV…", updated_at: new Date().toISOString(),
            }).eq("id", 1);

            const cvVersion = app.cv_profile || "fullstack";
            const r = await callSibling("ai-tailor-cv", {
              jobTitle: app.job_title,
              company: app.company,
              jobDescription: app.job_description || "",
              cvVersion,
            }, PER_ITEM_MS);
            if (r.ok && r.data?.tailored_cv) {
              await supabase.from("job_applications").update({
                tailored_cv: r.data.tailored_cv,
                cover_letter: r.data.cover_letter,
                status: "cv_tailored",
                cv_profile: cvVersion,
              }).eq("id", appId);
              app.tailored_cv = r.data.tailored_cv;
              app.cover_letter = r.data.cover_letter;
            } else if (r.status === 429) {
              // Rate-limited: back off and retry this same item next isolate.
              await supabase.from("bulk_send_state").update({
                step: "AI rate-limited — retrying shortly",
                last_error: r.data?.error || "AI rate limit",
                updated_at: new Date().toISOString(),
              }).eq("id", 1);
              await new Promise(res => setTimeout(res, RETRY_BASE_MS));
              await scheduleHandoff("rate-limit");
              return;
            }
          }

          // 2. Draft email if missing
          if (!app.email_body || !app.email_subject) {
            await supabase.from("bulk_send_state").update({
              step: "Drafting email…", updated_at: new Date().toISOString(),
            }).eq("id", 1);

            const r = await callSibling("ai-generate-email", {
              jobTitle: app.job_title,
              company: app.company,
              hiringManager: app.hiring_manager_name || "Hiring Team",
              jobDescription: app.job_description || "",
            }, PER_ITEM_MS);
            if (r.ok && r.data?.subject && r.data?.body) {
              await supabase.from("job_applications").update({
                email_subject: r.data.subject,
                email_body: r.data.body,
              }).eq("id", appId);
              app.email_subject = r.data.subject;
              app.email_body = r.data.body;
            } else if (r.status === 429) {
              await supabase.from("bulk_send_state").update({
                step: "AI rate-limited — retrying shortly",
                last_error: r.data?.error || "AI rate limit",
                updated_at: new Date().toISOString(),
              }).eq("id", 1);
              await new Promise(res => setTimeout(res, RETRY_BASE_MS));
              await scheduleHandoff("rate-limit");
              return;
            }
          }

          // 3. Validate ready-to-send
          if (!app.hiring_manager_email || !app.email_subject || !app.email_body) {
            skipped++;
            done++;
            queueIds.shift();
            await supabase.from("bulk_send_state").update({
              queue_ids: queueIds, done, sent, skipped, failed,
              step: "Skipped — missing recipient/subject/body",
              updated_at: new Date().toISOString(),
            }).eq("id", 1);
            continue;
          }

          // 4. Send
          await supabase.from("bulk_send_state").update({
            step: `Sending to ${app.hiring_manager_email}…`,
            updated_at: new Date().toISOString(),
          }).eq("id", 1);

          const s = await callSibling("email-mailbox", {
            action: "send",
            to: app.hiring_manager_email,
            subject: app.email_subject,
            body: app.email_body,
            hiringManagerName: app.hiring_manager_name || undefined,
            applicationId: appId,
          }, PER_ITEM_MS);

          const sendData = s.data || {};
          if (sendData.skipped) {
            skipped++;
          } else if (sendData.sent === false || sendData.error) {
            failed++;
            await supabase.from("bulk_send_state").update({
              last_error: `${app.company}: ${sendData.error || "send blocked"}`,
            }).eq("id", 1);
          } else {
            await supabase.from("job_applications").update({
              status: "applied",
              applied_at: new Date().toISOString(),
              follow_up_scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            }).eq("id", appId);
            sent++;
          }
        } catch (err) {
          failed++;
          await supabase.from("bulk_send_state").update({
            last_error: `${app.company}: ${err instanceof Error ? err.message : String(err)}`,
          }).eq("id", 1);
        }

        queueIds.shift();
        done++;
        await supabase.from("bulk_send_state").update({
          queue_ids: queueIds, done, sent, skipped, failed,
          updated_at: new Date().toISOString(),
          step: queueIds.length ? "Next…" : "Finishing…",
        }).eq("id", 1);
      }

      // All done
      await supabase.from("bulk_send_state").update({
        running: false,
        current_company: null,
        step: `Complete — ${sent} sent · ${skipped} skipped · ${failed} failed`,
        updated_at: new Date().toISOString(),
        queue_ids: [],
      }).eq("id", 1);
      console.log(`✅ bulk-send finished. sent=${sent} skipped=${skipped} failed=${failed}`);
    } catch (fatal) {
      console.error("bulk-send fatal error:", fatal);
      await supabase.from("bulk_send_state").update({
        running: false,
        step: "Errored",
        last_error: fatal instanceof Error ? fatal.message : String(fatal),
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
    }
  };

  // @ts-ignore - EdgeRuntime provided by Supabase runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(backgroundRun());
  } else {
    // Local dev fallback
    backgroundRun();
  }

  return jsonResponse({
    accepted: true,
    remaining: queueIds.length,
    message: isResume
      ? "Bulk send resumed in background."
      : `Bulk send started for ${queueIds.length} application(s). Safe to close this tab.`,
  }, { status: 202 });
});
