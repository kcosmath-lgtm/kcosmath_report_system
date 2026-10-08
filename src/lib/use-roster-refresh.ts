"use client";
import { useEffect } from "react";

export function useRosterRefresh(refresh: () => Promise<void>, disabled = false, refreshOnFocus = true) {
  useEffect(() => {
    const update = () => { if (!disabled) void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") update(); };
    if (refreshOnFocus) window.addEventListener("focus", update);
    window.addEventListener("cosmath-roster-changed", update);
    if (refreshOnFocus) document.addEventListener("visibilitychange", visible);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cosmath-roster") : null;
    if (channel) channel.onmessage = update;
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("cosmath-roster-changed", update);
      document.removeEventListener("visibilitychange", visible);
      channel?.close();
    };
  }, [refresh, disabled, refreshOnFocus]);
}
