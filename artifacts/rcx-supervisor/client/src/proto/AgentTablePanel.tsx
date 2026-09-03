import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled, { ThemeProvider, css } from "styled-components";
import { RcThemeProvider } from "@ringcentral/juno";
import { theme, Dialog } from "@ringcx/ui";

import "./i18n";
import "./vendor/ringcx-ui/icons/digital-icons/digital-icons.css";
import "./vendor/ringcx-ui/icons/engage-icons/engage-icons.css";

import RingCxCheckbox from "./vendor/ringcx-ui/components/Checkbox/Checkbox";
import RingCxFilterToggle from "./vendor/ringcx-ui/components/Inputs/SearchInput/components/FilterToggle";
import { SupervisorAgentList } from "./eag/containers/SupervisorAgentList/SupervisorAgentList";
import { DigitalInteractionTable } from "./eag/components/DigitalInteractionTable/DigitalInteractionTable";
import AiInsightsPanel from "./eag/components/AiInsightsPanel/AiInsightsPanel";
import { Dialer } from "./dialer/Dialer";
import { MonitoringCallWindow } from "./dialer/MonitoringCallWindow";
import {
  endActivePreviewCall,
  startActivePreviewCall,
  useActivePreviewCall,
} from "./activePreviewCallStore";
import { ReassignConversationModal } from "./ReassignConversationModal";
import { InteractionRollupModal } from "./eag/containers/SupervisorAgentList/components/InteractionRollupModal";
import {
  UpdateAgentStateModal,
  AgentStateToast,
  type AgentStateOption,
} from "./UpdateAgentStateModal";
import {
  columns,
  interactionColumns,
  queueColumns,
  myQueuesColumns,
  supervisor2InteractionColumns,
  supervisor3InteractionColumns,
  suggestionInteractionColumns,
  CONVERSATION_STATES,
  makeAgents,
  makeInteractions,
  makeInteractionPreview,
  makeQueuePreview,
  rollupColumns,
} from "./mock/supervisorMock";
import {
  useQueueRows,
  useQueuePendingCount,
  removeQueueRow,
  requeueRow,
} from "./mock/queueStore";
import { useUrlParam, useUrlSearchUpdater } from "@/hooks/useUrlState";

// Live "Queue (n)" counter hook — re-exported so the page's top tab label can
// track queue arrivals/departures without importing the proto mock tree.
export { useQueuePendingCount };
// All raw queue rows re-exported so consumers (e.g. the pagination panel) can
// compute total / filtered counts without coupling to the proto mock tree.
export { useQueueRows };

// Live "Interactions (n)" counter: all pending interactions — queued (Pending,
// live from the queue store) plus Reserved rows (routed to an agent but not
// yet picked up; pending with an agent assigned). Reserved rows come from the
// deterministic interaction seed, so only the queued share ticks live.
export function usePendingInteractionsCount(): number {
  return useQueuePendingCount() + RESERVED_INTERACTION_COUNT;
}
import {
  InteractionPreview,
  TransferMessageDialog,
  type InteractionPreviewMode,
} from "./InteractionPreview";
import { RequeueDialer, type RequeueDialerResult } from "./RequeueDialer";
import {
  SupervisorListHoverMenu,
  InformationHoverMenu,
} from "./eag/containers/SupervisorAgentList/SupervisorAgentList.styled";
import {
  appendContextHop,
  registerActiveCallContext,
  useContextHops,
} from "./contextHopStore";
import { CATEGORIES_MAP } from "./eag/helpers/injector";
import {
  CONVERSATION_CATEGORIES,
  getClaimedQueueRow,
  registerClaimedDigital,
  registerClaimedQueueRow,
  removeClaimedDigital,
  setConversationCategories,
  useCategoryOverrides,
  useClaimedDigitalIds,
} from "./claimedDigitalStore";
import { ActiveMessagesSidebar } from "./ActiveMessagesSidebar";
import {
  EndMessageDialog,
  RecategorizeDialog,
} from "./ActiveMessagesDialogs";

// Claimed-digital store, re-exported so the page's "Active messages" top tab
// (count + tab content) shares the same source of truth through @proto.
export {
  registerClaimedDigital,
  removeClaimedDigital,
  useClaimedDigitalIds,
} from "./claimedDigitalStore";
export { ActiveMessagesSidebar } from "./ActiveMessagesSidebar";

// Time in queue SLA breach threshold — matches the red band in the row
// renderer (red past 10 minutes).
const SLA_BREACH_MS = 10 * 60 * 1000;
const isSlaBreached = (timeInQueueMs: unknown): boolean =>
  typeof timeInQueueMs === "number" && timeInQueueMs > SLA_BREACH_MS;

// Read-only ("Agent view") scope: hides every row hover-action menu in both
// tables (Monitor / Whisper / Take over / AI insights / More) so a peer agent
// can review the team without any supervisor controls.
const PanelScope = styled.div<{ $readOnly?: boolean }>`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  ${(p) =>
    p.$readOnly &&
    css`
      ${SupervisorListHoverMenu},
      ${InformationHoverMenu} {
        display: none !important;
      }
    `}
`;

// Single source of truth for the agent table column ids/labels, derived directly
// from the proto column definitions. Consumed by the page's settings dialog so
// the checkbox list can never drift from the real table columns.
export const agentColumnMeta: { id: string; label: string }[] = columns.map(
  (c) => ({ id: c.id, label: String(c.content) }),
);

// Same single-source-of-truth treatment for the Interactions table, derived from
// the real interaction column definitions so the settings dialog list can never
// drift from the columns actually rendered in the table.
export const interactionColumnMeta: { id: string; label: string }[] =
  interactionColumns.map((c) => ({ id: c.id, label: String(c.content) }));

// Supervisor view 2's Interactions table has its own column set (Queue,
// Total waiting time, Time in queue, Previous agent, …), so its settings
// dialog needs its own meta to stay aligned with what's actually rendered.
export const supervisor2InteractionColumnMeta: { id: string; label: string }[] =
  supervisor2InteractionColumns.map((c: any) => ({
    id: c.id,
    label: String(c.content),
  }));

// Supervisor view 3: view 2's Interactions column set minus Agent type,
// Confidence, and Sentiment — the settings dialog must list exactly what the
// table renders, so it gets its own meta too.
export const supervisor3InteractionColumnMeta: { id: string; label: string }[] =
  supervisor3InteractionColumns.map((c: any) => ({
    id: c.id,
    label: String(c.content),
  }));

// CP: Suggestion Interactions column meta — view 3's set minus the queue-only
// columns (Previous agent, Queue wait time, Total wait time). Used for the
// Interactions tab settings dialog in the Supervisor and Agent suggestion views.
export const suggestionInteractionColumnMeta: { id: string; label: string }[] =
  suggestionInteractionColumns.map((c: any) => ({
    id: c.id,
    label: String(c.content),
  }));

// My Queues column meta for the suggestion-view Queue tab settings dialog.
export const myQueuesColumnMeta: { id: string; label: string }[] =
  myQueuesColumns.map((c: any) => ({
    id: c.id,
    label: String(c.content),
  }));

// Distinct agent states present in the mock, partitioned by agent type, so the
// page's State filter can offer exactly the states that appear in the table
// (human states for Human, AirPro states for AirPro, the union for All).
const _stateMetaAgents = makeAgents(25) as any[];
const _distinctStates = (xs: string[]) => Array.from(new Set(xs));
export const agentStateOptions: Record<"All" | "Air" | "Human", string[]> = {
  All: _distinctStates(_stateMetaAgents.map((a) => a.agentState)),
  Air: _distinctStates(
    _stateMetaAgents
      .filter((a) => a.agentType === "Air")
      .map((a) => a.agentState),
  ),
  Human: _distinctStates(
    _stateMetaAgents
      .filter((a) => a.agentType === "Human")
      .map((a) => a.agentState),
  ),
};

// Per-agent options for the Interactions-tab "All agents" picker, derived from
// the agents that actually appear in the interaction data (so every option
// resolves to at least one row). Keyed by agentId, labelled with the agent's
// display name (AirPro agents carry their "Name (Role)" identity).
const _interactionAgents = makeInteractions() as any[];

// Reserved interactions in the deterministic seed — counted once for the live
// "Interactions (n)" tab counter (usePendingInteractionsCount above).
const RESERVED_INTERACTION_COUNT = _interactionAgents.filter(
  (r) => r.conversationState === CONVERSATION_STATES.RESERVED.key,
).length;
export const agentFilterOptions: { value: string; label: string }[] =
  Array.from(
    new Map(
      _interactionAgents.map((r) => [r.agentId, r.fullName]),
    ).entries(),
  ).map(([value, label]) => ({ value, label }));

// Slim projection of the interaction rows, exported so the page can compute
// cascading Interactions-tab filter options (each dropdown constrained by the
// selections to its left) from the same data the table renders.
export interface InteractionFilterRow {
  agentId: string;
  fullName: string;
  agentType: string;
  sourceName: string;
  queueName: string;
  conversationState: string;
  conversationStateLabel: string;
  categoryIds: string;
}
export const interactionFilterRows: InteractionFilterRow[] =
  _interactionAgents.map((r) => ({
    agentId: String(r.agentId),
    fullName: String(r.fullName),
    agentType: String(r.agentType),
    sourceName: String(r.sourceName),
    queueName: String(r.queueName ?? ""),
    conversationState: String(r.conversationState),
    conversationStateLabel: String(r.conversationStateLabel),
    categoryIds: String(r.categoryIds ?? ""),
  }));

// RingCX core checkbox (vendor Checkbox), wrapped in the theme providers it
// expects so the page can drop it straight into the filter row through the
// @proto alias — same visual language as the rest of the RingCX controls.
export function SupervisorCheckbox({
  checked,
  onCheckedChange,
  label,
  testId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <RcThemeProvider>
      <ThemeProvider theme={theme}>
        <span data-testid={testId} style={{ display: "inline-flex" }}>
          <RingCxCheckbox
            checked={checked}
            onChange={(e: any) => onCheckedChange(!!e.target.checked)}
            label={label}
            color="primary"
          />
        </span>
      </ThemeProvider>
    </RcThemeProvider>
  );
}

// The vendor FilterToggle vertically aligns its icon and label with
// vertical-align (icon: middle, label: text-top), which only lines up under
// the RingCX app's own font metrics. Inside the page's font context the label
// sits visibly lower than the icon, so this wrapper flex-centers the toggle
// instead — same look, robust alignment.
const FilterToggleAlign = styled.span`
  display: inline-flex;

  > div {
    display: inline-flex;
    align-items: center;
    margin: 0;
  }

  > div i {
    vertical-align: unset;
  }

  > div span {
    vertical-align: unset;
  }
`;

// RingCX core "Filters (n)" toggle (vendor FilterToggle) wrapped in its theme
// providers: the label carries the active-filter count and the whole toggle
// paints primary blue whenever the panel is open OR any selection is active —
// the stock RingCX pattern. The vendor component is uncontrolled, so the
// wrapper re-keys it on the externally (URL-) driven open state to stay in
// sync with deep links and back/forward navigation.
export function SupervisorFilterToggle({
  open,
  count,
  onOpenChange,
  testId,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  testId?: string;
}) {
  return (
    <RcThemeProvider>
      <ThemeProvider theme={theme}>
        <FilterToggleAlign data-testid={testId}>
          <RingCxFilterToggle
            key={open ? "open" : "closed"}
            initState={open}
            count={count}
            onToggle={(isActive: boolean) => {
              if (isActive !== open) onOpenChange(isActive);
            }}
          />
        </FilterToggleAlign>
      </ThemeProvider>
    </RcThemeProvider>
  );
}

// Latest filter design: RingCX MultiSelect-based filter, re-exported so the
// page can import it through the @proto alias.
export { SupervisorFilter } from "./SupervisorFilter";
export type {
  SupervisorFilterOption,
  SupervisorFilterProps,
} from "./SupervisorFilter";

// Live pending (queued) rows projected into the same slim filter-row shape as
// interactionFilterRows, so Supervisor view 2 can offer "Pending" as a State
// option and cascade queue/channel/category options over the unassigned rows.
export function usePendingFilterRows(extended = false): InteractionFilterRow[] {
  const rows = useQueueRows(extended);
  return useMemo(
    () =>
      rows.map((q: any) => ({
        agentId: "",
        fullName: "",
        agentType: "",
        sourceName: String(q.sourceName),
        queueName: String(q.productName ?? ""),
        conversationState: String(CONVERSATION_STATES.PENDING.key),
        conversationStateLabel: String(CONVERSATION_STATES.PENDING.label),
        categoryIds: String(q.categoryIds ?? ""),
      })),
    [rows],
  );
}

interface AgentTablePanelProps {
  activeTab?: "Agents" | "Interactions" | "Queue";
  // Live count of interaction rows the table currently shows (all pre-filters
  // plus the grid's own search), for the "Interactions (n)" tab label.
  onInteractionCountChange?: (count: number) => void;
  // False when the hosting route can't navigate to /interactions/:id/takeover
  // (e.g. a /queue/:id/:mode deep link) — hides the preview's Take over action.
  previewTakeOverRoutable?: boolean;
  searchValue?: string;
  selectedStates?: string[];
  selectedChannels?: string[];
  selectedAgentGroups?: string[];
  agentTypeFilter?: string[];
  statusFilter?: "All" | "Active" | "Inactive";
  visibleColumnIds?: string[];
  selectedAgentIds?: string[];
  selectedCategories?: string[];
  // Interactions-tab Queue filter (matches each row's originating queueName).
  selectedQueues?: string[];
  // Interactions-tab State filter (conversationState keys, e.g. ACTIVE).
  selectedInteractionStates?: string[];
  visibleInteractionColumnIds?: string[];
  // Interactions-tab "Breached SLA" toggle: only rows whose Time in queue is
  // past the 10-minute SLA (the red band) remain.
  breachedSlaOnly?: boolean;
  onActiveInteractionsClick?: (agentId: string) => void;
  highlightAgentId?: string | null;
  highlightNonce?: number;
  // Digital AI-agent monitoring preview (URL-driven by the page): the engagement
  // being previewed and the current view mode, plus navigation callbacks.
  previewEngagementId?: string | null;
  previewMode?: InteractionPreviewMode | null;
  onPreviewOpen?: (engagementId: string) => void;
  onPreviewModeChange?: (mode: InteractionPreviewMode) => void;
  onPreviewClose?: () => void;
  // Prototype behavior flag: clicking outside a pending voice or digital
  // preview closes the URL-driven preview.
  closePreviewOnOutsideClick?: boolean;
  // Agent view: render the tables read-only (no monitoring, hover actions,
  // dialpads, or take over). Supervisor view passes false/omits it.
  readOnly?: boolean;
  // Marks the logged-in user's own row in the Agents table ("Name (you)").
  showCurrentUser?: boolean;
  // Supervisor view 2: the Interactions tab shows the regular interactions
  // plus the pending (queued) rows in a "Pending" state, with Queue name /
  // Time in queue / Previous agent columns. Supervisor view 3 behaves the
  // same but drops the Agent type / Confidence / Sentiment columns.
  // "suggestion": active interactions only, leaner column set (no wait-time
  // or previous-agent columns), used in the Supervisor/Agent suggestion views.
  interactionsVariant?: "supervisor2" | "supervisor3" | "suggestion";
  // CP: Suggestion queue-row action gating —
  //   hideQueueViewInsights: hide the View Insights (SV Assist) hover action
  //     on queue rows in the My Queues tab (active rows keep it).
  //   hideQueueTransferAndMore: hide the Transfer button and the More (3-dot)
  //     menu on queue rows (Agent suggestion view only; Claim remains).
  //   queueClaimLabel: button label for the claim action (default "Claim";
  //     pass "Claim" in suggestion views).
  hideQueueViewInsights?: boolean;
  hideQueueTransferAndMore?: boolean;
  // CP: Agent suggestion view — hide the preview/Monitor eye on active
  // Interactions rows (agents can't monitor teammates' conversations).
  hideInteractionPreview?: boolean;
  // My Queues table settings: column ids to render, in order. When omitted,
  // the default column set (visible !== false) renders.
  visibleQueueColumnIds?: string[];
  queueClaimLabel?: string;
  // Use the My Queues column set (renamed time columns) instead of the
  // standard queueColumns for the Queue tab in suggestion views.
  useMyQueuesColumns?: boolean;
  // Merge the pending (queued) rows into the Interactions table (Supervisor 1
  // flow). False in the Queue-tab flows, where pending rows live in the
  // top-level Queue tab instead.
  includePendingRows?: boolean;
  // Fired when a voice take-over commits so the page can switch to the
  // Active calls context for that agent's call.
  onTakeOverCommitted?: (agentId: string) => void;
  // Fired when an incoming voice preview call is answered (the active call is
  // already registered in the store) so the page can route to Active calls.
  onVoicePreviewAccepted?: () => void;
  // Fired when a digital take-over (Claim) commits so the page can switch to
  // the Active messages context for that conversation.
  onDigitalTakeOverCommitted?: (engagementId: string) => void;
  // True when this panel renders as the Active messages tab content — shows
  // the claimed-conversation list beside the take-over view.
  activeMessagesMode?: boolean;
  // Fired when the floating call window closes so the page can leave the
  // Active calls context if it was showing this agent's taken-over call.
  onMonitoringWindowClosed?: (agentId: string) => void;
  // When set, slices the Queue tab's display rows to the given page window so
  // the hosting panel can render its own pagination controls. The full queue
  // store (all rows) is still used for action lookups (Claim, Transfer, etc.).
  queuePageSlice?: { page: number; pageSize: number };
  /** Read the extended high-volume queue store without pagination
      (CP: Suggestion flows). */
  extendedQueue?: boolean;
  // Called with the full post-filter (pre-slice) row count whenever it changes
  // so PaginatedQueuePanel can render an accurate range indicator and page count
  // without duplicating the filter logic.
  onQueueFilteredCount?: (count: number) => void;
  // When set, slices the Interactions tab's merged rows to the given page
  // window so the hosting page can render its own pagination controls
  // (Supervisor (Expected) flow).
  interactionsPageSlice?: { page: number; pageSize: number };
  // Called with the full post-filter (pre-slice) Interactions row count so the
  // hosting page can render an accurate range indicator and page count.
  onInteractionsFilteredCount?: (count: number) => void;
  // Pads the seeded Interactions list up to this many rows (Supervisor
  // (Expected) flow's high-volume demo). Applied once on mount.
  interactionsVolume?: number;
}

export default function AgentTablePanel({
  activeTab = "Agents",
  previewTakeOverRoutable = true,
  onInteractionCountChange,
  searchValue = "",
  selectedStates = [],
  selectedChannels = [],
  selectedAgentGroups = [],
  agentTypeFilter = [] as string[],
  statusFilter = "All",
  visibleColumnIds,
  selectedAgentIds = [],
  selectedCategories = [],
  selectedQueues = [],
  selectedInteractionStates = [],
  visibleInteractionColumnIds,
  breachedSlaOnly = false,
  onActiveInteractionsClick,
  highlightAgentId,
  highlightNonce,
  previewEngagementId = null,
  previewMode = null,
  onPreviewOpen,
  onPreviewModeChange,
  onPreviewClose,
  closePreviewOnOutsideClick = true,
  readOnly = false,
  showCurrentUser = false,
  interactionsVariant,
  includePendingRows = true,
  onTakeOverCommitted,
  onVoicePreviewAccepted,
  onDigitalTakeOverCommitted,
  activeMessagesMode,
  onMonitoringWindowClosed,
  queuePageSlice,
  extendedQueue = false,
  onQueueFilteredCount,
  interactionsPageSlice,
  onInteractionsFilteredCount,
  interactionsVolume,
  hideQueueViewInsights = false,
  hideQueueTransferAndMore = false,
  hideInteractionPreview = false,
  visibleQueueColumnIds,
  queueClaimLabel = "Claim",
  useMyQueuesColumns = false,
}: AgentTablePanelProps) {
  // Supervisor view 3 shares all of view 2's Interactions behavior (pending
  // row merging, hover actions, preview) — only the column set differs.
  // "suggestion" uses a leaner Active-only column set; pending rows live in
  // the My Queues tab and never merge into the Interactions table.
  const isSupervisor2Interactions =
    interactionsVariant === "supervisor2" ||
    interactionsVariant === "supervisor3";
  const isSupervisor3Columns = interactionsVariant === "supervisor3";
  const isSuggestionVariant = interactionsVariant === "suggestion";
  const [agents, setAgents] = useState(() => makeAgents(25));
  const [interactions, setInteractions] = useState(() =>
    makeInteractions(undefined, interactionsVolume),
  );
  // Queue tab: live pending (Waiting) interactions from the shared queue store
  // (arrivals/departures churn it, Claim/Transfer remove rows). The paginated
  // Queue tab (queuePageSlice set) reads the extended high-volume set; every
  // other flow reads the compact set.
  const queueRows = useQueueRows(Boolean(queuePageSlice) || extendedQueue);
  const [queueCols] = useState(() =>
    queueColumns.map((c: any) => ({ ...c })),
  );
  const [interactionCols] = useState(() =>
    interactionColumns.map((c: any) => ({ ...c })),
  );
  const [supervisor2Cols] = useState(() =>
    supervisor2InteractionColumns.map((c: any) => ({ ...c })),
  );
  const [supervisor3Cols] = useState(() =>
    supervisor3InteractionColumns.map((c: any) => ({ ...c })),
  );
  const [suggestionCols] = useState(() =>
    suggestionInteractionColumns.map((c: any) => ({ ...c })),
  );
  // My Queues columns: queueColumns with renamed time labels.
  const [myQueuesCols] = useState(() =>
    myQueuesColumns.map((c: any) => ({ ...c })),
  );

  // Capture the seeded confidence/sentiment values once. Live scores oscillate
  // around these fixed bases: most rows hold their band while a few borderline
  // bases (parked on a threshold in supervisorMock) drift back and forth across
  // it, so their rows flip in and out of the flagged treatment live — the
  // "real-time" supervision signal (mock-simulated).
  const baseScoresRef = useRef<
    Record<string, { c: number | null; s: number | null }>
  >({});
  if (Object.keys(baseScoresRef.current).length === 0) {
    const map: Record<string, { c: number | null; s: number | null }> = {};
    interactions.forEach((r: any) => {
      map[r.engagementId] = {
        c: typeof r.confidenceScore === "number" ? r.confidenceScore : null,
        s: typeof r.sentimentScore === "number" ? r.sentimentScore : null,
      };
    });
    baseScoresRef.current = map;
  }

  // Deterministic bounded drift (±5) keyed by tick + per-row seed, so the
  // simulation is reproducible rather than using Math.random.
  useEffect(() => {
    if (activeTab !== "Interactions") return;
    let tick = 0;
    const drift = (base: number | null, seed: number): number | null =>
      typeof base === "number"
        ? Math.max(
            0,
            Math.min(100, Math.round(base + 5 * Math.sin((tick + seed) * 1.3))),
          )
        : base;
    const id = window.setInterval(() => {
      tick += 1;
      setInteractions((prev) =>
        prev.map((r: any, i: number) => {
          const b = baseScoresRef.current[r.engagementId];
          if (!b) return r;
          return {
            ...r,
            confidenceScore: drift(b.c, i),
            sentimentScore: drift(b.s, i + 7),
          };
        }),
      );
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeTab]);
  // Live interaction timers, gated by conversation state so the three time
  // columns behave like real clocks that agree with each other:
  //   - Time in queue keeps running for the interaction's whole life.
  //   - Total waiting time runs only while the customer is waiting
  //     (Pending/Reserved) and freezes once an agent session is active.
  //   - Interaction (agent handling time) runs only while Active.
  useEffect(() => {
    const id = window.setInterval(() => {
      setInteractions((prev) =>
        prev.map((r: any) => {
          const state = r.conversationState;
          const active = state === "ACTIVE";
          const waiting = state === "PENDING" || state === "RESERVED";
          if (!active && !waiting) return r;
          return {
            ...r,
            timeInQueueMs:
              typeof r.timeInQueueMs === "number"
                ? r.timeInQueueMs + 1000
                : r.timeInQueueMs,
            waitTimeMs:
              waiting && typeof r.waitTimeMs === "number"
                ? r.waitTimeMs + 1000
                : r.waitTimeMs,
            agentDurationMs:
              active && typeof r.agentDurationMs === "number"
                ? r.agentDurationMs + 1000
                : r.agentDurationMs,
          };
        }),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const [monitoredId, setMonitoredId] = useState<string | null>(null);
  // Engagement id of the voice interaction currently being monitored (from the
  // Interactions tab), used only to highlight that specific row — the dialpad
  // popup itself is keyed off monitoredId/agents, same as the Agents tab.
  const [monitoredEngagementId, setMonitoredEngagementId] = useState<
    string | null
  >(null);
  // AI Insights side panel: holds the opened interaction's context (or null).
  // engagementId keys back to the live interaction row so the panel's Sentiment /
  // Confidence stay in sync with the table and the row stays highlighted.
  const [insightCtx, setInsightCtx] = useState<{
    agentName: string;
    isVoice: boolean;
    engagementId: string;
    agentType?: string;
    // True when the interaction is still waiting in queue — the AI Insights
    // panel then renders its slimmed-down queue variant.
    isQueue?: boolean;
  } | null>(null);
  // Engagement the supervisor has actively taken over (the AI/agent moves on
  // to its next conversation).
  // Take over is immediate and permanent for the prototype — there is no
  // hand-back, so this only ever transitions from null to an engagement id.
  const [bargedId, setBargedId] = useState<string | null>(null);
  // Pending Ignore confirmation — set when the user picks "Ignore" from the
  // 3-dot menu on a queue row; cleared on Cancel or Confirm.
  const [removeConfirmRow, setRemoveConfirmRow] = useState<{
    agentId: string;
    engagementId: string;
    contactIdentity: string;
  } | null>(null);
  // Recategorize is URL-driven for pending voice and digital interactions:
  // "1" targets the open preview; another value targets that queue row.
  const [categorizeParam, setCategorizeParam] = useUrlParam("categorize");
  const recategorizeOpen = categorizeParam === "1";
  const recategorizeRowId =
    categorizeParam && categorizeParam !== "1" ? categorizeParam : null;
  const setRecategorizeOpen = useCallback(
    (open: boolean) => setCategorizeParam(open ? "1" : null),
    [setCategorizeParam],
  );
  const setRecategorizeRowId = useCallback(
    (id: string | null) => setCategorizeParam(id),
    [setCategorizeParam],
  );
  // Active messages End message dialog.
  const [endMessageOpen, setEndMessageOpen] = useState(false);
  // Incrementing signal that asks the open take-over view to show its
  // transfer dialog (sidebar card → arrow).
  const [transferSignal, setTransferSignal] = useState(0);
  // Runtime hop-log additions per engagement for the Context tab live in the
  // module-level contextHopStore: take over appends "You", transfers append
  // "Queue - {name}" / "Agent - {name}". The store is shared with the Active
  // calls screen (mounted outside this panel), so the hop log survives the
  // page's switch to the Active calls context after a voice take-over.

  // ---------------------------------------------------------------------
  // URL-driven action dialogs (deep-linkable / refresh-safe): all four share
  // the ?modal= key, so they are mutually exclusive by construction.
  //   ?modal=transfer      voice transfer overlay (needs an open AI Insights ctx)
  //   ?modal=reassign      digital reassign modal (needs an open AI Insights ctx)
  //   ?modal=agent-state&agentId=<id>   Update agent state picker
  //   ?modal=rollup&agentId=<id>        24h interactions rollup breakdown
  //   ?modal=queue-transfer&engagementId=<uii>   Transfer message dialog for a
  //                                              pending queue row
  //   ?modal=queue-requeue&engagementId=<uii>    Requeue call dialog for a
  //                                              pending voice queue row
  // Invalid/stale values (unknown agent, missing context, read-only view)
  // fall back by closing the dialog via history replace.
  // ---------------------------------------------------------------------
  const [modalParam] = useUrlParam("modal");
  const [modalAgentIdParam] = useUrlParam("agentId");
  const [modalEngagementIdParam] = useUrlParam("engagementId");
  const updateSearch = useUrlSearchUpdater();
  const openModal = useCallback(
    (id: string, agentId?: string, engagementId?: string) => {
      updateSearch((p) => {
        p.set("modal", id);
        if (agentId) p.set("agentId", agentId);
        else p.delete("agentId");
        if (engagementId) p.set("engagementId", engagementId);
        else p.delete("engagementId");
      });
    },
    [updateSearch],
  );
  const closeModal = useCallback(
    (options?: { replace?: boolean }) => {
      updateSearch((p) => {
        p.delete("modal");
        p.delete("agentId");
        p.delete("engagementId");
      }, options);
    },
    [updateSearch],
  );
  const transferOpen = modalParam === "transfer";
  const reassignOpen = modalParam === "reassign";
  const stateModalAgentId =
    modalParam === "agent-state" ? modalAgentIdParam : null;
  const rollupAgentId = modalParam === "rollup" ? modalAgentIdParam : null;
  const queueTransferEngagementId =
    modalParam === "queue-transfer" ? modalEngagementIdParam : null;
  const queueRequeueEngagementId =
    modalParam === "queue-requeue" ? modalEngagementIdParam : null;

  // The AI Insights panel belongs to the Interactions tab table view: navigating
  // away — to the Agents tab, or into an Interaction preview route — closes it
  // (the transfer/reassign dialogs anchored to it self-close below once their
  // context is gone).
  useEffect(() => {
    if (activeTab === "Interactions" && !previewEngagementId) return;
    setInsightCtx(null);
  }, [activeTab, previewEngagementId]);

  useEffect(() => {
    if (
      !closePreviewOnOutsideClick ||
      !previewEngagementId ||
      previewMode !== "preview" ||
      removeConfirmRow
    ) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-testid="monitoring-call-window"]') ||
        target.closest('[data-testid="pane-interaction-preview"]') ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="menu"]') ||
        target.closest('[data-testid^="overlay-"]')
      ) {
        return;
      }
      onPreviewClose?.();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [
    closePreviewOnOutsideClick,
    onPreviewClose,
    previewEngagementId,
    previewMode,
    removeConfirmRow,
  ]);

  // Switching to the read-only Agent view closes every supervisor-only surface
  // that may still be open: monitoring dialpad, AI Insights panel and its
  // transfer/reassign flows, the change-state modal, and the rollup popover.
  useEffect(() => {
    if (!readOnly) return;
    setMonitoredId(null);
    setMonitoredEngagementId(null);
    setInsightCtx(null);
    if (
      modalParam === "transfer" ||
      modalParam === "reassign" ||
      modalParam === "agent-state" ||
      modalParam === "rollup" ||
      modalParam === "queue-transfer" ||
      modalParam === "queue-requeue"
    ) {
      closeModal({ replace: true });
    }
  }, [readOnly, modalParam, closeModal]);
  const [toast, setToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [agentCols] = useState(() => columns.map((c: any) => ({ ...c })));

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout((flash as any)._t);
    (flash as any)._t = window.setTimeout(() => setToast(null), 2600);
  };
  const flashRef = useRef(flash);
  flashRef.current = flash;

  // Transfer / Reassign are anchored to an open AI Insights context: a deep
  // link (or tab change) without that context self-cleans via replace.
  useEffect(() => {
    if ((transferOpen || reassignOpen) && !insightCtx) {
      closeModal({ replace: true });
    }
  }, [transferOpen, reassignOpen, insightCtx, closeModal]);

  // Monitoring is voice-only: the Monitor icon is enabled ONLY when every one
  // of the agent's active interactions is a voice call. Any digital interaction
  // (alone or mixed with voice) or no interactions at all -> disabled icon with
  // an explanatory tooltip. The monitored-row highlight is driven separately by
  // monitoredAgent.monitoredAgentId in the row renderer (not by showMonitor).
  // Agent type + status filtering is applied here (pre-filter), while state /
  // channel / search filtering runs inside the GridList via props.
  // The first human agent stands in for the logged-in user when the page asks
  // for the "(you)" marker (View 2 variants).
  const currentUserAgentId = useMemo(
    () =>
      showCurrentUser
        ? ((agents.find((a: any) => a.agentType === "Human") ?? agents[0])
            ?.agentId ?? null)
        : null,
    [showCurrentUser, agents],
  );

  const displayAgents = useMemo(
    () =>
      agents
        .filter((a: any) => {
          if (
            agentTypeFilter.length > 0 &&
            !agentTypeFilter.includes(a.agentType)
          ) {
            return false;
          }
          if (
            agentTypeFilter.includes("Air") &&
            !agentTypeFilter.includes("Human") &&
            statusFilter !== "All" &&
            a.status !== statusFilter
          ) {
            return false;
          }
          if (
            selectedAgentGroups.length > 0 &&
            !selectedAgentGroups.includes(a.skill)
          ) {
            return false;
          }
          return true;
        })
        .map((a: any) => {
          const { subRows, ...rest } = a; // non-expandable (avoids GridList grouped path)
          const active: any[] = a.activeInteractions ?? [];
          const isVoiceOnly =
            active.length > 0 &&
            active.every((it: any) => it.channelType === "VOICE");
          return {
            ...rest,
            fullName:
              a.agentId === currentUserAgentId
                ? `${a.fullName} (you)`
                : a.fullName,
            showMonitor: !readOnly && isVoiceOnly,
            disabledTooltip: isVoiceOnly
              ? undefined
              : "You can only monitor voice calls",
            showLogout: !readOnly,
            // "Update agent state" is offered for every agent: AirPro agents get
            // the Inactive/Pending-Inactive lifecycle toggle, human agents get a
            // simple Available <-> On Break supervisor override.
            showChangeState: !readOnly,
          };
        }),
    [
      agents,
      agentTypeFilter,
      statusFilter,
      selectedAgentGroups,
      readOnly,
      currentUserAgentId,
    ],
  );

  // Interactions are pre-filtered by Agent Type (Air/Human/All), mirroring the
  // Agent List behavior. Monitor gating per row: voice rows keep their existing
  // behavior; digital rows handled by an AirPro (AI) agent get an ENABLED
  // monitor icon (opens the Interaction preview popup); digital rows handled by
  // a human agent stay voice-only gated with the explanatory tooltip.
  const displayInteractions = useMemo(
    () =>
      interactions
        .filter((it: any) => {
          if (
            agentTypeFilter.length > 0 &&
            !agentTypeFilter.includes(it.agentType)
          ) {
            return false;
          }
          // Queue / State are Interactions-tab filters applied here as row
          // pre-filters (no dedicated column path in the grid for them).
          if (
            selectedQueues.length > 0 &&
            !selectedQueues.includes(it.queueName)
          ) {
            return false;
          }
          if (
            selectedInteractionStates.length > 0 &&
            !selectedInteractionStates.includes(it.conversationState)
          ) {
            return false;
          }
          // Breached SLA toggle: keep only rows past the 10-minute
          // Time in queue SLA (the red band).
          if (breachedSlaOnly && !isSlaBreached(it.timeInQueueMs)) {
            return false;
          }
          return true;
        })
        // showMonitor passes through from makeInteractions() (always true for
        // agent rows). Human digital rows now show the preview eye, so there
        // is no longer a need to suppress it here.
        // AirPro rows rank above human-agent rows by default so supervisors
        // see AI interactions first. The table's column-header sort takes over
        // once the user clicks a column header.
        .sort((a: any, b: any) => {
          const aAir = a.agentType === "Air" ? 0 : 1;
          const bAir = b.agentType === "Air" ? 0 : 1;
          return aAir - bAir;
        }),
    [
      interactions,
      agentTypeFilter,
      selectedQueues,
      selectedInteractionStates,
      breachedSlaOnly,
    ],
  );

  // Supervisor view 2 Interactions rows: pending (queued) conversations merge
  // into the regular list in a "Pending" state, sorted to the top so the
  // unassigned work is impossible to miss. Their hover actions stay the queue
  // set (AI insights / preview / Transfer / Claim).
  const supervisor2Interactions = useMemo(() => {
    if (!isSupervisor2Interactions) return displayInteractions;
    const pending = (includePendingRows ? queueRows : [])
      .filter((q: any) => {
        // Pending rows funnel through the same Interactions filters as the
        // assigned rows. They are unassigned, so any agent-type selection
        // (Air/Human) excludes them by definition.
        if (agentTypeFilter.length > 0) return false;
        // Queue rows carry their queue name in productName.
        if (
          selectedQueues.length > 0 &&
          !selectedQueues.includes(q.productName)
        ) {
          return false;
        }
        if (
          selectedInteractionStates.length > 0 &&
          !selectedInteractionStates.includes(CONVERSATION_STATES.PENDING.key)
        ) {
          return false;
        }
        if (breachedSlaOnly && !isSlaBreached(q.timeInQueueMs)) {
          return false;
        }
        return true;
      })
      .map((q: any) => ({
        ...q,
        conversationState: CONVERSATION_STATES.PENDING.key,
        conversationStateLabel: CONVERSATION_STATES.PENDING.label,
      }));
    // Default order: Pending rows first, then everything else, each group
    // sorted by Time in queue (longest wait first) so the most urgent
    // unassigned work sits at the very top.
    const byTimeInQueue = (a: any, b: any) =>
      (Number(b.timeInQueueMs) || 0) - (Number(a.timeInQueueMs) || 0);
    return [
      ...[...pending].sort(byTimeInQueue),
      ...[...displayInteractions].sort(byTimeInQueue),
    ];
  }, [
    isSupervisor2Interactions,
    includePendingRows,
    queueRows,
    displayInteractions,
    agentTypeFilter,
    selectedQueues,
    selectedInteractionStates,
    breachedSlaOnly,
  ]);

  // When paginating, channel / category / search must be applied BEFORE slicing
  // so that a) every filtered row is reachable via pagination and b) the range
  // indicator ("21–40 of n") reflects the true post-filter count.  Without
  // pagination the grid still applies these filters internally, so we only
  // pre-filter when queuePageSlice is present.
  const matchesQueueGridFilters = useCallback(
    (q: any): boolean => {
      if (selectedChannels.length > 0 && !selectedChannels.includes(q.sourceName)) return false;
      if (selectedCategories.length > 0) {
        const rowIds = String(q.categoryIds ?? "").split(",").filter(Boolean);
        if (!selectedCategories.some((id: string) => rowIds.includes(id))) return false;
      }
      if (searchValue) {
        const s = searchValue.toLowerCase();
        // Mirror DigitalInteractionTable's interactionSearchColIndexes fields.
        const categoryNames = String(q.categoryIds ?? "")
          .split(",")
          .filter(Boolean)
          .map((id: string) => CATEGORIES_MAP[id]?.name ?? "")
          .join(" ");
        const haystack = [
          q.sourceName ?? "",
          q.fullName ?? "",
          q.productName ?? "",
          q.contactIdentity ?? "",
          q.contactIdentityE164 ?? "",
          q.threadTitle ?? "",
          categoryNames,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    },
    [selectedChannels, selectedCategories, searchValue],
  );

  const queueDisplayRows = useMemo(() => {
    // Base pre-filters (queue name + SLA) always run here.
    const baseFiltered = queueRows.filter((q: any) => {
      if (
        selectedQueues.length > 0 &&
        !selectedQueues.includes(q.productName)
      ) {
        return false;
      }
      if (breachedSlaOnly && !isSlaBreached(q.timeInQueueMs)) {
        return false;
      }
      return true;
    });
    if (!queuePageSlice) return baseFiltered;
    // Full pre-filter: also apply channel / category / search so the page
    // slice reflects exactly what the grid would show.
    const fullyFiltered = baseFiltered.filter(matchesQueueGridFilters);
    const { page, pageSize } = queuePageSlice;
    const start = (page - 1) * pageSize;
    return fullyFiltered.slice(start, start + pageSize);
  }, [queueRows, selectedQueues, breachedSlaOnly, queuePageSlice, matchesQueueGridFilters]);

  // Pre-slice count — only meaningful when pagination is active.  Reported
  // upward via onQueueFilteredCount so PaginatedQueuePanel can show an accurate
  // "x–y of n" range indicator and compute page count without having to
  // duplicate the filter logic.
  const queueFilteredTotal = useMemo(() => {
    if (!queuePageSlice) return 0;
    return queueRows.filter((q: any) => {
      if (selectedQueues.length > 0 && !selectedQueues.includes(q.productName)) return false;
      if (breachedSlaOnly && !isSlaBreached(q.timeInQueueMs)) return false;
      return matchesQueueGridFilters(q);
    }).length;
  }, [queueRows, selectedQueues, breachedSlaOnly, queuePageSlice, matchesQueueGridFilters]);

  useEffect(() => {
    if (queuePageSlice) {
      onQueueFilteredCount?.(queueFilteredTotal);
    }
  }, [queueFilteredTotal, queuePageSlice, onQueueFilteredCount]);

  // Interactions pagination (Supervisor (Expected) flow): the grid-level
  // filters (agent, channel, category, search) must be applied BEFORE slicing
  // so every filtered row is reachable via pagination and the range indicator
  // reflects the true post-filter count. Without pagination the grid applies
  // these filters internally, so this path only runs when a slice is set.
  const matchesInteractionGridFilters = useCallback(
    (r: any): boolean => {
      // The grid's agent filter matches on agentId (interactionAgentNameCol).
      if (
        selectedAgentIds.length > 0 &&
        !selectedAgentIds.includes(String(r.agentId ?? ""))
      ) {
        return false;
      }
      return matchesQueueGridFilters(r);
    },
    [selectedAgentIds, matchesQueueGridFilters],
  );

  const interactionsFilteredTotal = useMemo(() => {
    if (!interactionsPageSlice) return 0;
    return supervisor2Interactions.filter(matchesInteractionGridFilters).length;
  }, [supervisor2Interactions, interactionsPageSlice, matchesInteractionGridFilters]);

  const interactionsDisplayRows = useMemo(() => {
    if (!interactionsPageSlice) return supervisor2Interactions;
    const filtered = supervisor2Interactions.filter(
      matchesInteractionGridFilters,
    );
    const { page, pageSize } = interactionsPageSlice;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [supervisor2Interactions, interactionsPageSlice, matchesInteractionGridFilters]);

  useEffect(() => {
    if (interactionsPageSlice) {
      onInteractionsFilteredCount?.(interactionsFilteredTotal);
      // The tab label count should reflect the full filtered set, not the
      // current page (the grid only sees the sliced rows).
      onInteractionCountChange?.(interactionsFilteredTotal);
    }
  }, [
    interactionsFilteredTotal,
    interactionsPageSlice,
    onInteractionsFilteredCount,
    onInteractionCountChange,
  ]);

  const visibleAgentCols = useMemo(() => {
    // No selection provided -> show every column in its native order.
    if (!visibleColumnIds) {
      return agentCols.map((c: any) => ({ ...c, visible: true }));
    }
    // Render columns in the exact order the settings dialog provides, with the
    // Agent (fullName) column always pinned first.
    const byId = new Map(agentCols.map((c: any) => [c.id, c]));
    const orderedIds = visibleColumnIds.includes("fullName")
      ? visibleColumnIds
      : ["fullName", ...visibleColumnIds];
    return orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c: any) => ({ ...c, visible: true }));
  }, [agentCols, visibleColumnIds]);

  const visibleInteractionCols = useMemo(() => {
    // Supervisor view 2 uses its own column set. Visibility AND order come
    // from the settings dialog (when provided): the ids arrive in the user's
    // saved drag order, with the Channel (sourceName) column always pinned
    // first.
    const cols = isSuggestionVariant
      ? suggestionCols
      : isSupervisor3Columns
        ? supervisor3Cols
        : isSupervisor2Interactions
          ? supervisor2Cols
          : interactionCols;
    if (!visibleInteractionColumnIds) {
      return cols.map((c: any) => ({ ...c, visible: true }));
    }
    const orderedIds = visibleInteractionColumnIds.includes("sourceName")
      ? visibleInteractionColumnIds
      : ["sourceName", ...visibleInteractionColumnIds];
    return orderedIds
      .map((id) => cols.find((c: any) => c.id === id))
      .filter(Boolean)
      .map((c: any) => ({ ...c, visible: true }));
  }, [
    isSupervisor2Interactions,
    isSupervisor3Columns,
    supervisor2Cols,
    supervisor3Cols,
    interactionCols,
    visibleInteractionColumnIds,
  ]);

  // Toggle semantics: clicking Monitor on the currently-monitored agent stops
  // monitoring (clears the blue row and closes the monitoring dialpad popup);
  // clicking it on another agent switches the monitoring session — the popup
  // remounts (keyed by agentId) and resets to the listening state.
  const monitorAgentCallback = useCallback(
    (agentId: string) => {
      if (readOnly) return {} as any;
      const a = agents.find((x: any) => x.agentId === agentId);
      const isStopping = monitoredId === agentId;
      setMonitoredId(isStopping ? null : agentId);
      if (isStopping) {
        flashRef.current(`Call ended with ${a?.fullName ?? agentId}.`);
      } else {
        setInsightCtx(null);
      }
      return {} as any;
    },
    [agents, monitoredId, readOnly],
  );

  // Closing the monitoring popup (titlebar close or End call) ends the
  // monitoring session and clears the monitored-row highlight.
  const stopMonitoring = useCallback(() => {
    setMonitoredId((cur) => {
      if (cur) {
        const a = agents.find((x: any) => x.agentId === cur);
        flashRef.current(`Call ended with ${a?.fullName ?? cur}.`);
      }
      return null;
    });
    setMonitoredEngagementId(null);
  }, [agents]);

  // Takeover transfers ownership to the persisted active-call store. Clear the
  // source selection without showing an "ended" toast so ending/handing off
  // the owned call cannot reveal the old monitoring window again.
  const releaseMonitoringForTakeover = useCallback(() => {
    setMonitoredId(null);
    setMonitoredEngagementId(null);
  }, []);

  useEffect(() => {
    if (activeTab === "Interactions") return; // grid reports its own count
    onInteractionCountChange?.(supervisor2Interactions.length);
  }, [activeTab, supervisor2Interactions, onInteractionCountChange]);

  const monitoredAgentRow = useMemo(
    () =>
      monitoredId
        ? (agents.find((x: any) => x.agentId === monitoredId) as any) ?? null
        : null,
    [agents, monitoredId],
  );

  // Context tab data for the voice monitoring window. Keyed off the monitored
  // engagement (or a stable per-agent voice id when monitoring started from
  // the Agents tab) so hop timers and chips stay stable while the window is
  // open and runtime hops (take over / transfer) accumulate per engagement.
  const monitoredContextEngagementId = monitoredAgentRow
    ? monitoredEngagementId ?? `eng-${monitoredAgentRow.agentId}-voice`
    : null;
  const monitoredContextData = useMemo(
    () =>
      monitoredAgentRow && monitoredContextEngagementId
        ? makeInteractionPreview({
            engagementId: monitoredContextEngagementId,
            fullName: monitoredAgentRow.fullName,
            agentType: monitoredAgentRow.agentType,
            sourceType: "VOICE",
            sourceName: "Voice",
          })
        : null,
    [monitoredAgentRow, monitoredContextEngagementId],
  );
  const monitoredContextHops = useContextHops(monitoredContextEngagementId);

  const onLogOut = useCallback(
    (agentId: string) => {
      const a = agents.find((x: any) => x.agentId === agentId);
      setAgents((prev: any[]) => prev.filter((x) => x.agentId !== agentId));
      setMonitoredId((cur) => (cur === agentId ? null : cur));
      flash(`Logged out ${a?.fullName ?? agentId}`);
    },
    [agents],
  );

  // The "Update agent state" menu action opens the Figma state-picker modal
  // (instead of toggling inline). The supervisor chooses a state and applies it
  // on Update, which shows the green success toast from the design.
  const changeAgentState = useCallback(
    (agentId: string) => {
      openModal("agent-state", agentId);
    },
    [openModal],
  );

  // Drains an AirPro agent that still has in-flight work: it sits in Pending
  // Inactive until its interactions finish, then flips to Inactive (off).
  const scheduleDrain = useCallback((agentId: string, fullName: string) => {
    window.setTimeout(() => {
      setAgents((prev: any[]) =>
        prev.map((a) =>
          a.agentId === agentId
            ? {
                ...a,
                agentState: "Inactive",
                agentStateLabel: "Inactive",
                agentBaseState: "INACTIVE",
                status: "Inactive",
                activeInteractions: [],
                activeInteractionsSearchCols: [],
              }
            : a,
        ),
      );
      flash(`${fullName} is now Inactive`);
    }, 3000);
  }, []);

  const applyAgentState = useCallback(
    (option: AgentStateOption) => {
      const id = stateModalAgentId;
      if (!id) return;
      const agent = agents.find((a: any) => a.agentId === id) as any;
      closeModal();

      const showSuccess = () => {
        setSuccessToast("The agent's state has been updated successfully.");
        window.clearTimeout((applyAgentState as any)._t);
        (applyAgentState as any)._t = window.setTimeout(
          () => setSuccessToast(null),
          4000,
        );
      };

      // AirPro agents being switched off (Inactive) drain their in-flight work
      // through Pending Inactive first; idle ones go straight to Inactive.
      if (agent?.agentType === "Air" && option.key === "INACTIVE") {
        const hasWork =
          agent.agentBaseState === "ENGAGED" ||
          (agent.activeInteractions?.length ?? 0) > 0;
        if (hasWork) {
          setAgents((prev: any[]) =>
            prev.map((a) =>
              a.agentId === id
                ? {
                    ...a,
                    agentState: "Pending Inactive",
                    agentStateLabel: "Pending Inactive",
                    agentBaseState: "PENDING-INACTIVE",
                    status: "Active",
                  }
                : a,
            ),
          );
          scheduleDrain(id, agent.fullName);
          showSuccess();
          return;
        }
        setAgents((prev: any[]) =>
          prev.map((a) =>
            a.agentId === id
              ? {
                  ...a,
                  agentState: "Inactive",
                  agentStateLabel: "Inactive",
                  agentBaseState: "INACTIVE",
                  status: "Inactive",
                  activeInteractions: [],
                  activeInteractionsSearchCols: [],
                }
              : a,
          ),
        );
        showSuccess();
        return;
      }

      // Everyone else (humans, or AirPro going Available) takes the chosen
      // state directly. AirPro agents stay Active when given a non-off state.
      setAgents((prev: any[]) =>
        prev.map((a) =>
          a.agentId === id
            ? {
                ...a,
                agentState: option.label,
                agentStateLabel: option.label,
                agentBaseState: option.key,
                status: a.agentType === "Air" ? "Active" : a.status,
              }
            : a,
        ),
      );
      showSuccess();
    },
    [stateModalAgentId, agents, scheduleDrain, closeModal],
  );

  // "AI insights" action on an interaction row -> open the AI Insights sidebar
  // with that interaction's context (handling agent + voice/digital channel).
  const viewInsightCallback = useCallback(
    (_agentId: string, uii: string) => {
      const row = interactions.find((r: any) => r.engagementId === uii) as any;
      if (row) {
        setInsightCtx({
          agentName: row.fullName ?? "Agent",
          isVoice: Boolean(row.isVoiceInteraction),
          engagementId: uii,
          agentType: row.agentType,
        });
        return;
      }
      // Queue rows: nobody is handling the interaction yet, so the panel
      // opens in its queue variant (Notes + IVR transcript only). The IVR is
      // the "agent side" of any pre-handling transcript.
      const qRow = queueRows.find((r: any) => r.engagementId === uii) as any;
      if (qRow) {
        setInsightCtx({
          agentName: "IVR",
          isVoice: Boolean(qRow.isVoiceInteraction),
          engagementId: uii,
          isQueue: true,
        });
      }
    },
    [interactions, queueRows],
  );

  // Claim / Transfer on a queue row: either way the interaction leaves the
  // queue (claimed by you, or handed to another agent/queue).
  const queueActionCallback = useCallback(
    (_agentId: string, type?: string, uii?: string) => {
      // Digital queue rows with a pre-queue IVR transcript open the
      // Interaction preview popup (URL-driven, same as the Interactions tab).
      if (type === "queuePreview") {
        if (uii) onPreviewOpen?.(uii);
        return;
      }
      // 3-dot menu actions on pending rows.
      if (type === "queueRemove") {
        // Show a confirmation dialog before removing the row.
        const row = queueRows.find((r: any) => r.engagementId === uii) as any;
        if (!row) return;
        setRemoveConfirmRow({
          agentId: _agentId,
          engagementId: uii ?? "",
          contactIdentity: row.contactIdentity ?? "this conversation",
        });
        return;
      }
      if (type === "queueRequeue") {
        // Voice rows pick a destination queue in a dialog (same pattern as
        // the queue-transfer dialog) instead of requeueing immediately.
        if (uii) openModal("queue-requeue", undefined, uii);
        return;
      }
      if (type === "queueRecategorize") {
        const row = queueRows.find((r: any) => r.engagementId === uii) as any;
        if (uii && row) setRecategorizeRowId(uii);
        return;
      }
      // Transfer: voice rows open the phone-call modal with the Transfer
      // sheet already up; digital rows keep the Transfer message dialog.
      if (type === "queueTransfer") {
        const row = queueRows.find((r: any) => r.engagementId === uii) as any;
        if (row?.isVoiceInteraction) {
          if (uii) {
            setVoicePreviewInitialSheet("transfer");
            onPreviewOpen?.(uii);
          }
          return;
        }
        if (uii) openModal("queue-transfer", undefined, uii);
        return;
      }
      if (type !== "queueClaim") return;
      const claimRow = queueRows.find(
        (r: any) => r.engagementId === uii,
      ) as any;
      // Claiming a voice call answers it: register the app-wide active call
      // (connected phone window + Active calls details screen).
      if (claimRow?.isVoiceInteraction && uii) {
        removeQueueRow(uii);
        setInsightCtx((ctx) => (ctx?.engagementId === uii ? null : ctx));
        startActivePreviewCall({
          number: claimRow.contactIdentity || "Unknown number",
          queueName: claimRow.queueName || "Voice queue",
          engagementId: uii,
          origin: "preview",
          detailsPath: "/active-call/preview",
          agentId: "preview",
          agentName: "Agent",
          agentType: "Human",
        });
        onVoicePreviewAccepted?.();
        return;
      }
      const row = removeQueueRow(uii ?? "");
      if (!row) return;
      setInsightCtx((ctx) =>
        ctx?.engagementId === uii ? null : ctx,
      );
      flashRef.current(
        `You claimed the conversation with ${row.contactIdentity}`,
      );
      // Digital queue claim: the conversation moves to the Active messages
      // tab. The removed row is kept so the take-over view can render it.
      // Voice queue claims keep their existing behavior.
      if (!(row as any).isVoiceInteraction) {
        registerClaimedQueueRow(row as any);
        registerClaimedDigital(row.engagementId);
        appendContextHop(row.engagementId, { kind: "you" });
        onDigitalTakeOverCommitted?.(row.engagementId);
      }
    },
    [
      onPreviewOpen,
      queueRows,
      openModal,
      onVoicePreviewAccepted,
      onDigitalTakeOverCommitted,
    ],
  );

  // Queue row backing the open ?modal=queue-transfer dialog. A stale deep
  // link (row already claimed/transferred) self-heals by closing the dialog.
  const queueTransferRow = useMemo(
    () =>
      queueTransferEngagementId
        ? (queueRows.find(
            (r: any) => r.engagementId === queueTransferEngagementId,
          ) as any) ?? null
        : null,
    [queueTransferEngagementId, queueRows],
  );
  useEffect(() => {
    if (queueTransferEngagementId && !queueTransferRow) {
      closeModal({ replace: true });
    }
  }, [queueTransferEngagementId, queueTransferRow, closeModal]);

  // Queue row backing the open ?modal=queue-requeue dialog; stale deep links
  // and non-voice targets (requeue is voice-only) self-heal by closing the
  // dialog.
  const queueRequeueRow = useMemo(() => {
    if (!queueRequeueEngagementId) return null;
    const row = queueRows.find(
      (r: any) => r.engagementId === queueRequeueEngagementId,
    ) as any;
    return row?.isVoiceInteraction ? row : null;
  }, [queueRequeueEngagementId, queueRows]);
  useEffect(() => {
    if (modalParam === "queue-requeue" && !queueRequeueRow) {
      closeModal({ replace: true });
    }
  }, [modalParam, queueRequeueRow, closeModal]);

  // Requeue confirmed from the queue-row dialog: the call goes to the back of
  // the chosen queue, the hop log records the destination, and a toast
  // confirms.
  const handleQueueRequeue = useCallback(
    (result: RequeueDialerResult) => {
      const uii = queueRequeueEngagementId ?? "";
      closeModal();
      // Defensive re-check: requeue is voice-only.
      const target = queueRows.find(
        (r: any) => r.engagementId === uii,
      ) as any;
      if (!target?.isVoiceInteraction) return;
      const row = requeueRow(uii);
      if (!row) return;
      appendContextHop(uii, { kind: "queue", name: result.queueName });
      const skillNote = result.skillName ? ` (${result.skillName})` : "";
      flashRef.current(
        result.askFirst
          ? `Ask first sent — call from ${row.contactIdentity} will move to ${result.queueName}${skillNote} once accepted`
          : `Call from ${row.contactIdentity} requeued to ${result.queueName}${skillNote}`,
      );
    },
    [queueRequeueEngagementId, closeModal, queueRows],
  );

  // Transfer confirmed from the queue-row dialog: the interaction leaves the
  // queue, the hop log records each chosen destination, and a toast confirms.
  const handleQueueTransfer = useCallback(
    (_summary: string, destination: { queues: string[]; agents: string[] }) => {
      const uii = queueTransferEngagementId ?? "";
      closeModal();
      const row = removeQueueRow(uii);
      if (!row) return;
      setInsightCtx((ctx) => (ctx?.engagementId === uii ? null : ctx));
      destination.queues.forEach((name) =>
        appendContextHop(uii, { kind: "queue", name }),
      );
      destination.agents.forEach((name) =>
        appendContextHop(uii, { kind: "agent", name }),
      );
      const dest = [...destination.queues, ...destination.agents].join(", ");
      flashRef.current(
        `Conversation with ${row.contactIdentity} transferred to ${dest}`,
      );
    },
    [queueTransferEngagementId, closeModal],
  );

  // Row-level hover actions on an interaction. The legacy "barge-in" trigger
  // must NOT fire an instant barge — it routes through the single combined
  // Pause-&-Barge flow: open the AI Insights panel for that interaction, then
  // the confirm modal. This keeps "take over" as one action that can't be
  // bypassed, for both voice and digital.
  //
  // Voice Monitor and Whisper (coach) route through the same monitoring
  // dialpad used on the Agents tab, keyed to the interaction's agent, with
  // the row highlighted for as long as that dialpad is open. Digital Monitor
  // keeps its current toast-only preview (a real digital monitoring/take-over
  // experience is separate follow-up work).
  const monitorInteractionCallback = useCallback(
    (agentId: string, type?: string, uii?: string) => {
      if (readOnly) return;
      const row = interactions.find(
        (r: any) => r.engagementId === uii,
      ) as any;

      if (type === "bargeIn") {
        // Digital claim: the conversation moves to the Active messages tab
        // (register + route) instead of opening the AI Insights panel here.
        if (row && !row.isVoiceInteraction && uii) {
          setBargedId(uii);
          appendContextHop(uii, { kind: "you" });
          registerClaimedDigital(uii);
          flashRef.current(
            `You've claimed the conversation from ${row.fullName ?? "Agent"}`,
          );
          onDigitalTakeOverCommitted?.(uii);
          return;
        }
        // Voice take over is immediate — no confirmation modal. Open the AI
        // Insights panel onto this interaction and mark it taken over.
        setInsightCtx({
          agentName: row?.fullName ?? "Agent",
          isVoice: Boolean(row?.isVoiceInteraction),
          engagementId: uii ?? "",
          agentType: row?.agentType,
        });
        setBargedId(uii ?? "");
        flashRef.current(`You've claimed the conversation from ${row?.fullName ?? "Agent"}`);
        return;
      }

      // Voice preview (eye) — toggle the URL-driven preview-call window,
      // same toggle semantics as the digital Interaction preview.
      if (type === "voicePreview" && row?.isVoiceInteraction) {
        if (
          previewEngagementId === row.engagementId &&
          previewMode !== "takeover"
        ) {
          onPreviewClose?.();
        } else {
          onPreviewOpen?.(row.engagementId);
        }
        return;
      }

      if (row?.isVoiceInteraction && (type === "monitor" || type === "coach")) {
        const isStopping =
          monitoredId === agentId && monitoredEngagementId === uii;
        if (isStopping) {
          setMonitoredId(null);
          setMonitoredEngagementId(null);
          flashRef.current(`Call ended with ${row?.fullName ?? agentId}.`);
        } else {
          setInsightCtx(null);
          setMonitoredId(agentId);
          setMonitoredEngagementId(uii ?? null);
        }
        return;
      }

      // Digital conversation (any agent type) -> toggle the Interaction
      // preview popup in listening mode (URL-driven). Clicking Monitor again
      // while previewing stops (closes) it — same toggle semantics as voice.
      if (
        type === "monitor" &&
        row &&
        !row.isVoiceInteraction
      ) {
        if (
          previewEngagementId === row.engagementId &&
          previewMode !== "takeover"
        ) {
          onPreviewClose?.();
        } else {
          onPreviewOpen?.(row.engagementId);
        }
        return;
      }

      flashRef.current(
        type === "coach"
          ? "Coaching started"
          : type === "join"
            ? "Joined conversation"
            : "Monitoring interaction",
      );
    },
    [
      interactions,
      monitoredId,
      monitoredEngagementId,
      previewEngagementId,
      previewMode,
      onPreviewOpen,
      onPreviewClose,
      readOnly,
    ],
  );

  // Supervisor view 2 Interactions: the merged table carries both regular
  // interactions and pending queue rows — route each row's hover actions to
  // the right handler.
  const mergedInteractionCallback = useCallback(
    (agentId: string, type?: string, uii?: string) => {
      if (
        type === "queuePreview" ||
        type === "queueClaim" ||
        type === "queueTransfer" ||
        type === "queueRemove" ||
        type === "queueRequeue" ||
        type === "queueRecategorize"
      ) {
        queueActionCallback(agentId, type, uii);
        return;
      }
      monitorInteractionCallback(agentId, type, uii);
    },
    [queueActionCallback, monitorInteractionCallback],
  );

  // 'AI' for Air (AI) agents, 'agent' for human agents — used in the
  // active-takeover banner wording.
  const takeoverSubject = insightCtx?.agentType === "Air" ? "AI" : "agent";
  const isBarged = Boolean(insightCtx && bargedId === insightCtx.engagementId);

  // Transfer = hand the interaction off. Voice interactions open the dialer's
  // transfer workflow ("Ask first" warm / blind transfer); digital interactions
  // open the "Reassign conversation" modal to pick a new agent.
  const handleTransfer = useCallback(() => {
    if (!insightCtx || readOnly) return;
    if (insightCtx.isVoice) openModal("transfer");
    else openModal("reassign");
  }, [insightCtx, readOnly, openModal]);

  // Agents available to receive a reassigned conversation.
  const reassignAgents = useMemo(
    () =>
      (agents as any[]).map((a) => ({
        id: String(a.agentId),
        name: a.fullName as string,
      })),
    [agents],
  );

  // Take over immediately marks this engagement as taken over (the AI/agent
  // moves on to its next conversation) and surfaces a confirmation toast — no
  // confirmation modal, no identity choice, and no hand back afterward.
  const handleTakeOver = useCallback(() => {
    if (!insightCtx || readOnly) return;
    setBargedId(insightCtx.engagementId);
    appendContextHop(insightCtx.engagementId, { kind: "you" });
    flashRef.current(`You've claimed the conversation from ${insightCtx.agentName}`);
    // Digital claim from the AI Insights panel: close the panel and move the
    // conversation to the Active messages tab. Voice keeps its existing flow
    // (the monitoring window drives the Active calls hand-off).
    if (!insightCtx.isVoice) {
      registerClaimedDigital(insightCtx.engagementId);
      setInsightCtx(null);
      onDigitalTakeOverCommitted?.(insightCtx.engagementId);
    }
  }, [insightCtx, readOnly, onDigitalTakeOverCommitted]);

  // The rollup modal renders centered, so only the agent id needs to travel
  // through the URL (?modal=rollup&agentId=...).
  const onInteractionRollupClick = useCallback(
    (_e: any, agentId: string) => {
      openModal("rollup", agentId);
    },
    [openModal],
  );

  // Clicking the icons in the Agents tab "Active interactions" column jumps to
  // the Interactions tab and blinks that agent's interaction rows. (The rollup
  // number column keeps its own onInteractionRollupClick popover.)
  const onActiveInteractionsIconClick = useCallback(
    (_e: any, agentId: string) => {
      onActiveInteractionsClick?.(agentId);
    },
    [onActiveInteractionsClick],
  );

  const rollupAgent = rollupAgentId
    ? (agents.find((x: any) => x.agentId === rollupAgentId) as any) ?? null
    : null;

  const stateModalAgent = stateModalAgentId
    ? (agents.find((x: any) => x.agentId === stateModalAgentId) as any) ?? null
    : null;

  // Deep link names an agent that doesn't exist (stale id, logged out) ->
  // close the dialog and restore a clean URL.
  useEffect(() => {
    if (
      (rollupAgentId && !rollupAgent) ||
      (stateModalAgentId && !stateModalAgent) ||
      ((modalParam === "rollup" || modalParam === "agent-state") &&
        !modalAgentIdParam)
    ) {
      closeModal({ replace: true });
    }
  }, [
    rollupAgentId,
    rollupAgent,
    stateModalAgentId,
    stateModalAgent,
    modalParam,
    modalAgentIdParam,
    closeModal,
  ]);

  // Live row backing the open AI Insights panel, so its Sentiment / Confidence
  // track the same (drifting) scores shown in the table for that interaction.
  const insightRow = insightCtx
    ? ((interactions.find(
        (r: any) => r.engagementId === insightCtx.engagementId,
      ) ??
        queueRows.find(
          (r: any) => r.engagementId === insightCtx.engagementId,
        )) as any)
    : null;

  // Monitor gating for the open AI Insights panel mirrors the table's hover
  // Monitor icon exactly: voice rows and digital rows handled by an AirPro
  // (AI) agent are enabled (dialpad / interaction preview); digital rows
  // handled by a human agent render the button DISABLED with the same
  // explanatory tooltip the table uses.
  const insightMonitorEnabled = Boolean(
    insightRow &&
      (insightRow.isVoiceInteraction || insightRow.agentType === "Air"),
  );
  // "Monitoring" is active for a voice monitoring session OR while the digital
  // Interaction preview is open in a listening mode for this engagement.
  const insightIsMonitoring = Boolean(
    insightCtx &&
      insightRow &&
      ((monitoredId === insightRow.agentId &&
        monitoredEngagementId === insightCtx.engagementId) ||
        (previewEngagementId === insightCtx.engagementId &&
          previewMode !== "takeover")),
  );
  const handleInsightMonitor = useCallback(() => {
    if (!insightCtx || !insightRow) return;
    monitorInteractionCallback(
      insightRow.agentId,
      "monitor",
      insightCtx.engagementId,
    );
  }, [insightCtx, insightRow, monitorInteractionCallback]);

  // Interaction row backing the digital "Interaction preview" popup (URL-driven).
  const previewRow = previewEngagementId
    ? ((interactions.find(
        (r: any) => r.engagementId === previewEngagementId,
      ) ??
        queueRows.find(
          (r: any) =>
            r.engagementId === previewEngagementId && r.hasPreview,
        ) ??
        // Claimed queue rows leave the queue store — the claimed copy backs
        // the Active messages take-over view.
        getClaimedQueueRow(previewEngagementId)) as any)
    : null;
  const recategorizeRow = recategorizeRowId
    ? ((interactions.find(
        (row: any) => row.engagementId === recategorizeRowId,
      ) ??
        queueRows.find(
          (row: any) => row.engagementId === recategorizeRowId,
        )) as any)
    : null;
  useEffect(() => {
    if (
      recategorizeOpen &&
      (!previewRow || previewRow.isVoiceInteraction)
    ) {
      setRecategorizeOpen(false);
    }
    if (
      recategorizeRowId &&
      (!recategorizeRow || recategorizeRow.isVoiceInteraction)
    ) {
      setRecategorizeRowId(null);
    }
  }, [
    previewRow,
    recategorizeOpen,
    recategorizeRow,
    recategorizeRowId,
    setRecategorizeOpen,
    setRecategorizeRowId,
  ]);

  // Claimed digital conversations backing the Active messages list panel.
  const claimedDigitalIds = useClaimedDigitalIds();
  const claimedRows = useMemo(
    () =>
      (claimedDigitalIds
        .map(
          (id) =>
            interactions.find((r: any) => r.engagementId === id) ??
            queueRows.find((r: any) => r.engagementId === id) ??
            getClaimedQueueRow(id),
        )
        .filter(Boolean) as any[]).map((row: any) => ({
        // The card's second line must match the thread header's subject
        // used across the system (the preview subject), not the raw
        // table threadTitle.
        ...row,
        threadTitle: (row.isQueueRow
          ? makeQueuePreview(row)
          : makeInteractionPreview(row)
        ).subject,
      })),
    [claimedDigitalIds, interactions, queueRows],
  );

  // Deep link points at an engagement that doesn't exist -> restore the table URL.
  useEffect(() => {
    if (previewEngagementId && !previewRow) onPreviewClose?.();
  }, [previewEngagementId, previewRow, onPreviewClose]);

  // Digital category overrides stay live across preview/take-over remounts.
  const categoryOverrides = useCategoryOverrides();
  const previewData = useMemo(() => {
    if (!previewRow) return null;
    const base = previewRow.isQueueRow
      ? makeQueuePreview(previewRow)
      : makeInteractionPreview(previewRow);
    const override = categoryOverrides[previewRow.engagementId];
    return override
      ? {
          ...base,
          tags: override.map((category) => ({
            label: category.label,
            bg: category.bg,
            color: category.color,
          })),
        }
      : base;
  }, [previewRow, categoryOverrides]);
  const previewContextHops = useContextHops(
    previewData?.engagementId ?? null,
  );

  // Answered voice preview call (app-wide store): the phone window stays up
  // in its connected state after Answer, independent of the preview URL.
  const activePreviewCall = useActivePreviewCall();
  const activeCallRow = activePreviewCall
    ? ((interactions.find(
        (r: any) => r.engagementId === activePreviewCall.engagementId,
      ) ??
        queueRows.find(
          (r: any) => r.engagementId === activePreviewCall.engagementId,
        )) as any)
    : null;
  const activeCallContextData = useMemo(
    () =>
      activeCallRow
        ? activeCallRow.isQueueRow
          ? makeQueuePreview(activeCallRow)
          : makeInteractionPreview(activeCallRow)
        : null,
    [activeCallRow],
  );
  const activeCallHops = useContextHops(
    activePreviewCall?.engagementId ?? null,
  );

  // Queue-row Transfer on a voice call opens the phone window with the
  // Transfer sheet already up (cleared once the window closes).
  const [voicePreviewInitialSheet, setVoicePreviewInitialSheet] = useState<
    "transfer" | null
  >(null);

  // Take over availability tracks the AI agent's lifecycle: a draining agent
  // (Pending Inactive) can't accept a take-over hand-off.
  const previewAgent = previewRow
    ? (agents.find((a: any) => a.agentId === previewRow.agentId) as any)
    : null;
  const previewAgentPendingInactive = Boolean(
    previewAgent &&
      (previewAgent.agentBaseState === "PENDING-INACTIVE" ||
        previewAgent.agentBaseState === "PENDING_INACTIVE" ||
        previewAgent.agentState === "Pending Inactive"),
  );

  // Take over from the Interaction preview mirrors the AI Insights panel's
  // Take over: immediately mark the engagement as taken over (toast included)
  // and switch the preview to the embedded take-over view.
  const handlePreviewTakeOver = useCallback(() => {
    if (!previewRow || readOnly) return;
    const id = previewRow.engagementId;
    if (bargedId !== id) {
      setBargedId(id);
      appendContextHop(id, { kind: "you" });
      flashRef.current(
        previewRow.isQueueRow
          ? "You've claimed this conversation"
          : `You've claimed the conversation from ${previewRow.fullName ?? "Agent"}`,
      );
    }
    // Claiming a pending (queue) row pulls it out of the queue — same as the
    // row-level Claim action — and keeps a copy for the take-over view.
    if (previewRow.isQueueRow) {
      const removed = removeQueueRow(id);
      registerClaimedQueueRow((removed ?? previewRow) as any);
    }
    // Claimed digital conversations feed the "Active messages (n)" top tab.
    registerClaimedDigital(id);
    // Every digital claim lands on the Active messages tab, no matter which
    // surface it started from (preview popup, queue preview, expanded view).
    if (!previewRow.isVoiceInteraction && onDigitalTakeOverCommitted) {
      onDigitalTakeOverCommitted(id);
    } else {
      onPreviewModeChange?.("takeover");
    }
  }, [
    previewRow,
    bargedId,
    onPreviewModeChange,
    onDigitalTakeOverCommitted,
    readOnly,
  ]);

  return (
    <RcThemeProvider>
      <ThemeProvider theme={theme as any}>
        <PanelScope $readOnly={readOnly}>
          {previewRow &&
          !previewRow.isVoiceInteraction &&
          recategorizeOpen ? (
            <RecategorizeDialog
              current={previewData?.tags ?? []}
              onCancel={() => setRecategorizeOpen(false)}
              onSave={(categories) => {
                setConversationCategories(previewRow.engagementId, categories);
                setRecategorizeOpen(false);
                flashRef.current("Categories updated");
              }}
            />
          ) : recategorizeRow &&
            !recategorizeRow.isVoiceInteraction &&
            recategorizeRowId ? (
            <RecategorizeDialog
              current={(() => {
                const override = categoryOverrides[recategorizeRowId];
                if (override) return override;
                const ids = String(recategorizeRow.categoryIds ?? "")
                  .split(",")
                  .map((id: string) => id.trim())
                  .filter(Boolean);
                const names = ids
                  .map((id: string) => CATEGORIES_MAP[id]?.name)
                  .filter(Boolean) as string[];
                return CONVERSATION_CATEGORIES.filter((category) =>
                  names.includes(category.label),
                );
              })()}
              onCancel={() => setRecategorizeRowId(null)}
              onSave={(categories) => {
                setConversationCategories(recategorizeRowId, categories);
                setRecategorizeRowId(null);
                flashRef.current("Categories updated");
              }}
            />
          ) : null}
          {activeMessagesMode && previewRow && endMessageOpen ? (
            <EndMessageDialog
              onCancel={() => setEndMessageOpen(false)}
              onSubmit={() => {
                const id = previewRow.engagementId;
                setEndMessageOpen(false);
                removeClaimedDigital(id);
                flashRef.current("Message ended and disposition submitted");
                onPreviewClose?.();
              }}
            />
          ) : null}
          {previewRow && previewData && previewMode === "takeover" ? (
            // Take-over renders embedded in place of the table. On the Active
            // messages tab it also gets the claimed-conversation list on the
            // left (mirrors the RingCX agent UI's digital-queue panel).
            <div className="flex h-full min-h-0 flex-1">
              {activeMessagesMode ? (
                <ActiveMessagesSidebar
                  rows={claimedRows}
                  selectedId={previewRow.engagementId}
                  onSelect={(id) => onDigitalTakeOverCommitted?.(id)}
                  onTransfer={(id) => {
                    if (id !== previewRow.engagementId) {
                      onDigitalTakeOverCommitted?.(id);
                    }
                    setTransferSignal((v) => v + 1);
                  }}
                  onDone={(id) => {
                    if (id !== previewRow.engagementId) {
                      onDigitalTakeOverCommitted?.(id);
                    }
                    setEndMessageOpen(true);
                  }}
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                {activeMessagesMode ? (
                  <div className="shrink-0 border-b border-[#0000001a] bg-white px-4 py-3">
                    <span className="font-['Roboto',sans-serif] text-[14px] text-[#121212]">
                      Messages
                    </span>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <InteractionPreview
                  mode="takeover"
                  data={previewData}
                  contextHops={previewContextHops}
                  takeOverDisabled={previewAgentPendingInactive}
                  hideTiming={activeMessagesMode}
                  onClose={() => onPreviewClose?.()}
                  onEnlarge={() => onPreviewModeChange?.("expanded")}
                  onTakeOver={handlePreviewTakeOver}
                   onRecategorize={
                     previewRow.isVoiceInteraction
                       ? undefined
                       : () => setRecategorizeOpen(true)
                   }
                  onEndMessage={
                    activeMessagesMode
                      ? () => setEndMessageOpen(true)
                      : undefined
                  }
                  transferSignal={activeMessagesMode ? transferSignal : 0}
                />
                </div>
              </div>
            </div>
          ) : activeTab === "Queue" ? (
            // Queue tab: the same Interactions table, restricted to pending
            // (Waiting) rows. Agent-side cells render blank — no agent has
            // picked the interaction up yet — and there are no monitoring,
            // insights, or take-over affordances.
            <DigitalInteractionTable
              columns={
                (visibleQueueColumnIds
                  ? // Settings-driven: render exactly the chosen ids in the
                    // saved order (visibility + drag order from the dialog).
                    (visibleQueueColumnIds
                      .map((id) =>
                        (useMyQueuesColumns ? myQueuesCols : queueCols).find(
                          (c: any) => c.id === id,
                        ),
                      )
                      .filter(Boolean) as any[])
                  : (useMyQueuesColumns ? myQueuesCols : queueCols).filter(
                      (c: any) => c.visible !== false,
                    )) as any
              }
              digitalTaskList={queueDisplayRows as any}
              monitorAgentCallback={queueActionCallback as any}
              monitoredAgent={{ monitoredAgentId: "", uii: "" } as any}
              viewInsight={viewInsightCallback}
              loggedInAgentId={"supervisor"}
              selectedIds={[]}
              // When paginating, rows are already fully pre-filtered before the
              // page slice; passing the same filter props again would hide rows
              // that survived the pre-filter but whose field value has a false
              // partial match inside the grid's internal filtration.
              selectedChannels={queuePageSlice ? [] : selectedChannels}
              selectedCategories={queuePageSlice ? [] : selectedCategories}
              searchValue={queuePageSlice ? "" : searchValue}
              selectedEngagementId={insightCtx?.engagementId ?? null}
              shouldShowViewInsightsButton={!hideQueueViewInsights}
              hideQueueTransferAndMore={hideQueueTransferAndMore}
              queueClaimLabel={queueClaimLabel}
              categoryOverrides={categoryOverrides}
              AgentSvc={{ digitalAgentEnabled: true } as any}
              FeatureFlagsSvc={{ featureFlags: {} } as any}
              aiNotesFeatures={[] as any}
            />
          ) : activeTab === "Interactions" ? (
            <DigitalInteractionTable
              columns={visibleInteractionCols as any}
              digitalTaskList={interactionsDisplayRows as any}
              hasActiveFilters={
                agentTypeFilter.length > 0 ||
                selectedQueues.length > 0 ||
                selectedInteractionStates.length > 0 ||
                breachedSlaOnly
              }
              monitorAgentCallback={mergedInteractionCallback}
              monitoredAgent={
                {
                  // Voice monitoring (dialpad) takes precedence; otherwise an
                  // open digital Interaction preview highlights its row.
                  monitoredAgentId: monitoredId ?? previewRow?.agentId ?? "",
                  uii: monitoredEngagementId ?? previewEngagementId ?? "",
                } as any
              }
              viewInsight={viewInsightCallback}
              loggedInAgentId={"supervisor"}
              // When paginating, rows are already fully pre-filtered before
              // the page slice; passing the same filter props again would
              // double-filter the visible page.
              selectedIds={interactionsPageSlice ? [] : selectedAgentIds}
              selectedChannels={interactionsPageSlice ? [] : selectedChannels}
              selectedCategories={
                interactionsPageSlice ? [] : selectedCategories
              }
              searchValue={interactionsPageSlice ? "" : searchValue}
              onFilteredCountChange={
                // With a page slice the grid only sees one page — the true
                // filtered count is reported via the effect above instead.
                interactionsPageSlice ? undefined : onInteractionCountChange
              }
              highlightAgentId={highlightAgentId}
              highlightNonce={highlightNonce}
              selectedEngagementId={insightCtx?.engagementId ?? null}
              shouldShowViewInsightsButton={!readOnly}
              hideQueueTransferAndMore={hideQueueTransferAndMore}
              queueClaimLabel={queueClaimLabel}
              hideInteractionPreview={hideInteractionPreview}
              categoryOverrides={categoryOverrides}
              AgentSvc={{ digitalAgentEnabled: true } as any}
              FeatureFlagsSvc={{ featureFlags: {} } as any}
              aiNotesFeatures={[] as any}
            />
          ) : (
            <SupervisorAgentList
              agentList={displayAgents as any}
              hasActiveFilters={
                agentTypeFilter.length > 0 ||
                statusFilter !== "All" ||
                selectedAgentGroups.length > 0
              }
              columns={visibleAgentCols as any}
              onInteractionsClick={onActiveInteractionsIconClick}
              onInteractionRollupClick={onInteractionRollupClick}
              callTotalsLoading={false}
              loggedInAgentId={"supervisor"}
              onLogOut={onLogOut}
              monitorAgentCallback={monitorAgentCallback}
              monitoredAgent={
                { monitoredAgentId: monitoredId ?? "", uii: "" } as any
              }
              selectedChannels={selectedChannels}
              selectedStates={selectedStates}
              searchValue={searchValue}
              changeAgentState={changeAgentState}
            />
          )}

          {insightCtx && (
            <AiInsightsPanel
              agentName={insightCtx.agentName}
              isVoice={insightCtx.isVoice}
              sentimentScore={insightRow?.sentimentScore ?? null}
              confidenceScore={insightRow?.confidenceScore ?? null}
              isBarged={isBarged}
              takeoverSubject={takeoverSubject}
              onTransfer={handleTransfer}
              onTakeOver={handleTakeOver}
              onMonitor={handleInsightMonitor}
              monitorDisabled={!insightMonitorEnabled}
              monitorDisabledTooltip={
                insightMonitorEnabled
                  ? undefined
                  : "You can only monitor voice calls"
              }
              isMonitoring={insightIsMonitoring}
              variant={insightCtx.isQueue ? "queue" : undefined}
              isAiAgent={insightCtx.agentType === "Air"}
              onClose={() => setInsightCtx(null)}
            />
          )}
        </PanelScope>

        {/* Voice interaction already Active: an agent is on the call.
            MonitoringCallWindow branches internally on agentType:
            Human → Whisper/Barge-only layout with status chip (no Claim/Transfer/Requeue).
            AI → full Listen/Coach/Barge/Claim/Transfer/Requeue layout. */}
        {previewRow &&
          previewData &&
          previewMode &&
          previewRow.isVoiceInteraction &&
          previewRow.conversationState === "ACTIVE" &&
          activePreviewCall?.engagementId !== previewRow.engagementId && (
          <MonitoringCallWindow
            key={`voice-active-monitor-${previewRow.engagementId}`}
            monitoringId={previewRow.engagementId}
            agentName={previewRow.fullName ?? "Agent"}
            agentType={previewRow.agentType === "Air" ? "Air" : "Human"}
            customerPhone={previewRow.contactIdentity || undefined}
            onClose={() => {
              setVoicePreviewInitialSheet(null);
              onPreviewClose?.();
            }}
            onTakenOverCallEnded={() =>
              onMonitoringWindowClosed?.(previewRow.agentId)
            }
            onToast={(m) => flashRef.current(m)}
            contextData={previewData}
            contextHops={previewContextHops}
            onContextHop={(event) =>
              appendContextHop(previewRow.engagementId, event)
            }
            onTakeOverCommitted={() => {
              registerActiveCallContext(previewRow.agentId, {
                engagementId: previewRow.engagementId,
                fullName: previewRow.fullName ?? "Agent",
                agentType: previewRow.agentType,
              });
              startActivePreviewCall({
                number: previewRow.contactIdentity || "Unknown number",
                queueName: (previewRow as any).queueName || "Voice queue",
                engagementId: previewRow.engagementId,
                origin: "takeover",
                detailsPath: `/active-call/${previewRow.agentId}`,
                agentId: previewRow.agentId,
                agentName: previewRow.fullName ?? "Agent",
                agentType: previewRow.agentType === "Air" ? "Air" : "Human",
              });
              onPreviewClose?.();
              onTakeOverCommitted?.(previewRow.agentId);
            }}
          />
        )}

        {/* Voice interaction preview: the RingCX phone call window in its
            preview-call variant (incoming Accept/Decline state, no
            Mute/Keypad/Audio). URL-driven the same way as the digital
            Interaction preview (/interactions/:id/preview). Only genuinely
            incoming (not-yet-active) calls ring here — Active calls open the
            monitoring window above. */}
        {previewRow &&
          previewData &&
          previewMode &&
          !removeConfirmRow &&
          previewRow.isVoiceInteraction &&
          previewRow.conversationState !== "ACTIVE" &&
          activePreviewCall?.engagementId !== previewRow.engagementId && (
          <MonitoringCallWindow
            key={`voice-preview-${previewRow.engagementId}`}
            variant="preview"
            agentName={previewRow.fullName ?? "Agent"}
            agentType={previewRow.agentType === "Air" ? "Air" : "Human"}
            customerPhone={previewRow.contactIdentity || undefined}
            initialTransferOpen={voicePreviewInitialSheet === "transfer"}
            hideTransferAndRequeue={hideQueueTransferAndMore}
            previewClaimLabel={queueClaimLabel}
            onClose={() => {
              setVoicePreviewInitialSheet(null);
              onPreviewClose?.();
            }}
            onToast={(m) => flashRef.current(m)}
            contextData={previewData}
            contextHops={previewContextHops}
            onContextHop={(event) =>
              appendContextHop(previewRow.engagementId, event)
            }
            onPreviewAccepted={() => {
              // Answering registers the app-wide active call (top-bar chip,
              // Engaged status, Active calls details) and hands routing to
              // the page; the preview window closes with the preview URL.
              startActivePreviewCall({
                number: previewRow.contactIdentity || "Unknown number",
                queueName:
                  (previewRow as any).queueName || "Voice queue",
                engagementId: previewRow.engagementId,
                origin: "preview",
                detailsPath: "/active-call/preview",
                agentId: "preview",
                agentName: "Agent",
                agentType: "Human",
              });
              onVoicePreviewAccepted?.();
            }}
            onPreviewVoicemail={() => {
              const row = removeQueueRow(previewRow.engagementId);
              if (row) {
                flashRef.current(
                  `Conversation with ${row.contactIdentity} sent to voicemail.`,
                );
              }
            }}
            onPreviewIgnore={() =>
              queueActionCallback(
                previewRow.agentId,
                "queueRemove",
                previewRow.engagementId,
              )
            }
          />
        )}

        {/* Answered preview call: the same phone window, connected (in-call)
            state. Mounted from the answered-call store so it survives the route
            change to /active-call/preview and page refreshes. Monitoring header
            state lives in a separate store slot and cannot render here. */}
        {activePreviewCall?.origin === "preview" && (
          <MonitoringCallWindow
            key={`voice-preview-live-${activePreviewCall.engagementId}`}
            variant="preview"
            connectedAtMs={activePreviewCall.acceptedAtMs}
            agentName="Agent"
            agentType="Human"
            customerPhone={activePreviewCall.number}
            queueName={activePreviewCall.queueName}
            onClose={() => {
              endActivePreviewCall(activePreviewCall.engagementId);
              onMonitoringWindowClosed?.("preview");
            }}
            onToast={(m) => flashRef.current(m)}
            contextData={activeCallContextData}
            contextHops={activeCallHops}
            onContextHop={(event) =>
              appendContextHop(activePreviewCall.engagementId, event)
            }
          />
        )}

        {/* Taken-over call: store-backed dialer ownership survives both the
            monitor-to-active route transition and a page refresh. */}
        {activePreviewCall?.origin === "takeover" && (
          <MonitoringCallWindow
            key={`voice-takeover-live-${activePreviewCall.engagementId}`}
            initialTakenOver
            connectedAtMs={activePreviewCall.acceptedAtMs}
            monitoringId={activePreviewCall.engagementId}
            agentName={activePreviewCall.agentName}
            agentType={activePreviewCall.agentType}
            customerPhone={activePreviewCall.number}
            queueName={activePreviewCall.queueName}
            onClose={() =>
              endActivePreviewCall(activePreviewCall.engagementId)
            }
            onTakenOverCallEnded={() =>
              onMonitoringWindowClosed?.(activePreviewCall.agentId)
            }
            onToast={(m) => flashRef.current(m)}
            contextData={activeCallContextData}
            contextHops={activeCallHops}
            onContextHop={(event) =>
              appendContextHop(activePreviewCall.engagementId, event)
            }
          />
        )}

        {previewRow &&
          previewData &&
          previewMode &&
          !removeConfirmRow &&
          previewMode !== "takeover" &&
          !previewRow.isVoiceInteraction && (
          <InteractionPreview
            mode={previewMode}
            data={previewData}
            title={
              previewRow.conversationState === "ACTIVE"
                ? "Monitoring conversation"
                : "Conversation preview"
            }
            hideTakeOver={
              // With a digital-claim route available, Claim behaves the same
              // from every preview surface (Queue tab and pending previews
              // included); without one, keep the legacy hide rules.
              onDigitalTakeOverCommitted
                ? false
                : activeTab === "Queue" || !previewTakeOverRoutable
            }
            contextHops={previewContextHops}
            takeOverDisabled={readOnly || previewAgentPendingInactive}
            takeOverDisabledTooltip={
              readOnly
                ? "Switch to Supervisor view to claim this interaction."
                : previewAgentPendingInactive
                  ? "You can't claim this interaction right now. This AirPro agent is pending inactive."
                  : undefined
            }
            onClose={() => onPreviewClose?.()}
            onEnlarge={() => onPreviewModeChange?.("expanded")}
            onRestore={() => onPreviewModeChange?.("preview")}
            onTakeOver={handlePreviewTakeOver}
            onRecategorize={() => setRecategorizeOpen(true)}
            overflowActions={
              // CP: Agent suggestion view — no Ignore in the
              // preview; Claim (Take over) is the only available action.
              hideQueueTransferAndMore || previewRow.isVoiceInteraction
                ? undefined
                : previewRow.conversationState === "PENDING"
                  ? [
                      {
                        id: "recategorize",
                        label: "Recategorize",
                        onSelect: () => setRecategorizeOpen(true),
                      },
                      {
                        id: "ignore",
                        label: "Ignore",
                        onSelect: () => {
                          // Routes through queueActionCallback which now shows
                          // the confirmation dialog before removing the row.
                          queueActionCallback(
                            previewRow.agentId,
                            "queueRemove",
                            previewRow.engagementId,
                          );
                        },
                      },
                    ]
                  : undefined
            }
            hideTransfer={hideQueueTransferAndMore}
            takeOverLabel={queueClaimLabel}
          />
        )}

        {insightCtx && transferOpen && (
          <div
            onClick={() => closeModal()}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 9998,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            data-testid="overlay-transfer"
          >
            <div onClick={(e) => e.stopPropagation()}>
              <Dialer
                initialView="transfer"
                manageCallMode="v2"
                style={{
                  minHeight: 0,
                  width: "auto",
                  background: "transparent",
                  padding: 0,
                }}
                onToast={(t) =>
                  flashRef.current(
                    t.description ? `${t.title} — ${t.description}` : t.title,
                  )
                }
                onTransferComplete={(target) => {
                  closeModal();
                  if (insightCtx) {
                    appendContextHop(insightCtx.engagementId, {
                      kind: "queue",
                      name: target,
                    });
                  }
                }}
                onCallEnd={() => closeModal()}
              />
            </div>
          </div>
        )}

        {/* Agents-tab monitor: MonitoringCallWindow handles both Human and AI.
            Human → Whisper/Barge layout with header status chip.
            AI → full Listen/Coach/Barge/Claim/Transfer/Requeue layout. */}
        {monitoredAgentRow &&
          activePreviewCall?.engagementId !==
            (monitoredContextEngagementId ?? monitoredAgentRow.agentId) && (
          <MonitoringCallWindow
            key={monitoredAgentRow.agentId}
            monitoringId={
              monitoredContextEngagementId ?? monitoredAgentRow.agentId
            }
            agentName={monitoredAgentRow.fullName}
            agentType={monitoredAgentRow.agentType === "Air" ? "Air" : "Human"}
            onClose={stopMonitoring}
            onTakenOverCallEnded={() =>
              onMonitoringWindowClosed?.(monitoredAgentRow.agentId)
            }
            onToast={(m) => flashRef.current(m)}
            contextData={monitoredContextData}
            contextHops={monitoredContextHops}
            onContextHop={(event) => {
              if (monitoredContextEngagementId) {
                appendContextHop(monitoredContextEngagementId, event);
              }
            }}
            onTakeOverCommitted={() => {
              const engagementId =
                monitoredContextEngagementId ?? monitoredAgentRow.agentId;
              if (monitoredContextEngagementId) {
                registerActiveCallContext(monitoredAgentRow.agentId, {
                  engagementId: monitoredContextEngagementId,
                  fullName: monitoredAgentRow.fullName,
                  agentType: monitoredAgentRow.agentType,
                });
              }
              startActivePreviewCall({
                number:
                  (monitoredAgentRow as any).contactIdentity ||
                  "Unknown number",
                queueName:
                  (monitoredAgentRow as any).queueName || "Voice queue",
                engagementId,
                origin: "takeover",
                detailsPath: `/active-call/${monitoredAgentRow.agentId}`,
                agentId: monitoredAgentRow.agentId,
                agentName: monitoredAgentRow.fullName,
                agentType:
                  monitoredAgentRow.agentType === "Air" ? "Air" : "Human",
              });
              releaseMonitoringForTakeover();
              onTakeOverCommitted?.(monitoredAgentRow.agentId);
            }}
          />
        )}

        {insightCtx && reassignOpen && (
          <ReassignConversationModal
            agents={reassignAgents}
            onCancel={() => closeModal()}
            onSave={(agent) => {
              closeModal();
              if (insightCtx) {
                appendContextHop(insightCtx.engagementId, {
                  kind: "agent",
                  name: agent.name,
                });
              }
              flashRef.current(`Conversation reassigned to ${agent.name}`);
            }}
          />
        )}

        {queueTransferRow && !readOnly && (
          <TransferMessageDialog
            onCancel={() => closeModal()}
            onTransfer={handleQueueTransfer}
          />
        )}

        {queueRequeueRow && !readOnly && (
          <RequeueDialer
            onCancel={() => closeModal()}
            onRequeue={handleQueueRequeue}
          />
        )}

        {/* Ignore confirmation — uses the @ringcx/ui Dialog for correct
            RingCX fonts, colours, and modal behaviour. */}
        <Dialog
          open={!!removeConfirmRow}
          onClose={() => setRemoveConfirmRow(null) as any}
          style={{ zIndex: 10050 }}
          dialogTitle="Ignore conversation?"
          hideCloseWithX
          maxWidth="xs"
          fullWidth
          // Center vertically: the @ringcx/ui Dialog theme locks the container
          // to align-items:flex-start; auto margins on the Paper absorb the
          // remaining space and re-center it.
          PaperProps={{ style: { marginTop: "auto", marginBottom: "auto" } }}
          data-testid="dialog-remove-confirm"
          content={
            removeConfirmRow ? (
              <span style={{ fontSize: 14, lineHeight: "20px", color: "#616161" }}>
                The conversation with{" "}
                <strong style={{ color: "#121212" }}>{removeConfirmRow.contactIdentity}</strong>{" "}
                will be ignored and removed from the queue. This action is irreversible.
              </span>
            ) : null
          }
          actions={
            <div
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px 8px" }}
              data-testid="overlay-remove-confirm"
            >
              <button
                type="button"
                onClick={() => setRemoveConfirmRow(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#066FAC",
                  padding: "0 8px",
                }}
                data-testid="button-remove-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!removeConfirmRow) return;
                  // Call removeQueueRow directly — queueActionCallback now
                  // intercepts queueRemove to show this dialog, so re-calling
                  // it would loop.
                  const row = removeQueueRow(removeConfirmRow.engagementId);
                  if (row) {
                    setInsightCtx((ctx) =>
                      ctx?.engagementId === removeConfirmRow.engagementId
                        ? null
                        : ctx,
                    );
                    flashRef.current(
                      `Conversation with ${row.contactIdentity} ignored.`,
                    );
                  }
                  onPreviewClose?.();
                  setRemoveConfirmRow(null);
                }}
                style={{
                  height: 36,
                  padding: "0 20px",
                  borderRadius: 4,
                  border: "none",
                  background: "#e6413c",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                data-testid="button-remove-confirm"
              >
                Ignore
              </button>
            </div>
          }
        />

        {rollupAgent && (
          <>
            <div
              onClick={() => closeModal()}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 9997,
              }}
            />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 300,
                background: "#fff",
                border: "1px solid #E0E0E0",
                borderRadius: 8,
                boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
                zIndex: 9998,
                padding: "14px 16px",
              }}
            >
              <InteractionRollupModal
                rollupData={rollupAgent.rollupBreakdown as any}
                rollupColumns={rollupColumns as any}
                total={rollupAgent.interactions24hRollupTotalCount as any}
                agentName={rollupAgent.fullName}
                onClose={() => closeModal()}
              />
            </div>
          </>
        )}

        {stateModalAgent && (
          <UpdateAgentStateModal
            agentName={stateModalAgent.fullName}
            agentType={stateModalAgent.agentType}
            onCancel={() => closeModal()}
            onUpdate={applyAgentState}
          />
        )}

        {successToast && (
          <AgentStateToast
            message={successToast}
            onClose={() => setSuccessToast(null)}
          />
        )}

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#212121",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: 14,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              zIndex: 9999,
            }}
          >
            {toast}
          </div>
        )}
      </ThemeProvider>
    </RcThemeProvider>
  );
}

// Tag-family component library showcase page (Tag, Chip, Badge, Dot rendered
// live from the vendored @ringcx/ui source). Lives in the proto tree because
// it imports @ringcx/ui directly, which tsc excludes.
export { ActiveCallView } from "./ActiveCallView";
export type { ActiveCallViewProps } from "./ActiveCallView";
