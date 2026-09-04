declare module "@proto" {
  import type { ComponentType } from "react";
  export interface ProtoAgentTablePanelProps {
    activeTab?: "Agents" | "Interactions" | "Queue";

    searchValue?: string;

    selectedStates?: string[];

    selectedChannels?: string[];

    selectedAgentGroups?: string[];

    agentTypeFilter?: string[];

    statusFilter?: "All" | "Active" | "Inactive";

    visibleColumnIds?: string[];

    selectedAgentIds?: string[];

    selectedCategories?: string[];

    selectedQueues?: string[];

    selectedInteractionStates?: string[];

    visibleInteractionColumnIds?: string[];
    // Queue-tab column visibility/order from the paginated queue's settings
    // dialog. When omitted every queue column renders in its default order.
    visibleQueueColumnIds?: string[];
    // Interactions-tab "Breached SLA" toggle: only rows whose Time in queue
    // is past the 10-minute SLA remain.

    breachedSlaOnly?: boolean;

    onActiveInteractionsClick?: (agentId: string) => void;

    highlightAgentId?: string | null;

    highlightNonce?: number;
    // Digital "Interaction preview" (URL-driven by the page).

    previewEngagementId?: string | null;

    previewMode?: "preview" | "expanded" | "takeover" | null;

    onPreviewOpen?: (engagementId: string) => void;

    onPreviewModeChange?: (mode: "preview" | "expanded" | "takeover") => void;

    previewTakeOverRoutable?: boolean;

    onInteractionCountChange?: (count: number) => void;

    onPreviewClose?: () => void;
    closePreviewOnOutsideClick?: boolean;

    readOnly?: boolean;

    showCurrentUser?: boolean;

    interactionsVariant?: "supervisor2" | "supervisor3" | "suggestion";
    // Merge the pending (queued) rows into the Interactions table
    // (Supervisor 1 flow); false in the Queue-tab flows.
    includePendingRows?: boolean;
    // CP: Suggestion queue-row action gating.
    hideQueueViewInsights?: boolean;
    hideQueueTransferAndMore?: boolean;
    queueClaimLabel?: string;
    hideInteractionPreview?: boolean;
    visibleQueueColumnIds?: string[];
    useMyQueuesColumns?: boolean;
    // Voice take-over committed — page switches to the Active calls context.

    onTakeOverCommitted?: (agentId: string) => void;

    onVoicePreviewAccepted?: () => void;
    // Floating call window closed — page leaves the Active calls context
    // if it was showing this agent's taken-over call.

    onMonitoringWindowClosed?: (agentId: string) => void;

    onDigitalTakeOverCommitted?: (engagementId: string) => void;
    activeMessagesMode?: boolean;
    // When set, slices the Queue tab's display rows to the given page window
    // so the hosting panel can render its own pagination controls.
    queuePageSlice?: { page: number; pageSize: number };
    extendedQueue?: boolean;
    // Called with the full post-filter (pre-slice) row count whenever it changes,
    // so PaginatedQueuePanel can show an accurate range indicator.
    onQueueFilteredCount?: (count: number) => void;
    // When set, slices the Interactions tab's merged rows to the given page
    // window (Supervisor (Expected) flow).
    interactionsPageSlice?: { page: number; pageSize: number };
    // Called with the full post-filter (pre-slice) Interactions row count.
    onInteractionsFilteredCount?: (count: number) => void;
    // Pads the seeded Interactions list up to this many rows (applied once
    // on mount).
    interactionsVolume?: number;
  }
  const AgentTablePanel: ComponentType<ProtoAgentTablePanelProps>;
  export default AgentTablePanel;
  export const agentColumnMeta: { id: string; label: string }[];
  export const interactionColumnMeta: { id: string; label: string }[];
  export const queueColumnMeta: { id: string; label: string }[];
  export const supervisor2InteractionColumnMeta: {
    id: string;
    label: string;
  }[];
  // Supervisor view 3: view 2's columns minus Agent type / Confidence /
  // Sentiment.
  export const supervisor3InteractionColumnMeta: {
    id: string;
    label: string;
  }[];
  // CP: Suggestion views — active-only column set (view 3 minus the queue
  // time and previous-agent columns that only apply to pending rows).
  export const myQueuesColumnMeta: { id: string; label: string }[];
  export const suggestionInteractionColumnMeta: {
    id: string;
    label: string;
  }[];
  export const agentStateOptions: Record<"All" | "Air" | "Human", string[]>;
  export const agentFilterOptions: { value: string; label: string }[];
  // Slim projection of the interaction rows for computing cascading
  // Interactions-tab filter options on the page.
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
  export const interactionFilterRows: InteractionFilterRow[];
  // Live "Queue (n)" counter hook — tracks queue arrivals/departures and
  // Claim/Transfer removals. Pass extended=true for the high-volume set used
  // by the Supervisor (pagination) flow.
  export function useQueuePendingCount(extended?: boolean): number;
  // All raw queue rows — for consumers (e.g. pagination panel) that need the
  // full list to compute total / filtered counts. Pass extended=true for the
  // high-volume set used by the Supervisor (pagination) flow.
  export function useQueueRows(extended?: boolean): unknown[];
  // Live "Interactions (n)" counter — all pending interactions: queued
  // (Pending) rows plus Reserved rows (assigned but not yet picked up).
  export function usePendingInteractionsCount(): number;
  // Live pending (queued) rows in the same slim filter-row shape, so
  // Supervisor view 2 can cascade filter options over unassigned rows too.
  export function usePendingFilterRows(extended?: boolean): InteractionFilterRow[];
  // Latest filter design: RingCX MultiSelect-based multi-select dropdown.
  export interface SupervisorFilterOption {
    value: string;
    label: string;
  }
  export interface SupervisorFilterProps {
    values: string[];
    onValuesChange: (values: string[]) => void;
    placeholder: string;
    options: SupervisorFilterOption[];
    disabled?: boolean;
    testId?: string;
    ariaLabel?: string;
  }
  export const SupervisorFilter: ComponentType<SupervisorFilterProps>;
  // RingCX core "Filters (n)" toggle (vendor FilterToggle) wrapped in its
  // theme providers; blue whenever open or any filter is active.
  export const SupervisorFilterToggle: ComponentType<{
    open: boolean;
    count: number;
    onOpenChange: (open: boolean) => void;
    testId?: string;
  }>;
  // RingCX core checkbox (vendor Checkbox) wrapped in its theme providers.
  export const SupervisorCheckbox: ComponentType<{
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: string;
    testId?: string;
  }>;
  // Voice take-over: full-page Active calls view for a taken-over call.
  export interface ActiveCallViewProps {
    agentId?: string | null;
  }
  export const ActiveCallView: ComponentType<ActiveCallViewProps>;

  export const ActiveMessagesSidebar: ComponentType<{
    rows: unknown[];
    selectedId: string | null;
    onSelect: (engagementId: string) => void;
  }>;

  // Claimed-digital store (drives the "Active messages (n)" tab count).
  export function registerClaimedDigital(engagementId: string): void;
  export function removeClaimedDigital(engagementId: string): void;
  export function useClaimedDigitalIds(): string[];
}
