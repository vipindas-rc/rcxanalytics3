// ---------------------------------------------------------------------------
// Live queue store — a tiny external store (useSyncExternalStore) shared by
// the top-nav "Queue (n)" counter and the Queue table so both always agree.
//
// Two independent row sets live here:
//   - compact: the original queue used by Supervisor 1 / Supervisor
//     (suggestion) / Agent (suggestion) — seeded with 9 rows, capped at 14,
//     never dropping below 3.
//   - extended: the high-volume queue used only by the Supervisor
//     (pagination) flow — seeded with 50 rows, capped at 55, never dropping
//     below 20, so pagination always has multiple pages to show.
// Both sets share the same simulation heartbeat: every second the waiting
// clocks advance; every few seconds an interaction arrives or leaves, so the
// counters and tables churn like a real contact center. Claim / Transfer
// from the hover actions also remove the row immediately (from whichever set
// holds it — engagement ids never collide across sets).
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react';

import { CONVERSATION_STATES, makeQueueInteractions } from './supervisorMock';

const COMPACT_SEED = 9;
const COMPACT_CAP = 14;
const COMPACT_FLOOR = 3;
const EXTENDED_SEED = 50;
const EXTENDED_CAP = 55;
const EXTENDED_FLOOR = 20;

let compactRows: any[] = makeQueueInteractions(COMPACT_SEED);
let extendedRows: any[] = makeQueueInteractions(EXTENDED_SEED, 'queue-p-');
let listeners: Array<() => void> = [];

const emit = () => {
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.push(l);
  startQueueSimulation();
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
};

const getCompactSnapshot = () => compactRows;
const getExtendedSnapshot = () => extendedRows;

/**
 * Live pending rows. Pass `extended: true` only in the Supervisor
 * (pagination) flow to read the high-volume set; every other flow reads the
 * compact set (the original queue behavior).
 */
export const useQueueRows = (extended = false): any[] =>
  useSyncExternalStore(
    subscribe,
    extended ? getExtendedSnapshot : getCompactSnapshot,
  );

export const useQueuePendingCount = (extended = false): number =>
  useSyncExternalStore(
    subscribe,
    extended ? getExtendedSnapshot : getCompactSnapshot,
  ).length;

/** Remove an interaction from the queue (claimed / transferred / picked up). */
export const removeQueueRow = (engagementId: string): any | null => {
  let row = compactRows.find((r) => r.engagementId === engagementId) ?? null;
  if (row) {
    compactRows = compactRows.filter((r) => r.engagementId !== engagementId);
    emit();
    return row;
  }
  row = extendedRows.find((r) => r.engagementId === engagementId) ?? null;
  if (row) {
    extendedRows = extendedRows.filter((r) => r.engagementId !== engagementId);
    emit();
  }
  return row;
};

/**
 * Send a waiting call back to the end of the queue: its waiting clocks reset
 * and the row re-sorts to the bottom (default order is longest wait first).
 */
const requeueIn = (rows: any[], engagementId: string): any[] | null => {
  if (!rows.some((r) => r.engagementId === engagementId)) return null;
  return rows
    .map((r) =>
      r.engagementId === engagementId
        ? { ...r, timeInQueueMs: 0, waitTimeMs: 0 }
        : r,
    )
    .sort((a, b) => b.timeInQueueMs - a.timeInQueueMs);
};

export const requeueRow = (engagementId: string): any | null => {
  const inCompact = requeueIn(compactRows, engagementId);
  if (inCompact) {
    const row = compactRows.find((r) => r.engagementId === engagementId);
    compactRows = inCompact;
    emit();
    return row ?? null;
  }
  const inExtended = requeueIn(extendedRows, engagementId);
  if (inExtended) {
    const row = extendedRows.find((r) => r.engagementId === engagementId);
    extendedRows = inExtended;
    emit();
    return row ?? null;
  }
  return null;
};

// --- Arrival generator -------------------------------------------------------
const ARRIVAL_CUSTOMERS = [
  'Katrina Michaels',
  'Omar Haddad',
  'Yuki Tanaka',
  'Sofia Rossi',
  'Ben Carter',
  'Nadia Petrova',
  'Luis Ortega',
  'Hannah Weiss',
];
const ARRIVAL_SUBJECTS = [
  'Payment failed at checkout',
  '',
  'Reset two-factor authentication',
  'Cancel duplicate order',
  '',
  'Plan downgrade question',
];
const ARRIVAL_CHANNELS = [
  { type: 'VOICE', name: 'Voice', color: '' },
  { type: 'WEB_CHAT', name: 'Web Chat', color: '#7d5bbe' },
  { type: 'EMAIL', name: 'Support Inbox', color: '#e05d38' },
  { type: 'WHATS_APP', name: 'WhatsApp', color: '#25d366' },
];
const ARRIVAL_QUEUES = [
  'Customer support',
  'Billing',
  'Technical support',
  'Sales',
  'VIP support',
];

// Separate arrival sequences per set keep engagement ids unique within (and
// across) the compact and extended queues.
let compactArrivalSeq = 0;
let extendedArrivalSeq = 0;

const makeArrival = (i: number, idPrefix: string): any => {
  const ch = ARRIVAL_CHANNELS[i % ARRIVAL_CHANNELS.length];
  const engagementId = `${idPrefix}${i + 1}`;
  return {
    engagementId,
    glId: engagementId,
    agentId: '',
    fullName: '',
    agentName: '',
    agentType: '',
    sourceType: ch.type,
    sourceName: ch.name,
    sourceColor: ch.color,
    engagementSource: {
      initialEngagementSourceType: ch.type,
      initialEngagementSourceName: ch.name,
      initialEngagementSourceColor: ch.color,
    },
    categoryIds:
      i % 3 === 2 ? '' : [String((i % 6) + 1), String(((i + 2) % 6) + 1)].join(','),
    productName: ARRIVAL_QUEUES[i % ARRIVAL_QUEUES.length],
    agentDurationMs: null,
    confidenceScore: null,
    sentimentScore: null,
    // Voice callers are identified by their incoming number (no contact
    // record yet while waiting in queue); digital rows keep the name.
    contactIdentity:
      ch.type === 'VOICE'
        ? `+1 (628) 555-02${String((i % 90) + 10)}`
        : ARRIVAL_CUSTOMERS[i % ARRIVAL_CUSTOMERS.length],
    threadTitle: ARRIVAL_SUBJECTS[i % ARRIVAL_SUBJECTS.length],
    pendingDispositionMs: null,
    isVoiceInteraction: ch.type === 'VOICE',
    // Mix of waits so the SLA colors stay represented: most arrivals are
    // fresh, but some come back from transfers already deep in the orange
    // (>5 min) or red (>10 min) zones. Time in queue (interaction time +
    // interaction waiting time for the current segment) never exceeds the
    // customer's total waiting time.
    waitTimeMs: [15, 390, 45, 700, 85][i % 5] * 1000,
    timeInQueueMs: [10, 330, 30, 640, 60][i % 5] * 1000,
    conversationState: CONVERSATION_STATES.PENDING.key,
    conversationStateLabel: CONVERSATION_STATES.PENDING.label,
    // Routing priority on some live arrivals (1.0, 2.0, 3.0 — lower = more
    // urgent); the rest have none and render the em dash.
    priority: i % 3 === 0 ? (Math.floor(i / 3) % 3) + 1 : null,
    // Live arrivals are always fresh (never previously handled), so
    // Previous agent is blank.
    lastAgentName: '',
    isQueueRow: true,
    // Every queued conversation can be previewed: digital rows open the
    // Interaction preview; voice rows open the preview-call window.
    hasPreview: true,
    showViewInsights: true,
    showBargeIn: false,
    showMonitor: false,
    showCoach: false,
  };
};

// --- Simulation ---------------------------------------------------------------
let simulationStarted = false;
// Timer beat: the waiting clocks advance every second (matching the 1s
// timers on assigned interactions), while arrivals/departures churn on a
// slower beat so the queue doesn't thrash.
export const TIMER_TICK_MS = 1000;
// Churn beat: every CHURN_EVERY_TICKS timer beats, an arrival or departure
// happens (same 6s rhythm as before).
const CHURN_EVERY_TICKS = 6;
let tick = 0;
let churnBeat = 0;

// Waiting clocks keep running: while a customer is still waiting (queue rows
// are all Pending), both Total waiting time and Time in queue count up each
// second, so rows cross SLA bands live.
const advanceClocks = (rows: any[]): any[] =>
  rows.map((r) => ({
    ...r,
    timeInQueueMs: r.timeInQueueMs + TIMER_TICK_MS,
    waitTimeMs: r.waitTimeMs + TIMER_TICK_MS,
  }));

// Uneven rhythm (2 arrivals for every departure) so the counter visibly
// drifts instead of ping-ponging around one value.
//
// preferLongest controls departure strategy:
//   false (compact queue): remove shortest-waiting row — long (orange/red)
//         SLA rows stay visible in the demo.
//   true  (extended/paginated queue): remove longest-waiting row — breached
//         rows cycle out as fresh arrivals join at 0 ms, keeping the SLA-
//         breach count stable near the seeded level (~15) instead of
//         letting clocks push nearly every row into the red band over time.
const churn = (
  rows: any[],
  cap: number,
  floor: number,
  nextArrival: () => any,
  preferLongest = false,
): any[] => {
  if (churnBeat % 3 !== 0) {
    // A new customer joins the queue (cap so it can't grow unbounded).
    // Keep the default order by time in queue (longest first) so the
    // red SLA breaches sit on top, then the orange ones, then the rest.
    if (rows.length < cap) {
      return [...rows, nextArrival()].sort(
        (a, b) => b.timeInQueueMs - a.timeInQueueMs,
      );
    }
    return rows;
  }
  if (rows.length > floor) {
    // Another agent picks up an interaction. Which row to retire depends on
    // the queue set: compact keeps the long waiters visible (removes
    // shortest); extended retires the most-breached row so the red band
    // stays near the seeded count rather than growing unbounded.
    const target = preferLongest
      ? rows.reduce(
          (max, r) => (r.timeInQueueMs > max.timeInQueueMs ? r : max),
          rows[0],
        )
      : rows.reduce(
          (min, r) => (r.waitTimeMs < min.waitTimeMs ? r : min),
          rows[0],
        );
    return rows.filter((r) => r !== target);
  }
  return rows;
};

export const startQueueSimulation = (): void => {
  if (simulationStarted) return;
  simulationStarted = true;
  window.setInterval(() => {
    tick += 1;
    compactRows = advanceClocks(compactRows);
    extendedRows = advanceClocks(extendedRows);
    if (tick % CHURN_EVERY_TICKS !== 0) {
      emit();
      return;
    }
    churnBeat += 1;
    compactRows = churn(compactRows, COMPACT_CAP, COMPACT_FLOOR, () =>
      makeArrival(compactArrivalSeq++, 'queue-live-'),
    );
    extendedRows = churn(extendedRows, EXTENDED_CAP, EXTENDED_FLOOR, () =>
      makeArrival(extendedArrivalSeq++, 'queue-live-p-'),
      true, // preferLongest: retire most-breached rows so the red band stays ~15
    );
    emit();
  }, TIMER_TICK_MS);
};
