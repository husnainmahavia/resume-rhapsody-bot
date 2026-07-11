// Client-side compliance settings. Single-user today (localStorage); moves to
// profiles table when multi-tenant lands.

import { useEffect, useState } from "react";

const RISK_TOOLS_KEY = "acp_show_risk_tools";
const AUTONOMOUS_ACK_KEY = "acp_autonomous_ack";

export function getShowRiskTools(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(RISK_TOOLS_KEY) === "true";
}

export function setShowRiskTools(v: boolean) {
  localStorage.setItem(RISK_TOOLS_KEY, v ? "true" : "false");
  window.dispatchEvent(new Event("acp-settings-changed"));
}

export function getAutonomousAck(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUTONOMOUS_ACK_KEY) === "true";
}

export function setAutonomousAck(v: boolean) {
  if (v) sessionStorage.setItem(AUTONOMOUS_ACK_KEY, "true");
  else sessionStorage.removeItem(AUTONOMOUS_ACK_KEY);
  window.dispatchEvent(new Event("acp-settings-changed"));
}

export function useSetting<T>(getter: () => T): T {
  const [value, setValue] = useState<T>(getter);
  useEffect(() => {
    const onChange = () => setValue(getter());
    window.addEventListener("acp-settings-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("acp-settings-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
