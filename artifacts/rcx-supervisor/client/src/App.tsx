import {
  Component,
  Suspense,
  startTransition,
  useEffect,
  type ReactNode,
} from "react";
import { Route, Switch, useLocation } from "wouter";
import { ThemeProvider, suiLight } from "@ringcentral/spring-theme";
import NotFound from "@/pages/not-found";
import { SupervisorHeader, SupervisorShell } from "@/components/shell/SupervisorShell";
import { lazyRoute } from "@/lib/lazyRoute";

const AnalyticsRoute = lazyRoute("analytics", () =>
  import("@/routes/AnalyticsRoute"),
);
const SupervisorRoute = lazyRoute("supervisor", () =>
  import("@/routes/SupervisorRoute"),
);

function RouteLoading() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center self-stretch">
      Loading…
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 self-stretch p-6 text-center"
        role="alert"
      >
        <h1 className="text-lg font-semibold">
          {this.props.label} is temporarily unavailable
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Refresh the page to reconnect to the Supervisor workspace.
        </p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          onClick={() => window.location.reload()}
          type="button"
        >
          Refresh page
        </button>
      </div>
    );
  }
}

function LegacyAnalyticsRedirect() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(`/analytics${window.location.search}${window.location.hash}`, {
      replace: true,
    });
  }, [navigate]);

  return <RouteLoading />;
}

function Router() {
  const [pathname, navigate] = useLocation();
  const isAnalytics =
    pathname === "/analytics" || pathname.startsWith("/analytics/");

  const routeContent = isAnalytics ? (
    pathname === "/analytics/index.html" ? (
      <LegacyAnalyticsRedirect />
    ) : (
      <Suspense fallback={<RouteLoading />}>
        <AnalyticsRoute />
      </Suspense>
    )
  ) : (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={SupervisorRoute} />
        <Route path="/interactions/:engagementId/:mode" component={SupervisorRoute} />
        <Route path="/queue/:engagementId/:mode" component={SupervisorRoute} />
        <Route path="/active-call/:agentId" component={SupervisorRoute} />
        <Route path="/active-messages" component={SupervisorRoute} />
        <Route path="/active-messages/:engagementId" component={SupervisorRoute} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );

  return (
    <ThemeProvider theme={suiLight} scope="supervisor-shell" className="contents">
      <SupervisorShell
        activeArea={isAnalytics ? "analytics" : "agent"}
        onNavigate={(path) => {
          startTransition(() => {
            navigate(path);
          });
        }}
        header={<SupervisorHeader />}
      >
        <RouteErrorBoundary
          key={`${isAnalytics ? "analytics" : "supervisor"}:${pathname}`}
          label={isAnalytics ? "Analytics" : "Supervisor"}
        >
          {routeContent}
        </RouteErrorBoundary>
      </SupervisorShell>
    </ThemeProvider>
  );
}

function App() {
  return <Router />;
}

export default App;
