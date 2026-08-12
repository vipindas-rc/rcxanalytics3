import { Tooltip } from '@ringcx/ui';

import { INTERACTION_SOURCES } from '../../../constants/app';
import { StyledIconButton } from '../../../containers/SupervisorAgentList/components/Menus/Menus.styled';
import { sourceTypeMap } from '../../../containers/Chat/TypeIcon';
import BargeInMenu from '../../../containers/SupervisorAgentList/components/Menus/BargeInMenu';
import CoachMenu from '../../../containers/SupervisorAgentList/components/Menus/CoachMenu';
import ViewInsightsMenu from '../../../containers/SupervisorAgentList/components/Menus/ViewInsightsMenu';
import type { IMonitorMenuInfo } from '../../../containers/SupervisorAgentList/types/SupervisorAgentList';

interface IGetDigitalInteractionHoveredItems {
    agentId: string;
    monitoredAgent: IMonitorMenuInfo;
    monitorVoice: () => void;
    viewInsight: (agentId: string, uii: string) => void;
    interactionSourceType: string;
    uii: string;
    showCoach: boolean;
    showBargeIn: boolean;
    showMonitor: boolean;
    showViewInsights: boolean;
    showSupervisorAssist: boolean;
    conversationState?: string;
    monitorDisabledTooltip?: string;
    bargeInDisabledTooltip?: string;
    coachDisabledTooltip?: string;
    disabledTooltipPlacement?: 'left' | 'bottom';
}

export const getDigitalInteractionHoveredItems = (
    props: IGetDigitalInteractionHoveredItems
) => {
    const {
        agentId,
        monitoredAgent,
        monitorVoice,
        viewInsight,
        interactionSourceType,
        uii,
        showBargeIn,
        showMonitor,
        showCoach,
        showViewInsights,
        showSupervisorAssist,
        conversationState,
        bargeInDisabledTooltip,
        coachDisabledTooltip,
        disabledTooltipPlacement,
    } = props;

    if (
        Object.prototype.hasOwnProperty.call(
            sourceTypeMap,
            interactionSourceType
        )
    ) {
        if (interactionSourceType === INTERACTION_SOURCES.VOICE) {
            return [
                _getSupervisorAssistHoveredMenu({
                    agentId,
                    showSupervisorAssist,
                    viewInsight,
                    showViewInsights,
                    uii,
                }),
                // Voice rows get a preview (eye) action like digital rows:
                // opens the preview-call variant of the RingCX phone call
                // window (URL-driven via the same preview-open path).
                _getVoicePreviewHoveredMenu({
                    monitorVoice,
                    agentId,
                    uii,
                    conversationState,
                }),
                // Monitor is intentionally hidden in the Interactions table
                // hover actions (still available on the Agents tab).
                _getCoachHoveredMenu({
                    monitorVoice,
                    agentId,
                    monitoredAgent,
                    uii,
                    interactionSourceType,
                    showCoach,
                    disabledTooltip: coachDisabledTooltip,
                    disabledTooltipPlacement,
                }),
                _getBargeInHoveredMenu({
                    monitorVoice,
                    agentId,
                    monitoredAgent,
                    uii,
                    interactionSourceType,
                    showBargeIn,
                    disabledTooltip: bargeInDisabledTooltip,
                    disabledTooltipPlacement,
                }),
            ];
        } else {
            // Digital rows: Supervisor Assist, Preview (eye), Barge.
            return [
                _getSupervisorAssistHoveredMenu({
                    agentId,
                    showSupervisorAssist,
                    viewInsight,
                    showViewInsights,
                    uii,
                }),
                _getDigitalPreviewHoveredMenu({
                    monitorVoice,
                    agentId,
                    uii,
                    showMonitor,
                }),
                _getBargeInHoveredMenu({
                    monitorVoice,
                    agentId,
                    monitoredAgent,
                    uii,
                    interactionSourceType,
                    showBargeIn,
                    disabledTooltip: bargeInDisabledTooltip,
                    disabledTooltipPlacement,
                }),
            ];
        }
    }
    return [];
};

// Preview (eye) hover action for voice rows: routes through the shared
// monitor callback with the 'voicePreview' action type, which the host panel
// turns into the URL-driven preview-call window.
export const _getVoicePreviewHoveredMenu = ({
    monitorVoice,
    agentId,
    uii,
    conversationState,
}: {
    monitorVoice: () => void;
    agentId: string;
    uii: string;
    conversationState?: string;
}) => {
    // Active calls open in listening/monitoring mode; all other states
    // (Reserved, Pending) open the incoming ringing preview UI.
    const label = conversationState === 'ACTIVE' ? 'Monitor call' : 'Preview call';
    return (
        <Tooltip key={`voice_preview_${agentId}_${uii}`} title={label} placement='left'>
            {/* Shared icon button so the eye matches the library actions'
                box, spacing, and hover/disabled treatment exactly. */}
            <StyledIconButton
                {...{
                    size: 'medium',
                    'aria-label': label,
                    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        (monitorVoice as any)(agentId, 'voicePreview', uii);
                    },
                }}
                data-testid={`button-voice-preview-${uii}`}
            >
                {/* Eye glyph: preview the call */}
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
    );
};

// Preview (eye) hover action for digital rows — mirrors the voice variant but
// fires the standard 'monitor' action type so AgentTablePanel opens the
// InteractionPreview window for the engagement.
export const _getDigitalPreviewHoveredMenu = ({
    monitorVoice,
    agentId,
    uii,
    showMonitor,
}: {
    monitorVoice: () => void;
    agentId: string;
    uii: string;
    showMonitor: boolean;
}) => {
    if (!showMonitor) return null;
    return (
        <Tooltip key={`digital_preview_${agentId}_${uii}`} title="Preview conversation" placement="left">
            <StyledIconButton
                {...{
                    size: 'medium',
                    'aria-label': 'Preview conversation',
                    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        (monitorVoice as any)(agentId, 'monitor', uii);
                    },
                }}
                data-testid={`button-digital-preview-${uii}`}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            </StyledIconButton>
        </Tooltip>
    );
};

export const _getSupervisorAssistHoveredMenu = ({
    agentId,
    viewInsight,
    showSupervisorAssist,
    showViewInsights,
    uii,
}: {
    agentId: string;
    viewInsight: (agentId: string, uii: string) => void;
    showSupervisorAssist: boolean;
    showViewInsights: boolean;
    uii: string;
}) => {
    if (!showSupervisorAssist) {
        return null;
    }

    return (
        <ViewInsightsMenu
            key={`insights_${agentId}_${uii}`}
            {...{
                agentId,
                viewInsight,
                showViewInsights,
                uii,
            }}
        />
    );
};

export const _getCoachHoveredMenu = ({
    monitorVoice,
    agentId,
    monitoredAgent,
    uii,
    interactionSourceType,
    showCoach,
    disabledTooltip,
    disabledTooltipPlacement,
}: {
    monitorVoice: () => void;
    agentId: string;
    monitoredAgent: IMonitorMenuInfo;
    uii: string;
    interactionSourceType: string;
    showCoach: boolean;
    disabledTooltip?: string;
    disabledTooltipPlacement?: 'left' | 'bottom';
}) => {
    // Unavailable hover actions are hidden entirely (e.g. Coach on AI-agent
    // rows) rather than rendered disabled with a tooltip.
    if (!showCoach) {
        return null;
    }
    monitoredAgent = { ...monitoredAgent, uii: uii };
    return (
        <CoachMenu
            key={`coach_${agentId}_${uii}`}
            {...{
                monitorVoice: monitorVoice,
                agentId: agentId,
                monitoredAgent: monitoredAgent,
                interactionSourceType,
                showCoach,
                disabledTooltip,
                disabledTooltipPlacement,
            }}
        />
    );
};
export const _getBargeInHoveredMenu = ({
    monitorVoice,
    agentId,
    monitoredAgent,
    uii,
    interactionSourceType,
    showBargeIn,
    disabledTooltip,
    disabledTooltipPlacement,
}: {
    monitorVoice: () => void;
    agentId: string;
    monitoredAgent: IMonitorMenuInfo;
    uii: string;
    interactionSourceType: string;
    showBargeIn: boolean;
    disabledTooltip?: string;
    disabledTooltipPlacement?: 'left' | 'bottom';
}) => {
    // Unavailable hover actions are hidden entirely (e.g. Barge on AI-agent
    // rows) rather than rendered disabled with a tooltip.
    if (!showBargeIn) {
        return null;
    }
    monitoredAgent = { ...monitoredAgent, uii: uii };
    return (
        <BargeInMenu
            key={`barge_${agentId}_${uii}`}
            {...{
                monitorVoice: monitorVoice,
                agentId: agentId,
                monitoredAgent: monitoredAgent,
                interactionSourceType,
                showBargeIn,
                disabledTooltip,
                disabledTooltipPlacement,
            }}
        />
    );
};
