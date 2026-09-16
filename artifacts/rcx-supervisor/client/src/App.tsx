import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { ThemeProvider, suiLight } from "@ringcentral/spring-theme";
import NotFound from "@/pages/not-found";
import { SupervisorHeader, SupervisorShell } from "@/components/shell/SupervisorShell";

const AnalyticsRoute = lazy(() => import("@/routes/AnalyticsRoute"));
const SupervisorRoute = lazy(() => import("@/routes/SupervisorRoute"));

function RouteLoading() {
  return <div className="flex h-screen items-center justify-center">Loading…</div>;
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
        onNavigate={(path) => navigate(path)}
        header={<SupervisorHeader />}
      >
        {routeContent}
      </SupervisorShell>
    </ThemeProvider>
  );
}

function App() {
  return <Router />;
}

export default App;
