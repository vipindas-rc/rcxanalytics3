import { useEffect, useMemo, useRef, useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ActionButton, Dialer, NumericKeypad, buildAssets, type Assets } from "./Dialer";
import {
  startActivePreviewCall,
  endActivePreviewCall,
  toggleActivePreviewCallMute,
  useActivePreviewCall,
} from "../activePreviewCallStore";
import {
  transcriptTurnAt,
  type TranscriptTurn,
  type InteractionPreviewData,
  type PreviewMessage,
} from "../mock/supervisorMock";
import {
  ContextTabContent,
  ContactInfoSections,
  type ContextHopEvent,
} from "../InteractionPreview";

/**
 * Monitoring call window (Figma: mLIWieGGOG574eVKpKA50f, node 49:21797).
 *
 * A macOS-style "RingCX phone call" window (800x534) combining the monitoring
 * dialer (left, 280px) with a live Notes & Transcript panel (right, 520px).
 * Replaces the old MonitoringDialpad popup for voice monitoring.
 *
 * States (carried over from MonitoringDialpad):
 * - AI (Air) agent listening   -> Coach/Barge unavailable, Take over enabled
 * - Human agent listen-only    -> Mute disabled + tooltip, Coach/Barge/Take over
 * - Human agent barged         -> Mute toggles, Barge active, snackbar
 * - Taken over                 -> swaps to the existing active-call dialpad (Dialer)
 *
 * Non-modal (no backdrop) so the agent table stays clickable and the existing
 * monitor toggle semantics keep working.
 */

export type MonitoringCallWindowProps = {
  /**
   * "monitoring" (default): live monitoring of an agent's call.
   * "preview": preview-call variant — starts in an incoming (ringing) state
   * with Accept/Decline, hides Mute/Keypad/Audio and the monitoring actions,
   * titles the header "Preview call", and shows only the incoming number.
   */
  variant?: "monitoring" | "preview";
  agentName: string;
  agentType: "Air" | "Human";
  /** Customer side of the monitored call (design shows a phone number). */
  customerPhone?: string;
  /** Preview variant: queue the call came in on ("To: <queue>" header line). */
  queueName?: string;
  avatarBg?: string;
  /** Called whenever the window should close (end call, close control). */
  onClose: () => void;
  /** Host flash-toast hook for secondary feedback. */
  onToast?: (message: string) => void;
  /**
   * Fired when a voice take-over commits (the supervisor now owns the call),
   * so the host page can switch to the Active calls context.
   */
  onTakeOverCommitted?: () => void;
  /**
   * Preview variant: fired when the supervisor answers the incoming preview
   * call, so the host can register the active call and route to Active calls.
   */
  onPreviewAccepted?: () => void;
  /** Preview variant: remove the pending interaction after sending to voicemail. */
  onPreviewVoicemail?: () => void;
  /** Preview variant: open the host's Ignore confirmation dialog. */
  onPreviewIgnore?: () => void;
  /**
   * Preview variant: when set, the call is already answered — the window
   * opens connected (no ringing state) with the timer counting from this
   * epoch-ms accept time.
   */
  connectedAtMs?: number | null;
  /** Open the window with the Transfer sheet already up. */
  initialTransferOpen?: boolean;
  /**
   * Preview variant (Agent suggestion view): hide Transfer and Requeue from
   * the ringing footer so only Claim + Close are available.
   */
  hideTransferAndRequeue?: boolean;
  /**
   * Preview variant: label for the Claim button in the ringing
   * footer.  Defaults to "Claim".
   */
  previewClaimLabel?: string;
  // Fired when the taken-over call is ended from the popout dialer (End
  // call), as opposed to being handed off via transfer/requeue.
  onTakenOverCallEnded?: () => void;
  assetBasePath?: string;
  /** Per-interaction context (Context tab). Tab is hidden when omitted. */
  contextData?: InteractionPreviewData | null;
  /** Runtime hop-log additions owned by the host panel. */
  contextHops?: ContextHopEvent[];
  /** Reports live hop events (take over -> "you", transfer -> queue). */
  onContextHop?: (event: { kind: "you" | "queue"; name?: string }) => void;
};

type Phase = "passive" | "listening" | "coaching" | "barged" | "takenOver";
type PanelTab = "contact" | "notes" | "context";

const DEFAULT_CUSTOMER_PHONE = "(360) 765-2456";
const MONITORING_TOOLTIP = "Unavailable when monitoring";
// Coach (whisper) and Barge exist to support a human agent mid-call — they
// don't apply when an AI agent is handling the conversation (use Take over).
const AI_AGENT_TOOLTIP = "Not available for AI agents";
const WINDOW_W = 800;
const WINDOW_H = 534;
const LEFT_W = 280;

type MonitorAssets = Assets & {
  coach: string;
  barge: string;
  takeOver: string;
  popOut: string;
  collapse: string;
  contactUser: string;
  smartNotes: string;
  smartNotesActive: string;
  moreHoriz: string;
  aiSpinner: string;
  globe: string;
  notesPause: string;
  searchGray: string;
};

const MONITOR_ICON_VERSION = "?v=2";

function buildMonitorAssets(base: string): MonitorAssets {
  const p = base.replace(/\/$/, "");
  const v = MONITOR_ICON_VERSION;
  return {
    ...buildAssets(base),
    coach: `${p}/icon-coach-v2.svg`,
    barge: `${p}/icon-barge-v2.svg`,
    takeOver: `${p}/icon-take-over-v2.svg`,
    popOut: `${p}/icon-pop-out.svg${v}`,
    collapse: `${p}/icon-collapse-window.svg${v}`,
    contactUser: `${p}/icon-contact-user.svg${v}`,
    smartNotes: `${p}/icon-smart-notes.svg${v}`,
    smartNotesActive: `${p}/icon-smart-notes-active.svg${v}`,
    moreHoriz: `${p}/icon-more-horiz.svg`,
    aiSpinner: `${p}/icon-ai-spinner.svg${v}`,
    globe: `${p}/icon-globe.svg`,
    notesPause: `${p}/icon-notes-pause.svg${v}`,
    searchGray: `${p}/icon-search-gray.svg`,
  };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatClock(d: Date): string {
  let h = d.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${d.getMinutes().toString().padStart(2, "0")} ${suffix}`;
}

/* -------------------- DRAG SUPPORT -------------------- */

function useDragPosition() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const onDragPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // Don't hijack clicks on the titlebar's window controls.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      setOffset({
        x: d.baseX + (ev.clientX - d.startX),
        y: d.baseY + (ev.clientY - d.startY),
      });
    };
    const onUp = (ev: PointerEvent) => {
      if (drag.current?.pointerId !== ev.pointerId) return;
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { offset, onDragPointerDown };
}

/* -------------------- LIVE TRANSCRIPT FEED -------------------- */

type FeedEntry = TranscriptTurn & { at: string; key: number };

/**
 * Streams the shared mock transcript in as the call progresses: seeds a few
 * opening turns immediately, then appends a new turn every few seconds via
 * transcriptTurnAt (same feed mechanism the AI Insights panel uses).
 */
function useTranscriptFeed(agentName: string): FeedEntry[] {
  const [entries, setEntries] = useState<FeedEntry[]>(() => {
    const now = new Date();
    return [0, 1, 2, 3].map((i) => ({
      ...transcriptTurnAt(i, { isVoice: true, agentName }),
      at: formatClock(now),
      key: i,
    }));
  });
  const nextIndex = useRef(4);

  useEffect(() => {
    const id = window.setInterval(() => {
      const i = nextIndex.current;
      nextIndex.current += 1;
      setEntries((prev) => [
        ...prev,
        {
          ...transcriptTurnAt(i, { isVoice: true, agentName }),
          at: formatClock(new Date()),
          key: i,
        },
      ]);
    }, 4000);
    return () => window.clearInterval(id);
  }, [agentName]);

  return entries;
}

/* -------------------- SMALL PIECES -------------------- */

function WindowTitleBar({
  assets,
  onClose,
  onDragPointerDown,
  showTitle = true,
  title = "RingCX phone call",
}: {
  assets: MonitorAssets;
  onClose: () => void;
  onDragPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  showTitle?: boolean;
  title?: string;
}) {
  return (
    <div
      className="h-[28px] relative shrink-0 w-full bg-white border-b border-[#0000001a] cursor-grab active:cursor-grabbing touch-none select-none"
      onPointerDown={onDragPointerDown}
      data-testid="monitor-drag-handle"
    >
      <div className="absolute left-[8px] top-1/2 -translate-y-1/2 flex gap-[8px]">
        <button
          type="button"
          onClick={onClose}
          data-testid="button-monitor-close"
          className="size-[12px] p-0 border-none bg-transparent cursor-pointer hover:opacity-80 active:scale-90 transition-all"
          aria-label="Close"
        >
          <img alt="" className="size-[12px] block" src={assets.controlRed} />
        </button>
        <button
          type="button"
          data-testid="button-monitor-minimize"
          className="size-[12px] p-0 border-none bg-transparent cursor-pointer hover:opacity-80 active:scale-90 transition-all"
          aria-label="Minimize"
        >
          <img alt="" className="size-[12px] block" src={assets.controlYellow} />
        </button>
        <button
          type="button"
          data-testid="button-monitor-maximize"
          className="size-[12px] p-0 border-none bg-transparent cursor-pointer hover:opacity-80 active:scale-90 transition-all"
          aria-label="Maximize"
        >
          <img alt="" className="size-[12px] block" src={assets.controlGreen} />
        </button>
      </div>
      {showTitle && (
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-['Lato',sans-serif] font-bold text-[13px] text-[#121212] whitespace-nowrap select-none">
          {title}
        </p>
      )}
    </div>
  );
}

function MonitorHeaderRow({
  timer,
  assets,
  panelCollapsed,
  onTogglePanel,
}: {
  timer: string;
  assets: MonitorAssets;
  panelCollapsed: boolean;
  onTogglePanel: () => void;
}) {
  return (
    <div className="flex h-[36px] items-center justify-between w-full">
      <div className="flex gap-[4px] items-center">
        <time
          data-testid="text-monitor-timer"
          className="font-['Lato',sans-serif] font-bold leading-[20px] text-[14px] text-[#121212] whitespace-nowrap tabular-nums"
        >
          {timer}
        </time>
        <div className="flex gap-[4px] items-center">
          <img alt="Good connection" className="size-[16px]" src={assets.goodConnection} />
          <img alt="HD" className="size-[16px]" src={assets.hd} />
          <img alt="RingCentral Bridge off" className="size-[16px]" src={assets.rbnOff} />
        </div>
      </div>
      <div className="flex gap-[8px] items-center">
        <button
          type="button"
          data-testid="button-monitor-pop-out"
          className="size-[16px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70 active:scale-90 transition-all"
          aria-label="Pop out window"
        >
          <img alt="" className="size-[16px] block" src={assets.popOut} />
        </button>
        <button
          type="button"
          data-testid="button-monitor-collapse"
          onClick={onTogglePanel}
          className="size-[16px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70 active:scale-90 transition-all"
          aria-label={panelCollapsed ? "Show side panel" : "Hide side panel"}
        >
          <img
            alt=""
            className={`size-[16px] block transition-transform ${panelCollapsed ? "rotate-180" : ""}`}
            src={assets.collapse}
          />
        </button>
      </div>
    </div>
  );
}

function MonitorProfile({
  agentName,
  customerPhone,
  queueName,
  avatarBg,
  isPreview,
  connected,
  assets,
}: {
  agentName: string;
  customerPhone: string;
  queueName?: string;
  avatarBg: string;
  isPreview?: boolean;
  /** True once a preview call has been answered (ringing → connected). */
  connected?: boolean;
  assets?: ReturnType<typeof buildMonitorAssets>;
}) {
  // Three title states:
  // 1. Monitoring an agent's call  → "Monitoring call" + "Agent and Customer"
  // 2. Preview call, ringing        → never reaches here (hero banner shown)
  // 3. Preview call, answered       → customer phone as title, no subtitle
  const title = !isPreview
    ? "Monitoring call"
    : connected
      ? customerPhone
      : "Preview call";

  const subtitle = !isPreview
    ? `${agentName} and ${customerPhone}`
    : connected
      ? null
      : customerPhone;

  return (
    <div className="flex gap-[12px] items-start pb-[12px] pt-[10px] w-full">
      <div
        className="flex items-center justify-center rounded-full size-[40px] shrink-0"
        style={{ backgroundColor: avatarBg }}
      >
        <p className="font-['Lato',sans-serif] font-bold leading-[24px] text-[16px] text-white">
          {isPreview ? "C" : initialsOf(agentName)}
        </p>
      </div>
      <div className="flex flex-col items-start min-w-0">
        <p
          data-testid="text-monitoring-title"
          className="font-['Lato',sans-serif] font-bold leading-[24px] text-[16px] text-[#121212]"
        >
          {title}
        </p>
        {subtitle && (
          <p
            data-testid="text-monitoring-parties"
            className="font-['Lato',sans-serif] leading-[16px] text-[12px] text-[#121212]"
          >
            {subtitle}
          </p>
        )}
        {isPreview && connected && queueName && (
          /* Git reference (SPoG dialer): "To: <queue>" line + headset icon */
          <div className="flex items-center gap-[6px] pt-[2px]">
            <p
              data-testid="text-monitoring-queue"
              className="font-['Lato',sans-serif] leading-[16px] text-[12px] text-[#666666] m-0"
            >
              To: {queueName}
            </p>
            {assets?.headset && (
              <img alt="" className="size-[14px] block opacity-70" src={assets.headset} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Hover tooltip used on controls that are unavailable while monitoring. */
function UnavailableTooltip({
  children,
  label = MONITORING_TOOLTIP,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>
        <div className="inline-flex" data-testid="tooltip-unavailable-trigger">{children}</div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          sideOffset={4}
          className="z-[10001] bg-[#666666] text-white font-['Lato',sans-serif] text-[12px] leading-[16px] px-[8px] py-[4px] rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.25)] select-none"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[#666666]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function BargeSnackbar({ agentName, customerPhone }: { agentName: string; customerPhone: string }) {
  return (
    <div
      data-testid="snackbar-barge"
      className="absolute left-[140px] -translate-x-1/2 top-[40px] z-20 bg-[#666666] rounded-[4px] px-[16px] py-[12px] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.2),0px_4px_5px_0px_rgba(0,0,0,0.14),0px_1px_10px_0px_rgba(0,0,0,0.12)]"
    >
      <p className="font-['Lato',sans-serif] leading-[20px] text-[14px] text-white text-center whitespace-nowrap m-0">
        {agentName} and {customerPhone}
      </p>
      <p className="font-['Lato',sans-serif] leading-[20px] text-[14px] text-white text-center whitespace-nowrap m-0">
        can both hear you
      </p>
    </div>
  );
}

/** Whisper (coaching) snackbar — "Only [agent] can hear you". */
function WhisperSnackbar({ agentName }: { agentName: string }) {
  return (
    <div
      data-testid="snackbar-whisper"
      className="absolute left-[140px] -translate-x-1/2 top-[40px] z-20 bg-[#666666] rounded-[4px] px-[16px] py-[12px] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.2),0px_4px_5px_0px_rgba(0,0,0,0.14),0px_1px_10px_0px_rgba(0,0,0,0.12)]"
    >
      <p className="font-['Lato',sans-serif] leading-[20px] text-[14px] text-white text-center whitespace-nowrap m-0">
        Only {agentName} can hear you
      </p>
    </div>
  );
}

/* -------------------- RIGHT PANEL PIECES -------------------- */

function PanelTabBar({
  assets,
  activeTab,
  onTabChange,
  showContext = false,
  notesLabel = "Notes and transcripts",
  showNotesTab = true,
}: {
  assets: MonitorAssets;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  showContext?: boolean;
  // Preview calls show the pre-queue IVR transcript until accepted.
  notesLabel?: string;
  /** When false the Notes/Transcript tab is hidden (used for claimed preview calls). */
  showNotesTab?: boolean;
}) {
  const tabClass = (active: boolean) =>
    `relative flex h-[44px] items-center gap-[6px] px-[12px] border-none bg-transparent cursor-pointer font-['Lato',sans-serif] text-[14px] leading-[20px] whitespace-nowrap select-none transition-colors ${
      active ? "font-bold text-[#066FAC]" : "text-[#666666] hover:text-[#121212]"
    }`;
  const underline = (
    <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#066FAC] rounded-t-[2px]" />
  );
  return (
    <div className="flex items-center h-[44px] w-full border-b border-[#e0e0e0] px-[8px] shrink-0">
      <button
        type="button"
        className={tabClass(activeTab === "contact")}
        onClick={() => onTabChange("contact")}
        data-testid="tab-monitor-contact"
      >
        <img alt="" className="size-[20px] block" src={assets.contactUser} />
        Contact info
        {activeTab === "contact" && underline}
      </button>
      {showNotesTab && (
        <button
          type="button"
          className={tabClass(activeTab === "notes")}
          onClick={() => onTabChange("notes")}
          data-testid="tab-monitor-notes"
        >
          <img
            alt=""
            className="size-[20px] block"
            src={activeTab === "notes" ? assets.smartNotesActive : assets.smartNotes}
          />
          {notesLabel}
          {activeTab === "notes" && underline}
        </button>
      )}
      {showContext && (
        <button
          type="button"
          className={tabClass(activeTab === "context")}
          onClick={() => onTabChange("context")}
          data-testid="tab-monitor-context"
        >
          <img alt="" className="size-[20px] block" src={assets.globe} />
          Context
          {activeTab === "context" && underline}
        </button>
      )}
    </div>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5L9.7 6.3L14.5 8L9.7 9.7L8 14.5L6.3 9.7L1.5 8L6.3 6.3L8 1.5Z"
        stroke="#121212"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NotesPreviewState = "loading" | "ready";

function NotesPreviewSheet({
  state,
  lastUpdated,
  onUpdate,
  onClose,
}: {
  state: NotesPreviewState;
  lastUpdated: string;
  onUpdate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20" data-testid="notes-preview-overlay">
      {/* Scrim over the panel behind the sheet */}
      <div className="absolute inset-0 bg-black/50" />
      {/* White notes sheet */}
      <div className="absolute left-0 right-0 bottom-0 top-[36px] bg-white rounded-t-[8px] flex flex-col">
        <div className="flex items-start justify-between px-[16px] pt-[14px] pb-[10px] shrink-0">
          <div className="flex flex-col gap-[2px]">
            <div className="flex items-center gap-[6px]">
              <SparkleIcon />
              <h3 className="font-['Lato',sans-serif] font-bold text-[15px] leading-[20px] text-[#121212] m-0">
                Notes
              </h3>
            </div>
            {state === "loading" ? (
              <p
                data-testid="text-notes-preparing"
                className="font-['Lato',sans-serif] text-[13px] leading-[18px] text-[#666666] m-0"
              >
                Preparing notes...
              </p>
            ) : (
              <div className="flex items-center gap-[8px]">
                <p className="font-['Lato',sans-serif] text-[13px] leading-[18px] text-[#666666] m-0">
                  Last updated at {lastUpdated}
                </p>
                <span className="w-px h-[14px] bg-[#e0e0e0]" />
                <button
                  type="button"
                  onClick={onUpdate}
                  data-testid="button-notes-update"
                  className="flex items-center gap-[4px] border-none bg-transparent p-0 cursor-pointer font-['Lato',sans-serif] text-[13px] leading-[18px] text-[#066FAC] hover:underline"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3"
                      stroke="#066FAC"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Update
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-notes-close"
            aria-label="Close notes"
            className="size-[20px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70 text-[#121212]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="#121212" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 px-[16px] pb-[16px]">
          <div className="h-full rounded-[8px] border border-[#e0e0e0] overflow-y-auto [scrollbar-width:thin] p-[16px]">
            {state === "loading" ? (
              <div className="flex flex-col gap-[10px]" data-testid="notes-skeleton">
                <div className="h-[10px] w-[92%] rounded-full bg-[#fbe3d3] animate-pulse" />
                <div className="h-[10px] w-[88%] rounded-full bg-[#fbe3d3] animate-pulse [animation-delay:150ms]" />
                <div className="h-[10px] w-[64%] rounded-full bg-[#fbe3d3] animate-pulse [animation-delay:300ms]" />
              </div>
            ) : (
              <div className="flex flex-col gap-[12px]" data-testid="notes-content">
                <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212] m-0">
                  Sam is ordering one-color team shirts and needs pricing that fits his budget.
                </p>
                <div>
                  <h4 className="font-['Lato',sans-serif] font-bold text-[13px] leading-[18px] text-[#121212] m-0 mb-[6px]">
                    Recap
                  </h4>
                  <ul className="m-0 pl-[18px] list-disc space-y-[6px]">
                    {[
                      "Received a quote for team shirts, but it's over budget.",
                      "Found one-color shirts from Great Polos Inc. at around $4.8K for the whole order.",
                      "Needs the most up-to-date pricing sheet to compare options.",
                    ].map((line) => (
                      <li
                        key={line}
                        className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212]"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-['Lato',sans-serif] font-bold text-[13px] leading-[18px] text-[#121212] m-0 mb-[6px]">
                    Tasks
                  </h4>
                  <ul className="m-0 pl-[18px] list-disc space-y-[6px]">
                    {[
                      "Send the latest pricing sheet.",
                      "Follow up on the one-color shirt option and final order size.",
                    ].map((line) => (
                      <li
                        key={line}
                        className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212]"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AiTranscribingBanner({
  assets,
  paused,
  onTogglePause,
  onPreviewNotes,
}: {
  assets: MonitorAssets;
  paused: boolean;
  onTogglePause: () => void;
  onPreviewNotes: () => void;
}) {
  return (
    <div className="flex items-center gap-[8px] w-full rounded-[8px] bg-[#fdf0dd] px-[12px] py-[10px]">
      <span
        data-testid="loader-ai-transcribing"
        aria-hidden="true"
        className={`size-[18px] shrink-0 rounded-full border-2 border-[#e8890c]/25 border-t-[#e8890c] ${paused ? "" : "animate-spin [animation-duration:0.9s]"}`}
      />
      <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212] m-0">
        {paused ? "Transcription paused" : "AI is transcribing..."}
      </p>
      <button
        type="button"
        onClick={onPreviewNotes}
        data-testid="button-preview-notes"
        className="border-none bg-transparent p-0 cursor-pointer font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#066FAC] hover:underline"
      >
        Preview notes
      </button>
      <div className="ml-auto flex items-center gap-[10px]">
        <button
          type="button"
          data-testid="button-transcript-language"
          className="size-[18px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70"
          aria-label="Transcription language"
        >
          <img alt="" className="size-[18px] block" src={assets.globe} />
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          data-testid="button-transcript-pause"
          className="size-[18px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70"
          aria-label={paused ? "Resume transcription" : "Pause transcription"}
        >
          <img alt="" className="size-[18px] block" src={assets.notesPause} />
        </button>
      </div>
    </div>
  );
}

function TranscriptSearchField({
  assets,
  value,
  onChange,
}: {
  assets: MonitorAssets;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-[8px] w-full h-[32px] rounded-[16px] bg-[#f3f3f3] px-[12px]">
      <img alt="" className="size-[16px] block shrink-0" src={assets.searchGray} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        data-testid="input-transcript-search"
        className="flex-1 min-w-0 border-none bg-transparent outline-none font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212] placeholder:text-[#666666]"
      />
    </div>
  );
}

function TranscriptItem({
  entry,
  agentName,
  avatarBg,
}: {
  entry: FeedEntry;
  agentName: string;
  avatarBg: string;
}) {
  if (entry.type === "SYSTEM") {
    return (
      <div className="flex justify-center py-[6px]">
        <p className="font-['Lato',sans-serif] text-[12px] leading-[16px] text-[#666666] m-0">
          {entry.message}
        </p>
      </div>
    );
  }
  const name = entry.name ?? (entry.type === "AGENT" ? agentName : "Customer");
  const bg = entry.type === "AGENT" ? avatarBg : "#8a6fb8";
  return (
    <div className="flex gap-[10px] items-start py-[8px]" data-testid={`transcript-item-${entry.key}`}>
      <div
        className="flex items-center justify-center rounded-full size-[32px] shrink-0"
        style={{ backgroundColor: bg }}
      >
        <p className="font-['Lato',sans-serif] font-bold text-[12px] leading-[16px] text-white m-0">
          {initialsOf(name)}
        </p>
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-[8px]">
          <p className="font-['Lato',sans-serif] font-bold text-[14px] leading-[20px] text-[#121212] m-0 truncate">
            {name}
          </p>
          <p className="font-['Lato',sans-serif] text-[12px] leading-[16px] text-[#666666] m-0 shrink-0">
            {entry.at}
          </p>
        </div>
        <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#424242] m-0">
          {entry.message}
        </p>
      </div>
    </div>
  );
}

// Static IVR transcript line (pre-queue bot conversation), rendered in the
// same visual style as live transcript turns.
function IvrTranscriptItem({ msg }: { msg: PreviewMessage }) {
  if (msg.who === "system") {
    return (
      <div className="flex justify-center py-[6px]">
        <p className="font-['Lato',sans-serif] text-[12px] leading-[16px] text-[#666666] m-0">
          {msg.text}
        </p>
      </div>
    );
  }
  const name = msg.name ?? (msg.who === "customer" ? "Customer" : "Agent");
  const bg = msg.who === "customer" ? "#8a6fb8" : "#066fac";
  return (
    <div className="flex gap-[10px] items-start py-[8px]">
      <div
        className="flex items-center justify-center rounded-full size-[32px] shrink-0"
        style={{ backgroundColor: bg }}
      >
        <p className="font-['Lato',sans-serif] font-bold text-[12px] leading-[16px] text-white m-0">
          {msg.badge ?? initialsOf(name)}
        </p>
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-[8px]">
          <p className="font-['Lato',sans-serif] font-bold text-[14px] leading-[20px] text-[#121212] m-0 truncate">
            {name}
          </p>
          {msg.time && (
            <p className="font-['Lato',sans-serif] text-[12px] leading-[16px] text-[#666666] m-0 shrink-0">
              {msg.time}
            </p>
          )}
        </div>
        <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#424242] m-0">
          {msg.text}
        </p>
      </div>
    </div>
  );
}

function NotesTranscriptPanel({
  assets,
  agentName,
  avatarBg,
  onPreviewNotes,
  ivrMessages,
}: {
  assets: MonitorAssets;
  agentName: string;
  avatarBg: string;
  onPreviewNotes: () => void;
  // When set (preview call not yet accepted), the panel shows this static
  // pre-queue IVR transcript instead of the live call feed — there is no
  // active call to transcribe yet.
  ivrMessages?: PreviewMessage[] | null;
}) {
  const feed = useTranscriptFeed(agentName);
  const isIvr = !!ivrMessages;
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return feed;
    return feed.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        (e.name ?? "").toLowerCase().includes(q),
    );
  }, [feed, search]);

  const visibleIvr = useMemo(() => {
    if (!ivrMessages) return [];
    const q = search.trim().toLowerCase();
    if (!q) return ivrMessages;
    return ivrMessages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.name ?? "").toLowerCase().includes(q),
    );
  }, [ivrMessages, search]);

  // Keep the live feed pinned to the newest turn (unless searching).
  useEffect(() => {
    if (search) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length, search]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-[16px] pt-[12px] pb-[12px] gap-[10px]">
      <div className="flex items-center justify-between w-full shrink-0">
        <h2 className="font-['Lato',sans-serif] font-bold text-[16px] leading-[24px] text-[#121212] m-0">
          {isIvr ? "IVR transcript" : "Notes and transcript"}
        </h2>
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            data-testid="button-notes-pop-out"
            className="size-[16px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70"
            aria-label="Open notes in a new window"
          >
            <img alt="" className="size-[16px] block" src={assets.popOut} />
          </button>
          <button
            type="button"
            data-testid="button-notes-more"
            className="size-[16px] p-0 border-none bg-transparent cursor-pointer hover:opacity-70"
            aria-label="More options"
          >
            <img alt="" className="size-[16px] block" src={assets.moreHoriz} />
          </button>
        </div>
      </div>

      {/* No live transcription before the call is accepted — the AI banner
          only appears for an active call. */}
      {!isIvr && (
        <AiTranscribingBanner
          assets={assets}
          paused={paused}
          onTogglePause={() => setPaused((v) => !v)}
          onPreviewNotes={onPreviewNotes}
        />
      )}

      <TranscriptSearchField assets={assets} value={search} onChange={setSearch} />

      <div
        ref={listRef}
        data-testid="transcript-list"
        className="flex-1 min-h-0 overflow-y-auto pr-[6px] [scrollbar-width:thin]"
      >
        {isIvr
          ? visibleIvr.map((msg, i) => <IvrTranscriptItem key={i} msg={msg} />)
          : visible.map((entry) => (
              <TranscriptItem
                key={entry.key}
                entry={entry}
                agentName={agentName}
                avatarBg={avatarBg}
              />
            ))}
        {(isIvr ? visibleIvr.length : visible.length) === 0 && (
          <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#666666] text-center pt-[24px]">
            No matching transcript lines
          </p>
        )}
      </div>

    </div>
  );
}

// Contact info tab: renders the exact same section-row layout as the digital
// Interaction preview's Contact info pane (shared ContactInfoSections), so
// voice and digital surfaces stay consistent. Falls back to a minimal
// phone-only view when no preview data is available.
function ContactInfoPanel({
  customerPhone,
  contextData,
}: {
  customerPhone: string;
  contextData?: InteractionPreviewData | null;
}) {
  if (contextData) {
    return (
      <div
        className="flex flex-col flex-1 min-h-0 w-full"
        data-testid="monitoring-contact-info"
      >
        <ContactInfoSections data={contextData} />
      </div>
    );
  }
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full px-[16px] pt-[12px] gap-[12px]">
      <h2 className="font-['Lato',sans-serif] font-bold text-[16px] leading-[24px] text-[#121212] m-0">
        Contact info
      </h2>
      <div className="flex flex-col gap-[8px]">
        <div>
          <p className="font-['Lato',sans-serif] text-[12px] leading-[16px] text-[#666666] m-0">
            Phone
          </p>
          <p className="font-['Lato',sans-serif] text-[14px] leading-[20px] text-[#121212] m-0">
            {customerPhone}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------- MONITORING CONTROL HELPERS -------------------- */

/**
 * "Stop monitoring" exit button — closes the supervisor window without ending
 * the agent's call. Neutral styling; eye-with-slash icon matches the table's
 * monitor/preview eye glyph.
 */
function StopMonitoringButton({ onStop }: { onStop: () => void }) {
  return (
    <div className="flex flex-col items-center gap-[8px]">
      <button
        type="button"
        onClick={onStop}
        data-testid="button-stop-monitoring"
        aria-label="Stop monitoring"
        className="flex items-center justify-center rounded-full size-[56px] bg-[#f3f3f3] border-none cursor-pointer hover:bg-[#e8e8e8] active:scale-95 transition-all"
      >
        {/* Eye with diagonal slash — same eye glyph as the table monitor action */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#121212"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
          <line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      </button>
      <p className="font-['Lato',sans-serif] font-bold leading-[16px] text-[12px] text-[#666666] m-0">
        Stop monitoring
      </p>
    </div>
  );
}

/* -------------------- MAIN COMPONENT -------------------- */

export function MonitoringCallWindow({
  variant = "monitoring",
  agentName,
  agentType,
  customerPhone = DEFAULT_CUSTOMER_PHONE,
  customerName,
  queueName,
  avatarBg = "#509ac4",
  onClose,
  onToast,
  onTakeOverCommitted,
  onPreviewAccepted,
  onPreviewVoicemail,
  onPreviewIgnore,
  connectedAtMs = null,
  initialTransferOpen = false,
  hideTransferAndRequeue = false,
  previewClaimLabel = "Claim",
  onTakenOverCallEnded,
  assetBasePath = "/figmaAssets",
  contextData = null,
  contextHops = [],
  onContextHop,
}: MonitoringCallWindowProps) {
  const assets = buildMonitorAssets(assetBasePath);
  const isPreview = variant === "preview";
  const isHumanMonitoring = agentType === "Human" && !isPreview;
  // Human monitoring starts directly in listening mode (no passive/listen-toggle step).
  // AI monitoring and preview calls start passive / ringing as before.
  const [phase, setPhase] = useState<Phase>(isHumanMonitoring ? "listening" : "passive");
  // Preview calls open in an incoming (ringing) state: Accept connects,
  // Decline closes the window.
  const [ringing, setRinging] = useState(isPreview && connectedAtMs == null);
  const [seconds, setSeconds] = useState(() =>
    connectedAtMs != null
      ? Math.max(0, Math.floor((Date.now() - connectedAtMs) / 1000))
      : isPreview
        ? 0
        : 11,
  );
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  // Whisper (coaching) snackbar — "Only [agent] can hear you".
  const [whisperSnackbarVisible, setWhisperSnackbarVisible] = useState(false);
  const [supervisorMuted, setSupervisorMuted] = useState(false);

  // In-progress preview call controls. Mute is shared with the top-bar call
  // chip via the app-wide store; Hold and Keypad are window-local.
  const activePreviewCall = useActivePreviewCall();
  const previewCallMuted = activePreviewCall?.muted ?? false;
  const handlePreviewMuteToggle = () => toggleActivePreviewCallMute();
  const [previewOnHold, setPreviewOnHold] = useState(false);
  const [previewKeypadOpen, setPreviewKeypadOpen] = useState(false);
  const [previewRecording, setPreviewRecording] = useState(true);
  const handlePreviewHoldToggle = () => {
    const next = !previewOnHold;
    setPreviewOnHold(next);
    onToast?.(next ? "Call on hold" : "Call resumed");
  };
  const [activeTab, setActiveTab] = useState<PanelTab>("notes");
  // The incoming preview reference is a compact phone window; monitoring keeps
  // the notes panel open unless a transfer sheet explicitly collapsed it.
  const [panelCollapsed, setPanelCollapsed] = useState(
    initialTransferOpen,
  );
  const [notesPreview, setNotesPreview] = useState<NotesPreviewState | null>(null);
  const [notesUpdatedAt, setNotesUpdatedAt] = useState("");
  // Transfer opens the dialer's transfer workflow ("Ask first" warm / blind)
  // in an overlay; completing it hands the call off and ends monitoring.
  const [transferOpen, setTransferOpen] = useState(initialTransferOpen);
  // Requeue opens the dialer's requeue workflow (queue list with wait
  // indicators) in the same in-window overlay pattern as Transfer.
  const [requeueOpen, setRequeueOpen] = useState(false);

  const handlePreviewVoicemail = () => {
    onToast?.("Call sent to voicemail.");
    onPreviewVoicemail?.();
    onClose();
  };

  useEffect(() => {
    if (notesPreview !== "loading") return;
    const id = window.setTimeout(() => {
      setNotesUpdatedAt(
        new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      );
      setNotesPreview("ready");
    }, 1800);
    return () => window.clearTimeout(id);
  }, [notesPreview]);
  const { offset, onDragPointerDown } = useDragPosition();

  const isPassive   = phase === "passive";
  const isListening = phase === "listening";
  const isCoaching  = phase === "coaching";
  const isBarged    = phase === "barged";
  const isTakenOver = phase === "takenOver";

  useEffect(() => {
    if (isTakenOver || ringing) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isTakenOver, ringing]);

  useEffect(() => {
    if (!snackbarVisible) return;
    const id = window.setTimeout(() => setSnackbarVisible(false), 5000);
    return () => window.clearTimeout(id);
  }, [snackbarVisible]);

  useEffect(() => {
    if (!whisperSnackbarVisible) return;
    const id = window.setTimeout(() => setWhisperSnackbarVisible(false), 5000);
    return () => window.clearTimeout(id);
  }, [whisperSnackbarVisible]);

  const handleListen = () => setPhase("listening");

  const handleCoach = () => {
    setPhase("coaching");
    setSupervisorMuted(false);
  };

  /** Human monitoring: enter Whisper (coaching) mode — only the agent can hear the supervisor. */
  const handleWhisper = () => {
    setPhase("coaching");
    setSupervisorMuted(false);
    setWhisperSnackbarVisible(true);
  };

  const handleBarge = () => {
    setPhase("barged");
    setSupervisorMuted(false);
    setSnackbarVisible(true);
    setWhisperSnackbarVisible(false);
  };

  const handleStopBarge = () => {
    setPhase("listening");
    setSupervisorMuted(false);
    setSnackbarVisible(false);
  };

  const handleTakeOver = () => {
    setSnackbarVisible(false);
    setPhase("takenOver");
    onContextHop?.({ kind: "you" });
    onToast?.(`You've claimed the call from ${agentName}`);
    // Voice take-over committed — the host page switches to Active calls.
    onTakeOverCommitted?.();
  };

  // Reuse the existing "active preview call" chip in the header for human
  // monitoring — no separate chip needed.  On mount we register a synthetic
  // active call (agent name as the "number"); on unmount we clear it.
  useEffect(() => {
    if (!isHumanMonitoring) return;
    startActivePreviewCall({
      number: agentName,
      queueName: "Monitoring call",
      engagementId: `monitor-${agentName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
    });
    return () => {
      endActivePreviewCall();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHumanMonitoring, agentName]);

  // If the chip's end button clears the store externally, close the window too.
  // Use hadActiveCallRef so we only react after the store has been set at least
  // once — avoids an immediate close from the first-render effect ordering
  // (Effect 1 calls startActivePreviewCall but the store hasn't re-rendered yet
  // when Effect 2 first runs, so activePreviewCall would still read as null).
  const hadActiveCallRef = useRef(false);
  useEffect(() => {
    if (!isHumanMonitoring) return;
    if (activePreviewCall) {
      hadActiveCallRef.current = true;
    } else if (hadActiveCallRef.current) {
      onClose();
    }
  }, [isHumanMonitoring, activePreviewCall, onClose]);

  /* ---------- taken-over: swap to the existing active-call dialpad ---------- */
  if (isTakenOver) {
    return (
      <div
        className="fixed z-[9998]"
        style={{
          right: 32,
          top: 96,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
        data-testid="monitoring-dialpad-takeover"
      >
        <div className="relative">
          {/* Transparent drag strip over the dialpad's (inert) titlebar. */}
          <div
            className="absolute top-0 left-0 right-0 h-[28px] z-10 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={onDragPointerDown}
            data-testid="monitor-drag-handle-takeover"
          />
          <Dialer
            initialView="call"
            caller={{ name: customerPhone, phone: "", initials: "C", avatarBg }}
            style={{ minHeight: 0, width: "auto", background: "transparent", padding: 0 }}
            assetBasePath={assetBasePath}
            onToast={(t) => onToast?.(t.description ? `${t.title} — ${t.description}` : t.title)}
            // Ending the call closes the popout AND leaves the Active calls
            // context — the page returns to the Supervisor tab.
            onCallEnd={() => {
              onClose();
              onTakenOverCallEnded?.();
            }}
            // Completing a transfer or requeue hands the call off: close the
            // popout but leave the page's Active calls context (route) untouched.
            onTransferComplete={onClose}
            onRequeueComplete={onClose}
          />
        </div>
      </div>
    );
  }

  const isHuman = agentType === "Human";
  return (
    <TooltipPrimitive.Provider>
      <>
      <div
        className="fixed z-[9998]"
        style={{
          left: "50%",
          top: 80,
          transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        }}
        data-testid="monitoring-call-window"
      >
        <div
          className="relative bg-white flex flex-col overflow-visible rounded-[8px] shadow-[0px_7px_8px_-4px_rgba(0,0,0,0.2),0px_12px_17px_2px_rgba(0,0,0,0.14),0px_5px_22px_4px_rgba(0,0,0,0.12)]"
          style={{
            width: panelCollapsed ? LEFT_W : WINDOW_W,
            height: WINDOW_H,
            transition: "width 200ms ease",
          }}
        >
          {isBarged && snackbarVisible && (
            <BargeSnackbar agentName={agentName} customerPhone={customerPhone} />
          )}
          <div className="w-full h-full overflow-hidden rounded-[8px] flex flex-col">
            <WindowTitleBar
              assets={assets}
              onClose={onClose}
              onDragPointerDown={onDragPointerDown}
              title={isPreview ? "RingCentral Phone" : "RingCX phone call"}
            />
            <div className="flex flex-1 min-h-0 w-full">
              {/* ---------- LEFT: monitoring dialer ---------- */}
              <div
                className={`relative flex flex-col shrink-0 h-full ${panelCollapsed ? "" : "border-r border-[#e0e0e0]"}`}
                style={{ width: LEFT_W }}
                data-testid="monitoring-dialer-panel"
              >
                {ringing ? (
                  /* Incoming preview call: RingCentral Phone-style incoming
                     screen (Figma: Agent-peer-view, node 30-1169) — blue hero
                     with avatar, then the caller number front and center. */
                  <>
                    {/* Figma: Top Container 280×212, fill #509ac4; avatar 100×100, fill #f3f3f3 */}
                    <div className="relative flex items-center justify-center bg-[#0b76b2] w-full h-[212px] shrink-0">
                      <div className="absolute top-[10px] right-[12px] flex gap-[10px] items-center">
                        <button
                          type="button"
                          data-testid="button-preview-pop-out"
                          aria-label="Pop out window"
                          className="size-[16px] p-0 border-none bg-transparent cursor-pointer opacity-90 hover:opacity-100 active:scale-90 transition-all"
                        >
                          <img
                            alt=""
                            className="size-[16px] block"
                            style={{ filter: "brightness(0) invert(1)" }}
                            src={assets.popOut}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPanelCollapsed((v) => !v)}
                          data-testid="button-preview-collapse"
                          aria-label={
                            panelCollapsed ? "Show side panel" : "Hide side panel"
                          }
                          className="size-[16px] p-0 border-none bg-transparent cursor-pointer opacity-90 hover:opacity-100 active:scale-90 transition-all"
                        >
                          <img
                            alt=""
                            className={`size-[16px] block transition-transform ${panelCollapsed ? "rotate-180" : ""}`}
                            style={{ filter: "brightness(0) invert(1)" }}
                            src={assets.collapse}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-center rounded-full size-[100px] bg-[#f3f3f3]">
                        <svg
                          width="44"
                          height="44"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0b76b2"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4.5 20c1.2-3.4 4.1-5 7.5-5s6.3 1.6 7.5 5" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-[6px] pt-[28px] px-[16px] w-full">
                      <p
                        data-testid="text-preview-caller"
                        className="font-['Lato',sans-serif] font-bold leading-[28px] text-[20px] text-[#121212] m-0 text-center"
                      >
                        {customerPhone}
                      </p>
                      <p
                        data-testid="text-incoming-call"
                        className="font-['Lato',sans-serif] leading-[20px] text-[14px] text-[#666666] m-0 text-center"
                      >
                        Preview call
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-start px-[16px] w-full">
                    <MonitorHeaderRow
                      timer={formatTime(seconds)}
                      assets={assets}
                      panelCollapsed={panelCollapsed}
                      onTogglePanel={() => setPanelCollapsed((v) => !v)}
                    />
                    <MonitorProfile
                      agentName={agentName}
                      customerName={customerName}
                      customerPhone={customerPhone}
                      queueName={queueName}
                      avatarBg={avatarBg}
                      isPreview={isPreview}
                      connected={!ringing}
                      assets={assets}
                    />
                  </div>
                )}

                {!isPreview && isHuman && (
                  /* ── Human agent: Mute / Dialpad / Audio + Whisper / Barge ──
                     All 5 buttons share one flex-wrap 3-col container so both
                     rows line up. Whisper enters coaching mode (snackbar), Barge
                     puts supervisor into the call audibly. No Claim/Transfer/Requeue. */
                <div className="flex flex-col gap-[12px] items-center pt-[20px] px-[10px] w-full">
                  {isCoaching && whisperSnackbarVisible && (
                    <WhisperSnackbar agentName={agentName} />
                  )}
                  <div className="flex flex-wrap justify-start gap-y-[12px] w-[240px]">
                    {/* Row 1: Mute / Dialpad (always disabled) / Audio */}
                    {/* Mute is synced to the header chip (activePreviewCall.muted).
                        Disabled in listening-only mode; enabled in whisper/barge. */}
                    <ActionButton
                      imgSrc={assets.mute}
                      imgAlt=""
                      label={activePreviewCall?.muted ? "Unmute" : "Mute"}
                      disabled={isListening}
                      active={(isCoaching || isBarged) && (activePreviewCall?.muted ?? false)}
                      onClick={isCoaching || isBarged ? toggleActivePreviewCallMute : undefined}
                      testId="button-monitor-mute"
                    />
                    <UnavailableTooltip>
                      <ActionButton
                        imgSrc={assets.keypad}
                        imgAlt=""
                        label="Dialpad"
                        disabled
                        testId="button-monitor-dialpad"
                      />
                    </UnavailableTooltip>
                    <ActionButton
                      imgSrc={assets.audio}
                      imgAlt=""
                      label="Audio"
                      testId="button-monitor-audio"
                    />
                    {/* Row 2: Whisper / Barge — aligns under Mute / Dialpad */}
                    {isBarged ? (
                      <UnavailableTooltip label="Not available while barged">
                        <ActionButton
                          imgSrc={assets.coach}
                          imgAlt=""
                          label="Whisper"
                          disabled
                          testId="button-monitor-whisper"
                        />
                      </UnavailableTooltip>
                    ) : (
                      <ActionButton
                        imgSrc={assets.coach}
                        imgAlt=""
                        label="Whisper"
                        active={isCoaching}
                        onClick={
                          isCoaching
                            ? () => { setPhase("listening"); setWhisperSnackbarVisible(false); }
                            : handleWhisper
                        }
                        testId="button-monitor-whisper"
                      />
                    )}
                    <ActionButton
                      imgSrc={assets.barge}
                      imgAlt=""
                      label="Barge"
                      active={isBarged}
                      onClick={isBarged ? handleStopBarge : handleBarge}
                      testId="button-monitor-barge"
                    />
                  </div>
                </div>
                )}

                {!isPreview && !isHuman && (
                <div className="flex flex-col gap-[12px] items-center pt-[20px] px-[10px] w-full">
                  {/* ── AI agent: Listen / Coach / Barge / Transfer / Requeue / Claim ── */}
                  {isBarged ? null : (
                    <div className="flex flex-wrap justify-start gap-y-[12px] w-[240px]">
                      <ActionButton
                        imgSrc={assets.headset}
                        imgAlt=""
                        label="Listen"
                        active={!isPassive}
                        onClick={() => (isPassive ? handleListen() : setPhase("passive"))}
                        testId="button-monitor-listen"
                      />
                      <ActionButton
                        imgSrc={assets.audio}
                        imgAlt=""
                        label="Audio"
                        disabled={isPassive}
                        testId="button-monitor-audio"
                      />
                      {!isPassive && (
                        <>
                          <ActionButton
                            imgSrc={assets.mute}
                            imgAlt=""
                            label="Mute"
                            disabled={!isCoaching}
                            active={isCoaching && supervisorMuted}
                            onClick={
                              isCoaching
                                ? () => setSupervisorMuted((v) => !v)
                                : undefined
                            }
                            testId="button-monitor-mute"
                          />
                        </>
                      )}
                      <ActionButton
                        imgSrc={assets.transfer}
                        imgAlt=""
                        label="Transfer"
                        onClick={() => setTransferOpen(true)}
                        testId="button-monitor-transfer"
                      />
                      <ActionButton
                        imgSrc={assets.requeue}
                        imgAlt=""
                        label="Requeue"
                        onClick={() => setRequeueOpen(true)}
                        testId="button-monitor-requeue"
                      />
                      {!isPassive && (
                        <ActionButton
                          imgSrc={assets.takeOver}
                          imgAlt=""
                          label="Claim"
                          onClick={handleTakeOver}
                          testId="button-monitor-take-over"
                        />
                      )}
                    </div>
                  )}
                </div>
                )}

                {isPreview && !ringing && (
                  /* In-progress preview call controls (SPoG dialer action
                     grid, trimmed to what this prototype supports). */
                  <div className="flex flex-col gap-[12px] items-center pt-[24px] px-[10px] w-full">
                    {/* Row 1: Mute / Keypad / Audio */}
                    <div className="flex items-start justify-center">
                      <ActionButton
                        imgSrc={assets.mute}
                        imgAlt=""
                        label="Mute"
                        active={previewCallMuted}
                        onClick={handlePreviewMuteToggle}
                        testId="button-preview-call-mute"
                      />
                      <ActionButton
                        imgSrc={assets.keypad}
                        imgAlt=""
                        label="Keypad"
                        active={previewKeypadOpen}
                        onClick={() => setPreviewKeypadOpen((v) => !v)}
                        testId="button-preview-call-keypad"
                      />
                      <ActionButton
                        imgSrc={assets.audio}
                        imgAlt=""
                        label="Audio"
                        testId="button-preview-call-audio"
                      />
                    </div>
                    {/* Row 2: Requeue / Hold / Transfer (SPoG dialer order) */}
                    <div className="flex items-start justify-center">
                      <ActionButton
                        imgSrc={assets.requeue}
                        imgAlt=""
                        label="Requeue"
                        onClick={() => setRequeueOpen(true)}
                        testId="button-preview-call-requeue"
                      />
                      <ActionButton
                        imgSrc={assets.hold}
                        imgAlt=""
                        label={previewOnHold ? "Resume" : "Hold"}
                        active={previewOnHold}
                        onClick={handlePreviewHoldToggle}
                        testId="button-preview-call-hold"
                      />
                      <ActionButton
                        imgSrc={assets.transfer}
                        imgAlt=""
                        label="Transfer"
                        onClick={() => setTransferOpen(true)}
                        testId="button-preview-call-transfer"
                      />
                    </div>
                    {/* Row 3: Stop Rec / Disposition (left-aligned, spacer keeps 3-col grid) */}
                    <div className="flex items-start justify-center">
                      <ActionButton
                        imgSrc={assets.stopRec}
                        imgAlt=""
                        label="Stop Rec"
                        buttonBg="bg-[rgba(190,57,51,0.12)]"
                        disabled={!previewRecording}
                        onClick={() => {
                          setPreviewRecording(false);
                          onToast?.("Recording has been stopped");
                        }}
                        testId="button-preview-call-stop-rec"
                      />
                      <ActionButton
                        imgAlt=""
                        label="Disposition"
                        onClick={() => onToast?.("Disposition isn't available in this prototype yet")}
                        testId="button-preview-call-disposition"
                      >
                        <div className="h-[24px] relative w-[27px]">
                          <div className="absolute inset-[7.96%_33.61%_6.52%_7%]">
                            <div className="absolute inset-[-4.38%_-5.61%]">
                              <img alt="" className="block size-full" src={assets.dispositionGroup7} />
                            </div>
                          </div>
                          <div className="absolute inset-[24.68%_8.43%_23.51%_45.97%]">
                            <div className="absolute inset-[-7.01%_-8.33%_-1.75%_0]">
                              <img alt="" className="block size-full" src={assets.dispositionGroup23} />
                            </div>
                          </div>
                        </div>
                      </ActionButton>
                      <div className="w-[80px]" />
                    </div>
                    {previewKeypadOpen && (
                      <div className="pt-[4px]">
                        <NumericKeypad
                          onDigit={(d) => onToast?.(`Sent digit ${d}`)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {ringing ? (
                  /* Preview call actions: Transfer / Ignore / Requeue above
                     To voicemail / Claim. */
                  <div className="mt-auto flex flex-col items-center pb-[40px] w-full">
                    <div className="grid grid-cols-3 items-start justify-items-center gap-x-0 gap-y-[24px] w-[240px]">
                      {!hideTransferAndRequeue && (
                        <div className="flex flex-col items-center gap-[6px]">
                          <button
                            type="button"
                            onClick={() => setTransferOpen(true)}
                            data-testid="button-preview-transfer"
                            aria-label="Transfer"
                            className="bg-[#f2f2f2] flex items-center justify-center rounded-full size-[36px] border-none cursor-pointer hover:bg-[#e5e5e5] active:scale-95 transition-all"
                          >
                            <img alt="" className="size-[16px] block" src={assets.transfer} />
                          </button>
                          <p className="font-['Lato',sans-serif] leading-[18px] text-[13px] text-[#121212] m-0">
                            Transfer
                          </p>
                        </div>
                      )}
                      {!hideTransferAndRequeue && (
                        <div className="flex flex-col items-center gap-[6px]">
                          <button
                            type="button"
                            onClick={onPreviewIgnore}
                            data-testid="button-preview-ignore"
                            aria-label="Ignore"
                            className="bg-[#f2f2f2] flex items-center justify-center rounded-full size-[36px] border-none cursor-pointer hover:bg-[#e5e5e5] active:scale-95 transition-all"
                          >
                            <span className="font-['Lato',sans-serif] font-bold leading-none text-[18px] text-[#666666]">
                              ×
                            </span>
                          </button>
                          <p className="font-['Lato',sans-serif] leading-[18px] text-[13px] text-[#121212] m-0">
                            Ignore
                          </p>
                        </div>
                      )}
                      {!hideTransferAndRequeue && (
                        <div className="flex flex-col items-center gap-[6px]">
                          <button
                            type="button"
                            onClick={() => setRequeueOpen(true)}
                            data-testid="button-preview-requeue"
                            aria-label="Requeue"
                            className="bg-[#f2f2f2] flex items-center justify-center rounded-full size-[36px] border-none cursor-pointer hover:bg-[#e5e5e5] active:scale-95 transition-all"
                          >
                            <img alt="" className="size-[16px] block" src={assets.requeue} />
                          </button>
                          <p className="font-['Lato',sans-serif] leading-[18px] text-[13px] text-[#121212] m-0">
                            Requeue
                          </p>
                        </div>
                      )}
                      {!hideTransferAndRequeue && (
                        <div className="col-start-1 flex flex-col items-center gap-[6px]">
                          <button
                            type="button"
                            onClick={handlePreviewVoicemail}
                            data-testid="button-preview-voicemail"
                            aria-label="To voicemail"
                            className="bg-[#e6413c] flex items-center justify-center rounded-full size-[36px] border-none cursor-pointer hover:bg-[#d93a35] active:scale-95 transition-all"
                          >
                            <img
                              alt=""
                              className="size-[16px] block [filter:brightness(0)_invert(1)]"
                              src={assets.voicemail}
                            />
                          </button>
                          <p className="font-['Lato',sans-serif] leading-[18px] text-[13px] text-[#121212] m-0">
                            To voicemail
                          </p>
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-[6px]">
                        <button
                          type="button"
                          onClick={() => {
                            if (onPreviewAccepted) {
                              onPreviewAccepted();
                              return;
                            }
                            setRinging(false);
                          }}
                          data-testid="button-preview-claim"
                          aria-label={previewClaimLabel ?? "Claim"}
                          className="bg-[#35a853] flex items-center justify-center rounded-full size-[36px] border-none cursor-pointer hover:bg-[#2d9147] active:scale-95 transition-all"
                        >
                          <img alt="" className="size-[12px] block [filter:brightness(0)_invert(1)]" src={assets.callmd} />
                        </button>
                        <p className="font-['Lato',sans-serif] leading-[18px] text-[13px] text-[#121212] m-0">
                          {previewClaimLabel ?? "Claim"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex items-center justify-center pb-[24px] w-full">
                    {isPreview ? (
                      /* Claimed preview call: End call ends the supervisor's own call */
                      <button
                        type="button"
                        onClick={onClose}
                        data-testid="button-monitor-end-call"
                        className="bg-[#e6413c] flex items-center justify-center rounded-full size-[56px] border-none cursor-pointer hover:bg-[#d93a35] active:scale-95 transition-all"
                        aria-label="End call"
                      >
                        <img alt="" className="size-[28px] block" src={assets.hangUp} />
                      </button>
                    ) : (
                      /* Monitoring: Stop monitoring exits without ending the agent's call */
                      <StopMonitoringButton onStop={onClose} />
                    )}
                  </div>
                )}

                {/* Barged — the supervisor is now audible in the call, so the
                    left panel becomes the git dialer's conference view: the
                    customer on top, conference grid, and a red End call that
                    opens the "how do you want to end" sheet.                  */}
                {isBarged && !transferOpen && (
                  <div
                    className="absolute inset-0 z-10 bg-white flex flex-col overflow-hidden"
                    data-testid="overlay-monitor-conference"
                  >
                    <Dialer
                      initialView="conference"
                      manageCallMode="v2"
                      hideTitleBar
                      style={{
                        minHeight: 0,
                        width: "100%",
                        background: "transparent",
                        padding: 0,
                        flex: 1,
                      }}
                      warmCaller={{
                        name: customerPhone,
                        phone: customerPhone,
                        initials: "C",
                        avatarBg,
                      }}
                      assetBasePath={assetBasePath}
                      onToast={(t) =>
                        onToast?.(t.description ? `${t.title} — ${t.description}` : t.title)
                      }
                      onCallEnd={(reason) => {
                        if (reason === "everyone") {
                          onClose();
                        } else {
                          // Supervisor left the conference — drop back to
                          // listening; the agent and customer stay connected.
                          setSnackbarVisible(false);
                          setPhase("listening");
                        }
                      }}
                    />
                  </div>
                )}

                {/* Transfer workflow — in-window overlay over the left panel so
                    the notes / transcript panel remains visible behind it.     */}
                {transferOpen && (
                  <div
                    className="absolute inset-0 z-10 bg-white flex flex-col overflow-hidden"
                    data-testid="overlay-monitor-transfer"
                  >
                    <Dialer
                      initialView="transfer"
                      manageCallMode="v2"
                      hideTitleBar
                      style={{
                        minHeight: 0,
                        width: "100%",
                        background: "transparent",
                        padding: 0,
                        flex: 1,
                      }}
                      assetBasePath={assetBasePath}
                      onToast={(t) =>
                        onToast?.(t.description ? `${t.title} — ${t.description}` : t.title)
                      }
                      onTransferBack={() => setTransferOpen(false)}
                      onTransferComplete={(target) => {
                        if (target) onContextHop?.({ kind: "queue", name: target });
                        setTransferOpen(false);
                        onClose();
                      }}
                      onCallEnd={() => setTransferOpen(false)}
                    />
                  </div>
                )}

                {/* Requeue workflow — same in-window overlay pattern as the
                    Transfer overlay above.                                   */}
                {requeueOpen && (
                  <div
                    className="absolute inset-0 z-10 bg-white flex flex-col overflow-hidden"
                    data-testid="overlay-monitor-requeue"
                  >
                    <Dialer
                      initialView="requeue"
                      manageCallMode="v2"
                      hideTitleBar
                      style={{
                        minHeight: 0,
                        width: "100%",
                        background: "transparent",
                        padding: 0,
                        flex: 1,
                      }}
                      assetBasePath={assetBasePath}
                      onToast={(t) =>
                        onToast?.(t.description ? `${t.title} — ${t.description}` : t.title)
                      }
                      onRequeueBack={() => setRequeueOpen(false)}
                      onRequeueComplete={(queueName) => {
                        if (queueName) onContextHop?.({ kind: "queue", name: queueName });
                        setRequeueOpen(false);
                        onClose();
                        // Re-emit after the host finishes closing (its close path
                        // flashes "Stopped monitoring" during the next render, which
                        // would overwrite the requeue confirmation), so the requeue
                        // toast is the one the supervisor actually sees.
                        if (queueName) {
                          window.setTimeout(() => {
                            onToast?.(
                              `Call requeued — The call is now waiting in ${queueName}.`,
                            );
                          }, 80);
                        }
                      }}
                      // "Ask first" in requeue starts a consult; completing it
                      // hands the call off the same way a transfer does.
                      onTransferComplete={(target) => {
                        if (target) onContextHop?.({ kind: "queue", name: target });
                        setRequeueOpen(false);
                        onClose();
                      }}
                      onCallEnd={() => setRequeueOpen(false)}
                    />
                  </div>
                )}
              </div>

              {/* ---------- RIGHT: Smart Notes / Transcript ---------- */}
              {!panelCollapsed && (
                <div
                  className="relative flex flex-col flex-1 min-w-0 h-full"
                  data-testid="monitoring-notes-panel"
                >
                  <PanelTabBar
                    assets={assets}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    showContext={!!contextData && !isPreview}
                    showNotesTab={!isTakenOver}
                    notesLabel={
                      isPreview && ringing
                        ? "IVR transcript"
                        : "Notes and transcript"
                    }
                  />
                  {activeTab === "notes" && (
                    <NotesTranscriptPanel
                      assets={assets}
                      agentName={agentName}
                      avatarBg={avatarBg}
                      onPreviewNotes={() => setNotesPreview("loading")}
                      ivrMessages={
                        isPreview && ringing ? contextData?.messages : null
                      }
                    />
                  )}
                  {activeTab === "contact" && (
                    <ContactInfoPanel
                      customerPhone={customerPhone}
                      contextData={contextData}
                    />
                  )}
                  {activeTab === "context" && contextData && (
                    <ContextTabContent data={contextData} extraHops={contextHops} />
                  )}
                  {notesPreview && (
                    <NotesPreviewSheet
                      state={notesPreview}
                      lastUpdated={notesUpdatedAt}
                      onUpdate={() => setNotesPreview("loading")}
                      onClose={() => setNotesPreview(null)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
    </TooltipPrimitive.Provider>
  );
}
