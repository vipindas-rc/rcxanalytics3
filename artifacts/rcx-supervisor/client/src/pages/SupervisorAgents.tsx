import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  endActivePreviewCall,
  endMonitoringSession,
  toggleActivePreviewCallMute,
  toggleMonitoringSessionMute,
  useActivePreviewCall,
  useElapsedSince,
  useMonitoringSession,
} from "@/proto/activePreviewCallStore";
import {
  clearAuditLogParams,
  MODAL_IDS,
  useUrlFlag,
  useUrlParam,
  useUrlSearchUpdater,
  type ModalId,
} from "@/hooks/useUrlState";
import { trackEvent } from "@/lib/analytics";
import { useSupervisorHeaderState } from "@/components/shell/SupervisorShell";

// Kept in sync with the proto InteractionPreview component's mode union.
// (Declared locally so this page doesn't pull the excluded proto tree into tsc.)
type InteractionPreviewMode = "preview" | "expanded" | "takeover";

import AgentTablePanel, {
  ActiveCallView,
  agentColumnMeta,
  interactionColumnMeta,
  supervisor3InteractionColumnMeta,
  suggestionInteractionColumnMeta,
  myQueuesColumnMeta,
  queueColumnMeta,
  agentStateOptions,
  interactionFilterRows,
  usePendingInteractionsCount,
  usePendingFilterRows,
  SupervisorFilter,
  SupervisorFilterToggle,
  SupervisorCheckbox,
  ActiveMessagesSidebar,
  registerClaimedDigital,
  removeClaimedDigital,
  useClaimedDigitalIds,
} from "@proto";
import type { InteractionFilterRow } from "@proto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search as SearchIcon,
  Settings as SettingsIcon,
  ExternalLink,
  Menu as DragHandleIcon,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";

// The header/tabs/Filters blue, reused in the table settings dialogs so the
// whole page shares one accent color.
const RC_BLUE = "#066fac";

// Mirrors CATEGORIES_MAP in client/src/proto/eag/helpers/injector. The id is
// what the interactions table filters on (categoryIds), the label is shown.
const CATEGORY_OPTIONS = [
  { id: "1", label: "Billing" },
  { id: "2", label: "Refund" },
  { id: "3", label: "Technical" },
  { id: "4", label: "VIP" },
  { id: "5", label: "Escalation" },
  { id: "6", label: "Feedback" },
];

// Shared agent-type options, used on both the Agents and Interactions tabs.
const AGENT_TYPE_OPTIONS = [
  { value: "Air", label: "AirPro agents" },
  { value: "Human", label: "Human agents" },
];

const CHANNEL_OPTIONS = [
  "Web Chat",
  "Support Inbox",
  "Twitter",
  "Facebook",
  "Instagram",
  "WhatsApp",
  "SMS",
  "Voice",
];


// ---------------------------------------------------------------------------
// Interactions-tab filters: URL-driven (deep-linkable / refresh-safe) and
// cascading left-to-right — each dropdown only offers options that still exist
// after the filters to its left are applied. Render order (and cascade order):
// Agent type -> Agents -> Channels -> Queues -> States -> Categories.
// Every filter is multi-select: an empty selection means "All ..." and URL
// params carry comma-separated values.
// ---------------------------------------------------------------------------

const INTERACTION_FILTER_PARAMS = {
  agentType: "agentType",
  agent: "agent",
  channel: "channel",
  queue: "queue",
  state: "state",
  category: "category",
} as const;
type InteractionFilterKey = keyof typeof INTERACTION_FILTER_PARAMS;
const INTERACTION_FILTER_KEYS = Object.keys(
  INTERACTION_FILTER_PARAMS,
) as InteractionFilterKey[];
type InteractionFilterValues = Record<InteractionFilterKey, string[]>;

interface CascadedInteractionFilters {
  // Raw selections validated against the cascade: an upstream change drops
  // any downstream value that no longer exists ([] = "All").
  values: InteractionFilterValues;
  options: Record<InteractionFilterKey, { value: string; label: string }[]>;
}

function cascadeInteractionFilters(
  raw: InteractionFilterValues,
  allRows: InteractionFilterRow[] = interactionFilterRows,
): CascadedInteractionFilters {
  let rows = allRows;

  // Keep only selections still offered; [] (nothing valid picked) = All.
  const valid = (selected: string[], offered: { value: string }[]) =>
    selected.filter((v) => offered.some((o) => o.value === v));

  // Agent type is first in the cascade, so its options derive from the full
  // row set: only types actually present in the table are offered. Pending
  // (queued) rows are unassigned (agentType "") and never contribute a type.
  const agentTypeOptions = AGENT_TYPE_OPTIONS.filter((t) =>
    allRows.some((r) => String(r.agentType) === t.value),
  );
  // Keep string[] (not ("Air" | "Human")[]) so .includes(row.agentType)
  // below typechecks.
  const agentType: string[] = valid(raw.agentType, agentTypeOptions);
  if (agentType.length > 0) {
    rows = rows.filter((r) => agentType.includes(String(r.agentType)));
  }

  // Pending (queued) rows are unassigned — they carry no agent, so they never
  // contribute an Agents option.
  const agentOptions = Array.from(
    new Map(
      rows
        .filter((r) => r.agentId)
        .map((r) => [r.agentId, r.fullName]),
    ).entries(),
  ).map(([value, label]) => ({ value, label }));
  const agent = valid(raw.agent, agentOptions);
  if (agent.length > 0) rows = rows.filter((r) => agent.includes(r.agentId));

  // Channels keep the canonical CHANNEL_OPTIONS order regardless of row order.
  const presentChannels = new Set(rows.map((r) => r.sourceName));
  const channelOptions = CHANNEL_OPTIONS.filter((c) =>
    presentChannels.has(c),
  ).map((c) => ({ value: c, label: c }));
  const channel = valid(raw.channel, channelOptions);
  if (channel.length > 0) {
    rows = rows.filter((r) => channel.includes(r.sourceName));
  }

  const queueOptions = Array.from(
    new Set(rows.map((r) => r.queueName).filter(Boolean)),
  )
    .sort()
    .map((q) => ({ value: q, label: q }));
  const queue = valid(raw.queue, queueOptions);
  if (queue.length > 0) rows = rows.filter((r) => queue.includes(r.queueName));

  const stateOptions = Array.from(
    new Map(
      rows.map((r) => [r.conversationState, r.conversationStateLabel]),
    ).entries(),
  ).map(([value, label]) => ({ value, label }));
  const state = valid(raw.state, stateOptions);
  if (state.length > 0) {
    rows = rows.filter((r) => state.includes(r.conversationState));
  }

  const categoryOptions = CATEGORY_OPTIONS.filter((c) =>
    rows.some((r) => r.categoryIds.split(",").includes(c.id)),
  ).map((c) => ({ value: c.id, label: c.label }));
  const category = valid(raw.category, categoryOptions);

  return {
    values: { agentType, agent, channel, queue, state, category },
    options: {
      agentType: agentTypeOptions,
      agent: agentOptions,
      channel: channelOptions,
      queue: queueOptions,
      state: stateOptions,
      category: categoryOptions,
    },
  };
}

// ---------------------------------------------------------------------------
// Table column preferences (visibility + order) persist across reloads via
// localStorage — personal preference, not shareable state, so never in the
// URL. Stored values are validated against the live column ids: unknown ids
// are dropped, newly added columns default to visible / are appended.
// ---------------------------------------------------------------------------
const COLS_STORAGE_KEYS = {
  agentVisible: "rcx-supervisor.agentCols.visible.v1",
  interactionVisible: "rcx-supervisor.interactionCols.visible.v1",
  agentOrder: "rcx-supervisor.agentCols.order.v1",
  interactionOrder: "rcx-supervisor.interactionCols.order.v1",
  // v2: Priority became hidden-by-default in views 2/3; the key bump discards
  // v1 prefs that had auto-persisted it as visible.
  s2InteractionVisible: "rcx-supervisor.s2InteractionCols.visible.v2",
  s2InteractionOrder: "rcx-supervisor.s2InteractionCols.order.v1",
  s3InteractionVisible: "rcx-supervisor.s3InteractionCols.visible.v2",
  s3InteractionOrder: "rcx-supervisor.s3InteractionCols.order.v1",
  // CP: Suggestion views have their own column set (minus queue-specific time
  // columns), so they need separate localStorage keys.
  suggestionInteractionVisible: "rcx-supervisor.suggestionInteractionCols.visible.v1",
  suggestionInteractionOrder: "rcx-supervisor.suggestionInteractionCols.order.v1",
  // CP: Suggestion views — My Queues tab table settings.
  myQueuesVisible: "rcx-supervisor.myQueuesCols.visible.v1",
  myQueuesOrder: "rcx-supervisor.myQueuesCols.order.v1",
  queueVisible: "rcx-supervisor.queueCols.visible.v1",
  queueOrder: "rcx-supervisor.queueCols.order.v1",
} as const;

// Columns that exist (and can be re-enabled in Settings) but start hidden in
// Supervisor views 2 and 3. Classic view and the Queue tab show them.
const S2_S3_HIDDEN_COLUMN_IDS = new Set(["priority"]);

// My Queues starts with Priority hidden (matches the Interactions tab); it can
// be re-enabled from the My Queues table settings dialog.
const MY_QUEUES_HIDDEN_COLUMN_IDS = new Set(["priority"]);

function loadStoredVisibility(
  storageKey: string,
  columnIds: string[],
  hiddenByDefault?: Set<string>,
): Record<string, boolean> {
  const base = Object.fromEntries(
    columnIds.map((id) => [id, !hiddenByDefault?.has(id)]),
  );
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return base;
    for (const id of columnIds) {
      if (typeof parsed[id] === "boolean") base[id] = parsed[id];
    }
  } catch {
    // Corrupt storage -> defaults.
  }
  return base;
}

function loadStoredOrder(storageKey: string, columnIds: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return columnIds;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return columnIds;
    const valid = parsed.filter(
      (id): id is string => typeof id === "string" && columnIds.includes(id),
    );
    // Ids added after the user saved their order (e.g. a newly shipped
    // column) slot in at their canonical default position — right after the
    // nearest preceding default neighbor the user still has — instead of
    // being dumped at the end of the table.
    const merged = [...valid];
    columnIds.forEach((id, defaultIdx) => {
      if (merged.includes(id)) return;
      let insertAt = merged.length;
      for (let d = defaultIdx - 1; d >= 0; d--) {
        const at = merged.indexOf(columnIds[d]);
        if (at !== -1) {
          insertAt = at + 1;
          break;
        }
      }
      merged.splice(insertAt, 0, id);
    });
    return merged;
  } catch {
    return columnIds;
  }
}

function saveStored(storageKey: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota) — preferences just won't stick.
  }
}

const supervisorFilters = ["Agents", "Interactions"];

// Pagination page size for the Supervisor (pagination) flow.
const QUEUE_PAGE_SIZE = 20;
// Supervisor (Expected) flow: the merged Interactions table paginates at 10
// rows per page over a high-volume seeded list (~100 assigned rows plus the
// live pending rows).
const INTERACTIONS_PAGE_SIZE = 10;
const EXPECTED_INTERACTIONS_VOLUME = 100;
// SLA breach threshold: mirrors AgentTablePanel's red-band value (10 min).

// Shared prop shape between QueuePanel and PaginatedQueuePanel — keeps the
// two components in sync with the same set of toolbar props.
interface QueuePanelSharedProps {
  searchQuery: string;
  onSearch: (value: string) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  filterCount: number;
  channelValues: string[];
  channelOptions: { value: string; label: string }[];
  onChannelChange: (values: string[]) => void;
  queueValues: string[];
  queueOptions: { value: string; label: string }[];
  onQueueChange: (values: string[]) => void;
  categoryValues: string[];
  categoryOptions: { value: string; label: string }[];
  onCategoryChange: (values: string[]) => void;
  breachedSlaOnly: boolean;
  onBreachedSlaChange: (checked: boolean) => void;
  previewEngagementId: string | null;
  previewMode: InteractionPreviewMode | null;
  onPreviewOpen: (engagementId: string) => void;
  onPreviewModeChange: (mode: InteractionPreviewMode) => void;
  onPreviewClose: (options?: { replace?: boolean }) => void;
  onVoicePreviewAccepted?: () => void;
  onDigitalTakeOverCommitted: (engagementId: string) => void;
  // CP: Suggestion view overrides — optional so PaginatedQueuePanel (which
  // is NOT a suggestion view) keeps working without them.
  /** Toolbar heading text. Default "Queue"; pass "Pending interactions" for suggestion views. */
  queueTitle?: string;
  /** Hide the Breached SLA checkbox in the filter row (easy to re-enable). */
  hideBreachedSla?: boolean;
  /** Hide View Insights on queue rows (suggestion views). */
  hideQueueViewInsights?: boolean;
  /** Hide Transfer + More menu on queue rows (Agent suggestion view). */
  hideQueueTransferAndMore?: boolean;
  /** Label for the queue Claim button. */
  queueClaimLabel?: string;
  /** Use My Queues column set (renamed time labels) for the Queue tab. */
  useMyQueuesColumns?: boolean;
  /** Show the table-settings gear in the toolbar; opens the shared dialog. */
  onOpenSettings?: () => void;
  /** My Queues column ids to render, in order (from the settings dialog). */
  visibleQueueColumnIds?: string[];
}

// Shared queue toolbar: search, filter toggle, and filter row.
function QueueToolbar({
  searchQuery,
  onSearch,
  filtersOpen,
  onFiltersOpenChange,
  filterCount,
  channelValues,
  channelOptions,
  onChannelChange,
  queueValues,
  queueOptions,
  onQueueChange,
  categoryValues,
  categoryOptions,
  onCategoryChange,
  breachedSlaOnly,
  onBreachedSlaChange,
  queueTitle = "Queue",
  hideBreachedSla = false,
  onOpenSettings,
  searchTestId = "input-queue-search",
  filtersTestId = "button-queue-filters",
  filterRowTestId = "queue-filter-row",
}: QueuePanelSharedProps & {
  searchTestId?: string;
  filtersTestId?: string;
  filterRowTestId?: string;
}) {
  return (
    <>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,500px)_minmax(0,1fr)] items-center gap-6 border-b border-[#0000001a] px-5 py-3">
        <h2 className="shrink-0 font-subtitle-mini text-[15px] font-semibold leading-[var(--subtitle-mini-line-height)] text-[#121212]">
          {queueTitle}
        </h2>
        <div className="relative w-full min-w-0 max-w-[500px] justify-self-center">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a1a1a1]" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="h-10 rounded-[4px] border-[#e0e0e0] pl-11 pr-[96px] font-['Roboto',sans-serif] text-[14px] tracking-[0.25px] text-[#212121] placeholder:text-[#a1a1a1]"
            placeholder="Search the queue"
            data-testid={searchTestId}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <SupervisorFilterToggle
              open={filtersOpen}
              count={filterCount}
              onOpenChange={onFiltersOpenChange}
              testId={filtersTestId}
            />
          </div>
        </div>
        <div className="flex min-w-0 justify-end">
          {onOpenSettings && (
            <Button
              variant="ghost"
              aria-label="Table settings"
              onClick={onOpenSettings}
              className="h-10 w-10 shrink-0 rounded-full p-0 text-[#666666] shadow-none hover:bg-[#66666614]"
              data-testid="button-queue-settings"
            >
              <SettingsIcon className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>
      {filtersOpen && (
        <div
          className="flex shrink-0 items-center gap-3 border-b border-[#0000001a] bg-[#f9f9f9] px-5 py-3"
          data-testid={filterRowTestId}
        >
          {/* Queue rows are all unassigned (Pending), so only the Channels /
              Queues / Categories filters and the Breached SLA toggle apply. */}
          <div className="grid w-full grid-cols-4 items-center gap-3">
            <SupervisorFilter
              values={channelValues}
              onValuesChange={onChannelChange}
              placeholder="All channels"
              options={channelOptions}
              testId="select-queue-channel"
            />
            <SupervisorFilter
              values={queueValues}
              onValuesChange={onQueueChange}
              placeholder="All queues"
              options={queueOptions}
              testId="select-queue-queue"
            />
            <SupervisorFilter
              values={categoryValues}
              onValuesChange={onCategoryChange}
              placeholder="All categories"
              options={categoryOptions}
              testId="select-queue-category"
            />
            {/* Breached SLA: hidden in My Queues (suggestion views) behind a
                simple flag — Krum Zahariev may confirm it's needed, at which
                point setting hideBreachedSla=false re-enables it. */}
            {!hideBreachedSla && (
              <SupervisorCheckbox
                checked={breachedSlaOnly}
                onCheckedChange={onBreachedSlaChange}
                label="Breached SLA"
                testId="checkbox-queue-breached-sla"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Shared pagination footer: range indicator ("x–y of n"), Previous / Next and
// a window of page numbers. Purely presentational — the host owns the page
// state (URL-driven) and passes an already-clamped page.
function PaginationFooter({
  count,
  pageSize,
  page,
  onPageChange,
  emptyLabel,
  testIdPrefix,
}: {
  // Full post-filter row count; null while the first count report is pending.
  count: number | null;
  pageSize: number;
  page: number;
  onPageChange: (page: number) => void;
  emptyLabel: string;
  testIdPrefix: string;
}): JSX.Element {
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  // Page numbers to show: at most 5 consecutive pages centred on the current
  // page (the window shifts to keep the current page visible).
  const visiblePages = useMemo(() => {
    const half = 2;
    let lo = Math.max(1, page - half);
    const hi = Math.min(pageCount, lo + 2 * half);
    lo = Math.max(1, hi - 2 * half);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [page, pageCount]);

  return (
    <div
      className="flex shrink-0 items-center justify-between border-t border-[#0000001a] bg-white px-5 py-2"
      data-testid={`${testIdPrefix}-pagination`}
    >
      <span className="font-['Roboto',sans-serif] text-[13px] text-[#666666]" aria-live="polite">
        {count === null
          ? ""
          : total === 0
            ? emptyLabel
            : `${startRow}–${endRow} of ${total}`}
      </span>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <button
              type="button"
              aria-label="Go to previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="flex h-9 items-center gap-1 rounded-md px-3 font-['Roboto',sans-serif] text-[13px] font-medium text-[#121212] hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-40"
              data-testid={`button-${testIdPrefix}-page-prev`}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
          </PaginationItem>
          {visiblePages.map((p) => (
            <PaginationItem key={p}>
              <button
                type="button"
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
                className={`flex h-9 w-9 items-center justify-center rounded-md font-['Roboto',sans-serif] text-[13px] font-medium transition-colors ${
                  p === page
                    ? "border border-[#e5e5e5] bg-white text-[#121212] shadow-sm"
                    : "text-[#121212] hover:bg-[#f5f5f5]"
                }`}
                data-testid={`button-${testIdPrefix}-page-${p}`}
              >
                {p}
              </button>
            </PaginationItem>
          ))}
          <PaginationItem>
            <button
              type="button"
              aria-label="Go to next page"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
              className="flex h-9 items-center gap-1 rounded-md px-3 font-['Roboto',sans-serif] text-[13px] font-medium text-[#121212] hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-40"
              data-testid={`button-${testIdPrefix}-page-next`}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

// Queue tab with pagination (Supervisor (pagination) flow). Slices the pending
// rows into pages of QUEUE_PAGE_SIZE with Previous / Next / page-number
// controls and a range indicator. The current page is URL-driven so refresh
// and shared links land on the same page.
function PaginatedQueuePanel({
  page,
  onPageChange,
  ...shared
}: QueuePanelSharedProps & {
  page: number;
  onPageChange: (page: number) => void;
}): JSX.Element {
  // Accurate post-filter (pre-slice) count is reported by AgentTablePanel via
  // onQueueFilteredCount — it applies all active filters (queue, SLA, channel,
  // category, search) before slicing, so this count is always consistent with
  // what the current page actually shows. Seeded null so a deep-linked page
  // isn't clamped away before the first count report lands.
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [queueSettingsOpen, setQueueSettingsOpen] = useUrlFlag(
    "modal",
    "queue-settings",
  );
  const queueIds = useMemo(() => queueColumnMeta.map((column) => column.id), []);
  const queueLabels = useMemo(
    () => Object.fromEntries(queueColumnMeta.map((column) => [column.id, column.label])),
    [],
  );
  const [visibleQueueCols, setVisibleQueueCols] = useState<Record<string, boolean>>(
    () => loadStoredVisibility(COLS_STORAGE_KEYS.queueVisible, queueIds),
  );
  const [queueColOrder, setQueueColOrder] = useState<string[]>(() =>
    loadStoredOrder(COLS_STORAGE_KEYS.queueOrder, queueIds),
  );
  const [draftQueueCols, setDraftQueueCols] = useState(visibleQueueCols);
  const [draftQueueOrder, setDraftQueueOrder] = useState(queueColOrder);
  const [queueDragId, setQueueDragId] = useState<string | null>(null);
  const lockedQueueCol = "sourceName";

  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.queueVisible, visibleQueueCols);
  }, [visibleQueueCols]);
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.queueOrder, queueColOrder);
  }, [queueColOrder]);
  useEffect(() => {
    if (!queueSettingsOpen) return;
    setDraftQueueCols(visibleQueueCols);
    setDraftQueueOrder(queueColOrder);
  }, [queueSettingsOpen, visibleQueueCols, queueColOrder]);

  const visibleQueueColumnIds = queueColOrder.filter(
    (id) => id === lockedQueueCol || visibleQueueCols[id],
  );
  const moveQueueColumn = (fromId: string, toId: string) => {
    if (fromId === toId || fromId === lockedQueueCol || toId === lockedQueueCol) return;
    setDraftQueueOrder((current) => {
      const next = [...current];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  };

  const pageCount =
    filteredCount === null
      ? Number.MAX_SAFE_INTEGER
      : Math.max(1, Math.ceil(filteredCount / QUEUE_PAGE_SIZE));
  // Clamp to a valid page and notify the parent if the current page drifted
  // out of range (e.g. rows were claimed from the last page, emptying it).
  const clampedPage = Math.min(Math.max(1, page), pageCount);
  useEffect(() => {
    if (filteredCount !== null && clampedPage !== page) onPageChange(clampedPage);
  }, [filteredCount, clampedPage, page, onPageChange]);

  return (
    <>
      <QueueToolbar
        {...shared}
        onOpenSettings={() => setQueueSettingsOpen(true)}
      />
      <div className="min-h-0 flex-1 overflow-hidden" data-testid="queue-panel-paginated">
        <AgentTablePanel
          activeTab="Queue"
          searchValue={shared.searchQuery}
          selectedChannels={shared.channelValues}
          selectedQueues={shared.queueValues}
          selectedCategories={shared.categoryValues}
          breachedSlaOnly={shared.breachedSlaOnly}
          previewEngagementId={shared.previewEngagementId}
          previewMode={shared.previewMode}
          onPreviewOpen={shared.onPreviewOpen}
          onPreviewModeChange={shared.onPreviewModeChange}
          onPreviewClose={shared.onPreviewClose}
          onVoicePreviewAccepted={shared.onVoicePreviewAccepted}
          onDigitalTakeOverCommitted={shared.onDigitalTakeOverCommitted}
          queuePageSlice={{ page: clampedPage, pageSize: QUEUE_PAGE_SIZE }}
          onQueueFilteredCount={setFilteredCount}
          visibleQueueColumnIds={visibleQueueColumnIds}
        />
      </div>
      <PaginationFooter
        count={filteredCount}
        pageSize={QUEUE_PAGE_SIZE}
        page={clampedPage}
        onPageChange={onPageChange}
        emptyLabel="No items in queue"
        testIdPrefix="queue"
      />
      <Dialog open={queueSettingsOpen} onOpenChange={setQueueSettingsOpen}>
        <DialogContent
          className="max-w-3xl gap-0 p-0"
          data-testid="dialog-queue-settings"
        >
          <DialogHeader className="px-8 pt-7">
            <DialogTitle className="text-xl font-semibold text-[#121212]">
              Queue table settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-8 pb-2 pt-4">
            <p className="mb-4 text-sm text-[#666666]">
              For more information, visit{" "}
              <a
                href="https://support.ringcentral.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium"
                style={{ color: RC_BLUE }}
              >
                RingCentral Support
                <ExternalLink className="h-4 w-4" />
              </a>
            </p>
            <p className="mb-3 text-sm text-[#666666]">
              Drag the handle to reorder columns. Changes apply to the table when you save.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {draftQueueOrder.map((colId) => {
                const locked = colId === lockedQueueCol;
                return (
                  <label
                    key={colId}
                    htmlFor={`queue-col-${colId}`}
                    draggable={!locked}
                    onDragStart={() => !locked && setQueueDragId(colId)}
                    onDragOver={(event) => !locked && queueDragId && event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (queueDragId) moveQueueColumn(queueDragId, colId);
                      setQueueDragId(null);
                    }}
                    onDragEnd={() => setQueueDragId(null)}
                    className={`flex items-center justify-between gap-2 rounded-md bg-[#f4f5f7] px-3 py-2.5 text-sm ${
                      locked ? "cursor-default text-[#9aa0a6]" : "cursor-pointer text-[#121212]"
                    } ${queueDragId === colId ? "opacity-40 ring-2 ring-[#066fac]" : ""}`}
                    data-testid={`queue-col-row-${colId}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        id={`queue-col-${colId}`}
                        checked={locked || !!draftQueueCols[colId]}
                        disabled={locked}
                        onCheckedChange={(checked) =>
                          setDraftQueueCols((current) => ({
                            ...current,
                            [colId]: checked === true,
                          }))
                        }
                        className="h-5 w-5 rounded border-[#c4c8cd] disabled:opacity-100 data-[state=checked]:border-[#066fac] data-[state=checked]:bg-[#066fac]"
                        data-testid={`checkbox-queue-col-${colId}`}
                      />
                      <span className="truncate">{queueLabels[colId]}</span>
                    </span>
                    <DragHandleIcon className="h-4 w-4 shrink-0 text-[#9aa0a6]" />
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter className="items-center gap-2 px-8 pb-7 pt-6 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setQueueSettingsOpen(false)}
              className="px-4 text-[15px] font-semibold hover:bg-transparent"
              style={{ color: RC_BLUE }}
              data-testid="button-queue-settings-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setVisibleQueueCols(draftQueueCols);
                setQueueColOrder(draftQueueOrder);
                setQueueSettingsOpen(false);
              }}
              className="rounded-md px-6 text-[15px] font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: RC_BLUE }}
              data-testid="button-queue-settings-save"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Queue tab: pending interactions waiting to be picked up. Uses the same
// Interactions table as the Supervisor tab (agent-side cells stay blank
// because no agent has the conversation yet).
function QueuePanel(
  props: QueuePanelSharedProps & { extendedQueue?: boolean },
): JSX.Element {
  return (
    <>
      <QueueToolbar {...props} />
      <div className="min-h-0 flex-1 overflow-hidden" data-testid="queue-panel">
        {/* Not readOnly: queue rows have their own hover actions (AI insights /
            Transfer / Claim) available in both Agent and Supervisor views. */}
        <AgentTablePanel
          activeTab="Queue"
          extendedQueue={props.extendedQueue}
          searchValue={props.searchQuery}
          selectedChannels={props.channelValues}
          selectedQueues={props.queueValues}
          selectedCategories={props.categoryValues}
          breachedSlaOnly={props.breachedSlaOnly}
          previewEngagementId={props.previewEngagementId}
          previewMode={props.previewMode}
          onPreviewOpen={props.onPreviewOpen}
          onPreviewModeChange={props.onPreviewModeChange}
          onPreviewClose={props.onPreviewClose}
          onVoicePreviewAccepted={props.onVoicePreviewAccepted}
          onDigitalTakeOverCommitted={props.onDigitalTakeOverCommitted}
          hideQueueViewInsights={props.hideQueueViewInsights}
          hideQueueTransferAndMore={props.hideQueueTransferAndMore}
          queueClaimLabel={props.queueClaimLabel}
          useMyQueuesColumns={props.useMyQueuesColumns}
          visibleQueueColumnIds={props.visibleQueueColumnIds}
        />
      </div>
    </>
  );
}

export const SupervisorAgents = (): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState("");
  // Live queue depth for the "Queue (n)" top tab label — tracks simulated
  // arrivals/departures and Claim/Transfer removals.
  // Live pending-interaction count for the "Interactions (n)" sub-tab label —
  // queued (Pending) rows plus Reserved rows (assigned, not yet picked up).
  const pendingInteractionsCount = usePendingInteractionsCount();
  // Total interactions currently shown in the table (filters + search
  // applied), reported by the table itself; falls back to the pending count
  // until the first report arrives.
  const [interactionsCount, setInteractionsCount] = useState<number | null>(
    null,
  );
  // Agents-tab filters are multi-select arrays — empty array means "All".
  const [agentTypeFilter, setAgentTypeFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);

  // The filter row is closed by default; the "Filters" button toggles it open.
  // URL-driven (deep-linkable / refresh-safe): ?filters=open, omitted when
  // hidden (the default) so clean URLs stay short.
  const [filtersOpen, setFiltersOpen] = useUrlFlag("filters", "open");
  const [filtersParam, setFiltersParam] = useUrlParam("filters");
  // Invalid ?filters value (anything but "open") self-cleans via replace.
  useEffect(() => {
    if (filtersParam != null && filtersParam !== "open") {
      setFiltersParam(null, { replace: true });
    }
  }, [filtersParam, setFiltersParam]);

  // Unknown ?modal ids (stale links, typos) self-clean along with their
  // companion agentId param — no dialog ever half-renders from a bad URL.
  const updateSearch = useUrlSearchUpdater();
  const [modalParam] = useUrlParam("modal");
  useEffect(() => {
    if (modalParam && !MODAL_IDS.includes(modalParam as ModalId)) {
      updateSearch(
        (p) => {
          p.delete("modal");
          p.delete("agentId");
          p.delete("engagementId");
          p.delete("auditPos");
        },
        { replace: true },
      );
    }
  }, [modalParam, updateSearch]);

  // URL-driven tab state (deep-linkable): Interactions is the default landing
  // tab (clean URL, no param); the Agents tab is addressable via ?tab=agents.
  const search = useSearch();
  const [pathname, navigate] = useLocation();

  // URL-addressable digital "Interaction preview" (deep-linkable / refresh-safe):
  // /interactions/:engagementId/:mode with mode preview | expanded | takeover.
  const [previewRouteMatched, previewParams] = useRoute(
    "/interactions/:engagementId/:mode",
  );
  const rawPreviewMode = previewRouteMatched ? previewParams?.mode : null;
  const parsedPreviewMode: InteractionPreviewMode | null =
    rawPreviewMode === "preview" ||
    rawPreviewMode === "expanded" ||
    rawPreviewMode === "takeover"
      ? rawPreviewMode
      : null;

  // URL-driven view mode (deep-linkable / refresh-safe). This build ships
  // four flows:
  //   - Supervisor 1 (default, clean URL): pending + active interactions
  //     merged in the Interactions table — today's classic experience.
  //   - Supervisor (suggestion) (?view=supervisor-2): pending interactions
  //     move to a top-level Queue tab; the Interactions table keeps the rest.
  //   - Supervisor (pagination) (?view=supervisor-pagination): like Supervisor
  //     (suggestion) but the Queue tab paginates pending items 20 per page.
  // Any other (or missing/stale) ?view= value normalizes to the default
  // Supervisor 1 so old deep links stay refresh-safe.
  const parsedViewParam = new URLSearchParams(search).get("view");
  const rawViewParam: string | null =
    parsedViewParam === "supervisor-2" ||
    parsedViewParam === "supervisor-pagination" ||
    parsedViewParam === "supervisor-expected"
      ? parsedViewParam
      : null;
  const viewParam: string = rawViewParam ?? "supervisor-1";
  // Retired Agent or unknown view links render as Supervisor 1 and self-clean
  // from the address bar via replace.
  useEffect(() => {
    if (parsedViewParam != null && rawViewParam == null) {
      updateSearch((p) => p.delete("view"), { replace: true });
    }
  }, [parsedViewParam, rawViewParam, updateSearch]);
  const isSupervisor1View = viewParam === "supervisor-1";
  const isSupervisor2View = viewParam === "supervisor-2";
  const isPaginationView = viewParam === "supervisor-pagination";
  // The Supervisor suggestion view gets My Queues, Claim, and Phase 1 terms.
  const isSuggestionView = isSupervisor2View;
  // Supervisor (Expected): a copy of Supervisor 1 (merged Interactions view)
  // with a high-volume table paginated at 10 rows per page.
  const isExpectedView = viewParam === "supervisor-expected";
  // Flows where pending work lives in the top-level Queue tab instead of the
  // Interactions table.
  const hasQueueTab = isSupervisor2View || isPaginationView;
  const viewLabel = "Supervisor";

  // URL-addressable queue "Interaction preview" (deep-linkable / refresh-safe):
  // /queue/:engagementId/:mode with mode preview | expanded. Shows the
  // customer's pre-queue IVR transcript — there's no take-over, so no takeover
  // mode.
  const [queuePreviewMatched, queuePreviewParams] = useRoute(
    "/queue/:engagementId/:mode",
  );
  const rawQueuePreviewMode = queuePreviewMatched
    ? queuePreviewParams?.mode
    : null;
  const queuePreviewMode: InteractionPreviewMode | null =
    rawQueuePreviewMode === "preview" || rawQueuePreviewMode === "expanded"
      ? rawQueuePreviewMode
      : null;
  const queuePreviewEngagementId =
    queuePreviewMatched && queuePreviewMode
      ? (queuePreviewParams?.engagementId ?? null)
      : null;

  // Audit position is namespaced to the audit dialog. A target-bearing audit
  // link is validated by AgentTablePanel, which can replace an invalid preview
  // route with the correct owning table route.
  const auditPositionParam = new URLSearchParams(search).get("auditPos");
  useEffect(() => {
    if (modalParam !== "audit-log" && auditPositionParam != null) {
      updateSearch((params) => params.delete("auditPos"), { replace: true });
    }
  }, [auditPositionParam, modalParam, updateSearch]);

  // Queue remains deep-linkable for Supervisor flows that expose it. Top
  // navigation is intentionally hidden; preview links remain refresh-safe.
  const isQueueTab =
    hasQueueTab &&
    (queuePreviewMatched ||
      (!previewRouteMatched &&
        new URLSearchParams(search).get("nav") === "queue"));

  // Stale/invalid ?nav param self-cleans: "queue" is the only value, it only
  // applies in the flows that have a Queue tab, and it never belongs to an
  // Interactions preview route (those always render under Supervisor).
  const navParam = new URLSearchParams(search).get("nav");
  useEffect(() => {
    if (
      navParam != null &&
      (navParam !== "queue" || !hasQueueTab || previewRouteMatched)
    ) {
      updateSearch((p) => p.delete("nav"), { replace: true });
    }
  }, [navParam, hasQueueTab, previewRouteMatched, updateSearch]);

  // ?page=N — the current table page. Valid in two places: the Supervisor
  // (pagination) flow's Queue tab and the Supervisor (Expected) flow's
  // Interactions tab; the param self-cleans everywhere else (the effect lives
  // below, after the active tab is resolved). Parsed as a 1-based integer;
  // anything invalid normalises to 1.
  const rawPageParam = new URLSearchParams(search).get("page");
  const queuePage = Math.max(
    1,
    rawPageParam ? (parseInt(rawPageParam, 10) || 1) : 1,
  );
  const setQueuePage = useCallback(
    (page: number) => {
      updateSearch((p) => {
        if (page <= 1) p.delete("page");
        else p.set("page", String(page));
      });
    },
    [updateSearch],
  );

  // Keeps the view selection when navigating between table and preview URLs
  // (Agent view is the clean-URL default, so only Supervisor view is carried).
  const withView = useCallback(
    (path: string) => {
      // Carry the whole current query string (filters, tab, sla, filters=open)
      // so opening/closing a preview never resets the table's filtered view.
      // Modal params stay behind — a dialog shouldn't reopen on the new route.
      const params = new URLSearchParams(search);
      params.delete("modal");
      params.delete("agentId");
      params.delete("engagementId");
      params.delete("auditPos");
      // Pin the current flow (Supervisor 1 owns the clean URL).
      if (rawViewParam) params.set("view", rawViewParam);
      else params.delete("view");
      // The Queue-tab pin only travels to queue preview routes — everything
      // else (Interactions previews, the plain table) renders under the
      // Supervisor/My team tab, so a stale nav must not tag along.
      if (!path.startsWith("/queue")) params.delete("nav");
      const qs = params.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [search, rawViewParam],
  );

  // URL-addressable Active calls view (deep-linkable / refresh-safe): after a
  // voice take-over commits, the page routes to /active-call/:agentId and the
  // top tab bar switches from "Supervisor" to "Active calls".
  const [activeCallMatched, activeCallParams] = useRoute(
    "/active-call/:agentId",
  );
  const activeCallAgentId = activeCallMatched
    ? (activeCallParams?.agentId ?? null)
    : null;

  const handleTakeOverCommitted = useCallback(
    (agentId: string) => navigate(withView(`/active-call/${agentId}`)),
    [navigate, withView],
  );

  // Answering an incoming voice preview call: the active call is already
  // registered in the store; route to its Active calls details page
  // (URL-driven, refresh-safe — the store persists across reloads).
  const handleVoicePreviewAccepted = useCallback(
    () => navigate(withView("/active-call/preview")),
    [navigate, withView],
  );

  // Answered preview call — drives the top-bar call chip and Engaged status.
  const activePreviewCall = useActivePreviewCall();
  const activePreviewElapsed = useElapsedSince(
    activePreviewCall?.acceptedAtMs ?? null,
  );
  const monitoringSession = useMonitoringSession();
  const monitoringElapsed = useElapsedSince(
    monitoringSession?.startedAtMs ?? null,
  );
  // Answered calls take header priority if monitoring and a call overlap.
  const headerSession = activePreviewCall ?? monitoringSession;
  const headerSessionLabel =
    activePreviewCall?.number ?? monitoringSession?.agentName ?? "";
  const headerSessionMuted =
    activePreviewCall?.muted ?? monitoringSession?.muted ?? false;
  const headerSessionElapsed = activePreviewCall
    ? activePreviewElapsed
    : monitoringElapsed;
  const isEngaged = !!headerSession;
  const { setState: setHeaderState } = useSupervisorHeaderState();
  const engagementStartedAtMs = activePreviewCall
    ? activePreviewCall.acceptedAtMs
    : monitoringSession?.startedAtMs ?? null;

  useEffect(() => {
    setHeaderState((current) => ({
      ...current,
      engaged: isEngaged,
      engagedSinceMs: isEngaged ? engagementStartedAtMs ?? Date.now() : undefined,
      elapsed: isEngaged ? headerSessionElapsed : undefined,
    }));
  }, [
    engagementStartedAtMs,
    headerSessionElapsed,
    isEngaged,
    setHeaderState,
  ]);

  const pendingInteractionsUrl = useCallback(() => {
    const target = new URL(withView("/"), window.location.origin);
    if (hasQueueTab) target.searchParams.set("nav", "queue");
    else {
      target.searchParams.delete("nav");
      target.searchParams.delete("tab");
    }
    return `${target.pathname}${target.search}`;
  }, [hasQueueTab, withView]);

  const handleEndPreviewCall = useCallback(() => {
    endActivePreviewCall(activePreviewCall?.engagementId);
    if (activeCallMatched) {
      navigate(pendingInteractionsUrl());
    }
  }, [
    activeCallMatched,
    activePreviewCall?.engagementId,
    navigate,
    pendingInteractionsUrl,
  ]);

  useEffect(() => {
    if (
      activeCallMatched &&
      activeCallAgentId === "preview" &&
      !activePreviewCall
    ) {
      navigate(pendingInteractionsUrl(), { replace: true });
    }
  }, [
    activeCallAgentId,
    activeCallMatched,
    activePreviewCall,
    navigate,
    pendingInteractionsUrl,
  ]);

  // Digital take-over (Claim) commits land on the Active messages tab —
  // mirrors how voice take-overs land on Active calls.
  const handleDigitalTakeOverCommitted = useCallback(
    (engagementId: string) =>
      navigate(withView(`/active-messages/${engagementId}`)),
    [navigate, withView],
  );

  // URL-addressable Active messages tab (deep-linkable / refresh-safe): after
  // a digital take-over (Claim) commits, the page routes to
  // /active-messages/:engagementId and the top tab bar switches to "Active
  // messages". /active-messages without a conversation shows the empty state.
  const [activeMessagesRootMatched] = useRoute("/active-messages");
  const [activeMessageConvMatched, activeMessageParams] = useRoute(
    "/active-messages/:engagementId",
  );
  const activeMessagesMatched =
    activeMessagesRootMatched || activeMessageConvMatched;
  const activeMessageEngagementId = activeMessageConvMatched
    ? (activeMessageParams?.engagementId ?? null)
    : null;

  // Claimed digital conversations (drives the "Active messages (n)" count and
  // where the tab lands when clicked). A deep-linked conversation re-registers
  // itself so refreshes keep the count and tab content consistent.
  const claimedDigitalIds = useClaimedDigitalIds();
  useEffect(() => {
    if (activeMessageEngagementId) {
      registerClaimedDigital(activeMessageEngagementId);
    }
  }, [activeMessageEngagementId]);

  // Closing the taken-over call window ends the Active calls context and
  // returns to pending interactions.
  const handleMonitoringWindowClosed = useCallback(
    (agentId: string) => {
      if (activeCallMatched && agentId === activeCallAgentId) {
        navigate(pendingInteractionsUrl());
      }
    },
    [
      activeCallMatched,
      activeCallAgentId,
      navigate,
      pendingInteractionsUrl,
    ],
  );

  // All three flows are supervisor-capability flows: previews, take-over,
  // transfer, and requeue work everywhere.
  const canTakeOver = true;
  // The Active messages tab renders the claimed conversation as an embedded
  // take-over (no popup) — model it as a takeover preview on that route.
  const previewMode: InteractionPreviewMode | null = activeMessagesMatched
    ? activeMessageEngagementId
      ? "takeover"
      : null
    : parsedPreviewMode === "takeover" && !canTakeOver
      ? "preview"
      : parsedPreviewMode;
  const previewEngagementId = activeMessagesMatched
    ? activeMessageEngagementId
    : previewRouteMatched && previewMode
      ? (previewParams?.engagementId ?? null)
      : null;

  // Legacy digital take-over deep links (/interactions/:id/takeover) live on
  // the Active messages tab now — normalize them to its canonical URL.
  useEffect(() => {
    if (
      previewRouteMatched &&
      parsedPreviewMode === "takeover" &&
      canTakeOver &&
      previewEngagementId
    ) {
      navigate(withView(`/active-messages/${previewEngagementId}`), {
        replace: true,
      });
    }
  }, [
    previewRouteMatched,
    parsedPreviewMode,
    canTakeOver,
    previewEngagementId,
    navigate,
    withView,
  ]);


  // Unknown mode in the URL -> restore the plain table URL.
  useEffect(() => {
    if (previewRouteMatched && !previewMode) navigate(withView("/"));
  }, [previewRouteMatched, previewMode, navigate, withView]);


  // A preview deep link always belongs to the Interactions tab (preview URLs
  // never carry ?tab=agents, so the URL-derived tab is already Interactions).
  // Every flow shows the Agents/Interactions sub-tab pair. Queue-capable
  // Supervisor flows add Pending interactions as a local Supervisor sub-tab.
  // In Supervisor 1 a queue preview opens from the merged Interactions table;
  // in the Queue-tab flows it belongs to the Queue tab instead.
  const hasSubTabs = true;
  const activeTab: "Agents" | "Interactions" | "Queue" = isQueueTab
    ? "Queue"
    : previewRouteMatched
      ? "Interactions"
      : (isSupervisor1View || isExpectedView) && queuePreviewMatched
        ? "Interactions"
        : !hasSubTabs || new URLSearchParams(search).get("tab") === "agents"
          ? "Agents"
          : "Interactions";
  const isInteractions = activeTab === "Interactions";

  // Supervisor (Expected): full post-filter (pre-slice) Interactions count,
  // reported by AgentTablePanel so the footer's range indicator and page
  // count stay accurate. Seeded null so a deep-linked page isn't clamped
  // away before the first count report lands.
  const [expectedFilteredCount, setExpectedFilteredCount] = useState<
    number | null
  >(null);
  const expectedPageCount =
    expectedFilteredCount === null
      ? Number.MAX_SAFE_INTEGER
      : Math.max(1, Math.ceil(expectedFilteredCount / INTERACTIONS_PAGE_SIZE));
  const expectedPage = Math.min(Math.max(1, queuePage), expectedPageCount);
  // Clamp the URL page back into range when rows leave (e.g. claims empty the
  // last page) or a deep link overshoots.
  useEffect(() => {
    if (
      isExpectedView &&
      isInteractions &&
      expectedFilteredCount !== null &&
      expectedPage !== queuePage
    ) {
      setQueuePage(expectedPage);
    }
  }, [
    isExpectedView,
    isInteractions,
    expectedFilteredCount,
    expectedPage,
    queuePage,
    setQueuePage,
  ]);

  // Stale/invalid ?page param self-cleans: only valid in the pagination
  // flow's Queue tab or the Expected flow's Interactions tab; discard it
  // everywhere else.
  useEffect(() => {
    const pageParamValid =
      (isPaginationView && isQueueTab) || (isExpectedView && isInteractions);
    if (rawPageParam != null && !pageParamValid) {
      updateSearch((p) => p.delete("page"), { replace: true });
    }
  }, [
    rawPageParam,
    isPaginationView,
    isQueueTab,
    isExpectedView,
    isInteractions,
    updateSearch,
  ]);

  // Interactions-tab filters live in the URL (alongside ?view / ?tab), so any
  // filtered view is bookmarkable and refresh-safe. Values are validated
  // through the cascade: a stale/invalid param reads back as "All".
  // Supervisor view 2 merges the live pending (queued) rows into the
  // Interactions table, so those rows also feed the filter options — that is
  // what puts "Pending" in the States dropdown and the waiting queues in the
  // Queues dropdown.
  const pendingFilterRows = usePendingFilterRows(isPaginationView);
  const filterRows = useMemo(
    () =>
      isQueueTab
        ? pendingFilterRows
        : isSupervisor1View || isExpectedView
          ? [...pendingFilterRows, ...interactionFilterRows]
          : interactionFilterRows,
    [isQueueTab, isSupervisor1View, isExpectedView, pendingFilterRows],
  );

  const interactionFilters = useMemo(() => {
    const params = new URLSearchParams(search);
    const read = (key: InteractionFilterKey) =>
      (params.get(INTERACTION_FILTER_PARAMS[key]) ?? "")
        .split(",")
        .filter(Boolean);
    return cascadeInteractionFilters(
      {
        agentType: read("agentType"),
        agent: read("agent"),
        channel: read("channel"),
        queue: read("queue"),
        state: read("state"),
        category: read("category"),
      },
      filterRows,
    );
  }, [search, filterRows]);

  // Writes the validated selections back to the URL (comma-separated).
  const writeInteractionFilters = useCallback(
    (validated: InteractionFilterValues) => {
      updateSearch((params) => {
        INTERACTION_FILTER_KEYS.forEach((k) => {
          if (validated[k].length > 0) {
            params.set(INTERACTION_FILTER_PARAMS[k], validated[k].join(","));
          } else {
            params.delete(INTERACTION_FILTER_PARAMS[k]);
          }
        });
      });
    },
    [updateSearch],
  );

  // Changing one dropdown re-validates everything downstream of it: any
  // selection no longer offered after the change is dropped from the URL
  // (which is what resets its dropdown back to "All ...").
  const setInteractionFilter = useCallback(
    (key: InteractionFilterKey, values: string[]) => {
      const validated = cascadeInteractionFilters(
        {
          ...interactionFilters.values,
          [key]: values,
        },
        filterRows,
      ).values;
      writeInteractionFilters(validated);
      trackEvent("queue_filter_changed", {
        filter: key,
        value_count: validated[key].length,
        active_filter_count: INTERACTION_FILTER_KEYS.filter(
          (filterKey) => validated[filterKey].length > 0,
        ).length,
      });
    },
    [interactionFilters, writeInteractionFilters, filterRows],
  );

  // Interactions-tab "Breached SLA" toggle — URL-driven (deep-linkable /
  // refresh-safe): ?sla=breached, omitted when off (the default).
  const [breachedSlaOnly, setBreachedSlaOnly] = useUrlFlag("sla", "breached");
  const [slaParam, setSlaParam] = useUrlParam("sla");
  // Invalid ?sla value (anything but "breached") self-cleans via replace.
  useEffect(() => {
    if (slaParam != null && slaParam !== "breached") {
      setSlaParam(null, { replace: true });
    }
  }, [slaParam, setSlaParam]);

  // Supervisor 1 merges pending (queued) rows into the Interactions table;
  // the Queue-tab flows keep pending rows in the Queue tab only.
  const mergePendingInteractions =
    (isSupervisor1View || isExpectedView) && isInteractions;

  const setActiveTab = useCallback(
    (value: "Agents" | "Interactions" | "Queue") => {
      updateSearch(
        (params) => {
          if (value === "Queue") {
            params.set("nav", "queue");
            params.delete("tab");
          } else {
            params.delete("nav");
            if (value === "Agents") params.set("tab", "agents");
            else params.delete("tab");
          }
          if (params.get("modal") === "audit-log") {
            clearAuditLogParams(params);
          }
        },
        // Leaving from a preview deep link returns to the plain table URL.
        { path: previewRouteMatched || queuePreviewMatched ? "/" : pathname },
      );
    },
    [updateSearch, pathname, previewRouteMatched, queuePreviewMatched],
  );

  const openPreview = useCallback(
    (engagementId: string) => {
      navigate(withView(`/interactions/${engagementId}/preview`));
      trackEvent("interaction_preview_opened", {
        surface: "interactions",
        mode: "preview",
      });
    },
    [navigate, withView],
  );
  const changePreviewMode = useCallback(
    (mode: InteractionPreviewMode) => {
      if (!previewEngagementId) return;
      // A committed digital take-over (Claim) lives on the Active messages
      // tab; the listening modes stay on the popup routes.
      navigate(
        withView(
          mode === "takeover"
            ? `/active-messages/${previewEngagementId}`
            : `/interactions/${previewEngagementId}/${mode}`,
        ),
      );
    },
    [previewEngagementId, navigate, withView],
  );
  const closePreview = useCallback(
    (options?: { replace?: boolean }) =>
      navigate(withView("/"), { replace: options?.replace ?? false }),
    [navigate, withView],
  );
  // Closing the claimed conversation releases it (the count drops) and
  // returns to the Supervisor tab.
  const closeActiveMessage = useCallback(() => {
    if (activeMessageEngagementId) {
      removeClaimedDigital(activeMessageEngagementId);
    }
    // Fall back to the most recent other claimed conversation. With none
    // remaining, return to Supervisor so this route never strands the user.
    const remaining = claimedDigitalIds.filter(
      (id) => id !== activeMessageEngagementId,
    );
    navigate(
      withView(
        remaining.length
          ? `/active-messages/${remaining[remaining.length - 1]}`
          : "/",
      ),
    );
  }, [activeMessageEngagementId, claimedDigitalIds, navigate, withView]);

  // Queue preview navigation: opening a queue row's IVR-transcript preview
  // moves to /queue/:id/preview; closing returns to the Queue tab URL.
  const queueTabUrl = useCallback(() => {
    // Queue-tab flows return to their Queue tab; Supervisor 1 returns to the
    // merged Interactions table (clean URL).
    const params = new URLSearchParams();
    if (rawViewParam) params.set("view", rawViewParam);
    if (hasQueueTab) params.set("nav", "queue");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }, [rawViewParam, hasQueueTab]);
  const openQueuePreview = useCallback(
    (engagementId: string) => {
      navigate(withView(`/queue/${engagementId}/preview`));
      trackEvent("interaction_preview_opened", {
        surface: "queue",
        mode: "preview",
      });
    },
    [navigate, withView],
  );
  const changeQueuePreviewMode = useCallback(
    (mode: InteractionPreviewMode) => {
      // Queue previews have no takeover mode; ignore anything but the two
      // supported modes.
      if (
        queuePreviewEngagementId &&
        (mode === "preview" || mode === "expanded")
      ) {
        navigate(withView(`/queue/${queuePreviewEngagementId}/${mode}`));
      }
    },
    [queuePreviewEngagementId, navigate, withView],
  );
  const closeQueuePreview = useCallback(
    (options?: { replace?: boolean }) =>
      navigate(queueTabUrl(), { replace: options?.replace ?? false }),
    [navigate, queueTabUrl],
  );

  // Unknown queue preview mode in the URL -> restore the Queue tab URL.
  useEffect(() => {
    if (queuePreviewMatched && !queuePreviewMode) navigate(queueTabUrl());
  }, [queuePreviewMatched, queuePreviewMode, navigate, queueTabUrl]);

  // When the supervisor clicks an agent's "Active interactions" icons we jump to
  // the Interactions tab and blink that agent's rows. The nonce re-triggers the
  // blink animation even if the same agent is clicked again. (Blink highlight is
  // transient feedback, so it stays local rather than in the URL.)
  const [highlightAgentId, setHighlightAgentId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);

  const handleActiveInteractionsClick = useCallback(
    (agentId: string) => {
      setActiveTab("Interactions");
      setHighlightAgentId(agentId);
      setHighlightNonce((n) => n + 1);
    },
    [setActiveTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      // setActiveTab already routes back to the plain table URL when a preview
      // deep link is open, so switching tabs also closes the preview.
      setActiveTab(value as "Agents" | "Interactions" | "Queue");
      // Manually changing tabs clears any agent-driven row highlight.
      setHighlightAgentId(null);
    },
    [setActiveTab],
  );

  // State options constrained by the selected agent types. Empty selection shows
  // the union of all states. Selecting one type shows only that type's states.
  const stateOptionsForType = useMemo(() => {
    if (agentTypeFilter.length === 0) return agentStateOptions.All;
    return Array.from(
      new Set(
        agentTypeFilter.flatMap(
          (t) => agentStateOptions[t as "Air" | "Human"] ?? [],
        ),
      ),
    );
  }, [agentTypeFilter]);

  // Agent-type filter (shared by both tabs). Changing it drops any state
  // selections that are no longer valid for the new type set.
  const handleAgentTypeChange = useCallback((values: string[]) => {
    setAgentTypeFilter(values);
    if (values.length > 0) {
      const validStates = new Set(
        values.flatMap((t) => agentStateOptions[t as "Air" | "Human"] ?? []),
      );
      setStateFilter((prev) => prev.filter((s) => validStates.has(s)));
    }
    // If no types selected all states are valid — keep existing state selections.
  }, []);


  // Table settings dialog is URL-addressable (?modal=table-settings), sharing
  // the modal key with the panel's action dialogs so only one can be open.
  const [settingsOpen, setSettingsOpen] = useUrlFlag("modal", "table-settings");
  // Column visibility/order are personal preferences (not shareable state):
  // they persist across reloads via localStorage, never the URL.
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    loadStoredVisibility(
      COLS_STORAGE_KEYS.agentVisible,
      agentColumnMeta.map((c) => c.id),
    ),
  );
  // The Interactions table renders a different column set per view variant.
  // The Supervisor suggestion view uses a leaner Active-only column set (no
  // wait-time or previous-agent columns), so it uses separate preferences.
  const activeInteractionMeta = isSuggestionView
    ? suggestionInteractionColumnMeta
    : supervisor3InteractionColumnMeta;
  const interactionVisibleKey = isSuggestionView
    ? COLS_STORAGE_KEYS.suggestionInteractionVisible
    : COLS_STORAGE_KEYS.s3InteractionVisible;
  const interactionOrderKey = isSuggestionView
    ? COLS_STORAGE_KEYS.suggestionInteractionOrder
    : COLS_STORAGE_KEYS.s3InteractionOrder;
  const [visibleInteractionCols, setVisibleInteractionCols] = useState<
    Record<string, boolean>
  >(() =>
    loadStoredVisibility(
      interactionVisibleKey,
      activeInteractionMeta.map((c) => c.id),
      S2_S3_HIDDEN_COLUMN_IDS,
    ),
  );
  const [interactionColOrder, setInteractionColOrder] = useState<string[]>(
    () =>
      loadStoredOrder(
        interactionOrderKey,
        activeInteractionMeta.map((c) => c.id),
      ),
  );
  const [colOrder, setColOrder] = useState<string[]>(() =>
    loadStoredOrder(
      COLS_STORAGE_KEYS.agentOrder,
      agentColumnMeta.map((c) => c.id),
    ),
  );
  // My Queues (suggestion views) table settings — own state + storage keys so
  // they never clobber the Interactions/Agents prefs. Single schema, so no
  // key-switch rehydration is needed.
  const [visibleQueueCols, setVisibleQueueCols] = useState<
    Record<string, boolean>
  >(() =>
    loadStoredVisibility(
      COLS_STORAGE_KEYS.myQueuesVisible,
      myQueuesColumnMeta.map((c) => c.id),
      MY_QUEUES_HIDDEN_COLUMN_IDS,
    ),
  );
  const [queueColOrder, setQueueColOrder] = useState<string[]>(() =>
    loadStoredOrder(
      COLS_STORAGE_KEYS.myQueuesOrder,
      myQueuesColumnMeta.map((c) => c.id),
    ),
  );

  // Ref tracks which interaction-column schema is currently "committed" to
  // state. When the view switches between suggestion and classic/pagination
  // views, interactionVisibleKey changes but SupervisorAgents stays mounted,
  // so the interaction column state must be re-hydrated from the new key.
  // Save effects check this ref before writing: if it mismatches the current
  // key, the switch is mid-flight and stale state must not be persisted.
  const committedInteractionKeyRef = useRef(interactionVisibleKey);

  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.agentVisible, visibleCols);
  }, [visibleCols]);
  // Persist interaction visibility only when the committed key matches — blocks
  // stale writes from the old schema to the new key during rehydration.
  useEffect(() => {
    if (committedInteractionKeyRef.current !== interactionVisibleKey) return;
    saveStored(interactionVisibleKey, visibleInteractionCols);
  }, [interactionVisibleKey, visibleInteractionCols]);
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.agentOrder, colOrder);
  }, [colOrder]);
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.myQueuesVisible, visibleQueueCols);
  }, [visibleQueueCols]);
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.myQueuesOrder, queueColOrder);
  }, [queueColOrder]);
  // Same guard for the order key.
  useEffect(() => {
    if (committedInteractionKeyRef.current !== interactionVisibleKey) return;
    saveStored(interactionOrderKey, interactionColOrder);
  }, [interactionVisibleKey, interactionOrderKey, interactionColOrder]);

  // Rehydrate interaction column state whenever the active preference key
  // changes (= the user switches between a suggestion view and any other view).
  // Declared AFTER the save effects so those guards fire first on the same
  // render, preventing the old state from landing in the new key.
  useEffect(() => {
    if (committedInteractionKeyRef.current === interactionVisibleKey) return;
    committedInteractionKeyRef.current = interactionVisibleKey;
    setVisibleInteractionCols(
      loadStoredVisibility(
        interactionVisibleKey,
        activeInteractionMeta.map((c) => c.id),
        S2_S3_HIDDEN_COLUMN_IDS,
      ),
    );
    setInteractionColOrder(
      loadStoredOrder(
        interactionOrderKey,
        activeInteractionMeta.map((c) => c.id),
      ),
    );
    // activeInteractionMeta is stable per key (changes iff the key changes);
    // including it would create a circular dep with the key — exclude it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionVisibleKey, interactionOrderKey]);
  const [draftCols, setDraftCols] = useState<Record<string, boolean>>(
    visibleCols,
  );
  const [draftOrder, setDraftOrder] = useState<string[]>(colOrder);
  const [dragId, setDragId] = useState<string | null>(null);

  // Which table the settings dialog edits: My Queues when the (suggestion
  // view) Queue tab is active, otherwise the active My team sub-tab.
  const isMyQueuesSettings = isQueueTab && isSuggestionView;
  const lockedColId = isMyQueuesSettings
    ? "sourceName"
    : isInteractions
      ? "sourceName"
      : "fullName";
  const activeVisibleCols = isInteractions ? visibleInteractionCols : visibleCols;

  const colLabelById = Object.fromEntries(
    agentColumnMeta.map((c) => [c.id, c.label]),
  );

  const openSettings = (open: boolean) => {
    setSettingsOpen(open);
  };

  // Sync drafts whenever the dialog opens — covers button clicks, deep links,
  // and back/forward re-opens alike (the dialog is URL-driven).
  useEffect(() => {
    if (!settingsOpen) return;
    setDraftCols(
      isMyQueuesSettings
        ? visibleQueueCols
        : isInteractions
          ? visibleInteractionCols
          : visibleCols,
    );
    setDraftOrder(
      isMyQueuesSettings
        ? queueColOrder
        : isInteractions
          ? interactionColOrder
          : colOrder,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  // Reorders draftOrder by moving fromId to the slot occupied by toId. The
  // locked column (Agent on the Agents tab, Channel on Interactions) stays
  // pinned first and cannot be dragged or displaced.
  const moveColumn = (fromId: string, toId: string) => {
    if (fromId === toId || fromId === lockedColId || toId === lockedColId)
      return;
    setDraftOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  };

  // Agents-tab filters stay local component state; Interactions-tab filters
  // come from the URL-driven cascade. Shared props (channels, agent type) are
  // resolved per active tab.
  const iv = interactionFilters.values;
  const selectedStates = stateFilter;
  const selectedChannels = isInteractions ? iv.channel : channelFilter;
  const selectedCategories = iv.category;
  const selectedAgentIds = iv.agent;
  const selectedQueues = iv.queue;
  // Supervisor 2 Interactions shows only Active rows — State is always
  // unambiguous, so the column and filter are hidden there.
  // Supervisor (suggestion), Agent (suggestion), and Supervisor (pagination)
  // all show only Active rows on the Interactions tab — State is unambiguous
  // there, so the filter and column are hidden in those flows.
  const showStateFilter =
    isInteractions && !isSupervisor2View && !isPaginationView;
  const selectedInteractionStates = showStateFilter ? iv.state : [];
  // Active-filter count for the "Filters (n)" toggle label — one per filter
  // control with a non-default selection on the active tab (each multi-select
  // counts once no matter how many values it holds).
  const interactionFilterValues = showStateFilter
    ? [iv.agentType, iv.agent, iv.channel, iv.category, iv.queue, iv.state]
    : [iv.agentType, iv.agent, iv.channel, iv.category, iv.queue];
  const activeFilterCount = isInteractions
    ? interactionFilterValues.filter((v) => v.length > 0).length +
      (breachedSlaOnly ? 1 : 0)
    : [channelFilter, agentTypeFilter, stateFilter].filter((v) => v.length > 0)
        .length;
  // Both agent types picked = no narrowing (same as none picked).
  // The panel takes the raw multi-select array; empty = no narrowing.
  const effectiveAgentTypeFilter = isInteractions ? iv.agentType : agentTypeFilter;
  // Order matters: columns render in the saved drag order, Agent column first.
  const visibleColumnIds = colOrder.filter(
    (id) => id === "fullName" || visibleCols[id],
  );
  const visibleInteractionColumnIds = interactionColOrder.filter(
    (id) =>
      (id === "sourceName" || visibleInteractionCols[id]) &&
      // Supervisor (suggestion), Agent (suggestion), and Supervisor
      // (pagination) Interactions tabs are always Active — hide the State
      // column in those flows.
      !(
        (isSupervisor2View || isPaginationView) &&
        id === "conversationState"
      ),
  );

  // The settings dialog lists both tabs' columns in their draggable saved
  // order; the draft order is committed on Save.
  const dialogColumnOrder = draftOrder;
  const dialogLabelById = isMyQueuesSettings
    ? Object.fromEntries(myQueuesColumnMeta.map((c) => [c.id, c.label]))
    : isInteractions
      ? Object.fromEntries(activeInteractionMeta.map((c) => [c.id, c.label]))
      : colLabelById;
  // Column ids My Queues actually renders, in saved order (Channel pinned).
  const visibleQueueColumnIds = queueColOrder.filter(
    (id) => id === "sourceName" || visibleQueueCols[id],
  );
  const [headerControlsRoot, setHeaderControlsRoot] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderControlsRoot(
      document.getElementById("supervisor-header-controls"),
    );
    return () => setHeaderControlsRoot(null);
  }, []);

  return (
    <>
      {headerControlsRoot
        ? createPortal(
            <div className="flex items-center gap-2 self-stretch">
            {headerSession ? (
              /* Active call chip: dark bar with the caller number, live timer,
                 mute toggle and hang-up (design ref: RingCX top-bar call). */
              <div
                className="flex h-full min-w-[334px] max-w-[420px] shrink-0 items-center gap-3 px-4"
                style={{ backgroundColor: "var(--sui-colors-extra-denim-high-contrast)", color: "var(--sui-colors-neutral-static-w0)" }}
                data-testid="chip-active-call"
              >
                {activePreviewCall ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(withView(activePreviewCall.detailsPath))
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent p-0 text-left cursor-pointer"
                    data-testid="button-active-call-details"
                    aria-label={`Open call details for ${headerSessionLabel}`}
                  >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M4 13a8 8 0 0 1 16 0" />
                    <path d="M4 13v4a1.5 1.5 0 0 0 1.5 1.5H7V12H5.5A1.5 1.5 0 0 0 4 13.5" />
                    <path d="M20 13v4a1.5 1.5 0 0 1-1.5 1.5H17V12h1.5A1.5 1.5 0 0 1 20 13.5" />
                    <path d="M17 18.5v.5a2 2 0 0 1-2 2h-2" />
                  </svg>
                  <span className="flex min-w-0 flex-1 flex-col leading-none">
                    <span
                      className="block truncate font-['Lato',sans-serif] text-[15px] font-bold"
                      title={headerSessionLabel}
                    >
                      {headerSessionLabel}
                    </span>
                    <span
                      className="font-['Lato',sans-serif] text-[12px] opacity-80 tabular-nums"
                      data-testid="text-active-call-timer"
                    >
                      {headerSessionElapsed}
                    </span>
                  </span>
                  </button>
                ) : (
                  <div
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    data-testid="monitoring-status-summary"
                    aria-label={`Monitoring ${headerSessionLabel}`}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M4 13a8 8 0 0 1 16 0" />
                      <path d="M4 13v4a1.5 1.5 0 0 0 1.5 1.5H7V12H5.5A1.5 1.5 0 0 0 4 13.5" />
                      <path d="M20 13v4a1.5 1.5 0 0 1-1.5 1.5H17V12h1.5A1.5 1.5 0 0 1 20 13.5" />
                      <path d="M17 18.5v.5a2 2 0 0 1-2 2h-2" />
                    </svg>
                    <span className="flex min-w-0 flex-1 flex-col leading-none">
                      <span
                        className="block truncate font-['Lato',sans-serif] text-[15px] font-bold"
                        title={headerSessionLabel}
                      >
                        {headerSessionLabel}
                      </span>
                      <span
                        className="font-['Lato',sans-serif] text-[12px] opacity-80 tabular-nums"
                        data-testid="text-active-call-timer"
                      >
                        {headerSessionElapsed}
                      </span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={
                    activePreviewCall
                      ? toggleActivePreviewCallMute
                      : toggleMonitoringSessionMute
                  }
                  data-testid="button-active-call-mute"
                  aria-label={headerSessionMuted ? "Unmute" : "Mute"}
                  aria-pressed={headerSessionMuted}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none cursor-pointer transition-colors ${
                    headerSessionMuted
                      ? "bg-[var(--sui-colors-danger-f)] hover:opacity-80"
                      : "bg-[var(--sui-colors-neutral-base)] hover:bg-[var(--sui-colors-neutral-b5)]"
                  }`}
                  style={{ color: headerSessionMuted ? "var(--sui-colors-neutral-static-w0)" : "var(--sui-colors-neutral-b1)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <line x1="12" y1="18" x2="12" y2="21" />
                    {headerSessionMuted ? (
                      <line x1="4" y1="4" x2="20" y2="20" />
                    ) : null}
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={
                    activePreviewCall
                      ? handleEndPreviewCall
                      : () => endMonitoringSession(monitoringSession?.id)
                  }
                  data-testid="button-active-call-hangup"
                  aria-label={
                    activePreviewCall ? "Hang up" : "End monitoring"
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-[var(--sui-colors-danger-f)] cursor-pointer hover:opacity-80"
                  style={{ color: "var(--sui-colors-neutral-static-w0)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M12 9c-3.4 0-6.6 1.1-9.2 3.2a1.5 1.5 0 0 0-.2 2.2l1.6 1.8c.5.5 1.3.6 1.9.2l2.2-1.5c.4-.3.7-.8.7-1.3v-1.2c2-.6 4-.6 6 0v1.2c0 .5.3 1 .7 1.3l2.2 1.5c.6.4 1.4.3 1.9-.2l1.6-1.8a1.5 1.5 0 0 0-.2-2.2A14.4 14.4 0 0 0 12 9z" />
                  </svg>
                </button>
              </div>
            ) : null}
            </div>,
            headerControlsRoot,
          )
        : null}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-neutral-200 bg-white">
            <div className="flex h-[60px] items-center px-3 py-0.5">
              <div className="flex flex-1 items-center gap-2 pr-3">
                <span className="font-descriptor-mini tracking-[var(--descriptor-mini-letter-spacing)] text-neutralf-06 [font-style:var(--descriptor-mini-font-style)] focus-visible text-[18px] font-semibold">
                  RingCX Supervisor
                </span>
              </div>
              <Button
                variant="ghost"
                className="h-8 rounded-2xl px-3 shadow-none hover:bg-[#66666614]"
              >
                <img
                  className="mr-1 h-4 w-4"
                  alt="Icon"
                  src="/figmaAssets/--icon.svg"
                />
                <span className="font-descriptor-mini text-[length:var(--descriptor-mini-font-size)] font-[number:var(--descriptor-mini-font-weight)] leading-[var(--descriptor-mini-line-height)] tracking-[var(--descriptor-mini-letter-spacing)] text-[#666666] [font-style:var(--descriptor-mini-font-style)]">
                  Session info
                </span>
              </Button>
              <Separator
                orientation="vertical"
                className="ml-3 mr-2 h-4 bg-neutral-200"
              />
              <Button variant="ghost" className="h-8 w-8 p-0 shadow-none">
                <img
                  className="h-4 w-4"
                  alt="Icon help border"
                  src="/figmaAssets/icon-help-border.svg"
                />
              </Button>
            </div>
          </div>
          {isQueueTab && (
            <div
              data-name="Supervisor toolbar"
              className="relative flex shrink-0 items-center border-b border-[#0000001a] px-5 py-3"
            >
              <h2 className="shrink-0 font-subtitle-mini text-[15px] font-semibold leading-[var(--subtitle-mini-line-height)] text-[#121212]">
                {viewLabel}
              </h2>
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-auto">
                  <TabsList className="h-10 items-stretch gap-0 rounded-[4px] bg-[#f9f9f9] p-1">
                    {[...supervisorFilters, "Queue"].map((tab) => (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="h-full w-[148px] rounded-[4px] px-6 font-['Roboto',sans-serif] text-[14px] tracking-[0.15px] text-[#212121] shadow-none ring-offset-0 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#212121] data-[state=active]:shadow-[0px_2px_3px_0px_rgba(173,173,173,0.2)]"
                        data-testid={`tab-supervisor-${tab.toLowerCase()}`}
                      >
                        {tab === "Queue"
                          ? "Pending interactions"
                          : tab === "Interactions"
                            ? `Interactions (${interactionsCount ?? pendingInteractionsCount})`
                            : tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>
          )}
          {isQueueTab ? (
            isPaginationView ? (
              <PaginatedQueuePanel
                searchQuery={searchQuery}
                onSearch={setSearchQuery}
                filtersOpen={filtersOpen}
                onFiltersOpenChange={setFiltersOpen}
                filterCount={
                  [iv.channel, iv.queue, iv.category].filter(
                    (v) => v.length > 0,
                  ).length + (breachedSlaOnly ? 1 : 0)
                }
                channelValues={iv.channel}
                channelOptions={interactionFilters.options.channel}
                onChannelChange={(v) => setInteractionFilter("channel", v)}
                queueValues={iv.queue}
                queueOptions={interactionFilters.options.queue}
                onQueueChange={(v) => setInteractionFilter("queue", v)}
                categoryValues={iv.category}
                categoryOptions={interactionFilters.options.category}
                onCategoryChange={(v) => setInteractionFilter("category", v)}
                breachedSlaOnly={breachedSlaOnly}
                onBreachedSlaChange={setBreachedSlaOnly}
                previewEngagementId={queuePreviewEngagementId}
                previewMode={queuePreviewMode}
                onPreviewOpen={openQueuePreview}
                onPreviewModeChange={changeQueuePreviewMode}
                onPreviewClose={closeQueuePreview}
                onVoicePreviewAccepted={handleVoicePreviewAccepted}
                onDigitalTakeOverCommitted={handleDigitalTakeOverCommitted}
                hideBreachedSla={true}
                page={queuePage}
                onPageChange={setQueuePage}
              />
            ) : (
            <QueuePanel
              extendedQueue={isSuggestionView}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              filterCount={
                [iv.channel, iv.queue, iv.category].filter(
                  (v) => v.length > 0,
                ).length + (breachedSlaOnly ? 1 : 0)
              }
              channelValues={iv.channel}
              channelOptions={interactionFilters.options.channel}
              onChannelChange={(v) => setInteractionFilter("channel", v)}
              queueValues={iv.queue}
              queueOptions={interactionFilters.options.queue}
              onQueueChange={(v) => setInteractionFilter("queue", v)}
              categoryValues={iv.category}
              categoryOptions={interactionFilters.options.category}
              onCategoryChange={(v) => setInteractionFilter("category", v)}
              breachedSlaOnly={breachedSlaOnly}
              onBreachedSlaChange={setBreachedSlaOnly}
              previewEngagementId={queuePreviewEngagementId}
              previewMode={queuePreviewMode}
              onPreviewOpen={openQueuePreview}
              onPreviewModeChange={changeQueuePreviewMode}
              onPreviewClose={closeQueuePreview}
              onVoicePreviewAccepted={handleVoicePreviewAccepted}
              onDigitalTakeOverCommitted={handleDigitalTakeOverCommitted}
              queueTitle={isSuggestionView ? "Pending interactions" : "Queue"}
              hideBreachedSla={true}
              hideQueueViewInsights={isSuggestionView}
              hideQueueTransferAndMore={false}
              queueClaimLabel="Claim"
              useMyQueuesColumns={isSuggestionView}
              onOpenSettings={
                isSuggestionView ? () => openSettings(true) : undefined
              }
              visibleQueueColumnIds={
                isSuggestionView ? visibleQueueColumnIds : undefined
              }
            />
            )
          ) : (
          <>
          {activeCallMatched ||
          activeMessagesMatched ||
          previewMode === "takeover" ? null : (
            // The Active messages tab (and the momentary legacy-takeover
            // redirect frame) render without the Supervisor toolbar/filters:
            // the claimed conversation is the tab's content.
          <>
          <div
            data-name="Supervisor toolbar"
            className="relative flex shrink-0 items-center border-b border-[#0000001a] px-5 py-3"
          >
            <h2 className="shrink-0 font-subtitle-mini text-[15px] font-semibold leading-[var(--subtitle-mini-line-height)] text-[#121212]">
              {viewLabel}
            </h2>
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
              {hasSubTabs && (
              <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                className="w-auto"
              >
                <TabsList className="h-10 items-stretch gap-0 rounded-[4px] bg-[#f9f9f9] p-1">
                  {[...supervisorFilters, ...(hasQueueTab ? ["Queue"] : [])].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="h-full w-[148px] rounded-[4px] px-6 font-['Roboto',sans-serif] text-[14px] tracking-[0.15px] text-[#212121] shadow-none ring-offset-0 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#212121] data-[state=active]:shadow-[0px_2px_3px_0px_rgba(173,173,173,0.2)] data-[state=inactive]:bg-transparent data-[state=inactive]:font-normal data-[state=inactive]:text-[#212121]"
                      data-testid={`tab-supervisor-${tab.toLowerCase()}`}
                    >
                      {tab === "Queue"
                        ? "Pending interactions"
                        : tab === "Interactions"
                          ? `Interactions (${interactionsCount ?? pendingInteractionsCount})`
                          : tab}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              )}
              <div className="relative w-[500px]">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a1a1a1]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 rounded-[4px] border-[#e0e0e0] pl-11 pr-[96px] font-['Roboto',sans-serif] text-[14px] tracking-[0.25px] text-[#212121] placeholder:text-[#a1a1a1]"
                  placeholder={
                    isInteractions ? "Search interactions" : "Search agents"
                  }
                  data-testid="input-search"
                />
                {/* RingCX core FilterToggle: blue + bold count whenever any
                    filter is active, matching the stock RingCX pattern. */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <SupervisorFilterToggle
                    open={filtersOpen}
                    count={activeFilterCount}
                    onOpenChange={setFiltersOpen}
                    testId="button-filters"
                  />
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              aria-label="Table settings"
              onClick={() => openSettings(true)}
              className="ml-auto h-10 w-10 rounded-full p-0 text-[#666666] shadow-none hover:bg-[#66666614]"
              data-testid="button-settings"
            >
              <SettingsIcon className="h-6 w-6" />
            </Button>
          </div>
          {filtersOpen && (
            <div
              className={`flex shrink-0 gap-3 border-b border-[#0000001a] bg-[#f9f9f9] px-5 py-3 ${
                isInteractions ? "flex-col items-stretch" : "items-center"
              }`}
              data-testid="filter-row"
            >
              {/* Agents tab: Channel, Agent type, State (State options constrained
                  by the selected Agent types). */}
              {!isInteractions && (
                <>
                  <SupervisorFilter
                    values={channelFilter}
                    onValuesChange={setChannelFilter}
                    placeholder="All channels"
                    options={CHANNEL_OPTIONS.map((c) => ({
                      value: c,
                      label: c,
                    }))}
                    testId="select-channel"
                  />
                  <SupervisorFilter
                    values={agentTypeFilter}
                    onValuesChange={handleAgentTypeChange}
                    placeholder="All agent types"
                    options={AGENT_TYPE_OPTIONS}
                    testId="select-agent-type"
                  />
                  <SupervisorFilter
                    values={stateFilter}
                    onValuesChange={setStateFilter}
                    placeholder="All states"
                    options={stateOptionsForType.map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    testId="select-state"
                  />
                </>
              )}
              {/* Interactions tab: Agent type, Agents, Channels, Queues,
                  States, Categories (in that exact order). Each dropdown's
                  options cascade from the selections to its left, and every
                  selection is URL-addressable. */}
              {isInteractions && (
                <>
                  {/* Line 1 (design order): Agent type, Agents, Channels,
                      Categories. Agent type sits first — it is first
                      in the cascade, so picking a type narrows every dropdown
                      to its right. z-40 keeps line 1's in-flow dropdown menus
                      painting above line 2 — each MultiSelect wrapper carries
                      its own z-index: 30, so line 1's context must sit above
                      that. */}
                  {/* Both lines share a 4-column grid so the filters span
                      the full width of the container and every filter on
                      line 2 has the exact same width as the ones above it. */}
                  <div className="relative z-40 grid grid-cols-4 items-center gap-3">
                    <SupervisorFilter
                      values={iv.agentType}
                      onValuesChange={(v) =>
                        setInteractionFilter("agentType", v)
                      }
                      placeholder="All agent types"
                      options={interactionFilters.options.agentType}
                      testId="select-agent-type"
                    />
                    <SupervisorFilter
                      values={iv.agent}
                      onValuesChange={(v) => setInteractionFilter("agent", v)}
                      placeholder="All agents"
                      options={interactionFilters.options.agent}
                      testId="select-agent"
                    />
                    <SupervisorFilter
                      values={iv.channel}
                      onValuesChange={(v) => setInteractionFilter("channel", v)}
                      placeholder="All channels"
                      options={interactionFilters.options.channel}
                      testId="select-channel"
                    />
                    <SupervisorFilter
                      values={iv.category}
                      onValuesChange={(v) =>
                        setInteractionFilter("category", v)
                      }
                      placeholder="All categories"
                      options={interactionFilters.options.category}
                      testId="select-category"
                    />
                  </div>
                  {/* Line 2 (design order): Queues, States (hidden in
                      Supervisor 2), then the Breached SLA toggle. */}
                  {/* No z-index here: the menus carry their own z and
                      must not be capped below the table's sticky header. */}
                  <div className="grid grid-cols-4 items-center gap-3">
                    <SupervisorFilter
                      values={iv.queue}
                      onValuesChange={(v) => setInteractionFilter("queue", v)}
                      placeholder="All queues"
                      options={interactionFilters.options.queue}
                      testId="select-queue"
                    />
                    {showStateFilter && (
                      <SupervisorFilter
                        values={iv.state}
                        onValuesChange={(v) => setInteractionFilter("state", v)}
                        placeholder="All states"
                        options={interactionFilters.options.state}
                        testId="select-state"
                      />
                    )}
                    <div
                      className={`${showStateFilter ? "col-span-2" : "col-span-3"} flex items-center gap-4`}
                    >
                      {/* Breached SLA hidden in suggestion views (My Queues
                          page); set isSuggestionView=false to re-enable. */}
                      {!isSuggestionView && (
                        <SupervisorCheckbox
                          checked={breachedSlaOnly}
                          onCheckedChange={setBreachedSlaOnly}
                          label="Breached SLA"
                          testId="checkbox-breached-sla"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </>
          )}
          {activeCallMatched &&
          (activeCallAgentId !== "preview" || activePreviewCall) ? (
            // Active calls view for the taken-over voice call. The supervisor
            // table below stays mounted (zero-height) so the floating take-over
            // dialer window and monitoring session survive the tab switch.
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-[#0000001a] bg-white px-4 py-2">
                <Button variant="ghost" onClick={() => navigate(withView("/"))}>
                  Back to Supervisor
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ActiveCallView agentId={activeCallAgentId} />
              </div>
            </div>
          ) : null}
          {activeMessagesMatched && !activeMessageEngagementId ? (
            // Active messages with nothing claimed: the conversation list
            // (which also hosts the incoming-message card) plus an empty
            // state. The table stays mounted (zero-height) below, same as
            // the Active calls tab.
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <ActiveMessagesSidebar
                rows={[]}
                selectedId={null}
                onSelect={(id) =>
                  navigate(withView(`/active-messages/${id}`))
                }
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-[#0000001a] bg-white px-4 py-3">
                  <span className="font-['Roboto',sans-serif] text-[14px] text-[#121212]">
                    Messages
                  </span>
                </div>
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden px-6 text-center"
                  data-testid="empty-active-messages"
                >
                <span className="font-['Roboto',sans-serif] text-[16px] font-medium text-[#121212]">
                  No active messages
                </span>
                <span className="font-['Roboto',sans-serif] text-[14px] tracking-[0.25px] text-[#666666]">
                  When you claim a conversation, it appears here.
                </span>
                <Button variant="outline" onClick={() => navigate(withView("/"))}>
                  Back to Supervisor
                </Button>
                </div>
              </div>
            </div>
          ) : null}
          <div
            data-name={
              isInteractions ? "Interaction table" : "Agent table"
            }
            className={
              activeCallMatched ||
              (activeMessagesMatched && !activeMessageEngagementId)
                ? "h-0 overflow-hidden"
                : "min-h-0 flex-1 overflow-hidden"
            }
          >
            <AgentTablePanel
              // Remount when entering/leaving the Expected flow so its
              // high-volume seeded Interactions list applies (seeding runs
              // once per mount).
              key={isExpectedView ? "supervisor-expected" : "default"}
              readOnly={false}
              activeTab={activeTab}
              interactionsVariant={
                isInteractions
                  ? isSuggestionView
                    ? "suggestion"
                    : "supervisor3"
                  : undefined
              }
              includePendingRows={mergePendingInteractions}
              interactionsVolume={
                isExpectedView ? EXPECTED_INTERACTIONS_VOLUME : undefined
              }
              interactionsPageSlice={
                isExpectedView && isInteractions
                  ? { page: expectedPage, pageSize: INTERACTIONS_PAGE_SIZE }
                  : undefined
              }
              onInteractionsFilteredCount={
                isExpectedView ? setExpectedFilteredCount : undefined
              }
              showCurrentUser
              searchValue={searchQuery}
              selectedStates={selectedStates}
              selectedChannels={selectedChannels}
              agentTypeFilter={effectiveAgentTypeFilter}
              visibleColumnIds={visibleColumnIds}
              selectedAgentIds={selectedAgentIds}
              selectedCategories={selectedCategories}
              selectedQueues={selectedQueues}
              selectedInteractionStates={selectedInteractionStates}
              breachedSlaOnly={isInteractions && breachedSlaOnly}
              visibleInteractionColumnIds={visibleInteractionColumnIds}
              onActiveInteractionsClick={handleActiveInteractionsClick}
              highlightAgentId={highlightAgentId}
              highlightNonce={highlightNonce}
              previewEngagementId={
                mergePendingInteractions
                  ? (queuePreviewEngagementId ?? previewEngagementId)
                  : previewEngagementId
              }
              previewMode={
                mergePendingInteractions && queuePreviewEngagementId
                  ? queuePreviewMode
                  : previewMode
              }
              onInteractionCountChange={setInteractionsCount}
              onPreviewOpen={openPreview}
              previewTakeOverRoutable={!queuePreviewEngagementId}
              onPreviewModeChange={changePreviewMode}
              onPreviewClose={
                activeMessagesMatched
                  ? closeActiveMessage
                  : queuePreviewEngagementId
                    ? closeQueuePreview
                    : closePreview
              }
              onTakeOverCommitted={handleTakeOverCommitted}
              onVoicePreviewAccepted={handleVoicePreviewAccepted}
              onDigitalTakeOverCommitted={handleDigitalTakeOverCommitted}
              activeMessagesMode={activeMessagesMatched}
              onMonitoringWindowClosed={handleMonitoringWindowClosed}
            />
          </div>
          {/* Supervisor (Expected): pagination footer under the merged
              Interactions table. Hidden whenever the table itself is hidden
              (Active calls / Active messages) or replaced by a full take-over
              view. */}
          {isExpectedView &&
          isInteractions &&
          !activeCallMatched &&
          !activeMessagesMatched &&
          previewMode !== "takeover" ? (
            <PaginationFooter
              count={expectedFilteredCount}
              pageSize={INTERACTIONS_PAGE_SIZE}
              page={expectedPage}
              onPageChange={setQueuePage}
              emptyLabel="No interactions to show"
              testIdPrefix="interactions"
            />
          ) : null}
          </>
          )}
          <Dialog open={settingsOpen} onOpenChange={openSettings}>
            <DialogContent
              className="max-w-3xl gap-0 p-0"
              data-testid="dialog-settings"
            >
              {/* One type system across the dialog: 20px semibold dark title,
                  14px body, #666 secondary text, RC blue reserved for links
                  and primary actions. */}
              <DialogHeader className="px-8 pt-7">
                <DialogTitle className="text-xl font-semibold text-[#121212]">
                  {isMyQueuesSettings
                    ? "Pending interactions table settings"
                    : isInteractions
                      ? "Interactions table settings"
                      : "Agent table settings"}
                </DialogTitle>
              </DialogHeader>
              <div className="px-8 pb-2 pt-4">
                <p className="mb-4 text-sm text-[#666666]">
                  For more information, visit{" "}
                  <a
                    href="https://support.ringcentral.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: RC_BLUE }}
                    data-testid="link-support"
                  >
                    RingCentral Support
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </p>
                <p className="mb-3 text-sm text-[#666666]">
                  Drag the handle to reorder columns. Changes apply to the
                  table when you save.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {dialogColumnOrder.map((colId) => {
                    const locked = colId === lockedColId;
                    const checked = locked ? true : !!draftCols[colId];
                    const dragging = dragId === colId;
                    return (
                      <label
                        key={colId}
                        htmlFor={`col-${colId}`}
                        draggable={!locked}
                        onDragStart={() => {
                          if (!locked) setDragId(colId);
                        }}
                        onDragOver={(e) => {
                          if (!locked && dragId) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId) moveColumn(dragId, colId);
                          setDragId(null);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={`flex items-center justify-between gap-2 rounded-md bg-[#f4f5f7] px-3 py-2.5 text-sm transition-opacity ${
                          locked
                            ? "cursor-default text-[#9aa0a6]"
                            : "cursor-pointer text-[#121212]"
                        } ${dragging ? "opacity-40 ring-2 ring-[#066fac]" : ""}`}
                        data-testid={`col-row-${colId}`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Checkbox
                            id={`col-${colId}`}
                            checked={checked}
                            disabled={locked}
                            onCheckedChange={(value) =>
                              setDraftCols((prev) => ({
                                ...prev,
                                [colId]: value === true,
                              }))
                            }
                            className={`h-5 w-5 rounded border-[#c4c8cd] disabled:opacity-100 ${
                              locked
                                ? "data-[state=checked]:border-[#aeb3ba] data-[state=checked]:bg-[#aeb3ba]"
                                : "data-[state=checked]:border-[#066fac] data-[state=checked]:bg-[#066fac]"
                            }`}
                            data-testid={`checkbox-col-${colId}`}
                          />
                          <span className="truncate">
                            {dialogLabelById[colId]}
                          </span>
                        </span>
                        <DragHandleIcon
                          className={`h-4 w-4 shrink-0 text-[#9aa0a6] ${
                            locked ? "" : "cursor-grab active:cursor-grabbing"
                          }`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* Footer mirrors the RingCX reference: right-aligned, Cancel as
                  a plain blue text button, Save as the filled blue primary. */}
              <DialogFooter className="items-center gap-2 px-8 pb-7 pt-6 sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={() => openSettings(false)}
                  className="px-4 text-[15px] font-semibold hover:bg-transparent"
                  style={{ color: RC_BLUE }}
                  data-testid="button-settings-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (isMyQueuesSettings) {
                      setVisibleQueueCols(draftCols);
                      setQueueColOrder(draftOrder);
                    } else if (isInteractions) {
                      setVisibleInteractionCols(draftCols);
                      setInteractionColOrder(draftOrder);
                    } else {
                      setVisibleCols(draftCols);
                      setColOrder(draftOrder);
                    }
                    setSettingsOpen(false);
                  }}
                  className="rounded-md px-6 text-[15px] font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: RC_BLUE }}
                  data-testid="button-settings-save"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </section>
    </>
  );
};
