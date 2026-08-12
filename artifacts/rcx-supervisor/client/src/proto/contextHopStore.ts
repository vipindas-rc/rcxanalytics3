import { useSyncExternalStore } from "react";

import type { ContextHopEvent } from "./InteractionPreview";

// ---------------------------------------------------------------------------
// Module-level store for runtime hop-log events (take over / transfer) and the
// active-call registration made when a voice take-over commits. Lives outside
// React state so the Active calls screen (mounted by the page, outside the
// AgentTablePanel tree) sees the same hop history as the monitoring window
// and the interaction preview.
//
// Both maps are persisted to sessionStorage so the hop log and active-call
// context survive page refreshes. Pattern mirrors activePreviewCallStore.ts.
// ---------------------------------------------------------------------------

export type { ContextHopEvent };

const STORAGE_KEY = "rcx-context-hop-store";

interface PersistedShape {
  hops: Record<string, ContextHopEvent[]>;
  contexts: Record<string, ActiveCallContext>;
}

function load(): PersistedShape {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { hops: {}, contexts: {} };
    const parsed = JSON.parse(raw) as PersistedShape;
    // Basic validation — must be plain objects.
    if (
      typeof parsed?.hops !== "object" ||
      typeof parsed?.contexts !== "object"
    )
      return { hops: {}, contexts: {} };
    return parsed;
  } catch {
    return { hops: {}, contexts: {} };
  }
}

const initial = load();

const hopsByEngagement = new Map<string, ContextHopEvent[]>(
  Object.entries(initial.hops),
);
const activeCallByAgent = new Map<string, ActiveCallContext>(
  Object.entries(initial.contexts),
);
const listeners = new Set<() => void>();
const EMPTY_HOPS: ContextHopEvent[] = [];

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    const shape: PersistedShape = {
      hops: Object.fromEntries(hopsByEngagement),
      contexts: Object.fromEntries(activeCallByAgent),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // Storage unavailable — store still works for the current page life.
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function appendContextHop(
  engagementId: string,
  event: Omit<ContextHopEvent, "atMs">,
) {
  const existing = hopsByEngagement.get(engagementId) ?? [];
  // "You" is appended at most once per engagement (take over is one-way in
  // this prototype).
  if (event.kind === "you" && existing.some((e) => e.kind === "you")) return;
  hopsByEngagement.set(engagementId, [
    ...existing,
    { ...event, atMs: Date.now() },
  ]);
  persist();
  emit();
}

export function useContextHops(engagementId: string | null): ContextHopEvent[] {
  return useSyncExternalStore(subscribe, () =>
    engagementId ? hopsByEngagement.get(engagementId) ?? EMPTY_HOPS : EMPTY_HOPS,
  );
}

// Identity of the voice engagement a supervisor has taken over, keyed by the
// agent it was taken from. Registered when the take-over commits so the
// Active calls screen can rebuild the same interaction data (and hop log)
// the monitoring window was showing.
export interface ActiveCallContext {
  engagementId: string;
  fullName: string;
  agentType?: string;
}

export function registerActiveCallContext(
  agentId: string,
  ctx: ActiveCallContext,
) {
  activeCallByAgent.set(agentId, ctx);
  persist();
  emit();
}

export function useActiveCallContext(
  agentId: string | null,
): ActiveCallContext | null {
  return useSyncExternalStore(subscribe, () =>
    agentId ? activeCallByAgent.get(agentId) ?? null : null,
  );
}
