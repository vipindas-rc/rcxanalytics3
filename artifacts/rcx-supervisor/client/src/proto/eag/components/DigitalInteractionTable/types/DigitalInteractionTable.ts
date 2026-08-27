import type { PropertyPath } from '@ringcx/shared';
import type { RenderSubRowData } from '@ringcx/ui';

import type { AIFeature } from '../../../common/services/transport/aiFeatures';
import type {
    IMonitorMenuInfo,
    ISupervisorTableCol,
} from '../../../containers/SupervisorAgentList/types/SupervisorAgentList';

export type ConversationCategoryOverride = {
    label: string;
    bg: string;
    color: string;
};

export interface IDigitalInteractionTable {
    columns: ISupervisorTableCol[];
    digitalTaskList: InteractionData[];
    monitorAgentCallback: () => void;
    monitoredAgent: IMonitorMenuInfo;
    viewInsight: (agentId: string, uii: string) => void;
    loggedInAgentId: string;
    selectedIds: string[];
    selectedChannels: string[];
    selectedCategories: string[];
    searchValue: string;
    shouldShowViewInsightsButton: boolean;
    AgentSvc: any;
    FeatureFlagsSvc: any;
    aiNotesFeatures: AIFeature[];
    highlightAgentId?: string | null;
    highlightNonce?: number;
    selectedEngagementId?: string | null;
    // True when page-level pre-filters (queue/state/SLA/agent type) are
    // active: an empty list then means "no matches" rather than "no data",
    // so the grid's standard filter empty state is rendered instead of the
    // no-interactions message.
    hasActiveFilters?: boolean;
    // Reports the row count the grid actually shows after its own filters
    // (search box, agent/channel/category) so tab labels can mirror it.
    onFilteredCountChange?: (count: number) => void;
    // CP: Suggestion queue-row action gating:
    //   hideQueueTransferAndMore — hide the Transfer button and More (3-dot)
    //     menu on queue rows (Agent suggestion view only).
    //   queueClaimLabel — button label for the claim action.
    //     suggestion views, "Claim" (default) everywhere else.
    hideQueueTransferAndMore?: boolean;
    queueClaimLabel?: string;
    // CP: Agent suggestion view — hide the preview/Monitor eye on active
    // Interactions rows.
    hideInteractionPreview?: boolean;
    categoryOverrides?: Record<string, ConversationCategoryOverride[]>;
}
export type InteractionSearchRowsType = {
    agentId: string;
    sourceName: string;
    fullName: string;
    productName: string;
    contactIdentity: string;
    contactIdentityE164?: string;
    threadTitle: string;
    categoryIds: string;
    categoryNames?: string;
};
export const interactionAgentNameCol: PropertyPath<InteractionSearchRowsType>[] =
    [['agentId']];
export const interactionChannelNameCol: PropertyPath<InteractionSearchRowsType>[] =
    [['sourceName']];
export const interactionCategoryCol: PropertyPath<InteractionSearchRowsType>[] =
    [['categoryIds']];
export const interactionSearchColIndexes: PropertyPath<InteractionSearchRowsType>[] =
    [
        ['sourceName'],
        ['fullName'],
        ['productName'],
        ['contactIdentity'],
        ['contactIdentityE164'],
        ['threadTitle'],
        ['categoryNames'],
    ];

type EngagementSource = {
    initialEngagementSourceId: string;
    initialEngagementSourceType: string;
    initialEngagementSourceName: string;
    initialEngagementSourceColor: string;
    connections: InteractionConnections;
};
type InteractionConnections = {
    connectionId: string;
    connectionSourceType: string;
};
export type InteractionData = {
    agentId: string;
    fullName: string;
    agentType?: string;
    sourceName: string;
    isHidden?: boolean | undefined;
    glId: string;
    subRows: RenderSubRowData<InteractionSearchRowsType>[];
    engagementId: string;
    isActive: boolean;
    isLegacyChat: boolean;
    contactIdentity: string;
    threadTitle: string;
    focusedConnectionId: string;
    productId: string;
    productName: string;
    pendingDispositionMs: string;
    engagementSource: EngagementSource;
    categoryIds: string;
};
