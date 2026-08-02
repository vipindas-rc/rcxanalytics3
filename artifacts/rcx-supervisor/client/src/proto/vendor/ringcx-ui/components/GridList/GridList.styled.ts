import styled from 'styled-components';

import { GL_CLASSES } from './constants';

export const Wrapper = styled.div<{
    rowHeight: number;
    useDynamicHeight: boolean;
    isScrollDisabled: boolean;
}>`
    overflow: ${({ isScrollDisabled }) =>
        isScrollDisabled ? 'visible' : 'hidden'};
    width: 100%;
    flex-grow: 1;
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;

    /* Header lives outside the vertical scroller so the scrollbar track
       starts below it; horizontal position is synced from the body. */
    .${GL_CLASSES.HEAD_SCROLL} {
        flex: none;
        overflow: hidden;
        box-sizing: border-box;
    }

    /* The body owns both scroll axes; header follows scrollLeft. */
    .${GL_CLASSES.BODY} {
        flex: 1 1 auto;
        min-height: 0;
        overflow: ${({ isScrollDisabled }) =>
            isScrollDisabled ? 'visible' : 'auto'};
    }

    .${GL_CLASSES.HEAD_WRAPPER}, .${GL_CLASSES.LIST} {
        min-width: 100%;
    }

    .${GL_CLASSES.HEAD_WRAPPER} {
        background: ${({ theme }) => theme.colors.gray[0]};
        z-index: 1;
    }

    .${GL_CLASSES.HEAD} {
        border-bottom: 1px solid ${({ theme }) => theme.colors.gray[300]};
        max-width: ${({ theme }) => theme.dimensions.container};
        margin: auto;

        &.${GL_CLASSES.HEAD_GROUPED} {
            & > div:first-child {
                padding-left: 24px;
            }
        }
    }

    .${GL_CLASSES.HEAD_WRAPPER}, .${GL_CLASSES.LIST} {
        min-width: max-content;
        margin: auto;
    }

    .${GL_CLASSES.LIST} {
        margin-top: -1px;
    }

    .${GL_CLASSES.ROW} {
        border-top: 1px solid ${({ theme }) => theme.colors.gray[300]};
        border-bottom: 1px solid transparent;
    }

    :not(.${GL_CLASSES.ROW_GROUP}) > .${GL_CLASSES.ROW}:last-child {
        border-bottom: 1px solid ${({ theme }) => theme.colors.gray[300]};
    }

    .${GL_CLASSES.ROW_GROUP} {
        .${GL_CLASSES.ROW} {
            cursor: pointer;
            position: relative;

            & > div:first-of-type {
                padding-left: 24px;
            }

            &.${GL_CLASSES.ROW_OPEN} {
                height: ${({ rowHeight }) => rowHeight + 1}px;
                padding-bottom: 1px;
                border-bottom: 1px solid
                    ${({ theme }) => theme.colors.gray[300]};
            }
        }

        .${GL_CLASSES.ROW}, .${GL_CLASSES.SUB_ROW}, .${GL_CLASSES.EMPTY_ROW} {
            & > div:first-child {
                padding-left: 24px;
            }
        }

        &:last-child {
            border-bottom: 1px solid ${({ theme }) => theme.colors.gray[300]};
        }
    }

    .${GL_CLASSES.HEAD},
        .${GL_CLASSES.ROW},
        .${GL_CLASSES.SUB_ROW},
        .${GL_CLASSES.EMPTY_ROW} {
        display: grid;
    }

    .${GL_CLASSES.ROW}, .${GL_CLASSES.SUB_ROW}, .${GL_CLASSES.EMPTY_ROW} {
        height: ${({ rowHeight, useDynamicHeight }) =>
            useDynamicHeight ? 'auto' : rowHeight + 'px'};
    }

    .${GL_CLASSES.FOOTER} {
        position: sticky;
        bottom: 0;
        z-index: 1;
        height: 40px;

        &:empty {
            height: 0;
        }
    }
`;

export const SpinnerWrapper = styled.div`
    background: ${({ theme }) => theme.colors.gray[0]};
    position: absolute;
    z-index: ${({ theme }) => theme.zIndexes.spinnerOverlay};
    display: flex;
    top: 40px;
    bottom: 0;
    left: 0;
    right: 0;
    justify-content: center;
    align-items: center;
`;
