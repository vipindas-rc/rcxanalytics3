import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Alert,
  Button,
  Dialog as SpringDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Radio,
  RadioGroup,
  Text,
  TextField,
} from "@ringcentral/spring-ui";
import {
  PlusMd,
  SearchMd,
  FolderMd,
  AiStarsMd,
  EditPenMd,
  MenuMd,
  OverflowVerticalMd,
  ReplyMd,
  SendMd,
  TrashMd,
  Xsm,
} from "@ringcentral/spring-icon";
import type {
  Artifact,
  BriefingScenario,
  Dashboard,
  Filter,
  Project,
  Session,
  SourceContext,
  TurnRequest,
  Workspace,
} from "./lib/model";
import { curatedQuestions, isCatalogQuestion } from "./lib/curatedQuestions";
import { findReport, type ReportDefinition } from "./lib/reportCatalog";
import { api } from "./ui/api";
import { ChartCard } from "./ui/ChartCard";
import { BriefingPage } from "./ui/BriefingPage";
import { DashboardPicker } from "./ui/DashboardPicker";
import { AskAdvisor } from "./ui/AskAdvisor";
import { ProgressButton } from "./ui/ProgressButton";
import { RequestProgress } from "./ui/RequestProgress";
import { textAnswerAction } from "./ui/textAnswerAction";
import { paceRequest } from "./ui/requestStatus";
import {
  ReportComposer,
  type ReportContentsSelection,
} from "./ui/ReportComposer";
import { resolveAdvisorSource } from "./ui/conversationContext";
import { createConversationRequest } from "./ui/conversationRequest";
import {
  useAnalyticsRouteState,
  type AnalyticsRoutePatch,
  type AnalyticsRouteView,
} from "./ui/hooks/analyticsRouteState";
import { ReportComposerUrlProvider } from "./ui/useReportComposerUrlState";
import { ChartCardUrlProvider } from "./ui/useChartCardUrlState";
import "./App.css";

type Job = {
  request: TurnRequest;
  phaseSince?: number;
  waiting?: string[];
  renderError?: string;
};
type Form = {
  title: string;
  value: string;
  submit: (value: string) => Promise<unknown>;
};
const noFilters: Filter[] = [];
function renderMarkdownAnswerTables(root: ParentNode) {
  root
    .querySelectorAll<HTMLElement>(".answer-text:not([data-table-rendered])")
    .forEach((element) => {
      const lines = (element.textContent ?? "").split("\n");
      const headerIndex = lines.findIndex(
        (line, index) =>
          line.includes("|") &&
          /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
            lines[index + 1] ?? "",
          ),
      );
      element.dataset.tableRendered = "true";
      if (headerIndex < 0) return;
      const cells = (line: string) =>
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((value) => value.trim());
      const headers = cells(lines[headerIndex]);
      const rows: string[][] = [];
      let end = headerIndex + 2;
      while (end < lines.length && lines[end].includes("|"))
        rows.push(cells(lines[end++]));
      const fragment = document.createDocumentFragment();
      const appendText = (line: string) => {
        if (!line.trim()) return;
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        fragment.append(paragraph);
      };
      lines.slice(0, headerIndex).forEach(appendText);
      const scroll = document.createElement("div");
      scroll.className = "answer-table-scroll";
      const table = document.createElement("table");
      table.className = "answer-table";
      const head = table.createTHead().insertRow();
      headers.forEach((value) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = value;
        head.append(cell);
      });
      const body = table.createTBody();
      rows.forEach((row) => {
        const tr = body.insertRow();
        headers.forEach((_, index) => {
          const cell = tr.insertCell();
          cell.textContent = row[index] ?? "";
        });
      });
      scroll.append(table);
      fragment.append(scroll);
      lines.slice(end).forEach(appendText);
      element.replaceChildren(fragment);
    });
}

export default function App() {
  const analyticsRoot = useRef<HTMLElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const bindAnalyticsRoot = useCallback((node: HTMLElement | null) => {
    analyticsRoot.current = node;
    setPortalContainer(node);
  }, []);
  const Dialog = useCallback(
    (props: ComponentProps<typeof SpringDialog>) => (
      <SpringDialog
        container={portalContainer ?? undefined}
        {...props}
        bodyProps={{
          "aria-label": props["aria-label"],
          "aria-labelledby": props["aria-labelledby"],
          ...props.bodyProps,
        }}
      />
    ),
    [portalContainer],
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const {
    route,
    setRoute,
    updateSearch,
    search: locationSearch,
    searchParams,
    setSearchParams,
    navigateSearch,
  } = useAnalyticsRouteState();
  const {
    sessionId: activeId,
    view: destination,
    projectId,
    dashboardId,
  } = route;
  const navigateAnalytics = useCallback(
    (patch: AnalyticsRoutePatch, replace = false) =>
      setRoute(patch, { replace }),
    [setRoute],
  );
  const setDestination = useCallback(
    (view: AnalyticsRouteView) => navigateAnalytics({ view }),
    [navigateAnalytics],
  );
  const setProjectId = useCallback(
    (nextProjectId: string | null) =>
      navigateAnalytics({ view: "projects", projectId: nextProjectId }),
    [navigateAnalytics],
  );
  const setDashboardId = useCallback(
    (nextDashboardId: string | null) =>
      navigateAnalytics({ view: "dashboards", dashboardId: nextDashboardId }),
    [navigateAnalytics],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("rcx-analytics-drafts-v2") ?? "{}",
      );
    } catch {
      return {};
    }
  });
  const draftKey =
    destination === "dashboards" && dashboardId
      ? `dashboard:${dashboardId}`
      : (activeId ?? "new");
  const question = drafts[draftKey] ?? "";
  const setQuestion = (value: string) =>
    setDrafts((old) => ({ ...old, [draftKey]: value }));
  useEffect(() => {
    localStorage.setItem("rcx-analytics-drafts-v2", JSON.stringify(drafts));
  }, [drafts]);
  const [context, setContext] = useState<Artifact | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(
    null,
  );
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  // Cancellation is authoritative locally as soon as the user confirms it.
  // A GET that began before the cancel response must never restore pending UI.
  const cancelledRequestIds = useRef(new Set<string>());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (analyticsRoot.current)
      renderMarkdownAnswerTables(analyticsRoot.current);
  });
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 850);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 850);
  useEffect(() => {
    const media = matchMedia("(max-width:850px)");
    const update = () => {
      setNarrow(media.matches);
      if (media.matches) setSidebar(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const routeParams = new URLSearchParams(window.location.search);
  const analyticsDialog = routeParams.get("analyticsDialog");
  const analyticsTarget = routeParams.get("analyticsTarget");
  const setDialog = useCallback(
    (dialog: string | null, target: string | null = null) =>
      updateSearch((params) => {
        if (dialog) params.set("analyticsDialog", dialog);
        else params.delete("analyticsDialog");
        if (target) params.set("analyticsTarget", target);
        else params.delete("analyticsTarget");
      }),
    [updateSearch],
  );
  const searchOpen = analyticsDialog === "search";
  const setSearchOpen = useCallback(
    (open: boolean) => setDialog(open ? "search" : null),
    [setDialog],
  );
  const [search, setSearch] = useState("");
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const deleteConfirm =
    analyticsDialog === "delete-session"
      ? (workspace?.sessions.find(
          (session) => session.id === analyticsTarget,
        ) ?? null)
      : null;
  const setDeleteConfirm = useCallback(
    (session: Session | null) =>
      setDialog(session ? "delete-session" : null, session?.id ?? null),
    [setDialog],
  );
  const resetConfirm = analyticsDialog === "reset";
  const setResetConfirm = useCallback(
    (open: boolean) => setDialog(open ? "reset" : null),
    [setDialog],
  );
  const projectDelete =
    analyticsDialog === "delete-project"
      ? (workspace?.projects.find(
          (project) => project.id === analyticsTarget,
        ) ?? null)
      : null;
  const setProjectDelete = useCallback(
    (project: Project | null) =>
      setDialog(project ? "delete-project" : null, project?.id ?? null),
    [setDialog],
  );
  const organize = analyticsDialog === "organize";
  const setOrganize = useCallback(
    (open: boolean) => setDialog(open ? "organize" : null),
    [setDialog],
  );
  const saveArtifact =
    analyticsDialog === "save-artifact"
      ? (workspace?.artifacts.find(
          (artifact) => artifact.id === analyticsTarget,
        ) ?? null)
      : null;
  const setSaveArtifact = useCallback(
    (artifact: Artifact | null) =>
      setDialog(artifact ? "save-artifact" : null, artifact?.id ?? null),
    [setDialog],
  );
  const dashboardArtifact =
    analyticsDialog === "dashboard-picker"
      ? (workspace?.artifacts.find(
          (artifact) => artifact.id === analyticsTarget,
        ) ?? null)
      : null;
  const setDashboardArtifact = useCallback(
    (artifact: Artifact | null) =>
      setDialog(artifact ? "dashboard-picker" : null, artifact?.id ?? null),
    [setDialog],
  );
  const questionBrowser = analyticsDialog === "question-browser";
  const setQuestionBrowser = useCallback(
    (open: boolean) => setDialog(open ? "question-browser" : null),
    [setDialog],
  );
  const briefingScenario: BriefingScenario =
    searchParams.get("analyticsScenario") === "midday" ? "midday" : "morning";
  const setBriefingScenario = (scenario: BriefingScenario) =>
    updateSearch((params) => {
      if (scenario === "midday") params.set("analyticsScenario", scenario);
      else params.delete("analyticsScenario");
    });
  const [projectPickerSearch, setProjectPickerSearch] = useState("");
  const [projectPickerSelection, setProjectPickerSelection] = useState<
    string | null
  >(null);
  const [projectPickerBusy, setProjectPickerBusy] = useState(false);
  const [projectPickerError, setProjectPickerError] = useState("");
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectCreateName, setProjectCreateName] = useState("");
  const [notice, setNotice] = useState<{
    projectId?: string;
    dashboardId?: string;
    message: string;
  } | null>(null);
  const advisorOpen = analyticsDialog === "advisor";
  const setAdvisorOpen = useCallback(
    (open: boolean) => {
      if (open) setDialog("advisor");
      else
        updateSearch((params) => {
          params.delete("analyticsDialog");
          params.delete("analyticsTarget");
          params.delete("analyticsAdvisorArtifact");
          params.delete("analyticsAdvisorReport");
        });
    },
    [setDialog, updateSearch],
  );
  const [advisorArtifactState, setAdvisorArtifactState] =
    useState<Artifact | null>(null);
  const [advisorSourceContext, setAdvisorSourceContext] =
    useState<SourceContext | null>(null);
  const [advisorReportState, setAdvisorReportState] =
    useState<ReportDefinition | null>(null);
  const advisorArtifact =
    workspace?.artifacts.find(
      (artifact) => artifact.id === routeParams.get("analyticsAdvisorArtifact"),
    ) ?? advisorArtifactState;
  const advisorReport =
    findReport(routeParams.get("analyticsAdvisorReport") ?? "") ??
    advisorReportState;
  const setAdvisorArtifact = useCallback(
    (artifact: Artifact | null) => {
      setAdvisorArtifactState(artifact);
      updateSearch((params) => {
        if (artifact) params.set("analyticsAdvisorArtifact", artifact.id);
        else params.delete("analyticsAdvisorArtifact");
      });
    },
    [updateSearch],
  );
  const setAdvisorReport = useCallback(
    (report: ReportDefinition | null) => {
      setAdvisorReportState(report);
      updateSearch((params) => {
        if (report) params.set("analyticsAdvisorReport", report.id);
        else params.delete("analyticsAdvisorReport");
      });
    },
    [updateSearch],
  );
  const openAdvisorPanel = useCallback(
    (artifact: Artifact | null, report: ReportDefinition | null) => {
      setAdvisorArtifactState(artifact);
      setAdvisorReportState(report);
      updateSearch((params) => {
        params.set("analyticsDialog", "advisor");
        params.delete("analyticsTarget");
        if (artifact) params.set("analyticsAdvisorArtifact", artifact.id);
        else params.delete("analyticsAdvisorArtifact");
        if (report) params.set("analyticsAdvisorReport", report.id);
        else params.delete("analyticsAdvisorReport");
      });
    },
    [updateSearch],
  );
  const [consumedAdvisorFollowUps, setConsumedAdvisorFollowUps] = useState<
    string[]
  >([]);
  const advisorTrigger = useRef<HTMLElement | null>(null);
  const advisorEnd = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(async () => {
    const next = await api<Workspace>("/workspace");
    setWorkspace(next);
    return next;
  }, []);
  useEffect(() => {
    let disposed = false;
    const loadWorkspace = async (attempt = 0): Promise<void> => {
      try {
        const next = await refresh();
        if (!disposed)
          setJobs(
            Object.fromEntries(
              next.requests
                .filter((request) => request.status === "pending")
                .map((request) => [request.sessionId, { request }]),
            ),
          );
      } catch (caught) {
        // Bootstrap readiness is a GET-only, bounded retry. Mutations are
        // always user initiated and are never replayed automatically.
        if (attempt < 2 && !disposed) {
          window.setTimeout(() => {
            void loadWorkspace(attempt + 1);
          }, 2_000);
          return;
        }
        if (!disposed)
          setError(
            caught instanceof Error
              ? `${caught.message} Analytics will remain unavailable until it is ready.`
              : "Analytics is temporarily unavailable. Retry in a moment.",
          );
      }
    };
    void loadWorkspace();
    return () => {
      disposed = true;
    };
  }, [refresh]);
  useEffect(() => {
    if (destination !== "briefing" || !workspace) return;
    const upgraded =
      workspace.briefings.length === 2 &&
      workspace.briefings.every((snapshot) =>
        snapshot.widgets.every(
          (widget) =>
            widget.metricTitle &&
            widget.entity &&
            workspace.artifacts.find(
              (artifact) => artifact.id === widget.artifactId,
            )?.view.orientation,
        ),
      );
    if (upgraded) return;
    void api("/briefings/ensure", "POST")
      .then(refresh)
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to prepare the briefing.",
        ),
      );
  }, [destination, workspace, refresh]);
  useEffect(() => {
    const pending = Object.values(jobs).filter(
      (job) => job.request.status === "pending",
    );
    if (!pending.length) return;
    let cancelled = false;
    const pollStarted = Date.now();
    const timer = setTimeout(() => {
      void Promise.all(
        pending.map(async (job) => {
          try {
            const received = await api<TurnRequest>(
              `/requests/${job.request.id}`,
            );
            const request = paceRequest(
              job.request,
              received,
              job.phaseSince ?? pollStarted,
              Date.now(),
            );
            if (cancelled || cancelledRequestIds.current.has(job.request.id))
              return;
            const next =
              request.status === "pending"
                ? undefined
                : await api<Workspace>("/workspace");
            if (
              !cancelled &&
              !cancelledRequestIds.current.has(job.request.id)
            ) {
              setJobs((old) => ({
                ...old,
                [request.sessionId]: {
                  request,
                  phaseSince:
                    request.phase === job.request.phase
                      ? (job.phaseSince ?? pollStarted)
                      : Date.now(),
                  waiting:
                    request.status === "completed"
                      ? (request.artifactIds ?? [])
                      : [],
                },
              }));
              if (next) setWorkspace(next);
            }
          } catch (e) {
            if (!cancelled) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Connection interrupted. Retrying…",
              );
              setJobs((old) => ({ ...old }));
            }
          }
        }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobs, refresh]);
  const active = workspace?.sessions.find((s) => s.id === activeId);
  const synchronizedContext = useRef<string | null>(null);
  const synchronizedReport = useRef<string | null>(null);
  useEffect(() => {
    if (!workspace) return;
    const identity = `${destination}:${activeId ?? ""}:${projectId ?? ""}:${dashboardId ?? ""}`;
    // History navigation must clear the previous conversation's source just
    // as clicking a conversation does. Destination URLs remain authoritative.
    if (synchronizedContext.current !== identity) {
      synchronizedContext.current = identity;
      setContext(null);
    }
    const reportIdentity = `${identity}:${searchParams.get("analytics.composer.report") ?? ""}`;
    if (synchronizedReport.current === reportIdentity) return;
    synchronizedReport.current = reportIdentity;
    const reportId =
      searchParams.get("analytics.composer.report") ??
      (destination === "chats" ? active?.reportContext?.reportId : undefined);
    setSelectedReport(reportId ? (findReport(reportId) ?? null) : null);
  }, [destination, activeId, projectId, dashboardId, workspace, active, searchParams]);
  const dashboard = workspace?.dashboards.find((d) => d.id === dashboardId);
  const advisorSession = workspace?.sessions.find((session) => session.advisor);
  const advisorDraftKey = advisorSession
    ? `advisor:${advisorSession.id}`
    : "advisor:new";
  const advisorQuestion = drafts[advisorDraftKey] ?? "";
  const setAdvisorQuestion = (value: string) =>
    setDrafts((old) => ({ ...old, [advisorDraftKey]: value }));
  const lastRequest = workspace?.requests
    .filter((r) => r.sessionId === activeId)
    .at(-1);
  const job = activeId
    ? (jobs[activeId] ??
      (lastRequest && ["failed", "cancelled"].includes(lastRequest.status)
        ? ({ request: lastRequest } as Job)
        : undefined))
    : undefined;
  // Rendering a returned chart is independent from answering the next question.
  // Keeping it out of the composer lock means a slow renderer cannot strand a chat.
  const busy = submitting || job?.request.status === "pending";
  const lastAdvisorRequest = workspace?.requests
    .filter((request) => request.sessionId === advisorSession?.id)
    .at(-1);
  const advisorJob = advisorSession
    ? (jobs[advisorSession.id] ??
      (lastAdvisorRequest &&
      ["failed", "cancelled"].includes(lastAdvisorRequest.status)
        ? { request: lastAdvisorRequest }
        : undefined))
    : undefined;
  const advisorFailedRequest =
    advisorJob && ["failed", "cancelled"].includes(advisorJob.request.status)
      ? advisorJob.request
      : undefined;
  const advisorBusy = !!advisorJob && advisorJob.request.status === "pending";
  const missingRouteRecord =
    !!workspace &&
    (route.invalidPath ||
      (destination === "chats" && !!activeId && !active) ||
      (destination === "projects" &&
        !!projectId &&
        !workspace.projects.some((project) => project.id === projectId)) ||
      (destination === "dashboards" && !!dashboardId && !dashboard));
  useEffect(() => {
    if (advisorOpen && advisorArtifact && !advisorSourceContext)
      setAdvisorSourceContext(advisorContextFor(advisorArtifact));
  }, [advisorArtifact, advisorOpen, advisorSourceContext]);
  useEffect(() => {
    if (!activeId || !end.current) return;
    const frame = requestAnimationFrame(() =>
      end.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [
    activeId,
    active?.messages.length,
    job?.request.status,
    job?.waiting?.length,
  ]);
  useEffect(() => {
    if (!advisorOpen || !advisorEnd.current) return;
    const frame = requestAnimationFrame(() =>
      advisorEnd.current?.scrollIntoView({
        block: "end",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [
    advisorOpen,
    advisorSession?.messages.length,
    advisorJob?.request.status,
    advisorJob?.waiting?.length,
  ]);
  useEffect(() => {
    if (!advisorOpen || window.innerWidth > 600) return;
    const panel =
      analyticsRoot.current?.querySelector<HTMLElement>(".advisor-panel");
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href]",
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdvisor();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = focusable();
      if (!targets.length) return;
      const first = targets[0],
        last = targets.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => focusable()[0]?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [advisorOpen]);
  const run = async (action: () => Promise<unknown>) => {
    try {
      setError("");
      await action();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action failed. Please try again.",
      );
    }
  };
  const cancelRequest = async (request: TurnRequest) => {
    if (request.status !== "pending") return;
    cancelledRequestIds.current.add(request.id);
    try {
      const cancelled = await api<TurnRequest>(
        `/requests/${request.id}/cancel`,
        "POST",
      );
      setJobs((old) => ({
        ...old,
        [request.sessionId]: { request: cancelled },
      }));
      await refresh();
    } catch (caught) {
      cancelledRequestIds.current.delete(request.id);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to cancel this request. Please retry.",
      );
    }
  };
  const openSession = (session: Session) => {
    navigateAnalytics({
      view: "chats",
      sessionId: session.id,
      projectId: null,
      dashboardId: null,
    });
    setContext(null);
    setSelectedReport(
      session.reportContext
        ? (findReport(session.reportContext.reportId) ?? null)
        : null,
    );
    setSearchOpen(false);
    if (window.innerWidth <= 850) setSidebar(false);
    setError("");
  };
  const newSession = () => {
    if (narrow) setSidebar(false);
    navigateAnalytics({
      view: "chats",
      sessionId: null,
      projectId: null,
      dashboardId: null,
    });
    setContext(null);
    setSelectedReport(null);
    setError("");
  };
  const resetWorkspace = async () => {
    const next = await api<Workspace>("/workspace/reset", "POST", {});
    setWorkspace(next);
    navigateAnalytics({
      view: "briefing",
      sessionId: null,
      projectId: null,
      dashboardId: null,
    });
    setContext(null);
    setSelectedReport(null);
    setJobs({});
    setDrafts({});
    setAdvisorOpen(false);
    setAdvisorArtifact(null);
    setAdvisorSourceContext(null);
    setAdvisorReport(null);
    setResetConfirm(false);
  };
  const fillQuestion = (
    prompt: string,
    artifact?: Artifact,
    selectedFollowUpFrom?: string,
  ) => {
    if (active?.messages.length) {
      const sourceArtifact = isCatalogQuestion(prompt) ? undefined : artifact;
      setContext(sourceArtifact ?? null);
      setSelectedReport(null);
      void ask(prompt, undefined, sourceArtifact, selectedFollowUpFrom);
      return;
    }
    if (isCatalogQuestion(prompt)) {
      setContext(null);
      setSelectedReport(null);
    }
    setQuestion(prompt);
    requestAnimationFrame(() =>
      analyticsRoot.current
        ?.querySelector<HTMLTextAreaElement>("textarea")
        ?.focus(),
    );
  };
  const ask = async (
    text = question,
    retryOf?: string,
    contextOverride?: Artifact,
    selectedFollowUpFrom?: string,
    reportOverride?: ReportDefinition | null,
    selection?: ReportContentsSelection,
  ) => {
    const retry = retryOf
      ? workspace?.requests.find((request) => request.id === retryOf)
      : undefined;
    // A retry is bound to its persisted request, never the current composer's
    // report selection from a different conversation.
    const report = retry
      ? retry.reportContext
        ? (findReport(retry.reportContext.reportId) ?? null)
        : null
      : reportOverride ?? selectedReport;
    const retrySelection = retry?.reportContext?.selectedContentIds?.length
      ? ({
          contentIds: retry.reportContext.selectedContentIds,
          presentation: retry.reportContext.presentationPreference ?? "auto",
          question: text,
        } as ReportContentsSelection)
      : undefined;
    if ((!text.trim() && !report) || busy || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      let id = activeId;
      if (!id) {
        const session = await api<Session>("/sessions", "POST", { projectId });
        id = session.id;
      }
      const contextArtifactId = report
        ? undefined
        : retry
          ? retry.sourceContext?.artifactId ?? retry.contextArtifactId
          : contextOverride?.id ??
            (isCatalogQuestion(text) ? undefined : context?.id);
      if (!contextArtifactId && isCatalogQuestion(text)) setContext(null);
      const sourceArtifact =
        contextOverride ??
        workspace?.artifacts.find(
          (artifact) => artifact.id === contextArtifactId,
        ) ??
        context;
      const sourceContext =
        retry?.sourceContext ??
        (contextArtifactId && sourceArtifact
          ? advisorContextFor(sourceArtifact, sourceArtifact.view.filters)
          : undefined);
      const request = await api<TurnRequest>(
        "/conversation",
        "POST",
        createConversationRequest({
          sessionId: id,
          requestId: crypto.randomUUID(),
          question: text,
          sourceContext,
          report: report
            ? { id: report.id, version: report.version }
            : undefined,
          dashboardId: report
            ? undefined
            : (retry?.sourceContext?.dashboardId ??
              retry?.contextDashboardId ??
              (destination === "dashboards" ? dashboardId : undefined)),
          retryOf,
          selectedFollowUpFrom,
          selectedContentIds:
            selection?.contentIds ?? retrySelection?.contentIds,
          presentationPreference:
            selection?.presentation ?? retrySelection?.presentation,
        }),
      );
      setJobs((old) => ({ ...old, [id!]: { request } }));
      setQuestion("");
      navigateAnalytics({ view: "chats", sessionId: id!, dashboardId: null });
      await refresh();
      requestAnimationFrame(() =>
        end.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to send your question.",
      );
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  const advisorContextFor = (
    artifact: Artifact,
    filters: Filter[] = noFilters,
    partial: Partial<SourceContext> = {},
  ): SourceContext => ({
    artifactId: artifact.id,
    filters,
    datasetId: artifact.datasetId,
    sourceLabel: partial.sourceLabel ?? artifact.title,
    ...partial,
  });
  const askAdvisor = async (
    artifact: Artifact | null,
    text: string,
    trigger: HTMLElement,
    sourceContext?: SourceContext,
    retryOf?: string,
    selectedFollowUpFrom?: string,
    reportOverride?: ReportDefinition | null,
    selection?: ReportContentsSelection,
  ) => {
    // Opening Advisor from a card replaces a prior report scope. Only the
    // Advisor composer (which has no artifact) carries its selected report.
    const report = artifact
      ? reportOverride
      : (reportOverride ?? advisorReport);
    if ((!text.trim() && !report) || advisorBusy || lock.current) return;
    // A different Advisor card always starts from its own source. A context
    // from an earlier Advisor conversation cannot bleed into this request.
    const resolvedContext = artifact
      ? resolveAdvisorSource(artifact, sourceContext)
      : undefined;
    // Reopening a card while Advisor has a terminal turn must expose that
    // turn's retry action rather than silently replacing it with a new,
    // contextless request. The retry preserves the persisted source below.
    if (!advisorOpen && !retryOf && advisorFailedRequest) {
      advisorTrigger.current = trigger;
      openAdvisorPanel(artifact, report ?? null);
      setAdvisorSourceContext(resolvedContext ?? null);
      return;
    }
    advisorTrigger.current = trigger;
    openAdvisorPanel(artifact, report ?? null);
    setAdvisorSourceContext(resolvedContext ?? null);
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      // A closed Advisor is a completed investigation in Recents. Start a fresh
      // session when another card opens it, while keeping the active panel's
      // follow-ups in the same conversation.
      const hasCompletedAdvisorTurn = advisorSession?.messages.some(
        (message) => message.role === "assistant",
      );
      let id =
        !advisorOpen && hasCompletedAdvisorTurn
          ? undefined
          : advisorSession?.id;
      if (!id) {
        const session = await api<Session>("/sessions", "POST", {
          advisor: true,
        });
        id = session.id;
      }
      const request = await api<TurnRequest>(
        "/conversation",
        "POST",
        createConversationRequest({
          sessionId: id,
          requestId: crypto.randomUUID(),
          question: text,
          sourceContext: report ? undefined : resolvedContext,
          report: report
            ? { id: report.id, version: report.version }
            : undefined,
          retryOf,
          selectedFollowUpFrom,
          selectedContentIds: selection?.contentIds,
          presentationPreference: selection?.presentation,
        }),
      );
      setJobs((old) => ({ ...old, [id!]: { request } }));
      setAdvisorQuestion("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to ask Advisor.",
      );
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  const closeAdvisor = () => {
    setAdvisorOpen(false);
    requestAnimationFrame(() => advisorTrigger.current?.focus());
  };
  const submitAdvisorDraft = (selection?: ReportContentsSelection) => {
    if (advisorArtifact || advisorReport)
      void askAdvisor(
        advisorArtifact,
        selection?.question ?? advisorQuestion,
        advisorTrigger.current ?? document.body,
        advisorSourceContext ?? undefined,
        undefined,
        undefined,
        advisorReport,
        selection,
      );
  };
  const retryAdvisor = () => {
    const failed = advisorFailedRequest;
    if (!failed) return;
    const source = failed.sourceContext;
    const artifact = workspace?.artifacts.find(
      (item) => item.id === (source?.artifactId ?? failed.contextArtifactId),
    );
    const report = failed.reportContext
      ? (findReport(failed.reportContext.reportId) ?? null)
      : null;
    const selection = failed.reportContext?.selectedContentIds?.length
      ? ({
          contentIds: failed.reportContext.selectedContentIds,
          presentation: failed.reportContext.presentationPreference ?? "auto",
          question: failed.question,
        } as ReportContentsSelection)
      : undefined;
    if (artifact || report)
      void askAdvisor(
        artifact ?? null,
        failed.question,
        advisorTrigger.current ?? document.body,
        source ??
          (artifact
            ? advisorContextFor(artifact, failed.contextFilters ?? noFilters, {
                sourceLabel: failed.sourceLabel,
              })
            : undefined),
        failed.id,
        undefined,
        report,
        selection,
      );
  };
  const ready = useCallback(
    (id: string, renderError?: string) =>
      setJobs((old) => {
        const changed = Object.entries(old).find(([, j]) =>
          j.waiting?.includes(id),
        );
        if (!changed) return old;
        const [sessionId, j] = changed;
        return {
          ...old,
          [sessionId]: {
            ...j,
            waiting: j.waiting?.filter((item) => item !== id),
            renderError: renderError ?? j.renderError,
          },
        };
      }),
    [],
  );
  const editName = (title: string, value: string, submit: Form["submit"]) =>
    setForm({ title, value, submit });
  const createProject = () =>
    editName("Create project", "", async (name) => {
      const p = await api<{ id: string }>("/projects", "POST", { name });
      navigateAnalytics({
        view: "projects",
        projectId: p.id,
        dashboardId: null,
      });
    });
  const createProjectInline = async () => {
    if (!projectCreateName.trim() || projectPickerBusy) return;
    setProjectPickerBusy(true);
    setProjectPickerError("");
    try {
      const project = await api<Project>("/projects", "POST", {
        name: projectCreateName.trim(),
      });
      await refresh();
      setProjectPickerSelection(project.id);
      setProjectCreateName("");
      setProjectCreateOpen(false);
    } catch (caught) {
      setProjectPickerError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the project.",
      );
    } finally {
      setProjectPickerBusy(false);
    }
  };
  const addChartToProject = async () => {
    if (!saveArtifact || !projectPickerSelection || projectPickerBusy) return;
    setProjectPickerBusy(true);
    setProjectPickerError("");
    try {
      await api("/saved-charts", "POST", {
        artifactId: saveArtifact.id,
        projectId: projectPickerSelection,
      });
      await refresh();
      const project = workspace?.projects.find(
        (item) => item.id === projectPickerSelection,
      );
      setNotice({
        projectId: projectPickerSelection,
        message: `${saveArtifact.title} was added to ${project?.name ?? "the project"}.`,
      });
      setSaveArtifact(null);
    } catch (caught) {
      setProjectPickerError(
        caught instanceof Error
          ? caught.message
          : "Unable to add this chart. Please retry.",
      );
    } finally {
      setProjectPickerBusy(false);
    }
  };
  const createDashboard = (pid: string) =>
    editName("Create dashboard", "", async (title) => {
      const dashboard = await api<Dashboard>("/dashboards", "POST", {
        title,
        projectId: pid,
      });
      navigateAnalytics({
        view: "dashboards",
        projectId: null,
        dashboardId: dashboard.id,
      });
    });
  const createDashboardInPicker = async (title: string, pid: string) => {
    const created = await api<Dashboard>("/dashboards", "POST", {
      title,
      projectId: pid,
    });
    await refresh();
    return created;
  };
  const createProjectInPicker = async (name: string) => {
    const created = await api<Project>("/projects", "POST", { name });
    await refresh();
    return created;
  };
  const addChartToDashboard = async (selectedDashboardId: string) => {
    if (!dashboardArtifact) return;
    const artifact = dashboardArtifact;
    const next = await api<Dashboard>(
      `/dashboards/${selectedDashboardId}/widgets`,
      "POST",
      { artifactId: artifact.id },
    );
    setWorkspace((current) =>
      current
        ? {
            ...current,
            dashboards: current.dashboards.map((item) =>
              item.id === next.id ? next : item,
            ),
          }
        : current,
    );
    setDashboardArtifact(null);
    setNotice({
      dashboardId: selectedDashboardId,
      message: `${artifact.title} was added to ${next.title}.`,
    });
  };
  const patchDashboard = (d: Dashboard, patch: object) =>
    run(() =>
      api(`/dashboards/${d.id}`, "PATCH", { revision: d.revision, ...patch }),
    );
  const chart = (
    id: string,
    eager = false,
    filters: Filter[] = noFilters,
    showRendererControl = true,
    onAskOverride?: (artifact: Artifact) => void,
    showAdvisor = true,
    briefingWidget?: {
      briefingId?: string;
      briefingWidgetId: string;
      metricTitle?: string;
      entity?: string;
      reportingWindow?: string;
      comparisonWindow?: string;
    },
    onRemove?: (artifact: Artifact) => void,
    removeLabel = "Remove from dashboard",
  ) => {
    const artifact = workspace?.artifacts.find((a) => a.id === id);
    const dataset = workspace?.datasets.find(
      (d) => d.id === artifact?.datasetId,
    );
    return artifact && dataset ? (
      <ChartCard
        key={id}
        artifact={artifact}
        dataset={dataset}
        preference={workspace?.preferences[id]}
        filters={filters}
        eager={eager}
        onReady={ready}
        onAsk={
          onAskOverride ??
          ((a) => {
            setContext(a);
            analyticsRoot.current
              ?.querySelector<HTMLTextAreaElement>("textarea")
              ?.focus();
          })
        }
        onAdvisor={(a, prompt, trigger) =>
          void askAdvisor(
            a,
            prompt,
            trigger,
            advisorContextFor(
              a,
              filters,
              briefingWidget
                ? {
                    ...briefingWidget,
                    sourceLabel:
                      `${a.title} · ${briefingScenario} · ${briefingWidget.metricTitle ?? ""} ${briefingWidget.entity ?? ""}`.trim(),
                  }
                : {
                    sourceLabel: `${a.title}${filters.length ? ` · ${filters.map((filter) => `${filter.field}: ${String(filter.value)}`).join(", ")}` : ""}`,
                  },
            ),
          )
        }
        onSave={(artifact) => {
          setProjectPickerSearch("");
          setProjectPickerSelection(null);
          setProjectPickerError("");
          setProjectCreateOpen(false);
          setSaveArtifact(artifact);
        }}
        onDashboard={setDashboardArtifact}
        onRemove={onRemove}
        removeLabel={removeLabel}
        showRendererControl={showRendererControl}
        showAdvisor={showAdvisor}
      />
    ) : (
      <Text>Chart data is unavailable.</Text>
    );
  };
  const dashboardView = (d: Dashboard) => (
    <div className="dashboard-content">
      <div className="section-heading">
        <Text component="h2">{d.title}</Text>
        <Button
          color="neutral"
          variant="text"
          onClick={() =>
            editName("Rename dashboard", d.title, (title) =>
              api(`/dashboards/${d.id}`, "PATCH", {
                revision: d.revision,
                title,
              }),
            )
          }
        >
          Rename
        </Button>
      </div>
      <div className="collection-actions">
        <Button
          color="neutral"
          variant="outlined"
          onClick={() =>
            editName("Filter dashboard: field = value", "", async (input) => {
              const [field, ...parts] = input.split("=");
              if (!field?.trim() || !parts.length)
                throw new Error(
                  "Use field = value, for example channel = Email.",
                );
              await api(`/dashboards/${d.id}`, "PATCH", {
                revision: d.revision,
                filters: [
                  {
                    field: field.trim(),
                    operator: "eq",
                    value: parts.join("=").trim(),
                  },
                ],
              });
            })
          }
        >
          Add filter
        </Button>
        {!!d.filters.length && (
          <Button
            color="neutral"
            variant="text"
            onClick={() => void patchDashboard(d, { filters: [] })}
          >
            Clear filters
          </Button>
        )}
      </div>
      {d.filters.map((f, i) => (
        <Text key={i} className="filter-label">
          {f.field} {f.operator} {String(f.value)}
        </Text>
      ))}
      {!d.widgets.length && (
        <Text component="p">
          Save a chart from any answer, then choose “Add to dashboard”.
        </Text>
      )}
      <div className="dashboard-grid">
        {d.widgets.map((widget, i) => (
          <section key={widget.id} className="dashboard-widget">
            <div className="widget-tools">
              <Text>{widget.title}</Text>
              <Button
                color="neutral"
                size="small"
                variant="text"
                disabled={!i}
                onClick={() => {
                  const widgets = [...d.widgets];
                  [widgets[i - 1], widgets[i]] = [widgets[i], widgets[i - 1]];
                  void patchDashboard(d, { widgets });
                }}
              >
                Move up
              </Button>
              <Button
                color="neutral"
                size="small"
                variant="text"
                disabled={i === d.widgets.length - 1}
                onClick={() => {
                  const widgets = [...d.widgets];
                  [widgets[i + 1], widgets[i]] = [widgets[i], widgets[i + 1]];
                  void patchDashboard(d, { widgets });
                }}
              >
                Move down
              </Button>
              <Button
                color="neutral"
                size="small"
                variant="text"
                onClick={() => {
                  const a = workspace?.artifacts.find(
                    (a) => a.id === widget.artifactId,
                  );
                  if (a) {
                    setContext(a);
                    setQuestion(`Reconfigure widget "${widget.title}" to `);
                    analyticsRoot.current
                      ?.querySelector<HTMLTextAreaElement>("textarea")
                      ?.focus();
                  }
                }}
              >
                Reconfigure
              </Button>
              <Button
                color="neutral"
                size="small"
                variant="text"
                onClick={() =>
                  editName("Rename widget", widget.title, (title) =>
                    api(`/dashboards/${d.id}`, "PATCH", {
                      revision: d.revision,
                      widgets: d.widgets.map((w) =>
                        w.id === widget.id ? { ...w, title } : w,
                      ),
                    }),
                  )
                }
              >
                Rename
              </Button>
              <Button
                color="neutral"
                size="small"
                variant="text"
                onClick={() =>
                  void patchDashboard(d, {
                    widgets: d.widgets.filter((w) => w.id !== widget.id),
                  })
                }
              >
                Remove
              </Button>
            </div>
            {(() => {
              const a = workspace?.artifacts.find(
                (a) => a.id === widget.artifactId,
              );
              const ds = workspace?.datasets.find(
                (ds) => ds.id === a?.datasetId,
              );
              const compatible = d.filters.filter((f) =>
                ds?.fields.some((field) => field.id === f.field),
              );
              return (
                <>
                  {compatible.length !== d.filters.length && (
                    <Text className="chart-notice">
                      Some dashboard filters do not apply to this widget because
                      their fields are absent.
                    </Text>
                  )}
                  {chart(
                    widget.artifactId,
                    false,
                    compatible,
                    true,
                    undefined,
                    true,
                    undefined,
                    () => {
                      const latest = workspace?.dashboards.find(
                        (item) => item.id === d.id,
                      );
                      if (latest)
                        void patchDashboard(latest, {
                          widgets: latest.widgets.filter(
                            (item) => item.id !== widget.id,
                          ),
                        });
                    },
                  )}
                </>
              );
            })()}
          </section>
        ))}
      </div>
    </div>
  );
  const composer = (
    <div className="composer-wrap">
      <div className="composer">
        <ReportComposer
          urlState={{ searchParams, setSearchParams }}
          value={question}
          onChange={setQuestion}
          onSubmit={(selection) =>
            void ask(
              selection?.question ?? question,
              undefined,
              undefined,
              undefined,
              undefined,
              selection,
            )
          }
          selectedReport={selectedReport}
          onSelectReport={(report) => {
            setSelectedReport(report);
            setContext(null);
          }}
          onRemoveReport={() => setSelectedReport(null)}
          disabled={!!busy}
          placeholder={
            active?.messages.length
              ? "Ask a follow-up…"
              : "What would you like to understand?"
          }
        />
        <div className="composer-bottom">
          <IconButton
            symbol={SendMd}
            title="Send analytics request"
            aria-label="Send analytics request"
            variant="contained"
            color="primary"
            size="medium"
            disabled={(!question.trim() && !selectedReport) || !!busy}
            onClick={() => void ask()}
          />
        </div>
      </div>
    </div>
  );
  const filtered =
    workspace?.sessions.filter((s) =>
      `${s.title} ${s.messages.map((m) => m.text).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const spotlightSessions = search.trim()
    ? filtered
    : filtered
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5);
  const spotlightDisplayTitle = (session: Session) => {
    const artifactId = session.messages
      .slice()
      .reverse()
      .flatMap((message) => message.artifactIds ?? [])
      .at(0);
    const artifactTitle = workspace?.artifacts.find(
      (artifact) => artifact.id === artifactId,
    )?.title;
    if (artifactTitle) return artifactTitle;
    return session.title
      .replace(/^Help me understand\s+/i, "Understand ")
      .replace(/,?\s+including\b.*$/i, "")
      .replace(/\bfictional\s+/gi, "")
      .replace(/[.?!]+$/, "");
  };
  const sidebarContent = (
    <aside className="workspace-sidebar">
      <div className="sidebar-title">
        <Text component="h1">RCX Analytics 3.0</Text>
      </div>
      <div className="sidebar-actions">
        <Button
          color="neutral"
          variant="text"
          startIcon={PlusMd}
          onClick={newSession}
        >
          New session
        </Button>
        <Button
          color="neutral"
          variant="text"
          startIcon={SearchMd}
          onClick={() => setSearchOpen(true)}
        >
          Search conversations
        </Button>
        <Button
          color="neutral"
          variant="text"
          startIcon={AiStarsMd}
          onClick={() => {
            setDestination("briefing");
            if (narrow) setSidebar(false);
          }}
        >
          AI suggestions
        </Button>
        {(["projects", "saved", "dashboards"] as const).map((view) => (
          <Button
            key={view}
            color="neutral"
            variant="text"
            aria-current={destination === view ? "page" : undefined}
            onClick={() => {
              navigateAnalytics({
                view,
                sessionId: null,
                projectId: null,
                dashboardId: null,
              });
              if (narrow) setSidebar(false);
            }}
          >
            {view === "projects"
              ? "Projects"
              : view === "saved"
                ? "Saved charts"
                : "Dashboards"}
          </Button>
        ))}
      </div>
      <div className="sidebar-scroll">
        <section className="sidebar-section">
          <Text className="section-label">Recent conversations</Text>
          {workspace?.sessions
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((s) => (
              <div
                key={s.id}
                className={`sidebar-item ${s.id === activeId && destination === "chats" ? "selected" : ""}`}
              >
                <Button
                  color="neutral"
                  variant="text"
                  className="nav-row"
                  onClick={() => openSession(s)}
                >
                  {s.title}
                </Button>
                <IconButton
                  symbol={TrashMd}
                  title={`Delete ${s.title}`}
                  aria-label={`Delete ${s.title}`}
                  size="small"
                  color="neutral"
                  onClick={() => setDeleteConfirm(s)}
                />
              </div>
            ))}
          {!workspace?.sessions.length && (
            <Text className="sidebar-empty">
              Your conversations will appear here.
            </Text>
          )}
        </section>
        <section className="sidebar-section">
          <div className="section-heading">
            <Text className="section-label">Projects</Text>
            <IconButton
              symbol={PlusMd}
              title="Create project"
              aria-label="Create project"
              size="small"
              color="neutral"
              onClick={createProject}
            />
          </div>
          {workspace?.projects.map((p) => (
            <div
              key={p.id}
              className={`sidebar-item ${projectId === p.id && destination === "projects" ? "selected" : ""}`}
            >
              <Button
                startIcon={FolderMd}
                color="neutral"
                variant="text"
                className="nav-row"
                onClick={() => {
                  navigateAnalytics({
                    view: "projects",
                    projectId: p.id,
                    sessionId: null,
                    dashboardId: null,
                  });
                }}
              >
                {p.name}
              </Button>
              <IconButton
                symbol={TrashMd}
                title={`Delete ${p.name}`}
                aria-label={`Delete ${p.name}`}
                size="small"
                color="neutral"
                onClick={() => setProjectDelete(p)}
              />
            </div>
          ))}
        </section>
      </div>
      <div className="sidebar-footer">
        <Button
          color="neutral"
          variant="text"
          size="small"
          className="reset-workspace"
          onClick={() => setResetConfirm(true)}
        >
          Reset workspace
        </Button>
        <Text className="sidebar-foot">RCX Analytics 3.0 · Local concept</Text>
      </div>
    </aside>
  );
  return (
    <ReportComposerUrlProvider
      value={{ searchParams, setSearchParams }}
    >
      <ChartCardUrlProvider search={locationSearch} navigate={navigateSearch}>
        <main
          ref={bindAnalyticsRoot}
          className={`analytics-app ${sidebar ? "" : "sidebar-hidden"} ${advisorOpen ? "advisor-open" : ""}`}
        >
          {narrow ? (
            <Drawer
              container={portalContainer ?? undefined}
              open={sidebar}
              anchor="left"
              onClose={() => setSidebar(false)}
              aria-label="Conversations and projects"
            >
              {sidebarContent}
            </Drawer>
          ) : (
            sidebarContent
          )}
          <section className="main-pane">
            <header className="main-header">
              <div>
                <IconButton
                  symbol={MenuMd}
                  title="Toggle sidebar"
                  aria-label="Toggle sidebar"
                  color="neutral"
                  onClick={() => setSidebar(!sidebar)}
                />
                <Text component="h2">
                  {destination === "chats"
                    ? (active?.title ?? "New session")
                    : destination === "briefing"
                      ? "AI suggestions"
                      : destination === "projects"
                        ? (workspace?.projects.find((p) => p.id === projectId)
                            ?.name ?? "Projects")
                        : destination === "saved"
                          ? "Saved charts"
                          : (dashboard?.title ?? "Dashboards")}
                </Text>
              </div>
              <div>
                {job?.request.status === "pending" && (
                  <Button
                    color="neutral"
                    variant="text"
                    size="small"
                    onClick={() => void cancelRequest(job.request)}
                  >
                    Cancel request
                  </Button>
                )}
                {active && destination === "chats" && (
                  <IconButton
                    symbol={OverflowVerticalMd}
                    title="Conversation actions"
                    aria-label="Conversation actions"
                    color="neutral"
                    onClick={() => setOrganize(true)}
                  />
                )}
              </div>
            </header>
            {error && (
              <div role="alert" className="global-error">
                <Text>{error}</Text>
                <Button
                  color="neutral"
                  variant="text"
                  onClick={() => void run(refresh)}
                >
                  Retry connection
                </Button>
                <Button
                  color="neutral"
                  variant="text"
                  onClick={() => setError("")}
                >
                  Dismiss
                </Button>
              </div>
            )}
            {missingRouteRecord && (
              <div role="alert" className="global-error">
                <Text>
                  This Analytics link no longer points to an available record.
                </Text>
                <Button color="neutral" variant="text" onClick={newSession}>
                  Open Analytics home
                </Button>
              </div>
            )}
            {destination === "chats" ? (
              !active?.messages.length ? (
                <div className="welcome">
                  <div className="welcome-content">
                    <Text component="h2">
                      What would you like to understand?
                    </Text>
                    <Text component="p">
                      Start with a question from the analytics catalog, or write
                      your own.
                    </Text>
                    {composer}
                    <div
                      className="starter-list"
                      aria-label="Suggested questions"
                    >
                      {curatedQuestions.slice(0, 3).map((item) => (
                        <Button
                          key={item.title}
                          color="neutral"
                          variant="outlined"
                          className="starter-chip"
                          title={item.prompt}
                          onClick={() => fillQuestion(item.prompt)}
                        >
                          {item.title}
                        </Button>
                      ))}
                      <Button
                        color="neutral"
                        variant="text"
                        className="browse-questions"
                        onClick={() => setQuestionBrowser(true)}
                      >
                        Browse questions
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="conversation-scroll">
                    <div className="conversation-content">
                      {active.messages.map((message, messageIndex) => (
                        <article
                          className={`conversation-turn ${message.role}`}
                          key={message.id}
                        >
                          <Text className="turn-author">
                            {message.role === "user" ? "You" : "Analytics"}
                          </Text>
                          {message.role === "assistant" &&
                            message.reportContext && (
                              <div className="turn-report-context">
                                <Text>Report</Text>
                                <Text>{message.reportContext.title}</Text>
                              </div>
                            )}
                          <Text component="p" className="answer-text">
                            {message.text}
                          </Text>
                          {message.artifactIds?.map((id) =>
                            chart(id, !!job?.waiting?.includes(id)),
                          )}
                          {message.dashboardId &&
                            (() => {
                              const d = workspace?.dashboards.find(
                                (item) => item.id === message.dashboardId,
                              );
                              const snapshot = d?.history.find(
                                (h) => h.revision === message.dashboardRevision,
                              );
                              return d
                                ? dashboardView(
                                    snapshot ? { ...d, ...snapshot } : d,
                                  )
                                : null;
                            })()}
                          {(() => {
                            const choices =
                              message.choices?.filter(Boolean) ?? [];
                            const suggestions =
                              message.suggestions?.filter(Boolean) ?? [];
                            const prompts = (
                              choices.length ? choices : suggestions
                            ).slice(0, 3);
                            const artifact = active.messages
                              .slice(0, messageIndex + 1)
                              .reverse()
                              .flatMap((item) => item.artifactIds ?? [])
                              .map((id) =>
                                workspace?.artifacts.find(
                                  (item) => item.id === id,
                                ),
                              )
                              .find(Boolean);
                            const action = textAnswerAction(
                              message,
                              !!artifact,
                            );
                            return (
                              <>
                                {action && (
                                  <div className="text-answer-actions">
                                    <Button
                                      color="neutral"
                                      variant="outlined"
                                      size="small"
                                      disabled={!!busy}
                                      onClick={() => {
                                        const report = message.reportContext
                                          ? findReport(
                                              message.reportContext.reportId,
                                            )
                                          : undefined;
                                        void ask(
                                          action.prompt,
                                          undefined,
                                          report ? undefined : artifact,
                                          message.id,
                                          report,
                                        );
                                      }}
                                    >
                                      {action.label}
                                    </Button>
                                  </div>
                                )}
                                {prompts.length ? (
                                  <div className="follow-ups">
                                    <Text className="section-label">
                                      {choices.length
                                        ? "Choose a direction"
                                        : "Follow-up"}
                                    </Text>
                                    <div className="follow-up-options">
                                      {prompts.map((prompt) => (
                                        <Button
                                          key={prompt}
                                          color="neutral"
                                          variant="text"
                                          startIcon={ReplyMd}
                                          className="follow-up-row"
                                          disabled={!!busy}
                                          onClick={() =>
                                            fillQuestion(
                                              prompt,
                                              artifact,
                                              message.id,
                                            )
                                          }
                                        >
                                          {prompt}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </article>
                      ))}
                      {job &&
                        (job.request.status === "pending" ||
                          !!job.waiting?.length) && (
                          <RequestProgress
                            request={job.request}
                            waiting={job.waiting}
                          />
                        )}
                      {job && ["failed", "cancelled"].includes(job.request.status) && (
                        <div role="alert" className="inline-error">
                          <Text>{job.request.status === "cancelled" ? "Request cancelled." : job.request.error}</Text>
                          <Button
                            color="neutral"
                            onClick={() =>
                              void ask(job.request.question, job.request.id)
                            }
                          >
                            Retry
                          </Button>
                        </div>
                      )}
                      <div ref={end} />
                    </div>
                  </div>
                  <div className="anchored-composer">{composer}</div>
                </>
              )
            ) : destination === "briefing" ? (
              (() => {
                const snapshot = workspace?.briefings.find(
                  (item) => item.scenario === briefingScenario,
                );
                const briefingContext = (id: string) => {
                  const widget = snapshot?.widgets.find(
                    (item) => item.artifactId === id,
                  );
                  return widget
                    ? {
                        briefingId: snapshot?.id,
                        briefingWidgetId: widget.id,
                        metricTitle: widget.metricTitle,
                        entity: widget.entity,
                        reportingWindow: snapshot?.reportingWindow,
                        comparisonWindow: snapshot?.comparisonWindow,
                      }
                    : undefined;
                };
                return (
                  <BriefingPage
                    snapshot={snapshot}
                    scenario={briefingScenario}
                    onScenario={setBriefingScenario}
                    renderChart={(id) =>
                      chart(
                        id,
                        true,
                        noFilters,
                        true,
                        undefined,
                        false,
                        briefingContext(id),
                      )
                    }
                    renderAdvisor={(id) => {
                      const artifact = workspace?.artifacts.find(
                        (item) => item.id === id,
                      );
                      const details = briefingContext(id);
                      return artifact ? (
                        <AskAdvisor
                          artifact={artifact}
                          onAsk={(prompt, trigger) =>
                            void askAdvisor(
                              artifact,
                              prompt,
                              trigger,
                              advisorContextFor(artifact, noFilters, {
                                ...details,
                                sourceLabel: `${artifact.title} · ${briefingScenario}`,
                              }),
                            )
                          }
                        />
                      ) : null;
                    }}
                  />
                );
              })()
            ) : (
              <div className="collection-scroll">
                <div className="collection-content">
                  {destination === "projects" && (
                    <>
                      <div className="section-heading">
                        <div className="project-workspace-title">
                          <Text component="h2">
                            {projectId
                              ? "Project workspace"
                              : "Keep related work together"}
                          </Text>
                          {projectId && (
                            <IconButton
                              symbol={EditPenMd}
                              title="Rename project"
                              aria-label="Rename project"
                              size="small"
                              color="neutral"
                              onClick={() => {
                                const p = workspace?.projects.find(
                                  (p) => p.id === projectId,
                                );
                                if (p)
                                  editName("Rename project", p.name, (name) =>
                                    api(`/projects/${p.id}`, "PATCH", { name }),
                                  );
                              }}
                            />
                          )}
                        </div>
                        <Button color="neutral" onClick={createProject}>
                          Create project
                        </Button>
                      </div>
                      {projectId && (
                        <div className="collection-actions">
                          <Button
                            color="neutral"
                            onClick={() => createDashboard(projectId)}
                          >
                            Create dashboard
                          </Button>
                        </div>
                      )}
                      {workspace?.projects
                        .filter((p) => !projectId || p.id === projectId)
                        .map((p) => (
                          <section key={p.id} className="project-collection">
                            {!projectId && <Text component="h3">{p.name}</Text>}
                            {workspace.sessions.some(
                              (s) => s.projectId === p.id,
                            ) && (
                              <details className="project-conversations">
                                <summary>
                                  Conversations in this project (
                                  {
                                    workspace.sessions.filter(
                                      (s) => s.projectId === p.id,
                                    ).length
                                  }
                                  )
                                </summary>
                                {workspace.sessions
                                  .filter((s) => s.projectId === p.id)
                                  .map((s) => (
                                    <Button
                                      key={s.id}
                                      className="collection-row"
                                      color="neutral"
                                      variant="text"
                                      title={s.title}
                                      aria-label={`Open conversation: ${s.title}`}
                                      onClick={() => openSession(s)}
                                    >
                                      {s.title}
                                    </Button>
                                  ))}
                              </details>
                            )}
                            {workspace.savedCharts
                              .filter((s) => s.projectId === p.id)
                              .map((s) =>
                                chart(
                                  s.artifactId,
                                  false,
                                  noFilters,
                                  true,
                                  undefined,
                                  true,
                                  undefined,
                                  () =>
                                    void run(() =>
                                      api(`/saved-charts/${s.id}`, "DELETE"),
                                    ),
                                  "Remove from project",
                                ),
                              )}
                            {workspace.dashboards
                              .filter((d) => d.projectId === p.id)
                              .map((d) => (
                                <Button
                                  key={d.id}
                                  color="neutral"
                                  className="collection-row"
                                  variant="outlined"
                                  onClick={() => {
                                    setDashboardId(d.id);
                                    setDestination("dashboards");
                                  }}
                                >
                                  {d.title} · {d.widgets.length} widgets
                                </Button>
                              ))}
                          </section>
                        ))}
                    </>
                  )}
                  {destination === "saved" && (
                    <>
                      {!workspace?.savedCharts.length && (
                        <Text>
                          Save charts from an answer to revisit them here.
                        </Text>
                      )}
                      {workspace?.savedCharts.map((s) => (
                        <section key={s.id}>
                          {chart(
                            s.artifactId,
                            false,
                            noFilters,
                            true,
                            undefined,
                            true,
                            undefined,
                            () =>
                              void run(() =>
                                api(`/saved-charts/${s.id}`, "DELETE"),
                              ),
                            "Remove saved chart",
                          )}
                        </section>
                      ))}
                    </>
                  )}
                  {destination === "dashboards" && (
                    <>
                      {dashboard ? (
                        dashboardView(dashboard)
                      ) : (
                        <>
                          <Text component="h2">Bring your charts together</Text>
                          <Text component="p">
                            Create a dashboard inside a project, then add charts
                            from any answer.
                          </Text>
                          {workspace?.projects.map((project) => (
                            <Button
                              key={project.id}
                              color="neutral"
                              onClick={() => createDashboard(project.id)}
                            >
                              Create in {project.name}
                            </Button>
                          ))}
                          {workspace?.dashboards.map((d) => (
                            <Button
                              key={d.id}
                              className="collection-row"
                              color="neutral"
                              variant="outlined"
                              onClick={() => {
                                setDashboardId(d.id);
                                setDestination("dashboards");
                              }}
                            >
                              {d.title} · {d.widgets.length} widgets
                            </Button>
                          ))}
                        </>
                      )}
                      {dashboard && composer}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
          {advisorOpen && advisorJob?.request.status === "pending" && (
            <div className="global-error" aria-live="off">
              <Text>Advisor is preparing a response.</Text>
              <Button
                color="neutral"
                variant="text"
                size="small"
                onClick={() => void cancelRequest(advisorJob.request)}
              >
                Cancel Advisor request
              </Button>
            </div>
          )}
          {advisorOpen && (
            <aside className="advisor-panel" aria-label="Advisor conversation">
              <header>
                <div>
                  <Text component="h2">Advisor</Text>
                  <Text>
                    {advisorReport
                      ? `About: ${advisorReport.title}`
                      : advisorArtifact
                        ? `About: ${advisorArtifact.title}`
                        : "Select a widget or report to ask a question."}
                  </Text>
                </div>
                <div>
                  <Button
                    color="neutral"
                    variant="text"
                    size="small"
                    onClick={() => {
                      if (advisorSession) openSession(advisorSession);
                      closeAdvisor();
                    }}
                  >
                    Open conversation
                  </Button>
                  <IconButton
                    symbol={Xsm}
                    color="neutral"
                    variant="contained"
                    className="advisor-close"
                    title="Close Advisor"
                    aria-label="Close Advisor"
                    onClick={closeAdvisor}
                  />
                </div>
              </header>
              <div className="advisor-messages">
                {advisorSession?.messages.map((message, index, messages) => {
                  const request = message.requestId
                    ? workspace?.requests.find(
                        (item) => item.id === message.requestId,
                      )
                    : undefined;
                  const source =
                    message.reportContext?.title ??
                    request?.reportContext?.title ??
                    message.sourceContext?.sourceLabel ??
                    request?.sourceLabel;
                  const artifact = workspace?.artifacts.find(
                    (item) =>
                      item.id ===
                      (message.sourceContext?.artifactId ??
                        request?.contextArtifactId ??
                        advisorArtifact?.id),
                  );
                  const prompts = (
                    message.choices?.length
                      ? message.choices
                      : (message.suggestions ?? [])
                  )
                    .slice(0, 3)
                    .filter(
                      (prompt) =>
                        !consumedAdvisorFollowUps.includes(
                          `${message.id}:${prompt}`,
                        ),
                    );
                  const action = textAnswerAction(
                    message,
                    !!artifact || !!message.reportContext,
                  );
                  const latestAssistant = [...messages]
                    .map((item, itemIndex) =>
                      item.role === "assistant" ? itemIndex : -1,
                    )
                    .at(-1);
                  return (
                    <article
                      className={`advisor-message ${message.role}`}
                      key={message.id}
                    >
                      {source && (
                        <Text className="advisor-source">Source: {source}</Text>
                      )}
                      <Text className="turn-author">
                        {message.role === "user" ? "You" : "Advisor"}
                      </Text>
                      <Text component="p">{message.text}</Text>
                      {message.role === "assistant" &&
                        index === latestAssistant &&
                        message.artifactIds?.map((id) =>
                          chart(id, !!advisorJob?.waiting?.includes(id)),
                        )}
                      {action && (
                        <div className="text-answer-actions">
                          <Button
                            color="neutral"
                            variant="outlined"
                            size="small"
                            disabled={advisorBusy}
                            onClick={(event) => {
                              const report = message.reportContext
                                ? findReport(message.reportContext.reportId)
                                : advisorReport;
                              void askAdvisor(
                                report ? null : (artifact ?? null),
                                action.prompt,
                                event.currentTarget,
                                report
                                  ? undefined
                                  : artifact
                                    ? advisorContextFor(
                                        artifact,
                                        noFilters,
                                        message.sourceContext ??
                                          request?.sourceContext ??
                                          {},
                                      )
                                    : undefined,
                                undefined,
                                message.id,
                                report,
                              );
                            }}
                          >
                            {action.label}
                          </Button>
                        </div>
                      )}
                      {!!prompts.length && artifact && (
                        <div className="follow-ups">
                          <Text className="section-label">Follow-up</Text>
                          <div className="follow-up-options">
                            {prompts.map((prompt) => (
                              <Button
                                key={`${index}-${prompt}`}
                                color="neutral"
                                variant="text"
                                startIcon={ReplyMd}
                                disabled={advisorBusy}
                                onClick={(event) => {
                                  setConsumedAdvisorFollowUps((old) => [
                                    ...old,
                                    `${message.id}:${prompt}`,
                                  ]);
                                  void askAdvisor(
                                    artifact,
                                    prompt,
                                    event.currentTarget,
                                    advisorContextFor(
                                      artifact,
                                      noFilters,
                                      message.sourceContext ??
                                        request?.sourceContext ??
                                        {},
                                    ),
                                    undefined,
                                    message.id,
                                  );
                                }}
                              >
                                {prompt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
                {advisorJob &&
                  (advisorJob.request.status === "pending" ||
                    !!advisorJob.waiting?.length) && (
                    <RequestProgress
                      request={advisorJob.request}
                      waiting={advisorJob.waiting}
                    />
                  )}
                {advisorJob && ["failed", "cancelled"].includes(advisorJob.request.status) && (
                  <div role="alert" className="inline-error">
                    <Text>{advisorJob.request.status === "cancelled" ? "Request cancelled." : advisorJob.request.error}</Text>
                    <Button color="neutral" size="small" onClick={retryAdvisor}>
                      Retry
                    </Button>
                  </div>
                )}
                <div ref={advisorEnd} />
              </div>
              <div className="advisor-composer">
                <div className="advisor-active-source">
                  <Text>
                    Source:{" "}
                    {advisorReport?.title ??
                      advisorSourceContext?.sourceLabel ??
                      advisorArtifact?.title ??
                      "Choose a report or chart"}
                  </Text>
                </div>
                <div className="advisor-composer-input">
                  <ReportComposer
                    namespace="advisor"
                    value={advisorQuestion}
                    onChange={setAdvisorQuestion}
                    onSubmit={submitAdvisorDraft}
                    selectedReport={advisorReport}
                    onSelectReport={(report) => {
                      setAdvisorReport(report);
                      setAdvisorArtifact(null);
                      setAdvisorSourceContext(null);
                    }}
                    onRemoveReport={() => setAdvisorReport(null)}
                    disabled={advisorBusy}
                    placeholder="Ask a follow-up…"
                    ariaLabel="Ask Advisor"
                  />
                  <IconButton
                    symbol={SendMd}
                    title="Send Advisor question"
                    aria-label="Send Advisor question"
                    variant="contained"
                    color="primary"
                    size="medium"
                    disabled={
                      (!advisorQuestion.trim() && !advisorReport) || advisorBusy
                    }
                    onClick={() => submitAdvisorDraft()}
                  />
                </div>
              </div>
            </aside>
          )}
          <Dialog
            open={questionBrowser}
            onClose={() => setQuestionBrowser(false)}
            closeButton
            size="large"
            aria-label="Browse analytics questions"
          >
            <div className="dialog-content catalog-dialog-content">
              <Text component="h2">Browse analytics questions</Text>
              {Array.from(
                new Set(curatedQuestions.map((item) => item.topic)),
              ).map((topic) => (
                <section key={topic} className="question-topic">
                  <Text className="section-label">{topic}</Text>
                  {curatedQuestions
                    .filter((item) => item.topic === topic)
                    .map((item) => (
                      <Button
                        key={item.title}
                        color="neutral"
                        variant="outlined"
                        className="catalog-question"
                        onClick={() => {
                          setQuestionBrowser(false);
                          fillQuestion(item.prompt);
                        }}
                      >
                        <span className="catalog-question-content">
                          <Text className="starter-title">{item.title}</Text>
                          <Text className="starter-description">
                            {item.prompt}
                          </Text>
                        </span>
                      </Button>
                    ))}
                </section>
              ))}
            </div>
          </Dialog>
          <Dialog
            open={resetConfirm}
            onClose={() => setResetConfirm(false)}
            closeButton
            size="small"
            aria-label="Reset workspace"
          >
            <DialogTitle>Reset workspace?</DialogTitle>
            <DialogContent>
              <Text>
                This clears conversations, projects, dashboards, saved charts,
                drafts, and Advisor history. AI suggestions and their synthetic
                charts remain available.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                color="neutral"
                variant="outlined"
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </Button>
              <Button color="danger" onClick={() => void run(resetWorkspace)}>
                Reset workspace
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={!!deleteConfirm}
            onClose={() => setDeleteConfirm(null)}
            closeButton
            size="small"
            aria-label="Delete conversation"
          >
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogContent>
              <Text>
                Saved charts and dashboard widgets will remain available.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                color="neutral"
                variant="outlined"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onClick={() =>
                  void run(async () => {
                    const deleted = deleteConfirm;
                    if (!deleted) return;
                    await api(`/sessions/${deleted.id}`, "DELETE");
                    setDeleteConfirm(null);
                    if (activeId === deleted.id) newSession();
                  })
                }
              >
                Delete conversation
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={!!projectDelete}
            onClose={() => setProjectDelete(null)}
            closeButton
            size="small"
            aria-label="Delete project"
          >
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogContent>
              <Text>
                Its conversations remain in Recent conversations. Saved charts
                and dashboards in this project will be removed.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                color="neutral"
                variant="outlined"
                onClick={() => setProjectDelete(null)}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onClick={() =>
                  void run(async () => {
                    const deleted = projectDelete;
                    if (!deleted) return;
                    await api(`/projects/${deleted.id}`, "DELETE");
                    setProjectDelete(null);
                    if (projectId === deleted.id) {
                      setProjectId(null);
                      setDestination("chats");
                    }
                  })
                }
              >
                Delete project
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={searchOpen}
            onClose={() => {
              setSearchOpen(false);
              setSearch("");
              setSpotlightIndex(0);
            }}
            closeButton
            size="medium"
            aria-label="Search conversations"
          >
            <div className="dialog-content spotlight-dialog">
              <TextField
                autoFocus
                fullWidth
                placeholder="Search conversations"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSpotlightIndex(0);
                }}
                inputProps={{
                  "aria-label": "Search conversations",
                  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "ArrowDown" && spotlightSessions.length) {
                      event.preventDefault();
                      setSpotlightIndex((index) =>
                        Math.min(index + 1, spotlightSessions.length - 1),
                      );
                    } else if (
                      event.key === "ArrowUp" &&
                      spotlightSessions.length
                    ) {
                      event.preventDefault();
                      setSpotlightIndex((index) => Math.max(index - 1, 0));
                    } else if (
                      event.key === "Enter" &&
                      spotlightSessions[spotlightIndex]
                    )
                      openSession(spotlightSessions[spotlightIndex]);
                  },
                }}
              />
              <section
                className="spotlight-results"
                aria-label={search.trim() ? "Search results" : "Recents"}
              >
                <Text className="section-label">
                  {search.trim() ? "Results" : "Recents"}
                </Text>
                {spotlightSessions.map((session, index) => (
                  <Button
                    key={session.id}
                    color="neutral"
                    variant="text"
                    className={`spotlight-row ${index === spotlightIndex ? "is-active" : ""}`}
                    title={session.title}
                    aria-label={`Open conversation: ${session.title}`}
                    aria-current={index === spotlightIndex ? "true" : undefined}
                    onMouseMove={() => setSpotlightIndex(index)}
                    onClick={() => openSession(session)}
                  >
                    {spotlightDisplayTitle(session)}
                  </Button>
                ))}
                {!spotlightSessions.length && (
                  <Text className="spotlight-empty">
                    {search.trim()
                      ? "No conversations found."
                      : "No recent conversations."}
                  </Text>
                )}
              </section>
            </div>
          </Dialog>
          <Dialog
            open={!!form}
            onClose={() => !formBusy && setForm(null)}
            closeButton
            size="small"
            aria-label={form?.title}
          >
            <div className="dialog-content">
              <Text component="h2">{form?.title}</Text>
              <TextField
                fullWidth
                autoFocus
                label="Name"
                value={form?.value ?? ""}
                onChange={(e) =>
                  setForm((old) =>
                    old ? { ...old, value: e.target.value } : null,
                  )
                }
              />
              <ProgressButton
                busy={formBusy}
                label="Save"
                disabled={!form?.value.trim()}
                onClick={() => {
                  if (!form) return;
                  setFormBusy(true);
                  void run(async () => {
                    await form.submit(form.value.trim());
                    setForm(null);
                  }).finally(() => setFormBusy(false));
                }}
              />
            </div>
          </Dialog>
          <Dialog
            open={organize}
            onClose={() => setOrganize(false)}
            closeButton
            size="small"
            aria-label="Conversation actions"
          >
            <div className="dialog-content">
              <Text component="h2">Conversation actions</Text>
              <Button
                color="neutral"
                onClick={() => {
                  setOrganize(false);
                  if (active)
                    editName("Rename conversation", active.title, (title) =>
                      api(`/sessions/${active.id}`, "PATCH", { title }),
                    );
                }}
              >
                Rename
              </Button>
              <Text>Move to project</Text>
              {workspace?.projects.map((p) => (
                <Button
                  key={p.id}
                  color="neutral"
                  variant="text"
                  onClick={() =>
                    void run(async () => {
                      await api(`/sessions/${activeId}`, "PATCH", {
                        projectId: p.id,
                      });
                      setOrganize(false);
                    })
                  }
                >
                  {p.name}
                </Button>
              ))}
              <Button
                color="neutral"
                variant="text"
                onClick={() => {
                  setOrganize(false);
                  setDeleteConfirm(active ?? null);
                }}
              >
                Delete conversation
              </Button>
            </div>
          </Dialog>
          <Dialog
            open={!!saveArtifact}
            onClose={() => !projectPickerBusy && setSaveArtifact(null)}
            closeButton
            size="medium"
            aria-label="Add chart to project"
          >
            <DialogTitle>Add chart to project</DialogTitle>
            <DialogContent>
              <div className="project-picker-heading">
                <Text>{saveArtifact?.title}</Text>
                <Text>Choose where this synthetic chart belongs.</Text>
              </div>
              <TextField
                fullWidth
                label="Search projects"
                value={projectPickerSearch}
                onChange={(event) => setProjectPickerSearch(event.target.value)}
                inputProps={{ "aria-label": "Search projects" }}
              />
              <div className="project-picker-list-heading">
                <Text>Available projects</Text>
                {projectCreateOpen ? null : (
                  <Button
                    color="neutral"
                    variant="outlined"
                    size="small"
                    startIcon={PlusMd}
                    onClick={() => setProjectCreateOpen(true)}
                  >
                    New project
                  </Button>
                )}
              </div>
              {projectCreateOpen && (
                <div className="project-create-inline">
                  <TextField
                    autoFocus
                    fullWidth
                    label="New project name"
                    value={projectCreateName}
                    onChange={(event) =>
                      setProjectCreateName(event.target.value)
                    }
                  />
                  <Button
                    color="neutral"
                    variant="outlined"
                    size="small"
                    disabled={!projectCreateName.trim() || projectPickerBusy}
                    onClick={() => void createProjectInline()}
                  >
                    Create
                  </Button>
                  <Button
                    color="neutral"
                    variant="text"
                    size="small"
                    disabled={projectPickerBusy}
                    onClick={() => setProjectCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <RadioGroup
                name="project-picker"
                value={projectPickerSelection ?? ""}
                onChange={(event) =>
                  setProjectPickerSelection(
                    (event.target as HTMLInputElement).value,
                  )
                }
                className="project-picker-list"
              >
                {workspace?.projects
                  .filter((project) =>
                    project.name
                      .toLowerCase()
                      .includes(projectPickerSearch.toLowerCase()),
                  )
                  .map((project) => {
                    const alreadyAdded =
                      !!saveArtifact &&
                      workspace.savedCharts.some(
                        (chart) =>
                          chart.artifactId === saveArtifact.id &&
                          chart.projectId === project.id,
                      );
                    return (
                      <label
                        key={project.id}
                        className={`project-picker-row ${alreadyAdded ? "is-disabled" : ""}`}
                      >
                        <span className="project-picker-icon">
                          <FolderMd />
                        </span>
                        <span className="project-picker-copy">
                          <Text>{project.name}</Text>
                          {alreadyAdded && <Text>Already added</Text>}
                        </span>
                        <Radio
                          value={project.id}
                          disabled={alreadyAdded || projectPickerBusy}
                          inputProps={{
                            "aria-label": `Select ${project.name}`,
                          }}
                        />
                      </label>
                    );
                  })}
              </RadioGroup>
              {!workspace?.projects.filter((project) =>
                project.name
                  .toLowerCase()
                  .includes(projectPickerSearch.toLowerCase()),
              ).length && (
                <Text className="project-picker-empty">
                  No matching projects.
                </Text>
              )}
              {projectPickerError && (
                <Alert severity="error">{projectPickerError}</Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                color="neutral"
                variant="outlined"
                size="small"
                disabled={projectPickerBusy}
                onClick={() => setSaveArtifact(null)}
              >
                Cancel
              </Button>
              <ProgressButton
                busy={projectPickerBusy}
                label="Add to project"
                busyLabel="Adding…"
                disabled={!projectPickerSelection}
                onClick={() => void addChartToProject()}
              />
            </DialogActions>
          </Dialog>
          <DashboardPicker
            key={dashboardArtifact?.id ?? "closed-dashboard-picker"}
            artifact={dashboardArtifact}
            workspace={workspace}
            initialProjectId={
              destination === "dashboards"
                ? dashboard?.projectId
                : destination === "projects"
                  ? projectId
                  : null
            }
            onClose={() => setDashboardArtifact(null)}
            onCreateProject={createProjectInPicker}
            onCreateDashboard={createDashboardInPicker}
            onAdd={addChartToDashboard}
            onSuccess={() => {}}
          />
          {notice && (
            <div className="spring-notice" role="status">
              <Alert
                severity="success"
                action={
                  <Button
                    color="neutral"
                    variant="text"
                    size="small"
                    onClick={() => {
                      if (notice.dashboardId) {
                        setDashboardId(notice.dashboardId);
                        setDestination("dashboards");
                      } else if (notice.projectId) {
                        setProjectId(notice.projectId);
                        setDestination("projects");
                      }
                      setNotice(null);
                    }}
                  >
                    {notice.dashboardId ? "Open dashboard" : "Open project"}
                  </Button>
                }
                onClose={() => setNotice(null)}
              >
                {notice.message}
              </Alert>
            </div>
          )}
        </main>
      </ChartCardUrlProvider>
    </ReportComposerUrlProvider>
  );
}
