"use client";

import { supabase } from "./supabase";
import { usesLocalStorage } from "./report-storage";

export interface AiQuotaSnapshot {
  allowed: boolean;
  academyName: string;
  dailyPct: number;
  weeklyPct: number;
  monthlyPct: number;
  dailyRemainingPct: number;
  weeklyRemainingPct: number;
  monthlyRemainingPct: number;
  isBlocked: boolean;
  canManage: boolean;
}

const LOCAL_QUOTA_KEY = "cosmath:local-ai-quota:v1";

interface LocalQuotaStore {
  dayKey: string;
  weekKey: string;
  monthKey: string;
  dayUnits: number;
  weekUnits: number;
  monthUnits: number;
}

function getKstKeys(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const dayOfWeek = (kst.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - dayOfWeek);
  const weekKey = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  return {
    dayKey: `${year}-${month}-${day}`,
    weekKey,
    monthKey: `${year}-${month}`,
  };
}

function readLocalQuota(): LocalQuotaStore {
  const keys = getKstKeys();
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_QUOTA_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalQuotaStore>;
      return {
        dayKey: keys.dayKey,
        weekKey: keys.weekKey,
        monthKey: keys.monthKey,
        dayUnits: parsed.dayKey === keys.dayKey ? Number(parsed.dayUnits || 0) : 0,
        weekUnits: parsed.weekKey === keys.weekKey ? Number(parsed.weekUnits || 0) : 0,
        monthUnits: parsed.monthKey === keys.monthKey ? Number(parsed.monthUnits || 0) : 0,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { ...keys, dayUnits: 0, weekUnits: 0, monthUnits: 0 };
}

function toSnapshot(store: LocalQuotaStore, academyName = "우리 학원"): AiQuotaSnapshot {
  const dailyPct = Math.min(100, Math.round((store.dayUnits / 100) * 1000) / 10);
  const weeklyPct = Math.min(100, Math.round((store.weekUnits / 400) * 1000) / 10);
  const monthlyPct = Math.min(100, Math.round((store.monthUnits / 1200) * 1000) / 10);
  return {
    allowed: true,
    academyName,
    dailyPct,
    weeklyPct,
    monthlyPct,
    dailyRemainingPct: Math.max(0, Math.round((100 - dailyPct) * 10) / 10),
    weeklyRemainingPct: Math.max(0, Math.round((100 - weeklyPct) * 10) / 10),
    monthlyRemainingPct: Math.max(0, Math.round((100 - monthlyPct) * 10) / 10),
    isBlocked: false,
    canManage: false,
  };
}

export function consumeLocalQuota(units: number): AiQuotaSnapshot {
  const store = readLocalQuota();
  store.dayUnits += units;
  store.weekUnits += units;
  store.monthUnits += units;
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_QUOTA_KEY, JSON.stringify(store));
    }
  } catch {
    // Ignore storage errors
  }
  const snap = toSnapshot(store);
  notifyQuotaUpdated(snap);
  return snap;
}

export function notifyQuotaUpdated(snapshot?: AiQuotaSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cosmath-ai-quota-updated", { detail: snapshot }));
}

export async function fetchAiQuotaStatus(academyName = "우리 학원"): Promise<AiQuotaSnapshot> {
  if (!usesLocalStorage()) {
    try {
      const { data, error } = await supabase.rpc("cosmath_get_ai_quota_status");
      if (!error && data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const dailyPct = Number(d.daily_pct ?? 0);
        const weeklyPct = Number(d.weekly_pct ?? 0);
        const monthlyPct = Number(d.monthly_pct ?? 0);
        return {
          allowed: !Boolean(d.is_blocked ?? false),
          academyName: String(d.academy_name || academyName),
          dailyPct,
          weeklyPct,
          monthlyPct,
          dailyRemainingPct: Number(d.daily_remaining_pct ?? Math.max(0, 100 - dailyPct)),
          weeklyRemainingPct: Number(d.weekly_remaining_pct ?? Math.max(0, 100 - weeklyPct)),
          monthlyRemainingPct: Number(d.monthly_remaining_pct ?? Math.max(0, 100 - monthlyPct)),
          isBlocked: Boolean(d.is_blocked ?? false),
          canManage: Boolean(d.can_manage ?? false),
        };
      }
    } catch {
      // Fallback to local tracking if migration not yet applied
    }
  }
  return toSnapshot(readLocalQuota(), academyName);
}
