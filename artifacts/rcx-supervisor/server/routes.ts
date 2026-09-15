import type { Express } from "express";
import { createServer, type Server } from "http";
import { spawn } from "child_process";
import path from "path";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Conversational Analytics is intentionally an isolated React 19/service
  // import. It stays on loopback; Supervisor exposes only this namespaced,
  // same-origin gateway.
  const analyticsRoot = path.resolve(process.cwd(), "analytics");
  const analyticsPort = process.env.ANALYTICS_PORT ?? "5174";
  const analytics = spawn(
    "pnpm",
    ["--filter", "@workspace/analytics-content", "exec", "tsx", "server/index.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: analyticsPort,
        AI_PROVIDER: "openai",
        RCX_DEMO_BOOTSTRAP: "true",
        ANALYTICS_TEST_MODEL: process.env.ANALYTICS_TEST_MODEL,
      },
      stdio: "inherit",
    },
  );
  analytics.once("error", (error) => {
    console.error("Analytics service did not start:", error.message);
  });
  process.once("SIGTERM", () => analytics.kill("SIGTERM"));
  process.once("SIGINT", () => analytics.kill("SIGINT"));

  app.all("/analytics-api/*path", async (req, res, next) => {
    try {
      const suffix = req.originalUrl.replace(/^\/analytics-api/, "/api");
      const body =
        req.method === "GET" || req.method === "HEAD" || req.body == null
          ? undefined
          : JSON.stringify(req.body);
      const upstream = await fetch(`http://127.0.0.1:${analyticsPort}${suffix}`, {
        method: req.method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body,
        signal: AbortSignal.timeout(125_000),
      });
      const responseBody = await upstream.arrayBuffer();
      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type");
      if (contentType) res.setHeader("content-type", contentType);
      res.send(Buffer.from(responseBody));
    } catch (error) {
      next(error);
    }
  });

  return httpServer;
}
