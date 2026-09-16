import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import {
  SupervisorHeader,
  SupervisorShell,
} from "@/components/shell/SupervisorShell";

const AnalyticsRoute = lazy(() => import("@/routes/AnalyticsRoute"));
const SupervisorRoute = lazy(() => import("@/routes/SupervisorRoute"));

function RouteLoading({ activeArea }: { activeArea: "agent" | "analytics" }) {
  const destination = activeArea === "analytics" ? "/analytics" : "/";
  return (
    <SupervisorShell
      activeArea={activeArea}
      onNavigate={(path) => {
        window.history.pushState(null, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
      header={<SupervisorHeader />}
    >
      <section
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white"
        aria-label={`${activeArea === "analytics" ? "Analytics" : "Agent"} loading`}
      >
        <div className="flex h-full items-center justify-center">
          <div className="text-sm text-slate-500" aria-live="polite">
            Loading {destination === "/analytics" ? "Analytics" : "Agent"}…
          </div>
        </div>
      </section>
    </SupervisorShell>
  );
}

function LegacyAnalyticsRedirect() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(`/analytics${window.location.search}${window.location.hash}`, {
      replace: true,
    });
  }, [navigate]);

  return <RouteLoading activeArea="analytics" />;
}

function Router() {
  const [pathname] = useLocation();

  // The native branch is deliberately outside Switch: wouter continues to own
  // legacy routes while BrowserRouter owns Analytics descendants only.
  if (pathname === "/analytics" || pathname.startsWith("/analytics/")) {
    if (pathname === "/analytics/index.html") {
      return <LegacyAnalyticsRedirect />;
    }
    return (
      <Suspense fallback={<RouteLoading activeArea="analytics" />}>
        <AnalyticsRoute />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoading activeArea="agent" />}>
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
}

function App() {
  return <Router />;
}

export default App;
