import { useEffect } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";
import { TypeIcon } from "./eag/containers/Chat/TypeIcon/TypeIcon";
import {
  clearIncomingMessage,
  getClaimedAt,
  maybeTriggerIncomingMessage,
  registerClaimedDigital,
  registerClaimedQueueRow,
  useIncomingMessage,
} from "./claimedDigitalStore";

// ---------------------------------------------------------------------------
// Left conversation list for the Active messages tab — mirrors the RingCX
// agent UI's digital panel per the reference designs:
//   - a queue section ("Digital queue 1 (Email)"-style) where a new offer
//     shows up as a yellow-outlined card with Decline / Accept buttons,
//   - a "Claimed conversations" section; each card shows the contact name,
//     subject, channel icon, plus → (transfer) and ✓ (done) controls. The
//     open conversation gets a speech-bubble tail on its right edge.
// ---------------------------------------------------------------------------

export interface ActiveMessagesSidebarRow {
  engagementId: string;
  contactIdentity?: string;
  threadTitle?: string;
  sourceType?: string;
  sourceName?: string;
  sourceColor?: string;
  productName?: string;
  queueName?: string;
}

function timeSinceClaim(engagementId: string): string {
  const at = getClaimedAt(engagementId);
  if (!at) return "<1 min";
  const mins = Math.floor((Date.now() - at) / 60_000);
  return mins < 1 ? "<1 min" : `${mins} min`;
}

function ChannelGlyph({ row }: { row: ActiveMessagesSidebarRow }) {
  if (row.sourceType === "EMAIL" || row.sourceName?.includes("Inbox")) {
    return <Mail size={16} strokeWidth={2} color="#368541" aria-hidden="true" />;
  }
  // Same channel glyph the table's Channel column uses.
  return (
    <span className="flex items-center text-[16px] leading-none">
      <TypeIcon source={row.sourceType} inColor showTip={false} />
    </span>
  );
}

export function ActiveMessagesSidebar({
  rows,
  selectedId,
  onSelect,
  onTransfer,
  onDone,
}: {
  rows: ActiveMessagesSidebarRow[];
  selectedId: string | null;
  onSelect: (engagementId: string) => void;
  onTransfer?: (engagementId: string) => void;
  onDone?: (engagementId: string) => void;
}): JSX.Element {
  // Incoming-message demo: one predefined email arrival appears a few
  // seconds after the Active messages tab is first opened.
  const incoming = useIncomingMessage() as ActiveMessagesSidebarRow | null;
  useEffect(() => {
    const t = window.setTimeout(() => maybeTriggerIncomingMessage(), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const showIncoming = Boolean(
    incoming && incoming.engagementId !== selectedId,
  );

  const acceptIncoming = () => {
    if (!incoming) return;
    registerClaimedQueueRow(incoming as { engagementId: string });
    registerClaimedDigital(incoming.engagementId);
    clearIncomingMessage();
    onSelect(incoming.engagementId);
  };

  return (
    <div
      data-name="Active messages list"
      data-testid="active-messages-sidebar"
      className="flex w-[264px] shrink-0 flex-col border-r border-[#0000001a] bg-white font-['Roboto',sans-serif]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showIncoming && incoming ? (
          <div className="border-b border-[#0000000d] px-3.5 pb-3.5 pt-3">
            <div className="mb-2.5 text-[15px] font-bold text-[#121212]">
              {incoming.queueName || incoming.productName || "Digital queue"}
              {incoming.sourceType === "EMAIL" ? " (Email)" : ""}
            </div>
            {/* New conversation offer: yellow outline + Decline / Accept. */}
            <div
              data-testid="incoming-message-card"
              className="flex flex-col rounded-xl border border-[#f0a04b] bg-white px-3.5 py-3"
            >
              <span className="truncate text-[14px] font-bold text-[#121212]">
                {incoming.contactIdentity || "Customer"}
              </span>
              <span className="mt-0.5 truncate text-[14px] text-[#121212]">
                {incoming.threadTitle}
              </span>
              <div className="mt-2 flex items-center justify-between">
                <Mail
                  size={16}
                  strokeWidth={2}
                  color="#368541"
                  aria-hidden="true"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearIncomingMessage}
                    data-testid="button-dismiss-incoming"
                    className="text-[14px] font-bold text-[#e8891f] hover:underline"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={acceptIncoming}
                    data-testid="button-accept-incoming"
                    className="h-8 rounded-md bg-[#066fac] px-4 text-[14px] font-bold text-white hover:bg-[#055d91]"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="px-3.5 pb-3.5 pt-3">
          <div className="mb-2.5 text-[15px] font-bold text-[#121212]">
            Claimed conversations
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => {
              const selected = row.engagementId === selectedId;
              return (
                <div
                  key={row.engagementId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(row.engagementId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(row.engagementId);
                    }
                  }}
                  data-testid={`active-message-card-${row.engagementId}`}
                  aria-current={selected ? "true" : undefined}
                  className={`relative flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    selected
                      ? "border-[#066fac] bg-[#f2f8fc]"
                      : "border-[#00000014] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:bg-[#f9f9f9]"
                  }`}
                >
                  {selected ? (
                    // Speech-bubble tail marking the open conversation,
                    // pointing toward the thread on the right.
                    <span
                      aria-hidden="true"
                      className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-[#066fac] bg-[#f2f8fc]"
                    />
                  ) : null}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-bold text-[#121212]">
                      {row.contactIdentity || "Customer"}
                    </span>
                    <span className="shrink-0 text-[13px] text-[#666666]">
                      {timeSinceClaim(row.engagementId)}
                    </span>
                  </div>
                  {row.threadTitle ? (
                    <span className="mt-0.5 truncate text-[14px] text-[#121212]">
                      {row.threadTitle}
                    </span>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <ChannelGlyph row={row} />
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTransfer?.(row.engagementId);
                        }}
                        aria-label="Transfer conversation"
                        title="Transfer conversation"
                        data-testid={`button-transfer-${row.engagementId}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[#757575] hover:bg-[#f2f2f2]"
                      >
                        <ArrowRight size={16} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDone?.(row.engagementId);
                        }}
                        aria-label="Done with conversation"
                        title="Done with conversation"
                        data-testid={`button-done-${row.engagementId}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-[#9e9e9e] text-[#757575] hover:border-[#368541] hover:text-[#368541]"
                      >
                        <Check size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!rows.length ? (
              <span className="text-[13px] text-[#666666]">
                No claimed conversations
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
