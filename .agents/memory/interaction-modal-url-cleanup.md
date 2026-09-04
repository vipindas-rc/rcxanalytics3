---
name: Interaction modal URL cleanup
description: Rules for safely normalizing interaction-scoped modal deep links without browser-history loops.
---

Invalid interaction-scoped modal targets must replace the complete invalid preview route with the owning table route and clear all modal parameters. Malformed optional modal state, such as a saved drag position, must remove only that optional parameter and keep the valid modal open.

**Why:** Clearing only modal query parameters can leave an invalid preview path that browser Back repeatedly revisits. Clearing the entire modal for one bad optional value unnecessarily destroys otherwise valid deep-linked state.

**How to apply:** Use history replacement for invalid targets and stale required identifiers. For malformed optional parameters, reset the local default and replace only the malformed parameter.