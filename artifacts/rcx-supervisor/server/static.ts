import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Analytics is a native host route now. Reserve it before express.static so
  // no stale standalone bundle can shadow the SPA's lazy Analytics chunk.
  app.get("/analytics/index.html", (req, res) => {
    const queryAt = req.originalUrl.indexOf("?");
    const search = queryAt === -1 ? "" : req.originalUrl.slice(queryAt);
    res.redirect(302, `/analytics${search}`);
  });
  app.all("/analytics/assets/{*path}", (_req, res) => {
    res.status(410).json({
      code: "analytics_standalone_removed",
      message: "Analytics assets are delivered by the native Supervisor application.",
    });
  });
  app.get("/analytics", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
  app.get("/analytics/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
