import type { FC } from 'react';
import { Fragment, useMemo, useState } from 'react';

import { Tooltip, More, TagColor, TagComponent } from '@ringcx/ui';

import { CategoriesCell } from './CategoriesCell';
import { ScoreIndicator } from './ScoreIndicator';
import type { AIFeature } from '../../../common/services/transport/aiFeatures';
import { INTERACTION_SOURCES } from '../../../constants/app';
import { INTERACTION_CELL } from '../../../constants/testIds';
import { getSourceType } from '../../../containers/Chat/TypeIcon';
import InformationMenu from '../../../containers/SupervisorAgentList/components/Menus/InformationMenu';
import {
    StyledIconButton,
    StyledMenu,
} from '../../../containers/SupervisorAgentList/components/Menus/Menus.styled';
import { SourceTypeIcon } from '../../../containers/SupervisorAgentList/components/SourceTypeIcon';
import { SUPERVISOR_INTERACTION_COLUMN_ID } from '../../../containers/SupervisorAgentList/constants';
import {
    SupervisorListHoverMenu,
    SupervisorRowWrapper,
    InformationHoverMenu,
    StyledSupervisorCellWrapper,
} from '../../../containers/SupervisorAgentList/SupervisorAgentList.styled';
import type {
    IMonitorMenuInfo,
    ISupervisorTableCol,
} from '../../../containers/SupervisorAgentList/types/SupervisorAgentList';
import { hhMmSsFilterFromMs } from '../../../helpers/timeUtils';
import {
    filterNullValue,
    filterStrNullValue,
    filterTime,
} from '../../../helpers/utils';
import {
    _getSupervisorAssistHoveredMenu,
    getDigitalInteractionHoveredItems,
} from '../utils/DigitalInteractionRowRenderUtil';

// Conversation lifecycle state -> core Tag color (bordered variant), matching
// the legacy badge palette: Pending orange, Reserved blue, Active green.
const conversationStateTagColor = (state: string): TagColor => {
    switch (state) {
        case 'PENDING':
            return TagColor.Orange;
        case 'RESERVED':
            return TagColor.Blue;
        case 'ACTIVE':
            return TagColor.Green;
        default:
            return TagColor.Grey;
    }
};

// 3-dot menu on pending (queue) rows: Ignore for every channel, plus
// Recategorize (digital) or Requeue (voice). Same core More icon + flyout
// menu design as the Agents tab.
const QueueMoreMenu: FC<{
    engagementId: string;
    agentId: string;
    isVoice: boolean;
    onAction: (agentId: string, type: string, uii: string) => void;
}> = ({ engagementId, agentId, isVoice, onAction }) => {
    const [isOpen, setIsOpen] = useState(false);
    // Requeue / Recategorize leads; Ignore (the destructive-ish choice) last.
    const options = useMemo(
        () => [
            isVoice
                ? {
                      id: `requeue-${engagementId}`,
                      title: 'Requeue',
                      action: () =>
                          onAction(agentId, 'queueRequeue', engagementId),
                      style: { color: 'var(--primary-text-color)' },
                  }
                : {
                      id: `recategorize-${engagementId}`,
                      title: 'Recategorize',
                      action: () =>
                          onAction(agentId, 'queueRecategorize', engagementId),
                      style: { color: 'var(--primary-text-color)' },
                  },
            {
                id: `ignore-${engagementId}`,
                title: 'Ignore',
                action: () => onAction(agentId, 'queueIgnore', engagementId),
                style: { color: 'var(--primary-text-color)' },
            },
        ],
        [agentId, engagementId, isVoice, onAction]
    );
    const toggleComponent = (
        <Tooltip title='More' placement='left'>
            <StyledIconButton
                {...{
                    disableRipple: true,
                    size: 'medium',
                    'aria-label': 'More',
                    onClick: () => setIsOpen(true),
                    tabindex: '-1',
                }}
                data-testid={`button-queue-more-${engagementId}`}
            >
                <More />
            </StyledIconButton>
        </Tooltip>
    );
    return (
        // data-menu-open lets the row CSS pin its hover state (background +
        // action buttons) while the flyout is open, matching the Agents tab.
        <span data-menu-open={isOpen ? 'true' : undefined}>
            <StyledMenu
                {...{
                    options,
                    toggleComponent,
                    isOpen,
                    onClose: () => setIsOpen(false),
                    // Portal to body so the flyout stacks above other rows.
                    disablePortal: false,
                    disableAutoFocusItem: true,
                }}
            />
        </span>
    );
};

export const DigitalInteractionTableRow: FC<{
    columns: any;
    data: any;
    monitorAgentCallback: () => void;
    monitoredAgent: IMonitorMenuInfo;
    viewInsight: (agentId: string, uii: string) => void;
    loggedInAgentId: string;
    digitalAgentEnabled: boolean;
    shouldShowViewInsightsButton: boolean;
    aiNotesFeatures: AIFeature[];
    isAIFeaturesEnabled: boolean;
    highlightAgentId?: string | null;
    highlightNonce?: number;
    selectedEngagementId?: string | null;
}> = ({
    data: {
        engagementSource,
        perspectiveRecordingMode,
        isLegacyChat,
        sourceName,
        productName,
        agentDurationMs,
        contactIdentity,
        threadTitle,
        pendingDispositionMs,
        fullName,
        agentType,
        engagementId,
        agentId,
        showBargeIn,
        showMonitor,
        showCoach,
        showViewInsights,
        monitorDisabledTooltip,
        bargeInDisabledTooltip,
        coachDisabledTooltip,
        productId,
        categoryIds,
        confidenceScore,
        sentimentScore,
        conversationState,
        conversationStateLabel,
        priority,
        waitTimeMs,
        timeInQueueMs,
        lastAgentName,
        isQueueRow,
        hasPreview,
    },
    loggedInAgentId,
    columns,
    monitorAgentCallback,
    monitoredAgent,
    viewInsight,
    digitalAgentEnabled,
    shouldShowViewInsightsButton,
    aiNotesFeatures,
    isAIFeaturesEnabled,
    highlightAgentId,
    highlightNonce,
    selectedEngagementId,
}) => {
    const [isInfoToolTipVisible, setIsInfoToolTipVisible] =
        useState<boolean>(false);

    // Rows whose agent matches the one whose "Active interactions" icons were
    // clicked on the Agents tab blink to signal they are the selected set.
    const isHighlighted = !!highlightAgentId && agentId === highlightAgentId;

    // SLA colors on the wait columns are state-aware: red/orange only while
    // the interaction is still Pending (not yet assigned). Once the state
    // moves to Reserved/Active the values render in the normal color — the
    // Breached SLA filter still matches such rows (breach detection is on
    // the raw time in queue, not the color).
    const isSlaColorActive = conversationState === 'PENDING';

    // The interaction whose AI Insights panel is open is kept visually selected
    // (steady blue/grey tint) for as long as the panel is showing.
    const isSelected =
        !!selectedEngagementId && engagementId === selectedEngagementId;

    const interactionSourceType = getSourceType(
        engagementSource.initialEngagementSourceType
    );

    const isVoiceInteraction =
        interactionSourceType === INTERACTION_SOURCES.VOICE;
    const showInformationIcon =
        !digitalAgentEnabled && !isVoiceInteraction && !isLegacyChat;
    // AI insights are available for every conversation now — voice, digital,
    // and legacy chat alike — regardless of recording mode, legacy-chat
    // status, or per-queue AI-feature flags. The only remaining gate is the
    // page-level toggle (shouldShowViewInsightsButton) and the per-row
    // showViewInsights flag (used below to enable/disable the icon itself).
    const showSupervisorAssist = shouldShowViewInsightsButton;

    // Clicking anywhere on the row opens the AI Insights pane, but only for
    // rows where the hover "AI insights" action is available and enabled —
    // the row click must never bypass that gating.
    const canOpenInsights = showSupervisorAssist && showViewInsights;

    const supervisorRowHoverItems = useMemo(
        () =>
            getDigitalInteractionHoveredItems({
                interactionSourceType: interactionSourceType,
                monitorVoice: monitorAgentCallback,
                monitoredAgent: monitoredAgent,
                viewInsight,
                agentId: agentId,
                uii: engagementId,
                showBargeIn,
                showMonitor,
                showCoach,
                showViewInsights,
                showSupervisorAssist,
                monitorDisabledTooltip,
                bargeInDisabledTooltip,
                coachDisabledTooltip,
            }),
        [
            interactionSourceType,
            monitorAgentCallback,
            monitoredAgent,
            viewInsight,
            agentId,
            engagementId,
            showBargeIn,
            showMonitor,
            showCoach,
            showViewInsights,
            showSupervisorAssist,
            monitorDisabledTooltip,
            bargeInDisabledTooltip,
            coachDisabledTooltip,
        ]
    );

    const isSelfAgent = loggedInAgentId === agentId;
    // Matches the Agents-tab row highlight rule: a row is "currently
    // monitoring" only when it is the specific interaction the supervisor
    // opened monitoring for (agent + engagement both match). The highlight is
    // driven by the monitored engagement (monitoredAgent.uii), not by the
    // per-row icon visibility flags — digital rows can have Monitor disabled
    // (voice-only gating for human agents) without reading as monitored.
    const isCurrentlyMonitoring =
        !!monitoredAgent?.monitoredAgentId &&
        monitoredAgent.monitoredAgentId === agentId &&
        !!monitoredAgent?.uii &&
        monitoredAgent.uii === engagementId &&
        !isSelfAgent;

    const getColumnValue = useMemo(
        () => (columnName: string) => {
            switch (columnName) {
                case SUPERVISOR_INTERACTION_COLUMN_ID.FULL_NAME:
                    return filterStrNullValue(fullName);
                case SUPERVISOR_INTERACTION_COLUMN_ID.AGENT_DURATION_MS:
                    return filterTime(
                        hhMmSsFilterFromMs(filterNullValue(agentDurationMs))
                    );
                case SUPERVISOR_INTERACTION_COLUMN_ID.PRODUCT_NAME:
                    return filterStrNullValue(productName);
                // "Previous agent" (Supervisor view 2): the agent who last
                // picked the conversation up and returned it to queue.
                case 'lastAgentName':
                    return filterStrNullValue(lastAgentName);
                case SUPERVISOR_INTERACTION_COLUMN_ID.CONTACT_IDENTITY:
                    return filterStrNullValue(contactIdentity);
                case SUPERVISOR_INTERACTION_COLUMN_ID.THREAD_TITLE:
                    return filterStrNullValue(threadTitle);
                case SUPERVISOR_INTERACTION_COLUMN_ID.PENDING_DISPOSITION_MS:
                    return filterTime(
                        hhMmSsFilterFromMs(
                            filterNullValue(pendingDispositionMs)
                        )
                    );
                default:
                    return '-';
            }
        },
        [
            fullName,
            agentDurationMs,
            productName,
            contactIdentity,
            threadTitle,
            pendingDispositionMs,
            lastAgentName,
        ]
    );

    return (
        <Fragment>
            <SupervisorRowWrapper
                key={isHighlighted ? `hl-${highlightNonce ?? 0}` : 'row'}
                isCurrentlyMonitoring={isCurrentlyMonitoring}
                isInfoToolTipVisible={isInfoToolTipVisible}
                isHighlighted={isHighlighted}
                isSelected={isSelected}
                onClick={
                    canOpenInsights
                        ? () => viewInsight(agentId, engagementId)
                        : undefined
                }
                style={canOpenInsights ? { cursor: 'pointer' } : undefined}
            >
                <SourceTypeIcon
                    channelType={engagementSource.initialEngagementSourceType}
                    source={filterStrNullValue(sourceName)}
                    sourceColor={engagementSource.initialEngagementSourceColor}
                    role='gridcell'
                ></SourceTypeIcon>
                {columns.map((column: ISupervisorTableCol) => {
                    if (column.hiddenColumn) {
                        return true;
                    }
                    if (
                        !column?.visible ||
                        column?.id ===
                            SUPERVISOR_INTERACTION_COLUMN_ID.SOURCE_NAME
                    ) {
                        return null;
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.CATEGORIES
                    ) {
                        return (
                            <CategoriesCell
                                key={column.id}
                                categoryIds={categoryIds}
                            />
                        );
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.AGENT_TYPE
                    ) {
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                {/* Queue rows have no handling agent yet ->
                                    the agent-type cell stays blank. */}
                                {agentType ? (
                                    <TagComponent
                                        color={
                                            agentType === 'Air'
                                                ? TagColor.Orange
                                                : TagColor.Grey
                                        }
                                        text={
                                            agentType === 'Air'
                                                ? 'AirPro'
                                                : 'Human'
                                        }
                                    />
                                ) : null}
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (
                        column.id === SUPERVISOR_INTERACTION_COLUMN_ID.WAIT_TIME
                    ) {
                        // Total waiting time: the customer's overall wait.
                        // Own SLA bands (longer than Time in queue's):
                        // orange past 10 minutes, red past 15.
                        // Unlike Time in queue, the colors stay in every
                        // state — the total wait is a customer-experience
                        // number, so it keeps flagging long waits after
                        // assignment.
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                {typeof waitTimeMs === 'number' ? (
                                    <span
                                        style={
                                            waitTimeMs > 15 * 60 * 1000
                                                ? { color: '#d32f2f', fontWeight: 500 }
                                                : waitTimeMs > 10 * 60 * 1000
                                                  ? { color: '#b26205', fontWeight: 500 }
                                                  : undefined
                                        }
                                        data-testid={`text-total-waiting-time-${engagementId}`}
                                    >
                                        {filterTime(
                                            hhMmSsFilterFromMs(waitTimeMs)
                                        )}
                                    </span>
                                ) : (
                                    '-'
                                )}
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.TIME_IN_QUEUE
                    ) {
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                {typeof timeInQueueMs === 'number' ? (
                                    // Time-in-queue SLA colors: red past 10
                                    // minutes, orange between 5 and 10 —
                                    // only while the row is still Pending.
                                    <span
                                        style={
                                            !isSlaColorActive
                                                ? undefined
                                                : timeInQueueMs > 10 * 60 * 1000
                                                ? { color: '#d32f2f', fontWeight: 500 }
                                                : timeInQueueMs > 5 * 60 * 1000
                                                  ? { color: '#b26205', fontWeight: 500 }
                                                  : undefined
                                        }
                                        data-testid={`text-time-in-queue-${engagementId}`}
                                    >
                                        {filterTime(
                                            hhMmSsFilterFromMs(timeInQueueMs)
                                        )}
                                    </span>
                                ) : (
                                    '-'
                                )}
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.CONVERSATION_STATE
                    ) {
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                {conversationStateLabel ? (
                                    <span
                                        data-testid={`badge-state-${engagementId}`}
                                    >
                                        <TagComponent
                                            color={conversationStateTagColor(
                                                String(conversationState ?? '')
                                            )}
                                            text={conversationStateLabel}
                                            bordered
                                        />
                                    </span>
                                ) : (
                                    '-'
                                )}
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (column.id === 'priority') {
                        // Routing priority, one decimal (1.0, 2.0, …); rows
                        // without a priority render the em-dash placeholder.
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                <span
                                    data-testid={`text-priority-${engagementId}`}
                                >
                                    {typeof priority === 'number'
                                        ? priority.toFixed(1)
                                        : '—'}
                                </span>
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.CONFIDENCE_SCORE
                    ) {
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                <ScoreIndicator
                                    kind='confidence'
                                    score={confidenceScore}
                                />
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    if (
                        column.id ===
                        SUPERVISOR_INTERACTION_COLUMN_ID.SENTIMENT_SCORE
                    ) {
                        return (
                            <StyledSupervisorCellWrapper
                                data-aid={INTERACTION_CELL}
                                key={column.id}
                                role='gridcell'
                            >
                                <ScoreIndicator
                                    kind='sentiment'
                                    score={sentimentScore}
                                />
                            </StyledSupervisorCellWrapper>
                        );
                    }

                    return (
                        <StyledSupervisorCellWrapper
                            data-aid={INTERACTION_CELL}
                            key={column.id}
                            role='gridcell'
                        >
                            {getColumnValue(column.id)}
                        </StyledSupervisorCellWrapper>
                    );
                })}
            </SupervisorRowWrapper>

            {showInformationIcon ? (
                <InformationHoverMenu
                    isInfoToolTipVisible={isInfoToolTipVisible}
                >
                    <StyledSupervisorCellWrapper>
                        {
                            <InformationMenu
                                setIsInfoToolTipVisible={
                                    setIsInfoToolTipVisible
                                }
                            />
                        }
                    </StyledSupervisorCellWrapper>
                </InformationHoverMenu>
            ) : isQueueRow ? (
                // Queue rows: AI insights only (Monitor/Coach/Barge make no
                // sense before an agent is assigned, so their disabled icons
                // are omitted entirely) plus optional Preview and
                // Transfer / Claim. Either button removes the interaction
                // from the queue.
                <SupervisorListHoverMenu role='gridcell'>
                    <StyledSupervisorCellWrapper>
                        {_getSupervisorAssistHoveredMenu({
                            agentId,
                            showSupervisorAssist,
                            viewInsight,
                            showViewInsights,
                            uii: engagementId,
                        })}
                        {hasPreview && (
                            <Tooltip
                                title={
                                    isVoiceInteraction
                                        ? 'Preview call'
                                        : 'Preview interaction'
                                }
                                placement='left'
                            >
                                {/* Shared icon button keeps the eye on the
                                    same box/baseline as the other actions. */}
                                <StyledIconButton
                                    {...{
                                        size: 'medium',
                                        'aria-label': isVoiceInteraction
                                            ? 'Preview call'
                                            : 'Preview interaction',
                                        onClick: () =>
                                            (monitorAgentCallback as any)(
                                                agentId,
                                                'queuePreview',
                                                engagementId
                                            ),
                                    }}
                                    data-testid={`button-queue-preview-${engagementId}`}
                                >
                                {/* Eye glyph: preview the pre-queue IVR transcript */}
                                <svg
                                    width='18'
                                    height='18'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    aria-hidden
                                >
                                    <path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' />
                                    <circle cx='12' cy='12' r='3' />
                                </svg>
                                </StyledIconButton>
                            </Tooltip>
                        )}
                        <button
                            type='button'
                            onClick={() =>
                                (monitorAgentCallback as any)(
                                    agentId,
                                    'queueTransfer',
                                    engagementId
                                )
                            }
                            style={{
                                height: 28,
                                padding: '0 12px',
                                borderRadius: 4,
                                border: '1px solid #066fac',
                                background: '#ffffff',
                                color: '#066fac',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                            data-testid={`button-queue-transfer-${engagementId}`}
                        >
                            Transfer
                        </button>
                        <button
                            type='button'
                            onClick={() =>
                                (monitorAgentCallback as any)(
                                    agentId,
                                    'queueClaim',
                                    engagementId
                                )
                            }
                            style={{
                                height: 28,
                                padding: '0 12px',
                                borderRadius: 4,
                                border: '1px solid #066fac',
                                background: '#066fac',
                                color: '#ffffff',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                            data-testid={`button-queue-claim-${engagementId}`}
                        >
                            Claim
                        </button>
                        <QueueMoreMenu
                            engagementId={engagementId}
                            agentId={agentId}
                            isVoice={isVoiceInteraction}
                            onAction={monitorAgentCallback as any}
                        />
                    </StyledSupervisorCellWrapper>
                </SupervisorListHoverMenu>
            ) : (
                <SupervisorListHoverMenu role='gridcell'>
                    <StyledSupervisorCellWrapper>
                        {supervisorRowHoverItems}
                    </StyledSupervisorCellWrapper>
                </SupervisorListHoverMenu>
            )}
        </Fragment>
    );
};
