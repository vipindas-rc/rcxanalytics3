---
name: Analytics capability contracts
description: Rules for keeping report catalog content, persisted definitions, and generated Analytics output aligned.
---

Selected report content is the authoritative analytical contract. The orchestrator should route operational reports to their registered query, and route synthetic or preview content through the typed definition/data-preparation service. It should not reconstruct a catalog metric from the report title or silently substitute a neighboring metric.

**Why:** Catalog reports can share broad categories while requiring different metrics and groupings. Title-based fallbacks produced valid-looking but incorrect content and allowed immutable synthetic metadata to drift from the catalog.

**How to apply:** Every selectable content must produce unique dimension/measure identities, a typed definition, and a verified output containing the requested grouping and metric. Include definition version and generated recipe configuration/version in derived persisted dataset identities so corrected contracts can coexist with older immutable revisions.

Generated generic recipes must derive a stable version from immutable inputs, including definition version and entity count, when callers do not provide an explicit version. Explicit versions remain immutable and must not be silently rewritten.

**Why:** Catalog requests can produce different entity counts while sharing a domain and definition. Reusing a default recipe version or dataset identity either raises an immutable-metadata conflict or serves rows generated for the wrong shape.

**How to apply:** In the generic synthetic preparation path, fingerprint the generator, definition version, and recipe configuration for the fallback recipe version, and include that version in the generated dataset identity. Bump explicit versions when intentionally changing their metadata.