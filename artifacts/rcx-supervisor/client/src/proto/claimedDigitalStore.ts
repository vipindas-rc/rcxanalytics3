import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Module-level store of digital conversations the supervisor has claimed
// (taken over). Drives the "Active messages (n)" top-tab count and lets the
// tab return to the active conversation. Lives outside React state (same
// pattern as contextHopStore) so the page and the AgentTablePanel tree share
// one source of truth; a deep-linked /active-messages/:id re-registers its
// conversation on load so refreshes stay consistent.
// ---------------------------------------------------------------------------

let claimedIds: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// When each conversation was claimed — powers the relative time on the
// Active messages conversation list.
const claimedAt = new Map<string, number>();

export function registerClaimedDigital(engagementId: string) {
  if (!engagementId || claimedIds.includes(engagementId)) return;
  claimedIds = [...claimedIds, engagementId];
  if (!claimedAt.has(engagementId)) claimedAt.set(engagementId, Date.now());
  emit();
}

export function getClaimedAt(engagementId: string): number | null {
  return claimedAt.get(engagementId) ?? null;
}

export function removeClaimedDigital(engagementId: string) {
  if (!claimedIds.includes(engagementId)) return;
  claimedIds = claimedIds.filter((id) => id !== engagementId);
  emit();
}

/** Claimed digital conversation ids, oldest first. */
export function useClaimedDigitalIds(): string[] {
  return useSyncExternalStore(subscribe, () => claimedIds);
}

// Claiming a pending (queue) row removes it from the queue store, so the row
// data backing the take-over view is kept here for the Active messages tab to
// look up after the claim.
const claimedQueueRows = new Map<string, unknown>();

export function registerClaimedQueueRow(row: { engagementId: string }) {
  claimedQueueRows.set(row.engagementId, row);
}

export function getClaimedQueueRow(engagementId: string): unknown {
  return claimedQueueRows.get(engagementId) ?? null;
}

// ---------------------------------------------------------------------------
// Per-conversation category (tag) overrides — set from the Recategorize
// thread dialog. Keys are engagement ids; values replace the preview's tags.
// ---------------------------------------------------------------------------

export interface ConversationCategory {
  label: string;
  bg: string;
  color: string;
}

/** Every category the Recategorize dialog can assign. */
export const CONVERSATION_CATEGORIES: ConversationCategory[] = [
  { label: "Critical issue", bg: "#fdeae5", color: "#c40c05" },
  { label: "Tech", bg: "#f4e7f9", color: "#9b45a0" },
  { label: "Billing", bg: "#e8f4fb", color: "#066fac" },
  { label: "Refund", bg: "#e9f6ec", color: "#2e7d32" },
  { label: "Technical", bg: "#fdf3e5", color: "#b26205" },
  { label: "VIP", bg: "#f4e7f9", color: "#9b45a0" },
  { label: "Escalation", bg: "#fdeae5", color: "#c40c05" },
  { label: "Retention", bg: "#e9f6ec", color: "#2e7d32" },
  { label: "Feedback", bg: "#e5f6f7", color: "#0a7f8c" },
  { label: "English", bg: "#e8f4fb", color: "#066fac" },
  { label: "Russian", bg: "#f4e7f9", color: "#9b45a0" },
];

let categoryOverrides: Record<string, ConversationCategory[]> = {};

export function setConversationCategories(
  engagementId: string,
  categories: ConversationCategory[],
) {
  categoryOverrides = { ...categoryOverrides, [engagementId]: categories };
  emit();
}

export function useCategoryOverrides(): Record<
  string,
  ConversationCategory[]
> {
  return useSyncExternalStore(subscribe, () => categoryOverrides);
}

// ---------------------------------------------------------------------------
// Incoming-message demo: one predefined email arrival appears in the Active
// messages list a few seconds after the tab is first opened; the supervisor
// can accept it (opens the thread) or dismiss it.
// ---------------------------------------------------------------------------

let incomingRow: { engagementId: string } | null = null;
let incomingFired = false;

export function makeIncomingEmailRow() {
  return {
    engagementId: "eng-incoming-email-1",
    glId: "eng-incoming-email-1",
    agentId: "",
    fullName: "",
    agentName: "",
    agentType: "",
    sourceType: "EMAIL",
    sourceName: "Support Inbox",
    sourceColor: "#e05d38",
    engagementSource: {
      initialEngagementSourceType: "EMAIL",
      initialEngagementSourceName: "Support Inbox",
      initialEngagementSourceColor: "#e05d38",
    },
    categoryIds: "",
    productName: "Customer support",
    queueName: "Customer support",
    contactIdentity: "Sofia Marquez",
    threadTitle: "[EXTERNAL] Order status update",
    waitTimeMs: 20_000,
    timeInQueueMs: 15_000,
    conversationState: "PENDING",
    conversationStateLabel: "Waiting",
    isVoiceInteraction: false,
    isQueueRow: true,
    hasPreview: true,
    priority: null,
    pendingDispositionMs: null,
    agentDurationMs: null,
    confidenceScore: null,
    sentimentScore: null,
    showViewInsights: false,
    showBargeIn: false,
    showMonitor: false,
    showCoach: false,
  };
}

export function maybeTriggerIncomingMessage() {
  if (incomingFired) return;
  incomingFired = true;
  incomingRow = makeIncomingEmailRow();
  emit();
}

export function clearIncomingMessage() {
  if (!incomingRow) return;
  incomingRow = null;
  emit();
}

export function useIncomingMessage(): { engagementId: string } | null {
  return useSyncExternalStore(subscribe, () => incomingRow);
}
