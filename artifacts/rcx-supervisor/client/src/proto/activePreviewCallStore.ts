import { useEffect, useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Module-level store for the voice preview call the supervisor has answered.
// Lives outside React state (same pattern as contextHopStore) so the top-bar
// call chip, the Engaged presence status, and the Active calls details page
// all read the same call. Persisted to sessionStorage so the URL-driven
// /active-call/preview route is refresh-safe: reloading restores the call
// with its original accept time (timers stay correct).
// ---------------------------------------------------------------------------

export interface ActivePreviewCall {
  /** Caller number shown in the chip and the Details page. */
  number: string;
  /** Originating queue, e.g. "Voice queue 2". */
  queueName: string;
  /** Engagement the call came from (context/hop continuity). */
  engagementId: string;
  /** Epoch ms when the supervisor answered — drives all timers. */
  acceptedAtMs: number;
  /** Supervisor mic muted (chip toggle). */
  muted: boolean;
}

const STORAGE_KEY = "rcx-active-preview-call";

function load(): ActivePreviewCall | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivePreviewCall;
    return typeof parsed?.acceptedAtMs === "number" ? parsed : null;
  } catch {
    return null;
  }
}

let current: ActivePreviewCall | null = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    if (current) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the call still works for the current page life.
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function startActivePreviewCall(
  call: Omit<ActivePreviewCall, "acceptedAtMs" | "muted">,
) {
  current = { ...call, acceptedAtMs: Date.now(), muted: false };
  persist();
  emit();
}

export function endActivePreviewCall() {
  current = null;
  persist();
  emit();
}

export function toggleActivePreviewCallMute() {
  if (!current) return;
  current = { ...current, muted: !current.muted };
  persist();
  emit();
}

export function getActivePreviewCall(): ActivePreviewCall | null {
  return current;
}

export function useActivePreviewCall(): ActivePreviewCall | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Ticking MM:SS elapsed since `sinceMs` (e.g. call accept time). */
export function useElapsedSince(sinceMs: number | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (sinceMs == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sinceMs]);
  if (sinceMs == null) return "00:00";
  const total = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
