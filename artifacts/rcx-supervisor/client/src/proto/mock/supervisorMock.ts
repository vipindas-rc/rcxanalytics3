import { SortType } from '@ringcx/ui';
import type {
  ISupervisorTableCol,
  ISupervisorAgentListItem,
} from '../eag/containers/SupervisorAgentList/types/SupervisorAgentList';
import captured from './captured-data.json';

// Real data shapes captured from the running RingCX app (SupervisorSvc), so the
// fields/icons/rollups match exactly what the components expect.
const clone = <T>(v: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));

// --- Agents tab columns (from SupervisorAgentList.story.tsx) ---
export const columns: ISupervisorTableCol[] = [
  { id: 'fullName', content: 'Agent', sortAs: SortType.STRING, visible: true, disabled: true, width: 180 },
  { id: 'agentState', content: 'State', sortAs: SortType.STRING, visible: true, width: 160 },
  { id: 'agentType', content: 'Agent type', sortAs: SortType.STRING, visible: true, width: 120 },
  { id: 'stateDuration', content: 'State duration', sortAs: SortType.NUMBER, visible: true, width: 120 },
  { id: 'pendingDispTime', content: 'Pending disposition', sortAs: SortType.NUMBER, visible: true, width: 120 },
  { id: 'activeInteractions', content: 'Active interactions', sortAs: SortType.STRING, visible: true, width: 140 },
  { id: 'longestActiveInteraction', content: 'Longest active interaction', sortAs: SortType.NUMBER, visible: true, width: 140 },
  { id: 'interactionsRollup', content: 'Interactions rollup', sortAs: SortType.NUMBER, visible: true, width: 120 },
  { id: 'talkTime', content: 'Talk time', sortAs: SortType.NUMBER, visible: true, width: 100 },
  { id: 'averageTimePerCall', content: 'Average time per call', sortAs: SortType.NUMBER, visible: true, width: 130 },
  { id: 'login', content: 'Login', sortAs: SortType.NUMBER, visible: true, width: 90 },
  { id: 'skill', content: 'Skill', sortAs: SortType.STRING, visible: true, width: 160 },
  { id: 'utilization', content: 'Utilization', sortAs: SortType.NUMBER, visible: true, width: 100 },
];

// --- Interactions tab columns (real ids; first col 'sourceName' is skipped by the
// row renderer and filled by the leading SourceTypeIcon). ---
export const interactionColumns: ISupervisorTableCol[] = [
  { id: 'sourceName', content: 'Channel', sortAs: SortType.STRING, visible: true, disabled: true, width: 180 },
  { id: 'categories', content: 'Categories', sortAs: SortType.STRING, visible: true, width: 280 },
  { id: 'productName', content: 'Product', sortAs: SortType.STRING, visible: true, width: 140 },
  { id: 'agentDurationMs', content: 'Interaction', sortAs: SortType.NUMBER, visible: true, width: 110 },
  { id: 'fullName', content: 'Agent', sortAs: SortType.STRING, visible: true, width: 160 },
  { id: 'agentType', content: 'Agent type', sortAs: SortType.STRING, visible: true, width: 120 },
  { id: 'conversationState', content: 'State', sortAs: SortType.STRING, visible: true, width: 150 },
  // Routing priority (1.0 = highest). Only some interactions carry one; the
  // rest render the em-dash placeholder. Sits right after State by design.
  { id: 'priority', content: 'Priority', sortAs: SortType.NUMBER, visible: true, width: 100 },
  { id: 'confidenceScore', content: 'Confidence', sortAs: SortType.NUMBER, visible: true, width: 120 },
  { id: 'sentimentScore', content: 'Sentiment', sortAs: SortType.NUMBER, visible: true, width: 120 },
  { id: 'contactIdentity', content: 'From', sortAs: SortType.STRING, visible: true, width: 170 },
  { id: 'threadTitle', content: 'Subject', sortAs: SortType.STRING, visible: true, width: 200 },
  { id: 'pendingDispositionMs', content: 'Pending disp.', sortAs: SortType.NUMBER, visible: true, width: 110 },
];

// --- Interaction-rollup popover columns (real INTERACTION_ROLLUP_COLUMNS) ---
// translationPath is humanized by the i18n stub -> "Channel" / "Total".
export const rollupColumns: any[] = [
  { id: 'sourceType', translationPath: 'Channel', sortAs: SortType.STRING },
  { id: 'count', translationPath: 'Total', sortAs: SortType.NUMBER },
];

// --- Conversation lifecycle states -------------------------------------------
// Machine-readable key + display label. Three states only:
// - Pending: waiting in queue, not yet picked by anyone.
// - Reserved: routed/assigned to an agent, but the agent hasn't picked it up.
// - Active: an agent is actively working the interaction.
export type ConversationStateKey = 'PENDING' | 'RESERVED' | 'ACTIVE';

export const CONVERSATION_STATES: Record<
  ConversationStateKey,
  { key: ConversationStateKey; label: string }
> = {
  PENDING: { key: 'PENDING', label: 'Pending' },
  RESERVED: { key: 'RESERVED', label: 'Reserved' },
  ACTIVE: { key: 'ACTIVE', label: 'Active' },
};

// Channels that map to real glyphs in TypeIcon.sourceTypeMap; sourceColor is a
// digitalColorMap INDEX ('0'-'9'), not a hex.
const CHANNELS = [
  { type: 'WEB_CHAT', name: 'Web Chat', color: '4' },
  { type: 'EMAIL', name: 'Support Inbox', color: '6' },
  { type: 'TWITTER', name: 'Twitter', color: '3' },
  { type: 'FACEBOOK', name: 'Facebook', color: '1' },
  { type: 'INSTAGRAM', name: 'Instagram', color: '7' },
  { type: 'WHATS_APP', name: 'WhatsApp', color: '2' },
  { type: 'SMS', name: 'SMS', color: '5' },
  { type: 'VOICE', name: 'Voice', color: '0' },
];

// Deterministic per-agent 24h rollup breakdown (3-5 channels with counts).
function makeRollup(seed: number) {
  const n = 3 + (seed % 3); // 3-5 channels
  const rows = Array.from({ length: n }, (_, k) => {
    const ch = CHANNELS[(seed + k) % CHANNELS.length];
    const count = 2 + ((seed * 7 + k * 13) % 28); // 2-29
    return {
      glId: `${ch.type}-${seed}`,
      sourceId: `${ch.type}-${seed}`,
      sourceType: ch.type,
      sourceName: ch.name,
      sourceColor: ch.color,
      count,
    };
  });
  const total = rows.reduce((s, r) => s + r.count, 0);
  return { rows, total };
}

// Varied agent states so the State filter has real options (captured data is all
// ENGAGED). state = label shown; base = drives the state-dot color.
// Human agents use the full human state set.
const HUMAN_STATES = [
  { state: 'Engaged', base: 'ENGAGED' },
  { state: 'Available', base: 'AVAILABLE' },
  { state: 'Wrap-up', base: 'WRAP_UP' },
  { state: 'Break', base: 'NOT_READY' },
  { state: 'Lunch', base: 'NOT_READY' },
];

// AirPro (AI) agents start in one of these three states:
//  - Engaged / Available are automatic, same as humans.
//  - Inactive means the agent is turned off (only a supervisor can switch it
//    back on); it still shows in the list.
// Pending Inactive is a transitional drain-then-inactive state that only
// appears at runtime when a supervisor switches off an engaged AirPro agent —
// no agent should ever START in it, so it is not part of this seed pool.
// The 4th slot repeats Engaged (instead of the old Pending Inactive entry) to
// keep the cycle length — and therefore every seeded row's state, interaction
// mix, and the voice rows at i=2/i=14 — unchanged.
const AIR_STATES = [
  { state: 'Engaged', base: 'ENGAGED' },
  { state: 'Available', base: 'AVAILABLE' },
  { state: 'Inactive', base: 'INACTIVE' },
  { state: 'Engaged', base: 'ENGAGED' },
];

// Roles assigned to AirPro (AI) agents, cycled deterministically by index so the
// same agent shows the same role on both the Agents and Interactions tabs.
const AIRPRO_ROLES = [
  'Billing Agent',
  'Sales Agent',
  'Support Agent',
  'Retention Agent',
  'Technical Agent',
  'Onboarding Agent',
];

// Canonical AirPro display name for a given row index: a human-style name plus
// the agent's role, e.g. "Maria Brown (Billing Agent)". Both tabs derive the
// base name from the captured agents list (keyed by index) so the AI agent's
// identity stays aligned across the Agents and Interactions tabs.
function airProName(i: number): string {
  const list = captured.agents as any[];
  const base = list[i % list.length].fullName;
  const role = AIRPRO_ROLES[Math.floor(i / 3) % AIRPRO_ROLES.length];
  return `${base} (${role})`;
}

const VOICE_CHANNEL = CHANNELS.find((c) => c.type === 'VOICE')!;
const DIGITAL_CHANNELS = CHANNELS.filter((c) => c.type !== 'VOICE');

// Deterministic real-time quality signals. Confidence drives the two-tier row
// alerting (critical < 25 -> red row, warning 25–40 -> orange row), cycled per
// AI interaction across the ~8 AI rows. Sentiment on AI rows is paired to
// confidence by index (AI_SENTIMENT_POOL) so a low-confidence interaction also
// reads low on sentiment; human rows carry sentiment only (SENTIMENT_POOL).
//
// A few base values are deliberately parked ON a threshold boundary so the live
// ±5 drift carries them back and forth across it, making rows flip into and out
// of the flagged state on screen (the "real-time" supervision signal):
//   - confidence 40  -> oscillates 35–45, flips warning <-> healthy.
//   - confidence 26  -> oscillates 21–31, flips critical <-> warning.
//   - sentiment 40   -> oscillates 35–45, flips a human row warning <-> healthy.
// The remaining values sit with >=5 margin inside their band so they stay put,
// keeping the motion intentional and low-distraction rather than chaotic.
const SENTIMENT_POOL = [82, 64, 91, 73, 88, 70, 95, 78, 60, 85, 72, 90, 40, 80, 40];
const CONFIDENCE_POOL = [90, 16, 40, 74, 12, 26, 92, 33];
const AI_SENTIMENT_POOL = [84, 16, 70, 78, 14, 70, 90, 31];

const toInteraction = (c: { type: string; color: string; name: string }) => ({
  channelType: c.type,
  sourceColor: c.color,
  sourceName: c.name,
});

// Builds an agent's active-interaction list (one icon per concurrent interaction).
// Business rule: an agent can handle at MOST one voice call at a time, but several
// digital interactions can run in parallel. Two showcase agents demonstrate the
// multi-interaction case; everyone else has a single interaction.
function makeActiveInteractions(
  i: number,
  primary: { type: string; color: string; name: string },
) {
  // Scenario A: one voice + two parallel digital interactions.
  if (i === 0) {
    return [VOICE_CHANNEL, DIGITAL_CHANNELS[0], DIGITAL_CHANNELS[1]].map(
      toInteraction,
    );
  }
  // Scenario B: three parallel digital interactions, no voice.
  if (i === 6) {
    return [
      DIGITAL_CHANNELS[2],
      DIGITAL_CHANNELS[3],
      DIGITAL_CHANNELS[4],
    ].map(toInteraction);
  }
  // Default: a single interaction on the agent's primary channel.
  return [toInteraction(primary)];
}

// AirPro (AI) agents run several digital interactions in parallel. Each working
// AI agent carries two concurrent digital interactions, which reads as a busy
// virtual agent and yields enough AI interaction rows (confidence is AI-only) to
// surface the full alert spread: 2 critical + 3 warning across the AI rows.
function makeAirInteractions(i: number) {
  // Two engaged AirPro agents (rows 2 and 14 cycle onto the Engaged state)
  // carry a live voice-only call so the monitoring dialpad's AI flow can be
  // exercised — the Monitor icon is only offered on voice-only rows.
  if (i === 2 || i === 14) {
    return [VOICE_CHANNEL].map(toInteraction);
  }
  const a = DIGITAL_CHANNELS[i % DIGITAL_CHANNELS.length];
  const b = DIGITAL_CHANNELS[(i + 1) % DIGITAL_CHANNELS.length];
  return [a, b].map(toInteraction);
}

export function makeAgents(_count?: number): ISupervisorAgentListItem[] {
  return clone(captured.agents).map((a: any, i: number) => {
    const r = makeRollup(i + 1);
    // give each agent a varied primary channel so the Channel filter is meaningful
    const ch = CHANNELS[i % CHANNELS.length];
    // every 3rd agent is an AirPro (virtual) agent; the rest are Human.
    const isAir = i % 3 === 2;
    const agentType = isAir ? 'Air' : 'Human';

    // AirPro agents draw from the 4 AirPro states; humans from the human set.
    // Cycling the per-type index keeps every state represented in the table.
    const st = isAir
      ? AIR_STATES[Math.floor(i / 3) % AIR_STATES.length]
      : HUMAN_STATES[i % HUMAN_STATES.length];

    // status mirrors the AirPro on/off state and drives the Air-only
    // Active/Inactive filter. Pending Inactive is still draining work, so it
    // stays Active until the drain completes; only Inactive is off.
    const status = isAir
      ? st.state === 'Inactive'
        ? 'Inactive'
        : 'Active'
      : '';
    // Only AirPro agents that are engaged or still draining carry in-flight
    // interactions; idle/off AI agents have none. Humans always show their work.
    const airHasWork = st.base === 'ENGAGED' || st.base === 'PENDING_INACTIVE';
    const interactions = isAir
      ? airHasWork
        ? makeAirInteractions(i)
        : []
      : makeActiveInteractions(i, ch);

    // AirPro (AI) agents use a human-style name plus their role, e.g.
    // "Maria Brown (Billing Agent)", and the same name appears on the
    // Interactions tab so the AI agent identity stays aligned across both tabs.
    const fullName = isAir ? airProName(i) : a.fullName;
    return {
      ...a,
      fullName,
      agentType,
      status,
      agentState: st.state,
      agentStateLabel: st.state,
      agentBaseState: st.base,
      originalAgentBaseState: st.base,
      activeInteractions: interactions,
      activeInteractionsSearchCols: interactions,
      // per-channel breakdown for the rollup popover + the clickable total
      rollupBreakdown: r.rows,
      interactionsRollup: r.total,
      interactions24hRollupTotalCount: r.total,
    };
  }) as unknown as ISupervisorAgentListItem[];
}

// --- AI Insights side panel (mock content) ------------------------------------
// The supervisor opens the AI Insights panel from an interaction row. The panel
// has three tabs — Notes, Transcript, Checklist — plus a metrics summary and a
// live (mock-streamed) transcript. Content below is shared by all three tabs and
// kept coherent: the Notes summary, the streamed transcript and the checklist all
// describe the same Sam Carter / one-color-shirts negotiation.

// Metric summary shown above the tabs. dot drives the colored status dot.
export interface InsightMetric {
  label: string;
  value: string;
  dot: 'positive' | 'warning' | 'negative';
}

export const INSIGHT_METRICS: InsightMetric[] = [
  { label: 'Sentiment', value: 'Positive', dot: 'positive' },
  { label: 'Speech Pace', value: '135 WPM', dot: 'positive' },
  { label: 'Talk Ratio', value: '49%', dot: 'negative' },
];

// Notes tab — AI-generated call summary, grouped into headed sections.
export interface InsightNoteSection {
  heading: string;
  bullets: string[];
}

export const INSIGHT_NOTES: InsightNoteSection[] = [
  {
    heading: 'Reason for contact',
    bullets: [
      'Sam found a cheaper one-color shirt from Great Polos Inc. bringing the order price to $4.8K.',
    ],
  },
  {
    heading: 'Actions taken by agent',
    bullets: [
      'Switch to one-color shirts from Great Polos Inc. to meet Sam’s price.',
    ],
  },
  {
    heading: 'Next steps',
    bullets: [
      'Anita to send a revised quote to Sam in a couple of hours. Anita needs manager approval to update the quote.',
    ],
  },
];

export const INSIGHT_NOTES_UPDATED_AT = '09:38 AM';

// Checklist tab — grouped, AI-verified action items covering guided-selling /
// compliance steps the agent should complete. Two variants exist, one per
// transcript script, and getInsightChecklistSections(tone) picks the one that
// matches the transcript currently rendered so Checklist and Transcript always
// read as the same interaction:
//  - positive -> TRANSCRIPT_TURNS (Sam Carter shirt-order negotiation)
//  - negative -> NEGATIVE_TRANSCRIPT_TURNS (escalating refund complaint)
// Every item's answers quote or paraphrase actual lines from its script.
export interface InsightChecklistItem {
  title: string;
  required: boolean;
  done: boolean;
  answers: string[];
}

export interface InsightChecklistSection {
  heading: string;
  items: InsightChecklistItem[];
}

const POSITIVE_CHECKLIST_SECTIONS: InsightChecklistSection[] = [
  {
    heading: 'Order verification',
    items: [
      {
        title: 'Confirm the reason for contact',
        required: true,
        done: true,
        answers: [
          '"I got your quote but honestly it\'s over our budget for the team shirts."',
        ],
      },
      {
        title: 'Confirm the target price and product option',
        required: true,
        done: true,
        answers: [
          'Sam found one-color shirts from Great Polos Inc. at about $4.8K for the whole order.',
          'Sam confirmed the logo just needs to look clean, so a one-color design works for the team.',
        ],
      },
      {
        title: 'Set expectations for the revised quote',
        required: true,
        done: true,
        answers: ['Anita said the revised quote would be ready in a couple of hours.'],
      },
      {
        title: 'Get manager approval for the pricing change',
        required: true,
        done: false,
        answers: [
          'Anita still needs manager approval to update the pricing before sending the revised quote.',
        ],
      },
      {
        title: 'Send the revised quote and recap next steps',
        required: false,
        done: false,
        answers: ['Anita will follow up with the new quote once approval comes through.'],
      },
    ],
  },
];

// Negative variant — grounded in NEGATIVE_TRANSCRIPT_TURNS (the escalating
// refund complaint), shown when the panel streams the negative script.
const NEGATIVE_CHECKLIST_SECTIONS: InsightChecklistSection[] = [
  {
    heading: 'Refund resolution',
    items: [
      {
        title: 'Confirm the reason for contact',
        required: true,
        done: true,
        answers: [
          '"This is the third time I\'m reaching out about my refund and it\'s still not sorted."',
        ],
      },
      {
        title: 'Acknowledge the delay and apologize',
        required: true,
        done: true,
        answers: [
          'The customer has waited over a week and was promised a resolution before.',
          'The agent apologized: "You\'re right, and I apologize."',
        ],
      },
      {
        title: 'Verify the account and refund status',
        required: true,
        done: false,
        answers: [
          'The agent pulled up the account but couldn\'t confirm why the refund didn\'t process — "it might be a system issue on our end."',
        ],
      },
      {
        title: 'Escalate to the team that owns refunds',
        required: true,
        done: false,
        answers: [
          'The agent isn\'t sure who handles it: "I think it\'s the billing team, though I\'ll have to confirm that."',
          'The agent started an escalation but hasn\'t confirmed the owner.',
        ],
      },
      {
        title: 'Set a clear resolution timeline',
        required: false,
        done: false,
        answers: [
          'No timeline was given — "I\'m escalating this now, but I can\'t promise a timeline."',
          'The customer says they\'re close to cancelling their account.',
        ],
      },
    ],
  },
];

// Returns the checklist variant that matches the transcript script currently
// rendered, keyed by the same tone the panel uses to pick the script.
export function getInsightChecklistSections(
  tone: 'positive' | 'negative'
): InsightChecklistSection[] {
  return tone === 'negative'
    ? NEGATIVE_CHECKLIST_SECTIONS
    : POSITIVE_CHECKLIST_SECTIONS;
}

// Live transcript — replayed turn-by-turn to simulate a live conversation. type
// mirrors the real chat Message contract ('SYSTEM' | 'CLIENT' | 'AGENT'); CLIENT
// is the customer (Sam), AGENT is the handling agent (named per the row).
export interface TranscriptTurn {
  type: 'SYSTEM' | 'CLIENT' | 'AGENT';
  name?: string;
  message: string;
}

const CUSTOMER_NAME = 'Sam Carter';

const TRANSCRIPT_TURNS: TranscriptTurn[] = [
  { type: 'CLIENT', message: "Hi, I got your quote but honestly it's over our budget for the team shirts." },
  { type: 'AGENT', message: 'Hi Sam, thanks for letting me know. What price point are you aiming for?' },
  { type: 'CLIENT', message: 'I found one-color shirts from Great Polos Inc. at around $4.8K for the whole order.' },
  { type: 'AGENT', message: 'Got it. Our quote is for multi-color printing, which adds cost. Switching to a one-color design would get us much closer to that.' },
  { type: 'CLIENT', message: 'That could work. We mainly care about the logo looking clean.' },
  { type: 'AGENT', message: 'Perfect — a single-color logo will look sharp and keeps the price down. Let me put together a revised quote.' },
  { type: 'CLIENT', message: 'Great. How soon can you send it over?' },
  { type: 'AGENT', message: 'I should have it to you in a couple of hours. I just need a quick manager approval to update the pricing.' },
  { type: 'CLIENT', message: 'Sounds good, thank you Anita.' },
  { type: 'AGENT', message: "My pleasure, Sam. I'll follow up shortly with the new quote." },
];

// Negative / escalating variant used for low-confidence interactions: the
// customer grows increasingly frustrated while the agent hedges and struggles
// (uncertain answers) — so the conversation reads as steadily declining
// sentiment with low confidence, matching the row's quality signals.
const NEGATIVE_TRANSCRIPT_TURNS: TranscriptTurn[] = [
  { type: 'CLIENT', message: "This is the third time I'm reaching out about my refund and it's still not sorted." },
  { type: 'AGENT', message: "I'm sorry to hear that. Let me try to pull up your account... give me a moment." },
  { type: 'CLIENT', message: "I've already waited over a week. Why is this taking so long?" },
  { type: 'AGENT', message: "I'm honestly not sure why it didn't process — it might be a system issue on our end." },
  { type: 'CLIENT', message: "That's not good enough. I was promised this would be resolved last time too." },
  { type: 'AGENT', message: "You're right, and I apologize. I may need to escalate this, but I'm not certain who handles it." },
  { type: 'CLIENT', message: "Seriously? You don't even know who can help me with this?" },
  { type: 'AGENT', message: "Let me check... I think it's the billing team, though I'll have to confirm that." },
  { type: 'CLIENT', message: "This is really frustrating. I'm close to just cancelling my account." },
  { type: 'AGENT', message: "Please don't — I'll do my best to fix it. Could you give me a little more time?" },
  { type: 'CLIENT', message: "I've given you plenty of time already. This is completely unacceptable." },
  { type: 'AGENT', message: "I understand your frustration. I'm escalating this now, but I can't promise a timeline." },
];

// Dev-only invariant: every quoted line ("...") inside a checklist answer must
// appear verbatim in the transcript script for the same tone, so Checklist and
// Transcript can never drift apart when either script or checklist is edited.
// Runs once at module load in dev; throws so the drift is caught immediately.
export function assertChecklistGroundedInTranscript(): void {
  const variants: Array<{
    tone: 'positive' | 'negative';
    sections: InsightChecklistSection[];
    script: TranscriptTurn[];
  }> = [
    { tone: 'positive', sections: POSITIVE_CHECKLIST_SECTIONS, script: TRANSCRIPT_TURNS },
    { tone: 'negative', sections: NEGATIVE_CHECKLIST_SECTIONS, script: NEGATIVE_TRANSCRIPT_TURNS },
  ];
  for (const { tone, sections, script } of variants) {
    for (const section of sections) {
      for (const item of section.items) {
        for (const answer of item.answers) {
          const quotes = answer.match(/"([^"]+)"/g) ?? [];
          for (const wrapped of quotes) {
            const quote = wrapped.slice(1, -1);
            const grounded = script.some((turn) => turn.message.includes(quote));
            if (!grounded) {
              throw new Error(
                `Checklist/transcript drift (${tone}): quoted answer line not found in script — ${wrapped}`
              );
            }
          }
        }
      }
    }
  }
}

if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
  assertChecklistGroundedInTranscript();
}

// Returns the transcript turns for the monitored interaction. The opening
// SYSTEM line reads "Agent connected" (chat) or "Call connected" (voice), and
// each speaker turn is labelled with the customer / handling-agent name.
export function makeTranscript(opts: {
  isVoice: boolean;
  agentName: string;
}): TranscriptTurn[] {
  const connected: TranscriptTurn = {
    type: 'SYSTEM',
    message: opts.isVoice ? 'Call connected' : 'Agent connected',
  };
  const turns = TRANSCRIPT_TURNS.map((turn) => ({
    ...turn,
    name: turn.type === 'CLIENT' ? CUSTOMER_NAME : opts.agentName,
  }));
  return [connected, ...turns];
}

// Number of conversation turns that loop after the opening SYSTEM line.
export const TRANSCRIPT_CONVERSATION_LENGTH = TRANSCRIPT_TURNS.length;

// Resolves the transcript turn at an absolute (ever-growing) stream index so the
// panel can keep a conversation "live" indefinitely: index 0 is the connected
// SYSTEM line, every later index cycles through the same coherent conversation.
export function transcriptTurnAt(
  absIndex: number,
  opts: { isVoice: boolean; agentName: string; tone?: 'positive' | 'negative' }
): TranscriptTurn {
  if (absIndex <= 0) {
    return {
      type: 'SYSTEM',
      message: opts.isVoice ? 'Call connected' : 'Agent connected',
    };
  }
  const script =
    opts.tone === 'negative' ? NEGATIVE_TRANSCRIPT_TURNS : TRANSCRIPT_TURNS;
  const turn = script[(absIndex - 1) % script.length];
  return {
    ...turn,
    name: turn.type === 'CLIENT' ? CUSTOMER_NAME : opts.agentName,
  };
}

// The Interactions tab is derived directly from the Agents tab: for every agent
// we emit one interaction row per entry in their "Active interactions" list, so
// clicking an agent's active-interaction icons on the Agents tab always lands on
// real, matching rows in the Interactions tab (which then blink to show the
// selection). Rich fields (contact, subject, categories, durations) are cycled
// from the captured interaction templates so the table still looks realistic.
export function makeInteractions(_agents?: unknown): any[] {
  const templates = clone(captured.interactions) as any[];
  const agents = makeAgents() as any[];
  const rows: any[] = [];
  let t = 0;
  let aiIdx = 0;

  agents.forEach((agent: any) => {
    const active: any[] = agent.activeInteractions ?? [];
    active.forEach((ai: any, k: number) => {
      const tmpl = templates[t % templates.length];
      t += 1;

      const ch =
        CHANNELS.find((c) => c.type === ai.channelType) ?? CHANNELS[0];
      const isVoice = ch.type === 'VOICE';
      const isAir = agent.agentType === 'Air';
      const engagementId = `eng-${agent.agentId}-${k + 1}`;
      // category ids referencing injector CATEGORIES_MAP (1-6); some rows blank
      const cats =
        t % 4 === 0
          ? ''
          : [String((t % 6) + 1), String(((t + 2) % 6) + 1)].join(',');

      const base: any = {
        ...tmpl,
        engagementId,
        glId: engagementId,
        agentId: agent.agentId,
        categoryIds: cats,
        // Agent column shows the handling agent's name; for AI agents this is the
        // AirPro identity ("Name (Role)"), matching the Agents tab.
        fullName: agent.fullName,
        agentName: agent.fullName,
        agentType: agent.agentType,
        sourceType: ch.type,
        sourceName: ch.name,
        sourceColor: ch.color,
        // The queue the conversation was routed from. Not a table column —
        // it powers the Interactions-tab Queue filter and the preview's
        // queue chip. All rows keep the visible Product column aligned with
        // it so a Queue-filtered table reads consistently.
        queueName: String(tmpl.productName ?? 'Customer support'),
        engagementSource: {
          ...(tmpl.engagementSource || {}),
          initialEngagementSourceType: ch.type,
          initialEngagementSourceName: ch.name,
          initialEngagementSourceColor: ch.color,
        },
        isVoiceInteraction: isVoice,
        // Voice AI Insights is gated on the call being recorded across all agent
        // legs (RingCX rule). Without this, the AI Insights icon is hidden for
        // voice rows; digital rows fall through to the feature-flag path.
        perspectiveRecordingMode: isVoice ? 'ALL_AGENT_LEGS' : undefined,
        pendingDispositionMs: tmpl.pendingDispositionMs ?? 0,
        // All true at rest = "not currently being monitored" -> no blue row.
        // (isCurrentlyMonitoring = !showMonitor || !showCoach || !showBargeIn.)
        // The Monitor/Coach icons are still type-gated to VOICE rows by the renderer.
        showViewInsights: true,
        // Coach (whisper) and Barge target the human agent on a call, so they
        // don't apply to AirPro (AI) interactions — supervisors use Take over
        // instead. Disabled icons carry an explanatory tooltip.
        showBargeIn: !isAir,
        showMonitor: true,
        showCoach: !isAir,
        ...(isAir
          ? {
              bargeInDisabledTooltip: 'Not available for AI agents',
              coachDisabledTooltip: 'Not available for AI agents',
            }
          : {}),
      };

      if (isAir) {
        // AirPro (AI) interactions have no pending disposition -> renders
        // em-dash. Product stays the originating queue (same as Human rows)
        // so Queue-filtered views don't look like they leaked other queues.
        base.pendingDispositionMs = 0;
      }

      // Real-time quality signals (mock-simulated). Sentiment is present for both
      // AI and human interactions; confidence is AI-only (null for humans, where
      // the cell renders an em-dash).
      if (isAir) {
        const ci = aiIdx++ % CONFIDENCE_POOL.length;
        base.confidenceScore = CONFIDENCE_POOL[ci];
        // Sentiment tracks confidence on AI rows (same index): when confidence
        // dips, sentiment dips too, so a struggling AI interaction reads low on
        // both signals.
        base.sentimentScore = AI_SENTIMENT_POOL[ci];
      } else {
        base.confidenceScore = null;
        base.sentimentScore = SENTIMENT_POOL[(t - 1) % SENTIMENT_POOL.length];
      }

      // Conversation lifecycle state for the active interaction. Most rows an
      // agent holds are Active (being worked); a small deterministic slice is
      // Reserved — routed to the agent but not yet picked up.
      const convo =
        t % 9 === 0 ? CONVERSATION_STATES.RESERVED : CONVERSATION_STATES.ACTIVE;
      base.conversationState = convo.key;
      base.conversationStateLabel = convo.label;

      // Routing priority: a deterministic handful of assigned rows carry a
      // numeric priority (1.0, 2.0, 3.0 — lower = more urgent); the rest have
      // none and render the em-dash placeholder.
      base.priority = t % 4 === 1 ? (t % 3) + 1 : null;

      // Split time-in-queue values for assigned rows (Supervisor view 2
      // renders both columns for every row): time in queue = interaction time
      // + interaction waiting time for the current segment; total waiting time
      // adds any pre-segment wait from earlier transfers/requeues.
      // Up to ~12 min so a deterministic handful of assigned rows land past
      // the 10-minute SLA and the Breached SLA toggle has matches. (Assigned
      // rows render the value plain — the red/orange SLA colors only apply
      // while a row is still Pending.)
      const interactionWaitMs = ((t * 37) % 9) * 90 * 1000;
      base.timeInQueueMs =
        (Number(tmpl.agentDurationMs) || 0) + interactionWaitMs;
      base.waitTimeMs = base.timeInQueueMs + ((t * 61) % 7) * 90 * 1000;

      rows.push(base);
    });
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Queue tab — pending interactions waiting to be routed to an agent. Display
// only (no assign/reroute actions). Deterministic mock data so e2e runs and
// screenshots are stable. Rows are sorted by longest wait first, which is the
// order a supervisor cares about.
// ---------------------------------------------------------------------------

// Queue tab columns: the same Interactions table plus a Wait time column, so
// pending rows read identically to active ones. Agent-side columns (Agent,
// Agent type, Interaction, Confidence, Sentiment, Pending disp.) stay but
// render blank — the interaction hasn't been picked up yet.
// Queue columns = Interactions columns minus everything that only makes sense
// once a conversation is being handled: agent fields (Agent, Agent type),
// handling metrics (Interaction, Pending disp., Confidence, Sentiment), and
// State (every queued row is Waiting by definition, so the column carries no
// information here). A Wait time column is added after Product. Subject stays:
// the IVR / pre-chat bot collects it before pickup and it helps triage.
const QUEUE_EXCLUDED_COLUMNS = new Set([
  'agentDurationMs',
  'fullName',
  'agentType',
  'pendingDispositionMs',
  'confidenceScore',
  'sentimentScore',
  'conversationState',
]);
export const queueColumns: ISupervisorTableCol[] = interactionColumns
  .filter((c) => !QUEUE_EXCLUDED_COLUMNS.has(c.id))
  .flatMap((c) =>
    c.id === 'productName'
      ? [
          { ...c },
          // Split time columns: total customer wait (plain) vs. time
          // attributable to the current queue segment (SLA-colored).
          { id: 'waitTimeMs', content: 'Total waiting time', sortAs: SortType.NUMBER, visible: true, width: 130 },
          { id: 'timeInQueueMs', content: 'Time in queue', sortAs: SortType.NUMBER, visible: true, width: 120 },
        ]
      : [{ ...c }],
  );

// Supervisor view 2 Interactions columns: the regular Interactions columns
// with the Product column relabeled "Queue name", plus "Time in queue" (SLA
// colors) right after it and "Previous agent" (the agent who last picked the
// conversation up and returned it to queue) after the Agent column.
export const supervisor2InteractionColumns: ISupervisorTableCol[] =
  interactionColumns.flatMap((c) => {
    if (c.id === 'productName') {
      // State sits between Queue and Time in queue; its original slot in
      // interactionColumns is dropped below.
      const stateCol = interactionColumns.find((col) => col.id === 'conversationState');
      // Priority follows State here too — both relocate together, and their
      // original slots in interactionColumns are dropped below.
      const priorityCol = interactionColumns.find((col) => col.id === 'priority');
      return [
        { ...c, content: 'Queue' },
        ...(stateCol ? [{ ...stateCol, visible: true }] : []),
        ...(priorityCol ? [{ ...priorityCol, visible: true }] : []),
        { id: 'waitTimeMs', content: 'Total waiting time', sortAs: SortType.NUMBER, visible: true, width: 130 },
        { id: 'timeInQueueMs', content: 'Time in queue', sortAs: SortType.NUMBER, visible: true, width: 120 },
      ];
    }
    if (c.id === 'conversationState' || c.id === 'priority') {
      return [];
    }
    if (c.id === 'fullName') {
      return [
        { ...c },
        { id: 'lastAgentName', content: 'Previous agent', sortAs: SortType.STRING, visible: true, width: 160 },
      ];
    }
    return [{ ...c }];
  });

// --- Supervisor view 3 Interactions columns: view 2's set minus Agent type,
// Confidence, and Sentiment — a leaner monitoring surface. Everything else
// (order, labels, widths) carries over unchanged.
export const supervisor3InteractionColumns: ISupervisorTableCol[] =
  supervisor2InteractionColumns
    .filter(
      (c) =>
        !['agentType', 'confidenceScore', 'sentimentScore'].includes(c.id),
    )
    .map((c) => ({ ...c }));

const QUEUE_CUSTOMERS = [
  'Maya Alvarez',
  'Daniel Okafor',
  'Priya Nair',
  'Tom Becker',
  'Lena Fischer',
  'Carlos Mendes',
  'Aisha Khan',
  'Robert Lang',
  'Grace Liu',
];

const QUEUE_NAMES = [
  'Customer support',
  'Billing',
  'Technical support',
  'Sales',
  'VIP support',
];

// Pending-queue rows in the exact shape the DigitalInteractionTable expects.
// Only truly pending (Waiting) interactions live here — once a conversation is
// Assigned to an agent it leaves the queue and shows on the Interactions tab.
// Agent-side fields are intentionally empty: no one has picked the row up yet.
// Subjects the IVR / pre-chat bot collected before handoff (some rows blank —
// not every channel gathers a subject up front).
const QUEUE_SUBJECTS = [
  'Refund for double charge',
  '',
  'Cannot log in after password reset',
  'Upgrade to annual plan',
  '',
  'Order #58121 not delivered',
  'Billing address change',
  '',
  'Warranty claim for headset',
];

// Per-row time seeds (seconds), indexed by row. timeInQueueMs = interaction +
// segment wait; waitTimeMs additionally includes the pre-segment wait. Sums
// cover all three SLA bands (red >600s, orange 300-600s, plain <300s).
const QUEUE_INTERACTION_SEC = [140, 20, 260, 60, 180, 30, 320, 90, 200];
const QUEUE_SEGMENT_WAIT_SEC = [510, 25, 420, 100, 300, 45, 340, 240, 150];
const QUEUE_PRIOR_WAIT_SEC = [90, 15, 200, 40, 60, 10, 120, 30, 500];

// Agents who previously claimed a conversation and put it back in queue.
const PREVIOUS_AGENTS = [
  'Marcus Webb',
  'Elena Vasquez',
  'James Okoro',
  'Sarah Kim',
];

export function makeQueueInteractions(): any[] {
  return QUEUE_CUSTOMERS.map((customerName, i) => {
    const ch = CHANNELS[(i * 3 + 1) % CHANNELS.length];
    const engagementId = `queue-${i + 1}`;
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
      // Categories tagged by routing rules / IVR before assignment (some rows
      // untagged), same 1-6 id space as the Interactions tab.
      categoryIds:
        i % 4 === 3
          ? ''
          : [String((i % 6) + 1), String(((i + 3) % 6) + 1)].join(','),
      // Product column carries the queue the customer is waiting in.
      productName: QUEUE_NAMES[i % QUEUE_NAMES.length],
      agentDurationMs: null,
      // Confidence/sentiment are handling-time signals — always null in queue.
      confidenceScore: null,
      sentimentScore: null,
      contactIdentity: customerName,
      threadTitle: QUEUE_SUBJECTS[i % QUEUE_SUBJECTS.length],
      pendingDispositionMs: null,
      isVoiceInteraction: ch.type === 'VOICE',
      // Split time seeds (deterministic). Time in queue = interaction time +
      // interaction waiting time for the current queue segment; total waiting
      // time adds any wait from before this segment (transfers/requeues).
      // Values are chosen so the Time in queue SLA bands all appear: red
      // (>10 min), orange (5-10 min), and plain.
      timeInQueueMs:
        (QUEUE_INTERACTION_SEC[i % QUEUE_INTERACTION_SEC.length] +
          QUEUE_SEGMENT_WAIT_SEC[i % QUEUE_SEGMENT_WAIT_SEC.length]) *
        1000,
      waitTimeMs:
        (QUEUE_INTERACTION_SEC[i % QUEUE_INTERACTION_SEC.length] +
          QUEUE_SEGMENT_WAIT_SEC[i % QUEUE_SEGMENT_WAIT_SEC.length] +
          QUEUE_PRIOR_WAIT_SEC[i % QUEUE_PRIOR_WAIT_SEC.length]) *
        1000,
      conversationState: CONVERSATION_STATES.PENDING.key,
      conversationStateLabel: CONVERSATION_STATES.PENDING.label,
      // Routing priority on a deterministic handful of pending rows (1.0,
      // 2.0, 3.0 — lower = more urgent); the rest render the em dash.
      priority: i % 3 === 0 ? (Math.floor(i / 3) % 3) + 1 : null,
      // Some conversations were picked up once and returned to queue — the
      // agent who handed them back shows in the "Previous agent" column
      // (Supervisor view 2). Fresh arrivals have none.
      lastAgentName:
        i % 3 === 1 ? PREVIOUS_AGENTS[i % PREVIOUS_AGENTS.length] : '',
      // Queue rows get their own hover actions (AI insights / Transfer /
      // Claim) instead of the supervisor monitoring set.
      isQueueRow: true,
      // Digital rows sometimes carry a pre-queue IVR/bot transcript worth
      // previewing; voice rows never do, and not every digital contact used
      // the bot first.
      hasPreview: ch.type !== 'VOICE' && i % 3 !== 2,
      showViewInsights: true,
      showBargeIn: false,
      showMonitor: false,
      showCoach: false,
    };
  }).sort((a, b) => b.timeInQueueMs - a.timeInQueueMs);
}

// Queue "Interaction preview": the exchanges the customer already had with the
// IVR / pre-chat bot before landing in queue. These are discrete sessions —
// not a continuous live conversation — so there's no live script and no agent.
export function makeQueuePreview(row: any): InteractionPreviewData {
  const waitTimeMs =
    typeof row?.waitTimeMs === 'number' ? row.waitTimeMs : undefined;
  const timeInQueueMs =
    typeof row?.timeInQueueMs === 'number' ? row.timeInQueueMs : undefined;
  const customerName = String(row?.contactIdentity ?? 'Customer');
  const customerBadge = initialsOf(customerName);
  const sourceType = String(
    row?.engagementSource?.initialEngagementSourceType ??
      row?.sourceType ??
      'WEB_CHAT',
  );
  const channelLabel =
    sourceType === 'WEB_CHAT' ? 'Live chat' : String(row?.sourceName ?? 'Chat');
  const subject = String(row?.threadTitle ?? '') || 'Waiting in queue';

  // Queue previews have no agent history yet — the context is a single
  // still-running IVR hop plus a short AI recap of what the bot collected.
  const queueContext: InteractionContextData = {
    summaries: [
      {
        kind: 'ai',
        name: 'IVR',
        role: 'Virtual assistant',
        text: `${customerName} contacted us about "${subject}". The virtual assistant collected the account phone number and routed the conversation to the queue for the next available agent.`,
      },
    ],
    hops: [{ kind: 'ai', label: 'IVR' }],
    currentHopStartedSecAgo: Math.max(
      60,
      Math.round((timeInQueueMs ?? 60 * 1000) / 1000),
    ),
    dataChips: ['Phone verified', 'Waiting in queue'],
  };

  return {
    context: queueContext,
    waitTimeMs,
    timeInQueueMs,
    pending: true,
    channelLabel,
    sourceType,
    subject,
    tags: [{ label: 'Waiting', bg: '#e8f4fb', color: '#066fac' }],
    customerName,
    agentName: 'IVR',
    agentBadge: 'AI',
    connectedLine: `${customerName} is waiting in queue`,
    messages: [
      { who: 'system', text: 'IVR session • 09:12 AM' },
      {
        who: 'agent',
        name: 'IVR',
        badge: 'AI',
        text: "Hi! I'm the virtual assistant. What can I help you with today?",
        time: '09:12 AM',
      },
      {
        who: 'customer',
        name: customerName,
        badge: customerBadge,
        text: subject === 'Waiting in queue' ? 'I need help with my account.' : subject,
        time: '09:13 AM',
        lang: 'en',
      },
      {
        who: 'agent',
        name: 'IVR',
        badge: 'AI',
        text: 'Got it. Can you confirm the phone number or email on the account?',
        time: '09:13 AM',
      },
      {
        who: 'customer',
        name: customerName,
        badge: customerBadge,
        text: '(866) 929-1390',
        time: '09:14 AM',
        lang: 'en',
      },
      { who: 'system', text: 'IVR session ended • 09:15 AM' },
      { who: 'system', text: 'IVR session • 09:32 AM' },
      {
        who: 'agent',
        name: 'IVR',
        badge: 'AI',
        text: "Welcome back. I couldn't resolve this automatically, so I'm connecting you with an agent. You're in the queue now.",
        time: '09:32 AM',
      },
    ],
    queueName: String(row?.productName ?? 'Customer Support'),
    contactName: customerName,
    contactPhone: '(866) 929-1390',
    historyCountLabel: '4 interactions',
    history: PREVIEW_HISTORY,
    // No live script: the interaction isn't being handled yet.
    liveScript: [],
  };
}

// ---------------------------------------------------------------------------
// Digital "Interaction preview" popup (Figma node 4:107210) — the transcript,
// tags, contact card, and interaction-history entries shown when a supervisor
// monitors a digital conversation handled by an AirPro (AI) agent. The literal
// copy mirrors the Figma design 1:1; per-row dynamics (agent identity, channel
// label) come from the interaction row.
// ---------------------------------------------------------------------------

export interface PreviewMessage {
  who: 'system' | 'customer' | 'agent' | 'supervisor';
  name?: string;
  badge?: string;
  text: string;
  time?: string;
  edited?: boolean;
  // (Edited) renders inline after short texts, on its own line otherwise.
  editedInline?: boolean;
  lang?: string;
  liked?: boolean;
}

export interface PreviewTag {
  label: string;
  bg: string;
  color: string;
}

export interface PreviewHistoryEntry {
  icon: 'call-in' | 'email' | 'postcard' | 'call-out';
  title: string;
  summary?: string;
  showMore?: boolean;
  note?: string;
  date: string;
  duration: string;
}

// ---------------------------------------------------------------------------
// "Context" tab content (Figma node 88-63593): caller identity, per-hop
// conversation summaries, the hop log seed, and interaction-data chips. The
// hop log here covers only what has really happened so far — for an AI-handled
// interaction that's the AI routing hop plus the current (still running) skill
// hop. Live additions (take over -> "You", transfers) are appended at runtime.
// ---------------------------------------------------------------------------

export interface ContextSummaryEntry {
  kind: 'ai' | 'human';
  name: string;
  role: string;
  text: string;
}

export interface ContextHopSeed {
  kind: 'ai' | 'queue' | 'agent';
  label: string;
  // Omitted on the final seed hop = the hop is still running; its duration
  // ticks live from `currentHopStartedSecAgo`.
  durationSec?: number;
}

export interface InteractionContextData {
  summaries: ContextSummaryEntry[];
  hops: ContextHopSeed[];
  // How long ago (in seconds) the current running hop started, relative to
  // when the interaction context is first shown.
  currentHopStartedSecAgo: number;
  dataChips: string[];
}

export interface InteractionPreviewData {
  engagementId: string;
  channelLabel: string;
  sourceType: string;
  subject: string;
  tags: PreviewTag[];
  customerName: string;
  agentName: string;
  agentBadge: string;
  connectedLine: string;
  messages: PreviewMessage[];
  queueName: string;
  contactName: string;
  contactPhone: string;
  historyCountLabel: string;
  history: PreviewHistoryEntry[];
  // Messages that "arrive" one by one while the preview is open, so the
  // supervisor sees the digital interaction progressing live. Timestamps are
  // stamped by the component at arrival time.
  liveScript: PreviewMessage[];
  context: InteractionContextData;
  // Queue timing shown in the preview header (ms; from the table row).
  waitTimeMs?: number;
  timeInQueueMs?: number;
  // Pending rows keep the Time-in-queue SLA colors (matches the table).
  pending?: boolean;
}

const PREVIEW_CUSTOMER = 'Andy Smith';

const PREVIEW_HISTORY: PreviewHistoryEntry[] = [
  {
    icon: 'call-in',
    title: 'Success',
    summary:
      'Rafael want to become our marketing partner in the next year. He has a lot of ideas for our future advertisers. This call should be discussed',
    showMore: true,
    note: 'Need to request a Promo materials.',
    date: '09/25/23 10:10 AM',
    duration: '6 min 18 sec',
  },
  {
    icon: 'email',
    title: 'Success',
    summary:
      'Rafael emailed us with his main profile. He mentioned that we are the best and he will be glad to have an opportunity to work with us.',
    date: '09/24/23 10:10 AM',
    duration: '25 min 18 sec',
  },
  {
    icon: 'postcard',
    title: 'Success',
    note: 'Happy Birthday postcard.',
    date: '09/03/23 09:24 AM',
    duration: '20 min 18 sec',
  },
  {
    icon: 'call-out',
    title: 'Call sent to the Voicemail',
    date: '09/01/23 03:38 PM',
    duration: '5 min 18 sec',
  },
];

// Strips the AirPro "(Role)" suffix from the agent identity for chat display.
const displayAgentName = (fullName: string): string =>
  String(fullName ?? '').replace(/\s*\(.*\)\s*$/, '') || 'Agent';

// Initials badge for a display name ("Remy Murray" -> "RM").
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'A';

// Small deterministic hash so per-interaction context facts (case numbers,
// hop durations) stay stable across re-renders without storing state.
const hashOf = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export function makeInteractionPreview(row: any): InteractionPreviewData {
  const waitTimeMs =
    typeof row?.waitTimeMs === 'number' ? row.waitTimeMs : undefined;
  const timeInQueueMs =
    typeof row?.timeInQueueMs === 'number' ? row.timeInQueueMs : undefined;
  // Handling agent identity comes from the row (AirPro "Name (Role)" -> "Name");
  // transcript copy itself is the Figma-literal conversation.
  const agentName = row?.fullName
    ? displayAgentName(row.fullName)
    : 'Remy Murray';
  const agentBadge = initialsOf(agentName);
  const engagementId = String(row?.engagementId ?? 'eng-preview');
  // AirPro identity is "Name (Role)" — the role doubles as the skill the AI
  // is currently handling, so the hop log reads truthfully for this agent.
  const skillMatch = String(row?.fullName ?? '').match(/\(([^)]+)\)\s*$/);
  const aiSkill = skillMatch?.[1] ?? 'Customer Support';
  const seed = hashOf(engagementId);
  const sourceType = String(
    row?.engagementSource?.initialEngagementSourceType ??
      row?.sourceType ??
      'WEB_CHAT',
  );
  const channelLabel =
    sourceType === 'WEB_CHAT' ? 'Live chat' : String(row?.sourceName ?? 'Chat');

  // Context tab content matches this preview's conversation: the customer is
  // locked out of their account and the agent verifies + lifts the block.
  // Hops are truthful for the current handler: an AI agent shows only its AI
  // hops (routing + current skill); a human agent shows the queue hop that
  // routed the call plus the human agent's own (still running) hop.
  const isHuman = row?.agentType === 'Human';
  const context: InteractionContextData = isHuman
    ? {
        summaries: [
          {
            kind: 'human',
            name: agentName,
            role: 'Agent',
            text: `Customer reported being unable to access their account. ${agentName} confirmed the account was blocked after several failed sign-in attempts, verified the customer's identity, and lifted the block. Customer confirmed access is restored.`,
          },
        ],
        hops: [
          {
            kind: 'queue',
            label: 'Queue - Customer Support',
            durationSec: 42 + (seed % 50),
          },
          { kind: 'agent', label: `Agent - ${agentName}` },
        ],
        currentHopStartedSecAgo: 180 + (seed % 160),
        dataChips: [
          `Case ${100000 + (seed % 900000)}`,
          'Account 56751',
          'Sign-in blocked',
          'Block lifted (updated)',
        ],
      }
    : {
        summaries: [
          {
            kind: 'ai',
            name: agentName,
            role: 'AIR Pro',
            text: `Customer reported being unable to access their account. ${agentName} confirmed the account was blocked after several failed sign-in attempts, verified the customer's identity, and lifted the block. Customer confirmed access is restored.`,
          },
        ],
        hops: [
          {
            kind: 'ai',
            label: 'AIR Pro - Welcome & Routing',
            durationSec: 96 + (seed % 45),
          },
          { kind: 'ai', label: `AIR Pro - ${aiSkill}` },
        ],
        currentHopStartedSecAgo: 180 + (seed % 160),
        dataChips: [
          `Case ${100000 + (seed % 900000)}`,
          'Account 56751',
          'Sign-in blocked',
          'Block lifted (updated)',
        ],
      };

  return {
    engagementId,
    context,
    waitTimeMs,
    timeInQueueMs,
    pending: String(row?.conversationState ?? '') === 'PENDING',
    channelLabel,
    sourceType,
    subject: 'Hello! I have a problem with account. Can you help with it?',
    tags: [
      { label: 'Critical issue', bg: '#fdeae5', color: '#c40c05' },
      { label: 'Tech', bg: '#f4e7f9', color: '#9b45a0' },
    ],
    customerName: PREVIEW_CUSTOMER,
    agentName,
    agentBadge,
    connectedLine: `${PREVIEW_CUSTOMER} is connected • 06:05 PM`,
    messages: [
      {
        who: 'customer',
        name: PREVIEW_CUSTOMER,
        badge: 'RM',
        text: 'Hello! I have a problem with account. Can you help with it?',
        time: '06:06 PM',
        edited: true,
        lang: 'en',
        liked: true,
      },
      {
        who: 'agent',
        name: agentName,
        badge: agentBadge,
        text: 'Good morning! Sure, please type me your number in system',
        time: '06:10 PM',
      },
      {
        who: 'customer',
        name: PREVIEW_CUSTOMER,
        badge: 'RM',
        text: '56751',
        time: '06:20 PM',
        edited: true,
        editedInline: true,
        lang: 'en',
      },
      {
        who: 'agent',
        name: agentName,
        badge: agentBadge,
        text: "Thank you! It seems that your account is blocked. Give me a second, I'll find out why.",
        time: '06:10 PM',
        edited: true,
        editedInline: true,
      },
    ],
    queueName: String(row?.queueName ?? 'Customer Support'),
    contactName: 'Rafael Mobley',
    contactPhone: '(866) 929-1390',
    historyCountLabel: '4 interactions',
    history: PREVIEW_HISTORY,
    liveScript: [
      {
        who: 'agent',
        name: agentName,
        badge: agentBadge,
        text: 'I checked your account — it was flagged after several failed sign-in attempts.',
      },
      {
        who: 'customer',
        name: PREVIEW_CUSTOMER,
        badge: 'RM',
        text: 'Oh no. Can you unblock it for me?',
        lang: 'en',
      },
      {
        who: 'agent',
        name: agentName,
        badge: agentBadge,
        text: "I've verified your identity and lifted the block. Please try signing in now.",
      },
      {
        who: 'customer',
        name: PREVIEW_CUSTOMER,
        badge: 'RM',
        text: 'It works now. Thank you so much!',
        lang: 'en',
      },
      {
        who: 'agent',
        name: agentName,
        badge: agentBadge,
        text: "You're welcome! Is there anything else I can help you with today?",
      },
    ],
  };
}
