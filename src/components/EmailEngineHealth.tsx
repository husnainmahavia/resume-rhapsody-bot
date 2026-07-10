import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Health = {
  healthy: boolean | null;
  checking: boolean;
  lastCheckedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  attempts: number;
};

const INITIAL: Health = {
  healthy: null,
  checking: false,
  lastCheckedAt: null,
  errorCode: null,
  errorMessage: null,
  httpStatus: null,
  lastFailureAt: null,
  lastFailureReason: null,
  attempts: 0,
};

export function EmailEngineHealthBanner({
  onRecovered,
}: { onRecovered?: () => void }) {
  const [state, setState] = useState<Health>(INITIAL);

  const loadRecent = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("email-engine-health", {
        body: { recentOnly: true, source: "dashboard" },
      });
      if (data?.latestFailure) {
        setState((s) => ({
          ...s,
          lastFailureAt: data.latestFailure.checked_at,
          lastFailureReason:
            data.latestFailure.error_message ||
            data.latestFailure.error_code ||
            `HTTP ${data.latestFailure.http_status}`,
        }));
      }
    } catch { /* ignore */ }
  }, []);

  const runCheck = useCallback(
    async (source = "dashboard") => {
      setState((s) => ({ ...s, checking: true }));
      try {
        const { data, error } = await supabase.functions.invoke("email-engine-health", {
          body: { source },
        });
        const healthy = Boolean(data?.healthy) && !error;
        setState((s) => ({
          ...s,
          checking: false,
          healthy,
          lastCheckedAt: new Date().toISOString(),
          errorCode: healthy ? null : data?.errorCode || null,
          errorMessage: healthy ? null : data?.errorMessage || error?.message || null,
          httpStatus: data?.httpStatus ?? null,
          attempts: data?.attempts ?? 0,
        }));
        if (healthy && onRecovered) onRecovered();
        if (!healthy) await loadRecent();
      } catch (e) {
        setState((s) => ({
          ...s,
          checking: false,
          healthy: false,
          lastCheckedAt: new Date().toISOString(),
          errorCode: "CLIENT_ERROR",
          errorMessage: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [loadRecent, onRecovered],
  );

  // Keep the latest callbacks in refs so the mount effect below has stable deps
  // and doesn't re-fire (and re-flip to "checking…") on every parent render.
  const runCheckRef = useRef(runCheck);
  const loadRecentRef = useRef(loadRecent);
  runCheckRef.current = runCheck;
  loadRecentRef.current = loadRecent;

  useEffect(() => {
    runCheckRef.current("initial");
    loadRecentRef.current();
    const t = window.setInterval(() => runCheckRef.current("interval"), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const bg = state.healthy
    ? "bg-success/10 border-success/30 text-success"
    : state.healthy === false
      ? "bg-destructive/10 border-destructive/40 text-destructive"
      : "bg-muted/40 border-border text-muted-foreground";

  const Icon = state.checking
    ? Loader2
    : state.healthy
      ? CheckCircle2
      : state.healthy === false
        ? AlertTriangle
        : Activity;

  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-xs ${bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${state.checking ? "animate-spin" : ""}`} />
        <span className="font-medium">
          Email engine:{" "}
          {state.checking
            ? "checking…"
            : state.healthy
              ? "healthy"
              : state.healthy === false
                ? `unhealthy${state.errorCode ? ` (${state.errorCode})` : ""}`
                : "unknown"}
        </span>
        {state.lastCheckedAt && (
          <span className="text-[10px] opacity-70 ml-1">
            checked {new Date(state.lastCheckedAt).toLocaleTimeString()}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-[11px]"
          disabled={state.checking}
          onClick={() => runCheck("manual")}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Retry / Warm up
        </Button>
      </div>
      {state.healthy === false && state.errorMessage && (
        <div className="text-[11px] opacity-90 break-all">
          {state.httpStatus ? `HTTP ${state.httpStatus} — ` : ""}
          {state.errorMessage.slice(0, 300)}
        </div>
      )}
      {state.lastFailureAt && (
        <div className="text-[10px] opacity-70">
          Last failure: {new Date(state.lastFailureAt).toLocaleString()} —{" "}
          {state.lastFailureReason?.slice(0, 160)}
        </div>
      )}
    </div>
  );
}

/**
 * Safe wrapper around supabase.functions.invoke("email-engine", ...) that
 * treats a 404 NOT_FOUND_FUNCTION_BLOB (blob eviction) as recoverable:
 * pings the health/warm-up endpoint once and retries the original call.
 */
export async function invokeEmailEngine<T = any>(body: any): Promise<{ data: T | null; error: any }> {
  const first = await supabase.functions.invoke("email-engine", { body });
  const errMsg = (first.error as any)?.message || "";
  const looksEvicted =
    (first.error as any)?.status === 404 ||
    /NOT_FOUND_FUNCTION_BLOB|Requested function was not found/i.test(errMsg);

  if (!first.error || !looksEvicted) {
    return first as { data: T | null; error: any };
  }

  // Warm up the function and retry once.
  try {
    await supabase.functions.invoke("email-engine-health", {
      body: { source: "auto-warmup" },
    });
  } catch { /* ignore warm failure */ }

  const retry = await supabase.functions.invoke("email-engine", { body });
  return retry as { data: T | null; error: any };
}
