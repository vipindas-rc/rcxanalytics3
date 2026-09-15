import type { Express } from "express";
import type { Server } from "http";
import { createAnalyticsLifecycle, type AnalyticsLifecycle } from "../analytics/server/lifecycle.ts";
import { initializeAnalyticsRuntime, SUPERVISOR_ANALYTICS_PROVIDER } from "../analytics/server/bootstrap.ts";

let analyticsLifecycle: AnalyticsLifecycle | undefined;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Keep Analytics' established `/api` handlers unchanged while exposing
  // them through Supervisor's externally-used `/analytics-api` gateway.
  // Initialization happens after the gateway is mounted, so Supervisor can
  // start normally and callers receive a bounded, explicit 503 meanwhile.
  analyticsLifecycle = createAnalyticsLifecycle({
    initialize: () => initializeAnalyticsRuntime({
      provider: SUPERVISOR_ANALYTICS_PROVIDER,
      demoBootstrap: true,
      deterministicTestModel: process.env.ANALYTICS_TEST_MODEL === "deterministic",
    }),
  });
  app.use("/analytics-api", analyticsLifecycle.middleware);
  void analyticsLifecycle.start().catch(() => {
    // Lifecycle logs a sanitized initialization failure. Keep the host alive
    // so its unrelated routes continue serving while Analytics returns 503.
  });

  return httpServer;
}

export async function shutdownRoutes() {
  await analyticsLifecycle?.close();
}
