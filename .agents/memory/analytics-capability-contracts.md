---
name: Analytics capability contracts
description: Rules for keeping report catalog content, persisted definitions, and generated Analytics output aligned.
---

Selected report content is the authoritative analytical contract. The orchestrator should route operational reports to their registered query, and route synthetic or preview content through the typed definition/data-preparation service. It should not reconstruct a catalog metric from the report title or silently substitute a neighboring metric.

**Why:** Catalog reports can share broad categories while requiring different metrics and groupings. Title-based fallbacks produced valid-looking but incorrect content and allowed immutable synthetic metadata to drift from the catalog.

**How to apply:** Every selectable content must produce unique dimension/measure identities, a typed definition, and a verified output containing the requested grouping and metric. Include the definition version in any derived persisted dataset identity so a corrected contract can coexist with older immutable revisions.