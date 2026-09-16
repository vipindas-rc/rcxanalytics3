---
name: Cartographer Tailwind config
description: Replit cartographer imports the root Tailwind config in the browser for element inspection.
---

The root Tailwind config must remain browser-safe because Replit cartographer dynamically imports it when the element picker starts. Keep Node-only Tailwind plugins in a separate build config referenced by PostCSS.

**Why:** Static plugin imports caused cartographer's browser config request to fail with a 504 and made the preview runtime overlay report a false application crash when selecting an element.

**How to apply:** When adding Tailwind plugins to Supervisor, update the build-only wrapper rather than adding imports to the root config. Verify the root config is reachable through the Vite `/@fs/` path.