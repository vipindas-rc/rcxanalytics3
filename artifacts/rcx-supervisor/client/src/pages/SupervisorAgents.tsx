import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  MODAL_IDS,
  useUrlFlag,
  useUrlParam,
  useUrlSearchUpdater,
  type ModalId,
} from "@/hooks/useUrlState";

// Kept in sync with the proto InteractionPreview component's mode union.
// (Declared locally so this page doesn't pull the excluded proto tree into tsc.)
type InteractionPreviewMode = "preview" | "expanded" | "takeover";

import AgentTablePanel, {
  ActiveCallView,
  agentColumnMeta,
  interactionColumnMeta,
  supervisor2InteractionColumnMeta,
  supervisor3InteractionColumnMeta,
  agentStateOptions,
  interactionFilterRows,
  useQueuePendingCount,
  usePendingInteractionsCount,
  usePendingFilterRows,
  SupervisorFilter,
  SupervisorFilterToggle,
  SupervisorCheckbox,
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
  ArrowLeft,
  Check,
  Eye,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ExternalLink,
  Menu as DragHandleIcon,
  X,
} from "lucide-react";

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
} as const;

// Columns that exist (and can be re-enabled in Settings) but start hidden in
// Supervisor views 2 and 3. Classic view and the Queue tab show them.
const S2_S3_HIDDEN_COLUMN_IDS = new Set(["priority"]);

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

const topTabs = [
  "Active calls",
  "Active messages",
  "All messages",
  "History",
  "Callbacks",
  "Scripts",
  "Stats",
  "Supervisor",
  "Queue",
];

const supervisorFilters = ["Agents", "Interactions"];

const sidePrimaryNav = [
  {
    label: "Message",
    icon: "/figmaAssets/icon-bubble-lines-border.svg",
    active: false,
    badge: "6",
  },
  {
    label: "Video",
    icon: "/figmaAssets/icon-videocam-border.svg",
    active: false,
  },
  {
    label: "Phone",
    icon: "/figmaAssets/icon-phone-border.svg",
    active: false,
  },
  {
    label: "Agent",
    icon: "/figmaAssets/icon-engage-border-1.svg",
    active: true,
  },
  {
    label: "Contacts",
    icon: "/figmaAssets/phone-inbox-border-1.svg",
    active: false,
  },
  {
    label: "More",
    icon: "/figmaAssets/icon-more-horiz.svg",
    active: false,
  },
];

const sideSecondaryNav = [
  {
    label: "Apps",
    icon: "/figmaAssets/icon-default-integration-border.svg",
  },
  {
    label: "Settings",
    icon: "/figmaAssets/icon-settings-border.svg",
  },
  {
    label: "Help",
    icon: "/figmaAssets/icon-help-border.svg",
  },
];

// Queue tab: pending interactions waiting to be picked up, rendered with the
// same Interactions table as the Supervisor tab (agent-side cells stay blank
// because no agent has the conversation yet). Display only — no queue actions.
function QueuePanel({
  searchQuery,
  onSearch,
  previewEngagementId,
  previewMode,
  onPreviewOpen,
  onPreviewModeChange,
  onPreviewClose,
}: {
  searchQuery: string;
  onSearch: (value: string) => void;
  previewEngagementId: string | null;
  previewMode: InteractionPreviewMode | null;
  onPreviewOpen: (engagementId: string) => void;
  onPreviewModeChange: (mode: InteractionPreviewMode) => void;
  onPreviewClose: () => void;
}): JSX.Element {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-6 border-b border-[#0000001a] px-5 py-3">
        <h2 className="shrink-0 font-subtitle-mini text-[15px] font-semibold leading-[var(--subtitle-mini-line-height)] text-[#121212]">
          Queue
        </h2>
        <div className="relative w-full max-w-[500px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a1a1a1]" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="h-10 rounded-[4px] border-[#e0e0e0] pl-11 font-['Roboto',sans-serif] text-[14px] tracking-[0.25px] text-[#212121] placeholder:text-[#a1a1a1]"
            placeholder="Search the queue"
            data-testid="input-queue-search"
          />
        </div>
        {/* spacer keeps the search box visually centered */}
        <div className="hidden w-0 shrink md:block md:w-[64px]" aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" data-testid="queue-panel">
        {/* Not readOnly: queue rows have their own hover actions (AI insights /
            Transfer / Claim) available in both Agent and Supervisor views. */}
        <AgentTablePanel
          activeTab="Queue"
          searchValue={searchQuery}
          previewEngagementId={previewEngagementId}
          previewMode={previewMode}
          onPreviewOpen={onPreviewOpen}
          onPreviewModeChange={onPreviewModeChange}
          onPreviewClose={onPreviewClose}
        />
      </div>
    </>
  );
}

export const SupervisorAgents = (): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState("");
  // Live queue depth for the "Queue (n)" top tab label — tracks simulated
  // arrivals/departures and Claim/Transfer removals.
  const queuePendingCount = useQueuePendingCount();
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

  // URL-driven view mode (deep-linkable / refresh-safe): Agent view is the
  // default (clean URL); Supervisor view is addressable via ?view=supervisor
  // and Cherry picking via ?view=cherry-picking.
  // Supervisor view 3 is the default landing (clean URL); every other view is
  // addressable via its own ?view= value, including Agent view (?view=agent)
  // and Supervisor view 2 (?view=supervisor-2).
  // This build ships only the Supervisor view 2 and Supervisor view 3
  // workflows. Any other (or missing/stale) ?view= value normalizes to the
  // default Supervisor view 3 so old deep links stay refresh-safe.
  const parsedViewParam = new URLSearchParams(search).get("view");
  const rawViewParam: string | null =
    parsedViewParam === "supervisor-2" ? "supervisor-2" : null;
  const viewParam: string = rawViewParam ?? "supervisor-3";
  const isAgentView = viewParam === "agent";
  const isSupervisorView = viewParam === "supervisor";
  // "View 2" variants: Agents tab marks the current user, and the
  // Interactions sub-tab shows only pending (queued) interactions — no Queue
  // top tab.
  const isAgent2View = viewParam === "agent-2";
  const isSupervisor2View = viewParam === "supervisor-2";
  // Supervisor view 3 = Supervisor view 2 minus the Agent type / Confidence /
  // Sentiment columns; all other view-2 behavior carries over unchanged.
  const isSupervisor3View = viewParam === "supervisor-3";
  const isSupervisor2Like = isSupervisor2View || isSupervisor3View;
  const isView2 = isAgent2View || isSupervisor2Like;
  const viewLabel =
    isSupervisorView || isSupervisor2Like ? "Supervisor" : "My team";

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

  // Cherry-picking view is the only view with a Queue tab. A queue preview
  // deep link implies the Cherry picking view even without the param — unless
  // the URL pins a View 2 variant, where queue previews open from the
  // Interactions sub-tab instead.
  const isCherryPickingView =
    viewParam === "cherry-picking" || (queuePreviewMatched && !isView2);

  // URL-driven top tab (deep-linkable / refresh-safe): the Supervisor/My team
  // tab is the default (clean URL, current behavior); the Queue tab exists
  // only in the Cherry picking view and is addressable via ?nav=queue (and by
  // queue preview deep links). Preview deep links always belong to the
  // Supervisor tab, so a preview route wins over a stray nav param.
  const isQueueTab =
    (queuePreviewMatched && !isView2) ||
    (!previewRouteMatched &&
      isCherryPickingView &&
      new URLSearchParams(search).get("nav") === "queue");

  // Keeps the view selection when navigating between table and preview URLs
  // (Agent view is the clean-URL default, so only Supervisor view is carried).
  const withView = useCallback(
    (path: string) => {
      // Carry whichever view the URL pins (a queue preview without a param
      // implies Cherry picking, so pin it explicitly on navigation).
      const view =
        rawViewParam ?? (isCherryPickingView ? "cherry-picking" : null);
      return view ? `${path}?view=${view}` : path;
    },
    [rawViewParam, isCherryPickingView],
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

  // Closing the taken-over call window ends the Active calls context — the
  // top tab bar returns to Supervisor automatically.
  const handleMonitoringWindowClosed = useCallback(
    (agentId: string) => {
      if (activeCallMatched && agentId === activeCallAgentId) {
        navigate(withView("/"));
      }
    },
    [activeCallMatched, activeCallAgentId, navigate, withView],
  );

  const handleTopTabChange = useCallback(
    (value: string) => {
      // Leaving the Active calls context returns to the Supervisor table.
      if (value === "Supervisor" && activeCallMatched) {
        navigate(withView("/"));
        return;
      }
      // Only the Supervisor/My team, Queue, and Active calls tabs are
      // functional in this prototype; the other top tabs are decorative.
      if (value !== "Queue" && value !== "Supervisor") return;
      updateSearch((params) => {
        if (value === "Queue") params.set("nav", "queue");
        else params.delete("nav");
      });
    },
    [updateSearch, navigate, activeCallMatched, withView],
  );

  // Take over is a Supervisor-capability: available in the classic Supervisor
  // view and the Supervisor 2/3 views. A takeover deep link opened in a
  // non-supervisor view renders as the read-only preview (the URL is
  // normalized by an effect below) — the take-over UI must never mount there.
  const canTakeOver = isSupervisorView || isSupervisor2Like;
  const previewMode: InteractionPreviewMode | null =
    parsedPreviewMode === "takeover" && !canTakeOver
      ? "preview"
      : parsedPreviewMode;
  const previewEngagementId =
    previewRouteMatched && previewMode
      ? (previewParams?.engagementId ?? null)
      : null;


  // Unknown mode in the URL -> restore the plain table URL.
  useEffect(() => {
    if (previewRouteMatched && !previewMode) navigate(withView("/"));
  }, [previewRouteMatched, previewMode, navigate, withView]);



  // A preview deep link always belongs to the Interactions tab (preview URLs
  // never carry ?tab=agents, so the URL-derived tab is already Interactions).
  // Agent (My team) view has no sub-tabs — it always shows the Agents table,
  // except when a preview deep link needs the interactions context.
  const hasSubTabs = isSupervisorView || isView2;
  const activeTab: "Agents" | "Interactions" = previewRouteMatched
    ? "Interactions"
    : isView2 && queuePreviewMatched
      ? "Interactions"
      : !hasSubTabs || new URLSearchParams(search).get("tab") === "agents"
        ? "Agents"
        : "Interactions";
  const isInteractions = activeTab === "Interactions";

  // Interactions-tab filters live in the URL (alongside ?view / ?tab), so any
  // filtered view is bookmarkable and refresh-safe. Values are validated
  // through the cascade: a stale/invalid param reads back as "All".
  // Supervisor view 2 merges the live pending (queued) rows into the
  // Interactions table, so those rows also feed the filter options — that is
  // what puts "Pending" in the States dropdown and the waiting queues in the
  // Queues dropdown.
  const pendingFilterRows = usePendingFilterRows();
  const filterRows = useMemo(
    () =>
      isSupervisor2Like
        ? [...pendingFilterRows, ...interactionFilterRows]
        : interactionFilterRows,
    [isSupervisor2Like, pendingFilterRows],
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
      writeInteractionFilters(
        cascadeInteractionFilters(
          {
            ...interactionFilters.values,
            [key]: values,
          },
          filterRows,
        ).values,
      );
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

  // Agent view 2's Interactions sub-tab shows the pending (queued)
  // interactions table in place of the regular Interactions table.
  // Supervisor view 2 instead shows the full Interactions table with pending
  // rows merged in (handled via interactionsVariant below).
  const isView2PendingTab = isAgent2View && isInteractions;
  const isSupervisor2Interactions = isSupervisor2Like && isInteractions;

  const setActiveTab = useCallback(
    (value: "Agents" | "Interactions") => {
      updateSearch(
        (params) => {
          if (value === "Agents") params.set("tab", "agents");
          else params.delete("tab");
        },
        // Leaving from a preview deep link returns to the plain table URL.
        { path: previewRouteMatched ? "/" : pathname },
      );
    },
    [updateSearch, pathname, previewRouteMatched],
  );

  const openPreview = useCallback(
    (engagementId: string) =>
      navigate(withView(`/interactions/${engagementId}/preview`)),
    [navigate, withView],
  );
  const changePreviewMode = useCallback(
    (mode: InteractionPreviewMode) => {
      if (previewEngagementId) {
        navigate(withView(`/interactions/${previewEngagementId}/${mode}`));
      }
    },
    [previewEngagementId, navigate, withView],
  );
  const closePreview = useCallback(
    () => navigate(withView("/")),
    [navigate, withView],
  );

  // Queue preview navigation: opening a queue row's IVR-transcript preview
  // moves to /queue/:id/preview; closing returns to the Queue tab URL.
  const queueTabUrl = useCallback(() => {
    // In a View 2 variant, pending interactions live on the Interactions
    // sub-tab; otherwise the Queue tab only exists in the Cherry picking view.
    const params = new URLSearchParams();
    if (isView2) {
      params.set("view", viewParam as string);
    } else {
      params.set("nav", "queue");
      params.set("view", "cherry-picking");
    }
    return `/?${params.toString()}`;
  }, [isView2, viewParam]);
  const openQueuePreview = useCallback(
    (engagementId: string) =>
      navigate(withView(`/queue/${engagementId}/preview`)),
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
    () => navigate(queueTabUrl()),
    [navigate, queueTabUrl],
  );

  // Unknown queue preview mode in the URL -> restore the Queue tab URL.
  useEffect(() => {
    if (queuePreviewMatched && !queuePreviewMode) navigate(queueTabUrl());
  }, [queuePreviewMatched, queuePreviewMode, navigate, queueTabUrl]);

  // Normalize an Agent-view takeover URL to its preview URL (render already
  // treats it as preview, so this only cleans up the address bar).
  useEffect(() => {
    if (
      !canTakeOver &&
      parsedPreviewMode === "takeover" &&
      previewEngagementId
    ) {
      navigate(`/interactions/${previewEngagementId}/preview`, {
        replace: true,
      });
    }
  }, [canTakeOver, parsedPreviewMode, previewEngagementId, navigate]);

  // Floating view switcher: Agent view (default) or Supervisor view.
  // Menu open state is transient chrome (not URL state).
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewFabRef = useRef<HTMLButtonElement | null>(null);
  // Escape closes the view menu and returns focus to the floating button.
  useEffect(() => {
    if (!viewMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewMenuOpen(false);
        viewFabRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMenuOpen]);
  const handleViewChange = useCallback(
    (
      view:
        | "agent"
        | "supervisor"
        | "cherry-picking"
        | "agent-2"
        | "supervisor-2"
        | "supervisor-3",
    ) => {
      setViewMenuOpen(false);
      updateSearch(
        (params) => {
          // Supervisor view 3 owns the clean URL; other views pin the param.
          if (view === "supervisor-3") params.delete("view");
          else params.set("view", view);
          // Leaving the Cherry picking view removes the Queue tab, so drop the
          // nav param; any open queue preview closes on a view change (its URL
          // context no longer applies).
          if (view !== "cherry-picking") params.delete("nav");
        },
        { path: queuePreviewMatched ? "/" : pathname },
      );
    },
    [updateSearch, pathname, queuePreviewMatched],
  );

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
      setActiveTab(value as "Agents" | "Interactions");
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
  // The Interactions table renders a different column set per view variant
  // (Supervisor view 2 vs the classic Interactions tab), so the settings meta
  // and stored preferences are variant-aware to stay aligned with the table.
  const activeInteractionMeta = isSupervisor3View
    ? supervisor3InteractionColumnMeta
    : isSupervisor2View
      ? supervisor2InteractionColumnMeta
      : interactionColumnMeta;
  const interactionVisibleKey = isSupervisor3View
    ? COLS_STORAGE_KEYS.s3InteractionVisible
    : isSupervisor2View
      ? COLS_STORAGE_KEYS.s2InteractionVisible
      : COLS_STORAGE_KEYS.interactionVisible;
  const interactionOrderKey = isSupervisor3View
    ? COLS_STORAGE_KEYS.s3InteractionOrder
    : isSupervisor2View
      ? COLS_STORAGE_KEYS.s2InteractionOrder
      : COLS_STORAGE_KEYS.interactionOrder;
  const [visibleInteractionCols, setVisibleInteractionCols] = useState<
    Record<string, boolean>
  >(() =>
    loadStoredVisibility(
      interactionVisibleKey,
      activeInteractionMeta.map((c) => c.id),
      isSupervisor2View || isSupervisor3View
        ? S2_S3_HIDDEN_COLUMN_IDS
        : undefined,
    ),
  );
  const [interactionColOrder, setInteractionColOrder] = useState<string[]>(
    () =>
      loadStoredOrder(
        interactionOrderKey,
        activeInteractionMeta.map((c) => c.id),
      ),
  );
  // Switching view variants swaps the column set — reload that variant's
  // stored preferences so stale ids from the other set never leak in.
  useEffect(() => {
    setVisibleInteractionCols(
      loadStoredVisibility(
        interactionVisibleKey,
        activeInteractionMeta.map((c) => c.id),
        isSupervisor2View || isSupervisor3View
          ? S2_S3_HIDDEN_COLUMN_IDS
          : undefined,
      ),
    );
    setInteractionColOrder(
      loadStoredOrder(
        interactionOrderKey,
        activeInteractionMeta.map((c) => c.id),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionVisibleKey]);
  const [colOrder, setColOrder] = useState<string[]>(() =>
    loadStoredOrder(
      COLS_STORAGE_KEYS.agentOrder,
      agentColumnMeta.map((c) => c.id),
    ),
  );
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.agentVisible, visibleCols);
  }, [visibleCols]);
  useEffect(() => {
    saveStored(interactionVisibleKey, visibleInteractionCols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleInteractionCols]);
  useEffect(() => {
    saveStored(COLS_STORAGE_KEYS.agentOrder, colOrder);
  }, [colOrder]);
  useEffect(() => {
    saveStored(interactionOrderKey, interactionColOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionColOrder]);
  const [draftCols, setDraftCols] = useState<Record<string, boolean>>(
    visibleCols,
  );
  const [draftOrder, setDraftOrder] = useState<string[]>(colOrder);
  const [dragId, setDragId] = useState<string | null>(null);

  const lockedColId = isInteractions ? "sourceName" : "fullName";
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
    setDraftCols(isInteractions ? visibleInteractionCols : visibleCols);
    setDraftOrder(isInteractions ? interactionColOrder : colOrder);
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
  const selectedInteractionStates = iv.state;
  // Active-filter count for the "Filters (n)" toggle label — one per filter
  // control with a non-default selection on the active tab (each multi-select
  // counts once no matter how many values it holds).
  const activeFilterCount = isInteractions
    ? [iv.agentType, iv.agent, iv.channel, iv.category, iv.queue, iv.state].filter(
        (v) => v.length > 0,
      ).length + (breachedSlaOnly ? 1 : 0)
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
    (id) => id === "sourceName" || visibleInteractionCols[id],
  );

  // The settings dialog lists both tabs' columns in their draggable saved
  // order; the draft order is committed on Save.
  const dialogColumnOrder = draftOrder;
  const dialogLabelById = isInteractions
    ? Object.fromEntries(activeInteractionMeta.map((c) => [c.id, c.label]))
    : colLabelById;

  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-white">
      <header
        data-name="App bar"
        className="flex h-14 w-full shrink-0 items-center border-b border-[#0000001f] bg-white"
      >
        <div className="relative flex h-full w-full items-center bg-[url('/figmaAssets/appbar-bg.svg')] bg-cover bg-center px-4 pl-5">
          <div className="flex items-center gap-4">
            <button type="button" className="relative">
              <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white">
                <img
                  className="h-full w-full object-cover"
                  alt="Image"
                  src="/figmaAssets/image-1-1.png"
                />
              </div>
              <img
                className="absolute bottom-0 right-0 h-3.5 w-3.5"
                alt="Presence"
                src="/figmaAssets/presence.svg"
              />
            </button>
            <h1 className="font-headline-2 text-[length:var(--headline-2-font-size)] font-[number:var(--headline-2-font-weight)] leading-[var(--headline-2-line-height)] tracking-[var(--headline-2-letter-spacing)] text-headertext [font-style:var(--headline-2-font-style)]">
              RingCentral, Inc.
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="h-8 w-8 rounded-full bg-[#ffffff29] p-0 hover:bg-[#ffffff40]"
              >
                <img
                  className="h-4 w-4"
                  alt="Icon chevron left"
                  src="/figmaAssets/icon-chevron-left.svg"
                />
              </Button>
              <Button
                variant="ghost"
                className="h-8 w-8 rounded-full bg-[#ffffff14] p-0 hover:bg-[#ffffff29]"
              >
                <img
                  className="h-4 w-4"
                  alt="Icon chevron right"
                  src="/figmaAssets/icon-chevron-right.svg"
                />
              </Button>
            </div>
          </div>
          <div className="flex flex-1 px-2 pl-3 pr-3">
            <div className="relative w-full max-w-[468px]">
              <div className="pointer-events-none absolute inset-0 rounded-full bg-[#ffffff29]" />
              <div className="relative flex h-8 items-center gap-2 px-3">
                <img
                  className="h-4 w-4"
                  alt="Icon search nav"
                  src="/figmaAssets/icon-search-nav.svg"
                />
                <span className="font-button text-[length:var(--button-font-size)] font-[number:var(--button-font-weight)] leading-[var(--button-line-height)] tracking-[var(--button-letter-spacing)] text-headertexthint [font-style:var(--button-font-style)]">
                  Search
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 w-[164px] items-center gap-1 rounded-2xl bg-white px-3"
            >
              <img
                className="h-3.5 w-3.5"
                alt="Presence"
                src="/figmaAssets/presence.svg"
              />
              <img
                className="h-4 w-4"
                alt="Icon engage border"
                src="/figmaAssets/icon-engage-border.svg"
              />
              <div className="flex flex-1 items-center justify-between gap-1">
                <span className="font-caption-1 text-[length:var(--caption-1-font-size)] font-[number:var(--caption-1-font-weight)] leading-[var(--caption-1-line-height)] tracking-[var(--caption-1-letter-spacing)] text-[#121212] [font-style:var(--caption-1-font-style)]">
                  Available
                </span>
                <span className="whitespace-nowrap font-caption-1 text-[length:var(--caption-1-font-size)] font-[number:var(--caption-1-font-weight)] leading-[var(--caption-1-line-height)] tracking-[var(--caption-1-letter-spacing)] text-[#121212] [font-style:var(--caption-1-font-style)]">
                  21:01
                </span>
              </div>
              <img
                className="h-4 w-4"
                alt="Icon arrow down"
                src="/figmaAssets/icon-arrow-down.svg"
              />
            </button>
            <Button
              variant="secondary"
              className="h-8 w-8 rounded-full bg-white p-0 shadow-none hover:bg-white"
            >
              <img
                className="h-4 w-4"
                alt="Icon dialer s"
                src="/figmaAssets/icon-dialer-s.svg"
              />
            </Button>
            <Button
              variant="secondary"
              className="h-8 w-8 rounded-full bg-white p-0 shadow-none hover:bg-white"
            >
              <img
                className="h-4 w-4"
                alt="Icon call add"
                src="/figmaAssets/icon-call-add.svg"
              />
            </Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          data-name="Side nav"
          className="flex w-20 shrink-0 flex-col justify-between border-r border-neutral-200 bg-navb-02 py-4"
        >
          <nav className="flex flex-col">
            {sidePrimaryNav.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`relative flex min-h-10 w-20 flex-col items-center justify-center px-0 py-[5px] ${
                  item.active ? "bg-[#066fac1f]" : ""
                }`}
              >
                <img className="relative" alt={item.label} src={item.icon} />
                <span
                  className={`mt-0.5 flex h-4 items-center justify-center self-stretch text-center font-caption-2 text-[length:var(--caption-2-font-size)] font-[number:var(--caption-2-font-weight)] leading-[var(--caption-2-line-height)] tracking-[var(--caption-2-letter-spacing)] [font-style:var(--caption-2-font-style)] ${
                    item.active ? "text-[#066fac]" : "text-[#121212]"
                  }`}
                >
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="absolute right-[22px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white bg-[#ff8800] font-caption-1 text-[length:var(--caption-1-font-size)] font-[number:var(--caption-1-font-weight)] leading-[var(--caption-1-line-height)] tracking-[var(--caption-1-letter-spacing)] text-white [font-style:var(--caption-1-font-style)]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <nav className="flex flex-col">
            {sideSecondaryNav.map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex min-h-10 w-20 flex-col items-center justify-center px-0 py-[5px]"
              >
                <img className="relative" alt={item.label} src={item.icon} />
                <span
                  className={`mt-0.5 flex h-4 items-center justify-center self-stretch text-center ${
                    item.label === "Help"
                      ? "[font-family:'Lato',Helvetica] text-xs font-bold leading-4 tracking-[0]"
                      : "font-caption-2 text-[length:var(--caption-2-font-size)] font-[number:var(--caption-2-font-weight)] leading-[var(--caption-2-line-height)] tracking-[var(--caption-2-letter-spacing)] [font-style:var(--caption-2-font-style)]"
                  } text-[#121212]`}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-neutral-200 bg-white">
            <div className="flex h-[60px] items-center px-3 py-0.5">
              <div className="flex flex-1 items-center gap-2 pr-3">
                <span className="font-descriptor-mini text-[length:var(--descriptor-mini-font-size)] font-[number:var(--descriptor-mini-font-weight)] leading-[var(--descriptor-mini-line-height)] tracking-[var(--descriptor-mini-letter-spacing)] text-neutralf-06 [font-style:var(--descriptor-mini-font-style)]">
                  RingCX Agent
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
            <Tabs
              value={
                activeCallMatched
                  ? "Active calls"
                  : isQueueTab
                    ? "Queue"
                    : "Supervisor"
              }
              onValueChange={handleTopTabChange}
              className="w-full"
            >
              <TabsList className="h-auto justify-start rounded-none border-0 bg-transparent p-0">
                {topTabs
                  .filter((tab) => tab !== "Queue" || isCherryPickingView)
                  .map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    data-testid={`tab-top-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                    className="rounded-none border-b-2 border-transparent px-3 py-1.5 font-descriptor-mini text-[length:var(--descriptor-mini-font-size)] font-[number:var(--descriptor-mini-font-weight)] leading-[var(--descriptor-mini-line-height)] tracking-[var(--descriptor-mini-letter-spacing)] text-[#121212] shadow-none ring-offset-0 [font-style:var(--descriptor-mini-font-style)] focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-[#066fac] data-[state=active]:bg-transparent data-[state=active]:text-[#066fac] data-[state=active]:shadow-none"
                  >
                    {tab === "Supervisor"
                      ? viewLabel
                      : tab === "Queue"
                        ? `Queue (${queuePendingCount})`
                        : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {isQueueTab ? (
            <QueuePanel
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              previewEngagementId={queuePreviewEngagementId}
              previewMode={queuePreviewMode}
              onPreviewOpen={openQueuePreview}
              onPreviewModeChange={changeQueuePreviewMode}
              onPreviewClose={closeQueuePreview}
            />
          ) : (
          <>
          {activeCallMatched ? null : previewMode === "takeover" ? (
            // Embedded take-over: the Supervisor header/filters give way to a
            // back row, and the taken-over conversation fills the area below.
            <div
              className="flex shrink-0 items-center border-b border-[#0000001a] px-4 py-2.5"
              data-testid="row-takeover-back"
            >
              <button
                type="button"
                onClick={closePreview}
                className="flex items-center gap-2 font-['Roboto',sans-serif] text-[15px] font-medium tracking-[0.15px] text-[#066fac] transition-opacity hover:opacity-80 focus-visible:underline focus-visible:outline-none"
                data-testid="button-back-supervisor"
              >
                <ArrowLeft className="h-4 w-4" />
                Supervisor
              </button>
            </div>
          ) : (
          <>
          <div
            data-name="Supervisor toolbar"
            className="relative flex shrink-0 items-center border-b border-[#0000001a] px-5 py-3"
          >
            <h2 className="shrink-0 font-subtitle-mini text-[15px] font-semibold leading-[var(--subtitle-mini-line-height)] text-[#121212]">
              {viewLabel}
            </h2>
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
              {/* Agent (My team) view has no sub-tabs — just the Agents table. */}
              {hasSubTabs && (
              <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                className="w-auto"
              >
                <TabsList className="h-10 items-stretch gap-0 rounded-[4px] bg-[#f9f9f9] p-1">
                  {supervisorFilters.map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="h-full w-[148px] rounded-[4px] px-6 font-['Roboto',sans-serif] text-[14px] tracking-[0.15px] text-[#212121] shadow-none ring-offset-0 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-[#212121] data-[state=active]:shadow-[0px_2px_3px_0px_rgba(173,173,173,0.2)] data-[state=inactive]:bg-transparent data-[state=inactive]:font-normal data-[state=inactive]:text-[#212121]"
                      data-testid={`tab-supervisor-${tab.toLowerCase()}`}
                    >
                      {tab === "Interactions"
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
          {filtersOpen && !isView2PendingTab && (
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
                  {/* Line 2 (design order): Queues, States, then the Breached
                      SLA toggle — only rows past the 10-minute SLA remain. */}
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
                    <SupervisorFilter
                      values={iv.state}
                      onValuesChange={(v) => setInteractionFilter("state", v)}
                      placeholder="All states"
                      options={interactionFilters.options.state}
                      testId="select-state"
                    />
                    <div className="col-span-2 flex items-center gap-4">
                      <SupervisorCheckbox
                        checked={breachedSlaOnly}
                        onCheckedChange={setBreachedSlaOnly}
                        label="Breached SLA"
                        testId="checkbox-breached-sla"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </>
          )}
          {activeCallMatched ? (
            // Active calls view for the taken-over voice call. The supervisor
            // table below stays mounted (zero-height) so the floating take-over
            // dialer window and monitoring session survive the tab switch.
            <div className="min-h-0 flex-1 overflow-hidden">
              <ActiveCallView agentId={activeCallAgentId} />
            </div>
          ) : null}
          <div
            data-name={
              isInteractions ? "Interaction table" : "Agent table"
            }
            className={
              activeCallMatched
                ? "h-0 overflow-hidden"
                : "min-h-0 flex-1 overflow-hidden"
            }
          >
            <AgentTablePanel
              readOnly={
                isView2PendingTab
                  ? false
                  : !(isSupervisorView || isSupervisor2Like)
              }
              activeTab={isView2PendingTab ? "Queue" : activeTab}
              interactionsVariant={
                isSupervisor2Interactions
                  ? isSupervisor3View
                    ? "supervisor3"
                    : "supervisor2"
                  : undefined
              }
              showCurrentUser={isView2}
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
                isView2PendingTab || isSupervisor2Interactions
                  ? (queuePreviewEngagementId ?? previewEngagementId)
                  : previewEngagementId
              }
              previewMode={
                isView2PendingTab || isSupervisor2Interactions
                  ? (queuePreviewEngagementId ? queuePreviewMode : previewMode)
                  : previewMode
              }
              onInteractionCountChange={setInteractionsCount}
              onPreviewOpen={isView2PendingTab ? openQueuePreview : openPreview}
              previewTakeOverRoutable={
                !isView2PendingTab && !queuePreviewEngagementId
              }
              onPreviewModeChange={
                isView2PendingTab ? changeQueuePreviewMode : changePreviewMode
              }
              onPreviewClose={
                isView2PendingTab || queuePreviewEngagementId
                  ? closeQueuePreview
                  : closePreview
              }
              onTakeOverCommitted={handleTakeOverCommitted}
              onMonitoringWindowClosed={handleMonitoringWindowClosed}
            />
          </div>
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
                  {isInteractions
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
                    if (isInteractions) {
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

          {/* Floating view switcher: Agent view (read-only, default) vs
              Supervisor view (full monitoring controls). URL-driven. */}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {viewMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setViewMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="View options"
                  className="z-50 w-48 rounded-md border border-[#e5e5e5] bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
                  data-testid="menu-view-switcher"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleViewChange("supervisor-2")}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm text-[#121212] hover:bg-[#f5f5f5]"
                    data-testid="menuitem-supervisor-view-2"
                  >
                    Supervisor view 2
                    {isSupervisor2View && (
                      <Check className="h-4 w-4" style={{ color: RC_BLUE }} />
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleViewChange("supervisor-3")}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm text-[#121212] hover:bg-[#f5f5f5]"
                    data-testid="menuitem-supervisor-view-3"
                  >
                    Supervisor view 3
                    {isSupervisor3View && (
                      <Check className="h-4 w-4" style={{ color: RC_BLUE }} />
                    )}
                  </button>
                </div>
              </>
            )}
            <button
              ref={viewFabRef}
              type="button"
              aria-label="Change view"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((o) => !o)}
              className="z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: RC_BLUE }}
              data-testid="button-view-switcher"
            >
              <Eye className="h-5 w-5" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};
