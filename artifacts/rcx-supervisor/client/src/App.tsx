import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import NotFound from "@/pages/not-found";

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
  const [pathname] = useLocation();

  // The native branch is deliberately outside Switch: wouter continues to own
  // legacy routes while BrowserRouter owns Analytics descendants only.
  if (pathname === "/analytics" || pathname.startsWith("/analytics/")) {
    if (pathname === "/analytics/index.html") {
      return <LegacyAnalyticsRedirect />;
    }
    return (
      <Suspense fallback={<RouteLoading />}>
        <AnalyticsRoute />
      </Suspense>
    );
  }

  return (
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
}

function App() {
  return <Router />;
}

export default App;
