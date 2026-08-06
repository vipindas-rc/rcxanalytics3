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
    readOnly?: boolean;
    showCurrentUser?: boolean;
    interactionsVariant?: "supervisor2" | "supervisor3";
    // Voice take-over committed — page switches to the Active calls context.
    onTakeOverCommitted?: (agentId: string) => void;
    // Floating call window closed — page leaves the Active calls context
    // if it was showing this agent's taken-over call.
    onMonitoringWindowClosed?: (agentId: string) => void;
  }
  const AgentTablePanel: ComponentType<ProtoAgentTablePanelProps>;
  export default AgentTablePanel;
  export const agentColumnMeta: { id: string; label: string }[];
  export const interactionColumnMeta: { id: string; label: string }[];
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
  // Claim/Transfer removals.
  export function useQueuePendingCount(): number;
  // Live "Interactions (n)" counter — all pending interactions: queued
  // (Pending) rows plus Reserved rows (assigned but not yet picked up).
  export function usePendingInteractionsCount(): number;
  // Live pending (queued) rows in the same slim filter-row shape, so
  // Supervisor view 2 can cascade filter options over unassigned rows too.
  export function usePendingFilterRows(): InteractionFilterRow[];
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
}
