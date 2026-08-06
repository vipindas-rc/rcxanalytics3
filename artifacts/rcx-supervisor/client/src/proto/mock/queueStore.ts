// ---------------------------------------------------------------------------
// Live queue store — a tiny external store (useSyncExternalStore) shared by
// the top-nav "Queue (n)" counter and the Queue table so both always agree.
//
// Simulation: every few seconds an interaction either arrives (a new customer
// joins the queue) or leaves (another agent picked it up), so the counter and
// table churn like a real contact center. Claim / Transfer from the hover
// actions also remove the row immediately.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react';

import { CONVERSATION_STATES, makeQueueInteractions } from './supervisorMock';

let rows: any[] = makeQueueInteractions();
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

const getSnapshot = () => rows;

export const useQueueRows = (): any[] =>
  useSyncExternalStore(subscribe, getSnapshot);

export const useQueuePendingCount = (): number =>
  useSyncExternalStore(subscribe, getSnapshot).length;

/** Remove an interaction from the queue (claimed / transferred / picked up). */
export const removeQueueRow = (engagementId: string): any | null => {
  const row = rows.find((r) => r.engagementId === engagementId) ?? null;
  if (row) {
    rows = rows.filter((r) => r.engagementId !== engagementId);
    emit();
  }
  return row;
};

/**
 * Send a waiting call back to the end of the queue: its waiting clocks reset
 * and the row re-sorts to the bottom (default order is longest wait first).
 */
export const requeueRow = (engagementId: string): any | null => {
  const row = rows.find((r) => r.engagementId === engagementId) ?? null;
  if (row) {
    rows = rows
      .map((r) =>
        r.engagementId === engagementId
          ? { ...r, timeInQueueMs: 0, waitTimeMs: 0 }
          : r,
      )
      .sort((a, b) => b.timeInQueueMs - a.timeInQueueMs);
    emit();
  }
  return row;
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

let arrivalSeq = 0;

const makeArrival = (): any => {
  const i = arrivalSeq++;
  const ch = ARRIVAL_CHANNELS[i % ARRIVAL_CHANNELS.length];
  const engagementId = `queue-live-${i + 1}`;
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
    contactIdentity: ARRIVAL_CUSTOMERS[i % ARRIVAL_CUSTOMERS.length],
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
    isQueueRow: true,
    // Digital arrivals sometimes have a pre-queue IVR/bot transcript to
    // preview; voice arrivals never do.
    hasPreview: ch.type !== 'VOICE' && i % 2 === 0,
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

export const startQueueSimulation = (): void => {
  if (simulationStarted) return;
  simulationStarted = true;
  window.setInterval(() => {
    tick += 1;
    // Waiting clocks keep running: while a customer is still waiting
    // (queue rows are all Pending), both Total waiting time and Time in
    // queue count up each second, so rows cross SLA bands live.
    rows = rows.map((r) => ({
      ...r,
      timeInQueueMs: r.timeInQueueMs + TIMER_TICK_MS,
      waitTimeMs: r.waitTimeMs + TIMER_TICK_MS,
    }));
    if (tick % CHURN_EVERY_TICKS !== 0) {
      emit();
      return;
    }
    churnBeat += 1;
    // Uneven rhythm (2 arrivals for every departure) so the counter visibly
    // drifts instead of ping-ponging around one value.
    if (churnBeat % 3 !== 0) {
      // A new customer joins the queue (cap so it can't grow unbounded).
      // Keep the default order by time in queue (longest first) so the
      // red SLA breaches sit on top, then the orange ones, then the rest.
      if (rows.length < 14)
        rows = [...rows, makeArrival()].sort(
          (a, b) => b.timeInQueueMs - a.timeInQueueMs,
        );
    } else if (rows.length > 3) {
      // Another agent picks up an interaction. Take the shortest-waiting row
      // so the long (orange/red SLA) waiters stay visible in the demo.
      const shortest = rows.reduce(
        (min, r) => (r.waitTimeMs < min.waitTimeMs ? r : min),
        rows[0],
      );
      rows = rows.filter((r) => r !== shortest);
    }
    emit();
  }, TIMER_TICK_MS);
};
