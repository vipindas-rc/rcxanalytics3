---
name: Analytics isolation
description: Architectural reasons for native integration, runtime isolation, and source portability.
---

# Analytics isolation

Native integration and source portability are both requirements. Analytics must remain independently runnable and testable, rather than becoming usable only inside Supervisor.

**Why:** Native interaction superseded the original iframe approach, but the user explicitly retained the source application and harness as independently verifiable deliverables.

**How to apply:** Evaluate host and standalone startup contracts separately when changing dependencies, styles, routing, or API configuration.

Keep runtime and style boundaries even without an iframe; avoid upgrading the legacy Supervisor runtime merely to accommodate Analytics.

**Why:** The native integration was chosen to remove iframe friction, not to force a broader Supervisor rewrite or load unrelated feature engines on every visit.

**How to apply:** Preserve compatible shared infrastructure while isolating feature-specific loading and styling. Test actual valid output in both contexts, not merely before/after equality.