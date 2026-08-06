import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled, { ThemeProvider, css } from "styled-components";
import { RcThemeProvider } from "@ringcentral/juno";
import { theme } from "@ringcx/ui";

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
  supervisor2InteractionColumns,
  supervisor3InteractionColumns,
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

// Live "Interactions (n)" counter: all pending interactions — queued (Pending,
// live from the queue store) plus Reserved rows (routed to an agent but not
// yet picked up; pending with an agent assigned). Reserved rows come from the
// deterministic interaction seed, so only the queued share ticks live.
export function usePendingInteractionsCount(): number {
  return useQueuePendingCount() + RESERVED_INTERACTION_COUNT;
}
import {
  InteractionPreview,
  type InteractionPreviewMode,
} from "./InteractionPreview";
import {
  SupervisorListHoverMenu,
  InformationHoverMenu,
} from "./eag/containers/SupervisorAgentList/SupervisorAgentList.styled";
import {
  appendContextHop,
  registerActiveCallContext,
  useContextHops,
} from "./contextHopStore";

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
export function usePendingFilterRows(): InteractionFilterRow[] {
  const rows = useQueueRows();
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
  // Agent view: render the tables read-only (no monitoring, hover actions,
  // dialpads, or take over). Supervisor view passes false/omits it.
  readOnly?: boolean;
  // Marks the logged-in user's own row in the Agents table ("Name (you)").
  showCurrentUser?: boolean;
  // Supervisor view 2: the Interactions tab shows the regular interactions
  // plus the pending (queued) rows in a "Pending" state, with Queue name /
  // Time in queue / Previous agent columns. Supervisor view 3 behaves the
  // same but drops the Agent type / Confidence / Sentiment columns.
  interactionsVariant?: "supervisor2" | "supervisor3";
  // Fired when a voice take-over commits so the page can switch to the
  // Active calls context for that agent's call.
  onTakeOverCommitted?: (agentId: string) => void;
  // Fired when the floating call window closes so the page can leave the
  // Active calls context if it was showing this agent's taken-over call.
  onMonitoringWindowClosed?: (agentId: string) => void;
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
  readOnly = false,
  showCurrentUser = false,
  interactionsVariant,
  onTakeOverCommitted,
  onMonitoringWindowClosed,
}: AgentTablePanelProps) {
  // Supervisor view 3 shares all of view 2's Interactions behavior (pending
  // row merging, hover actions, preview) — only the column set differs.
  const isSupervisor2Interactions =
    interactionsVariant === "supervisor2" ||
    interactionsVariant === "supervisor3";
  const isSupervisor3Columns = interactionsVariant === "supervisor3";
  const [agents, setAgents] = useState(() => makeAgents(25));
  const [interactions, setInteractions] = useState(() => makeInteractions());
  // Queue tab: live pending (Waiting) interactions from the shared queue store
  // (arrivals/departures churn it, Claim/Transfer remove rows).
  const queueRows = useQueueRows();
  const [queueCols] = useState(() =>
    queueColumns.map((c: any) => ({ ...c, visible: true })),
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
  // Invalid/stale values (unknown agent, missing context, read-only view)
  // fall back by closing the dialog via history replace.
  // ---------------------------------------------------------------------
  const [modalParam] = useUrlParam("modal");
  const [modalAgentIdParam] = useUrlParam("agentId");
  const updateSearch = useUrlSearchUpdater();
  const openModal = useCallback(
    (id: string, agentId?: string) => {
      updateSearch((p) => {
        p.set("modal", id);
        if (agentId) p.set("agentId", agentId);
        else p.delete("agentId");
      });
    },
    [updateSearch],
  );
  const closeModal = useCallback(
    (options?: { replace?: boolean }) => {
      updateSearch((p) => {
        p.delete("modal");
        p.delete("agentId");
      }, options);
    },
    [updateSearch],
  );
  const transferOpen = modalParam === "transfer";
  const reassignOpen = modalParam === "reassign";
  const stateModalAgentId =
    modalParam === "agent-state" ? modalAgentIdParam : null;
  const rollupAgentId = modalParam === "rollup" ? modalAgentIdParam : null;

  // The AI Insights panel belongs to the Interactions tab table view: navigating
  // away — to the Agents tab, or into an Interaction preview route — closes it
  // (the transfer/reassign dialogs anchored to it self-close below once their
  // context is gone).
  useEffect(() => {
    if (activeTab === "Interactions" && !previewEngagementId) return;
    setInsightCtx(null);
  }, [activeTab, previewEngagementId]);

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
      modalParam === "rollup"
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
        .map((it: any) => {
          if (it.isVoiceInteraction || it.agentType === "Air") return it;
          return {
            ...it,
            showMonitor: false,
            monitorDisabledTooltip: "You can only monitor voice calls",
          };
        })
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
    const pending = queueRows
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
    queueRows,
    displayInteractions,
    agentTypeFilter,
    selectedQueues,
    selectedInteractionStates,
    breachedSlaOnly,
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
    const cols = isSupervisor3Columns
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
        flashRef.current(`Stopped monitoring ${a?.fullName ?? agentId}`);
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
        flashRef.current(`Stopped monitoring ${a?.fullName ?? cur}`);
      }
      return null;
    });
    setMonitoredEngagementId(null);
  }, [agents]);

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
      if (type === "queueIgnore") {
        const row = removeQueueRow(uii ?? "");
        if (!row) return;
        setInsightCtx((ctx) => (ctx?.engagementId === uii ? null : ctx));
        flashRef.current(
          `Conversation with ${row.contactIdentity} ignored`,
        );
        return;
      }
      if (type === "queueRequeue") {
        const row = requeueRow(uii ?? "");
        if (!row) return;
        flashRef.current(
          `Call from ${row.contactIdentity} moved to the back of the queue`,
        );
        return;
      }
      if (type === "queueRecategorize") {
        const row = queueRows.find((r: any) => r.engagementId === uii);
        flashRef.current(
          `Conversation with ${row?.contactIdentity ?? "customer"} sent for recategorization`,
        );
        return;
      }
      if (type !== "queueClaim" && type !== "queueTransfer") return;
      const row = removeQueueRow(uii ?? "");
      if (!row) return;
      setInsightCtx((ctx) =>
        ctx?.engagementId === uii ? null : ctx,
      );
      flashRef.current(
        type === "queueClaim"
          ? `You claimed the conversation with ${row.contactIdentity}`
          : `Conversation with ${row.contactIdentity} transferred`,
      );
    },
    [onPreviewOpen, queueRows],
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
        // Take over is immediate — no confirmation modal. Open the AI
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

      if (row?.isVoiceInteraction && (type === "monitor" || type === "coach")) {
        const isStopping =
          monitoredId === agentId && monitoredEngagementId === uii;
        if (isStopping) {
          setMonitoredId(null);
          setMonitoredEngagementId(null);
          flashRef.current(`Stopped monitoring ${row?.fullName ?? agentId}`);
        } else {
          setMonitoredId(agentId);
          setMonitoredEngagementId(uii ?? null);
        }
        return;
      }

      // Digital conversation handled by an AirPro (AI) agent -> toggle the
      // Interaction preview popup in listening mode (URL-driven). Clicking
      // Monitor again while previewing stops (closes) it — same toggle
      // semantics as voice monitoring.
      if (
        type === "monitor" &&
        row &&
        !row.isVoiceInteraction &&
        row.agentType === "Air"
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
        type === "queueIgnore" ||
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
  }, [insightCtx, readOnly]);

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
        )) as any)
    : null;

  // Deep link points at an engagement that doesn't exist -> restore the table URL.
  useEffect(() => {
    if (previewEngagementId && !previewRow) onPreviewClose?.();
  }, [previewEngagementId, previewRow, onPreviewClose]);

  const previewData = useMemo(
    () =>
      previewRow
        ? previewRow.isQueueRow
          ? makeQueuePreview(previewRow)
          : makeInteractionPreview(previewRow)
        : null,
    [previewRow],
  );
  const previewContextHops = useContextHops(
    previewData?.engagementId ?? null,
  );

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
    if (bargedId !== previewRow.engagementId) {
      setBargedId(previewRow.engagementId);
      appendContextHop(previewRow.engagementId, { kind: "you" });
      flashRef.current(
        previewRow.isQueueRow
          ? "You've claimed this conversation"
          : `You've claimed the conversation from ${previewRow.fullName ?? "Agent"}`,
      );
    }
    onPreviewModeChange?.("takeover");
  }, [previewRow, bargedId, onPreviewModeChange, readOnly]);

  return (
    <RcThemeProvider>
      <ThemeProvider theme={theme as any}>
        <PanelScope $readOnly={readOnly}>
          {previewRow && previewData && previewMode === "takeover" ? (
            // Take-over renders embedded in place of the table (the page shows
            // a "← Supervisor" back row above this panel).
            <InteractionPreview
              mode="takeover"
              data={previewData}
              contextHops={previewContextHops}
              takeOverDisabled={previewAgentPendingInactive}
              onClose={() => onPreviewClose?.()}
              onEnlarge={() => onPreviewModeChange?.("expanded")}
              onTakeOver={handlePreviewTakeOver}
            />
          ) : activeTab === "Queue" ? (
            // Queue tab: the same Interactions table, restricted to pending
            // (Waiting) rows. Agent-side cells render blank — no agent has
            // picked the interaction up yet — and there are no monitoring,
            // insights, or take-over affordances.
            <DigitalInteractionTable
              columns={queueCols as any}
              digitalTaskList={queueRows as any}
              monitorAgentCallback={queueActionCallback as any}
              monitoredAgent={{ monitoredAgentId: "", uii: "" } as any}
              viewInsight={viewInsightCallback}
              loggedInAgentId={"supervisor"}
              selectedIds={[]}
              selectedChannels={[]}
              selectedCategories={[]}
              searchValue={searchValue}
              selectedEngagementId={insightCtx?.engagementId ?? null}
              shouldShowViewInsightsButton={true}
              AgentSvc={{ digitalAgentEnabled: true } as any}
              FeatureFlagsSvc={{ featureFlags: {} } as any}
              aiNotesFeatures={[] as any}
            />
          ) : activeTab === "Interactions" ? (
            <DigitalInteractionTable
              columns={visibleInteractionCols as any}
              digitalTaskList={supervisor2Interactions as any}
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
              selectedIds={selectedAgentIds}
              selectedChannels={selectedChannels}
              selectedCategories={selectedCategories}
              searchValue={searchValue}
              onFilteredCountChange={onInteractionCountChange}
              highlightAgentId={highlightAgentId}
              highlightNonce={highlightNonce}
              selectedEngagementId={insightCtx?.engagementId ?? null}
              shouldShowViewInsightsButton={!readOnly}
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

        {previewRow && previewData && previewMode && previewMode !== "takeover" && (
          <InteractionPreview
            mode={previewMode}
            data={previewData}
            hideTakeOver={activeTab === "Queue" || !previewTakeOverRoutable}
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
            overflowActions={
              previewRow.conversationState === "PENDING"
                ? [
                    previewRow.isVoiceInteraction
                      ? {
                          id: "requeue",
                          label: "Requeue",
                          onSelect: () => {
                            queueActionCallback(
                              previewRow.agentId,
                              "queueRequeue",
                              previewRow.engagementId,
                            );
                          },
                        }
                      : {
                          id: "recategorize",
                          label: "Recategorize",
                          onSelect: () => {
                            queueActionCallback(
                              previewRow.agentId,
                              "queueRecategorize",
                              previewRow.engagementId,
                            );
                          },
                        },
                    {
                      id: "ignore",
                      label: "Ignore",
                      onSelect: () => {
                        queueActionCallback(
                          previewRow.agentId,
                          "queueIgnore",
                          previewRow.engagementId,
                        );
                        onPreviewClose?.();
                      },
                    },
                  ]
                : undefined
            }
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

        {monitoredAgentRow && (
          <MonitoringCallWindow
            key={monitoredAgentRow.agentId}
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
              if (monitoredContextEngagementId) {
                registerActiveCallContext(monitoredAgentRow.agentId, {
                  engagementId: monitoredContextEngagementId,
                  fullName: monitoredAgentRow.fullName,
                  agentType: monitoredAgentRow.agentType,
                });
              }
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

export { ActiveCallView } from "./ActiveCallView";
export type { ActiveCallViewProps } from "./ActiveCallView";
