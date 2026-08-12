import { Tooltip } from '@ringcx/ui';

import {
    DigitalMonitorButton,
    DigitalMonitorButtonContainer,
} from './Supervisor.styled';
import { INTERACTION_SOURCES, MONITOR_TYPES } from '../../constants/app';
import { StyledIconButton } from '../../containers/SupervisorAgentList/components/Menus/Menus.styled';
import { SupervisorDataId } from '../../constants/testIds';
import { getSourceType, sourceTypeMap } from '../../containers/Chat/TypeIcon';
import type { IMonitorMenuInfo } from '../../containers/SupervisorAgentList/types/SupervisorAgentList';
import { _getMonitorHoveredMenu } from '../../containers/SupervisorAgentList/utils/SupervisorRowRenderUtil';
import translate from '../../helpers/translate';
import {
    _getCoachHoveredMenu,
    _getBargeInHoveredMenu,
} from '../DigitalInteractionTable/utils/DigitalInteractionRowRenderUtil';
interface IGetDigitalInteractionHoveredItems {
    agentId: string;
    monitoredAgent: IMonitorMenuInfo;
    monitorVoice: (
        id?: string,
        type?: string,
        uii?: string,
        sourceType?: string
    ) => void;
    interactionSourceType: string;
    uii: string;
    showCoach: boolean;
    showBargeIn: boolean;
    showMonitor: boolean;
    monitorDisabledTooltip?: string;
    bargeInDisabledTooltip?: string;
    coachDisabledTooltip?: string;
    disabledTooltipPlacement?: 'left' | 'bottom';
}
export const getDigitalInteractionItems = (
    props: IGetDigitalInteractionHoveredItems
) => {
    const {
        agentId,
        monitoredAgent,
        monitorVoice,
        interactionSourceType,
        uii,
        showBargeIn,
        showMonitor,
        showCoach,
        monitorDisabledTooltip,
        bargeInDisabledTooltip,
        coachDisabledTooltip,
        disabledTooltipPlacement = 'left',
    } = props;
    const sourceType = getSourceType(interactionSourceType);
    if (
        Object.prototype.hasOwnProperty.call(
            sourceTypeMap,
            interactionSourceType
        )
    ) {
        if (interactionSourceType === INTERACTION_SOURCES.VOICE) {
            return (
                <DigitalMonitorButtonContainer>
                    <DigitalMonitorButton
                        disabled={!showMonitor}
                        data-aid={SupervisorDataId.MONITOR_BUTTON}
                    >
                        {_getMonitorHoveredMenu({
                            monitorVoice: monitorVoice,
                            agentId,
                            monitoredAgent,
                            showMonitor,
                            uii: monitoredAgent.uii,
                            disabledTooltip: monitorDisabledTooltip,
                            disabledTooltipPlacement,
                        })}
                        <span
                            onClick={() =>
                                showMonitor &&
                                monitorVoice(
                                    agentId,
                                    MONITOR_TYPES.MONITOR,
                                    uii,
                                    sourceType
                                )
                            }
                        >
                            {translate('MONITORING.TOOL_TIP.MONITOR')}
                        </span>
                    </DigitalMonitorButton>
                    <DigitalMonitorButton
                        disabled={!showCoach}
                        data-aid={SupervisorDataId.COACH_BUTTON}
                    >
                        {_getCoachHoveredMenu({
                            monitorVoice,
                            agentId,
                            monitoredAgent,
                            uii,
                            interactionSourceType,
                            showCoach,
                            disabledTooltip: coachDisabledTooltip,
                            disabledTooltipPlacement,
                        })}
                        <span
                            onClick={() =>
                                showCoach &&
                                monitorVoice(
                                    agentId,
                                    MONITOR_TYPES.COACH,
                                    uii,
                                    sourceType
                                )
                            }
                        >
                            {translate('MONITORING.TOOL_TIP.COACH')}
                        </span>
                    </DigitalMonitorButton>
                    <DigitalMonitorButton
                        disabled={!showBargeIn}
                        data-aid={SupervisorDataId.BARGE_BUTTON}
                    >
                        {_getBargeInHoveredMenu({
                            monitorVoice,
                            agentId,
                            monitoredAgent,
                            uii,
                            interactionSourceType,
                            showBargeIn,
                            disabledTooltip: bargeInDisabledTooltip,
                            disabledTooltipPlacement,
                        })}
                        <span
                            onClick={() =>
                                showBargeIn &&
                                monitorVoice(
                                    agentId,
                                    MONITOR_TYPES.BARGE_IN,
                                    uii,
                                    sourceType
                                )
                            }
                        >
                            {translate('MONITORING.TOOL_TIP.BARGE_IN')}
                        </span>
                    </DigitalMonitorButton>
                </DigitalMonitorButtonContainer>
            );
        } else {
            return (
                <DigitalMonitorButtonContainer>
                    {/* Preview eye — opens the InteractionPreview panel for
                        this digital conversation (same as the Interactions
                        tab eye). Hidden when showMonitor is false. */}
                    {showMonitor && (
                        <Tooltip title="Preview conversation" placement={disabledTooltipPlacement}>
                            <StyledIconButton
                                size="medium"
                                aria-label="Preview conversation"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    (monitorVoice as any)(agentId, 'monitor', uii);
                                }}
                                data-testid={`button-digital-card-preview-${uii}`}
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
                    )}
                    <DigitalMonitorButton
                        disabled={!showBargeIn}
                        data-aid={SupervisorDataId.MONITOR_BUTTON}
                    >
                        {_getBargeInHoveredMenu({
                            monitorVoice,
                            agentId,
                            monitoredAgent,
                            uii,
                            interactionSourceType,
                            showBargeIn,
                            disabledTooltip: bargeInDisabledTooltip,
                            disabledTooltipPlacement,
                        })}
                        <span
                            onClick={() =>
                                showBargeIn &&
                                monitorVoice(
                                    agentId,
                                    MONITOR_TYPES.BARGE_IN,
                                    uii,
                                    sourceType
                                )
                            }
                        >
                            {translate('MONITORING.TOOL_TIP.BARGE_IN')}
                        </span>
                    </DigitalMonitorButton>
                </DigitalMonitorButtonContainer>
            );
        }
    }
    return [];
};
