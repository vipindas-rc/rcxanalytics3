// ---------------------------------------------------------------------------
// RequeueDialer — the dialer-style Requeue flow for voice queue rows.
//
// A faithful lookalike of the production softphone Requeue panel
// (eag/components/Requeue): back-button header, search field, grouped queue
// list with live wait-time and agent-availability metrics, drill-in skill
// selector, and the circular Choose skill / Ask first / Requeue action
// buttons. The production component depends on Spring UI's Tailwind preset
// (not built in this app) and live ACD services, so this version recreates
// the layout with plain styling and mock data.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Search,
  Check,
  PhoneForwarded,
  MessageCircleQuestion,
  ListChecks,
  User,
  BarChart,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types + mock data (mirrors the production RequeueQueue/QueueMetrics shapes)
// ---------------------------------------------------------------------------
interface Skill {
  skillId: string;
  skillName: string;
}

interface RequeueQueue {
  gateId: string;
  gateName: string;
  groupName: string;
  groupSkills: Skill[];
}

interface QueueMetrics {
  longestWaitingTimeInSeconds: number;
  numberOfAgentsAvailable: number;
  numberOfAgentsLoggedIn: number;
}

const GROUP_SKILLS: Skill[] = [
  { skillId: "s1", skillName: "English" },
  { skillId: "s2", skillName: "Spanish" },
  { skillId: "s3", skillName: "Billing expert" },
  { skillId: "s4", skillName: "Tier 2" },
  { skillId: "s5", skillName: "VIP" },
];

const MOCK_QUEUES: RequeueQueue[] = [
  { gateId: "1", gateName: "Customer support", groupName: "Support", groupSkills: GROUP_SKILLS },
  { gateId: "2", gateName: "Technical support", groupName: "Support", groupSkills: GROUP_SKILLS },
  { gateId: "3", gateName: "VIP support", groupName: "Support", groupSkills: GROUP_SKILLS },
  { gateId: "11", gateName: "Billing", groupName: "Revenue", groupSkills: GROUP_SKILLS },
  { gateId: "12", gateName: "Sales", groupName: "Revenue", groupSkills: GROUP_SKILLS },
];

// A spread of the production wait-time bands: ready, first in line,
// short/medium waits, and one long-wait queue.
const MOCK_METRICS: Record<string, QueueMetrics> = {
  "1": { longestWaitingTimeInSeconds: 45, numberOfAgentsAvailable: 0, numberOfAgentsLoggedIn: 6 },
  "2": { longestWaitingTimeInSeconds: 0, numberOfAgentsAvailable: 3, numberOfAgentsLoggedIn: 8 },
  "3": { longestWaitingTimeInSeconds: 260, numberOfAgentsAvailable: 0, numberOfAgentsLoggedIn: 4 },
  "11": { longestWaitingTimeInSeconds: 0, numberOfAgentsAvailable: 0, numberOfAgentsLoggedIn: 5 },
  "12": { longestWaitingTimeInSeconds: 3900, numberOfAgentsAvailable: 0, numberOfAgentsLoggedIn: 2 },
};

// Same thresholds as production (constants.WAIT_TIME_THRESHOLDS).
const MEDIUM_WAIT = 3 * 60;
const LONG_WAIT = 60 * 60;

function waitTimeLabel(m: QueueMetrics): string {
  if (m.numberOfAgentsLoggedIn === 0) return "No agents";
  if (m.longestWaitingTimeInSeconds <= 0) {
    return m.numberOfAgentsAvailable > 0 ? "Ready" : "First in line";
  }
  if (m.longestWaitingTimeInSeconds > LONG_WAIT) return "More than 1 hour";
  const mins = Math.floor(m.longestWaitingTimeInSeconds / 60);
  const secs = m.longestWaitingTimeInSeconds % 60;
  const parts: string[] = [];
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? "s" : ""}`);
  if (secs > 0) parts.push(`${secs} sec`);
  return parts.join(" ");
}

function waitTimeColor(m: QueueMetrics): string {
  if (m.numberOfAgentsLoggedIn === 0) return "#B3B7C2";
  if (m.longestWaitingTimeInSeconds <= 0) return "#3BA755";
  if (m.longestWaitingTimeInSeconds <= MEDIUM_WAIT) return "#3BA755";
  if (m.longestWaitingTimeInSeconds <= LONG_WAIT) return "#F5A623";
  return "#E8433B";
}

export interface RequeueDialerResult {
  queueName: string;
  skillName?: string;
  askFirst: boolean;
}

type ViewState = "queue-list" | "skill-selector";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function CircleActionButton({
  label,
  icon,
  disabled,
  primary,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        width: 84,
      }}
    >
      <span
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: disabled ? "#F1F2F6" : primary ? "#066FAC" : "#FFFFFF",
          border: primary ? "none" : "1px solid #DEE0E6",
          color: disabled ? "#B3B7C2" : primary ? "#FFFFFF" : "#282C33",
          boxShadow: disabled ? "none" : "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 12,
          color: disabled ? "#B3B7C2" : "#282C33",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RequeueDialer({
  onCancel,
  onRequeue,
}: {
  onCancel: () => void;
  onRequeue: (result: RequeueDialerResult) => void;
}) {
  const [viewState, setViewState] = useState<ViewState>("queue-list");
  const [selectedQueue, setSelectedQueue] = useState<RequeueQueue | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [search, setSearch] = useState("");

  const isSkillView = viewState === "skill-selector";
  const skills = selectedQueue?.groupSkills ?? [];
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus management: focus the dialog on open, trap Tab inside it, close on
  // Escape, and restore focus to the trigger on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>("input, button")
      ?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  const handleBack = useCallback(() => {
    if (isSkillView) {
      setViewState("queue-list");
      setSearch("");
    } else {
      onCancel();
    }
  }, [isSkillView, onCancel]);

  const confirm = useCallback(
    (askFirst: boolean) => {
      if (!selectedQueue) return;
      onRequeue({
        queueName: selectedQueue.gateName,
        skillName: selectedSkill?.skillName,
        askFirst,
      });
    },
    [selectedQueue, selectedSkill, onRequeue],
  );

  const query = search.trim().toLowerCase();

  const groups = useMemo(() => {
    const filtered = MOCK_QUEUES.filter((q) =>
      q.gateName.toLowerCase().includes(query),
    );
    const byGroup = new Map<string, RequeueQueue[]>();
    for (const q of filtered) {
      const list = byGroup.get(q.groupName) ?? [];
      list.push(q);
      byGroup.set(q.groupName, list);
    }
    return Array.from(byGroup.entries());
  }, [query]);

  const filteredSkills = useMemo(
    () => skills.filter((s) => s.skillName.toLowerCase().includes(query)),
    [skills, query],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
      data-testid="overlay-requeue-dialer"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isSkillView ? "Choose a skill" : "Requeue call"}
        style={{
          width: 320,
          height: 560,
          maxHeight: "calc(100vh - 48px)",
          background: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "inherit",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-requeue-dialer"
      >
        {/* Header */}
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            flexShrink: 0,
            zIndex: 1,
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            data-testid="button-requeue-back"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#282C33",
              fontSize: 14,
              padding: "6px 8px",
              borderRadius: 4,
            }}
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#282C33",
              marginRight: 64,
            }}
          >
            {isSkillView ? "Choose a skill" : "Requeue call"}
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: 12, flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid #DEE0E6",
              borderRadius: 4,
              padding: "0 10px",
              height: 36,
            }}
          >
            <Search size={16} color="#70768D" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isSkillView ? "Search skills" : "Search queues"}
              aria-label={isSkillView ? "Search skills" : "Search queues"}
              data-testid="input-requeue-search"
              style={{
                border: "none",
                outline: "none",
                flex: 1,
                fontSize: 14,
                color: "#282C33",
                background: "transparent",
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSkillView ? (
            filteredSkills.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "#70768D" }}>
                No skills found
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const isSelected = selectedSkill?.skillId === skill.skillId;
                return (
                  <button
                    key={skill.skillId}
                    type="button"
                    onClick={() =>
                      setSelectedSkill(isSelected ? null : skill)
                    }
                    data-testid={`option-skill-${skill.skillId}`}
                    aria-pressed={isSelected}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "10px 16px",
                      background: isSelected ? "#EBF6FC" : "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#282C33",
                      textAlign: "left",
                    }}
                  >
                    {skill.skillName}
                    {isSelected && <Check size={16} color="#066FAC" />}
                  </button>
                );
              })
            )
          ) : groups.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: "#70768D" }}>
              No queues found
            </div>
          ) : (
            groups.map(([groupName, queues]) => (
              <div key={groupName}>
                <div
                  style={{
                    padding: "10px 16px 4px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#70768D",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {groupName}
                </div>
                {queues.map((queue) => {
                  const isSelected = selectedQueue?.gateId === queue.gateId;
                  const metrics = MOCK_METRICS[queue.gateId];
                  return (
                    <button
                      key={queue.gateId}
                      type="button"
                      onClick={() => {
                        setSelectedQueue(isSelected ? null : queue);
                        setSelectedSkill(null);
                      }}
                      data-testid={`option-queue-${queue.gateId}`}
                      aria-pressed={isSelected}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "10px 16px",
                        background: isSelected ? "#EBF6FC" : "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            color: "#282C33",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {queue.gateName}
                        </div>
                        {metrics && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              marginTop: 2,
                              fontSize: 12,
                              color: "#70768D",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              title="Longest wait time"
                            >
                              <BarChart
                                size={12}
                                color={waitTimeColor(metrics)}
                              />
                              {waitTimeLabel(metrics)}
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              title="Available agents / signed-in agents"
                            >
                              <User size={12} />
                              {metrics.numberOfAgentsAvailable}/
                              {metrics.numberOfAgentsLoggedIn}
                            </span>
                          </div>
                        )}
                      </div>
                      {isSelected && <Check size={16} color="#066FAC" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            padding: "14px 8px 18px",
            borderTop: "1px solid #EDEEF2",
            flexShrink: 0,
          }}
        >
          {!isSkillView && (
            <CircleActionButton
              label="Choose skill"
              icon={<ListChecks size={20} />}
              disabled={!selectedQueue || skills.length === 0}
              onClick={() => {
                setViewState("skill-selector");
                setSearch("");
              }}
              testId="button-choose-skill"
            />
          )}
          <CircleActionButton
            label="Ask first"
            icon={<MessageCircleQuestion size={20} />}
            disabled={!selectedQueue}
            onClick={() => confirm(true)}
            testId="button-ask-first"
          />
          <CircleActionButton
            label="Requeue"
            icon={<PhoneForwarded size={20} />}
            disabled={!selectedQueue}
            primary
            onClick={() => confirm(false)}
            testId="button-requeue-confirm"
          />
        </div>
      </div>
    </div>
  );
}
