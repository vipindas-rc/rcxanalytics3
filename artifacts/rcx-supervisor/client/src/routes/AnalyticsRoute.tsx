import { type ComponentType, type ReactNode } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, suiLight } from "@ringcentral/spring-theme";
import { lazyRoute } from "@/lib/lazyRoute";

// This is a lazy route stylesheet, not a second entry point. Its selectors are
// scoped by the Analytics CSS owner to .analytics-app/.analytics-portal.
import "../../../analytics/src/index.css";

// import.meta.glob keeps Analytics outside the legacy host TypeScript program
// while still giving Vite a statically analyzable lazy chunk. Analytics keeps
// its own project references/harness type-checking contract.
const analyticsModules = import.meta.glob<{
  default: ComponentType;
}>("../../../analytics/src/App.tsx");
const analyticsRouteModules = import.meta.glob<{
  AnalyticsRouteProvider: ComponentType<{
    value: {
      pathname: string;
      search: string;
      navigate: (href: string, options?: { replace?: boolean }) => void;
    };
    children?: ReactNode;
  }>;
}>("../../../analytics/src/ui/hooks/analyticsRouteState.ts");
const loadAnalyticsApp = analyticsModules["../../../analytics/src/App.tsx"];
const loadAnalyticsRouteState =
  analyticsRouteModules[
    "../../../analytics/src/ui/hooks/analyticsRouteState.ts"
  ];
const AnalyticsApp = lazyRoute("analytics-app", async () => {
  if (!loadAnalyticsApp || !loadAnalyticsRouteState) {
    throw new Error("Native Analytics route modules are unavailable from the host build.");
  }
  const [{ default: NativeAnalyticsApp }, { AnalyticsRouteProvider }] =
    await Promise.all([loadAnalyticsApp(), loadAnalyticsRouteState()]);

  function RouterBoundAnalytics() {
    const location = useLocation();
    const routerNavigate = useNavigate();
    return (
      <AnalyticsRouteProvider
        value={{
          pathname: location.pathname,
          search: location.search,
          navigate: (href, options) =>
            routerNavigate(href, { replace: options?.replace }),
        }}
      >
        <NativeAnalyticsApp />
      </AnalyticsRouteProvider>
    );
  }
  return { default: RouterBoundAnalytics };
});

export default function AnalyticsRoute() {
  return (
    <BrowserRouter>
      <ThemeProvider theme={suiLight} scope="analytics-native" className="contents">
        <section className="analytics-portal min-w-0 flex-1 overflow-hidden">
          <AnalyticsApp />
        </section>
      </ThemeProvider>
    </BrowserRouter>
  );
}