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
  /** Which surface owns the connected call window. */
  origin: "preview" | "takeover";
  /** URL opened from the header's call-details control. */
  detailsPath: string;
  /** Agent route identity used by taken-over call ownership. */
  agentId: string;
  /** Agent metadata needed to restore a taken-over dialer after refresh. */
  agentName: string;
  agentType: "Air" | "Human";
}

const STORAGE_KEY = "rcx-active-preview-call";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function load(): ActivePreviewCall | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActivePreviewCall>;
    const detailsPath = isNonEmptyString(parsed.detailsPath)
      ? parsed.detailsPath
      : "/active-call/preview";
    const detailsAgentId =
      detailsPath.split("/").filter(Boolean).at(-1) ?? "preview";
    // Records created before origin-aware routing were all preview calls.
    const normalized: Partial<ActivePreviewCall> = {
      ...parsed,
      origin:
        parsed.origin === "preview" || parsed.origin === "takeover"
          ? parsed.origin
          : "preview",
      detailsPath,
      agentId: isNonEmptyString(parsed.agentId)
        ? parsed.agentId
        : detailsAgentId,
      agentName: isNonEmptyString(parsed.agentName) ? parsed.agentName : "Agent",
      agentType: parsed.agentType === "Air" ? "Air" : "Human",
    };
    const valid =
      isNonEmptyString(normalized.number) &&
      isNonEmptyString(normalized.queueName) &&
      isNonEmptyString(normalized.engagementId) &&
      typeof normalized.acceptedAtMs === "number" &&
      Number.isFinite(normalized.acceptedAtMs) &&
      normalized.acceptedAtMs > 0 &&
      typeof normalized.muted === "boolean" &&
      (normalized.origin === "preview" || normalized.origin === "takeover") &&
      isNonEmptyString(normalized.detailsPath) &&
      normalized.detailsPath.startsWith("/active-call/") &&
      !normalized.detailsPath.includes("?") &&
      !normalized.detailsPath.includes("#") &&
      isNonEmptyString(normalized.agentId) &&
      isNonEmptyString(normalized.agentName) &&
      (normalized.agentType === "Air" || normalized.agentType === "Human");
    if (valid) return normalized as ActivePreviewCall;
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable.
    }
    return null;
  }
}

let current: ActivePreviewCall | null = load();
export interface MonitoringSession {
  /** Stable owner ID used to prevent one monitoring window ending another. */
  id: string;
  agentName: string;
  agentType: "Air" | "Human";
  startedAtMs: number;
  muted: boolean;
}

let monitoringCurrent: MonitoringSession | null = null;
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

export function endActivePreviewCall(expectedEngagementId?: string) {
  if (
    expectedEngagementId &&
    current?.engagementId !== expectedEngagementId
  ) {
    return;
  }
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

export function startMonitoringSession(
  session: Omit<MonitoringSession, "muted">,
) {
  const previous = monitoringCurrent;
  const sameSession = previous?.id === session.id;
  monitoringCurrent = {
    ...session,
    startedAtMs: sameSession
      ? previous.startedAtMs
      : session.startedAtMs,
    muted: sameSession ? previous.muted : false,
  };
  emit();
}

export function endMonitoringSession(expectedId?: string) {
  if (expectedId && monitoringCurrent?.id !== expectedId) return;
  monitoringCurrent = null;
  emit();
}

export function toggleMonitoringSessionMute() {
  if (!monitoringCurrent) return;
  monitoringCurrent = {
    ...monitoringCurrent,
    muted: !monitoringCurrent.muted,
  };
  emit();
}

export function useMonitoringSession(): MonitoringSession | null {
  return useSyncExternalStore(subscribe, () => monitoringCurrent);
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
