---
name: Analytics record navigation
description: Preventing transient missing-record states when Analytics creates and opens sessions.
---

When Analytics creates a session and immediately opens its canonical URL, refresh the workspace data before navigating to that new record.

**Why:** Route validation runs against the currently loaded workspace. Navigating first makes a valid newly created session look missing until the follow-up refresh completes, which produces a misleading stale-link banner.

**How to apply:** For create-then-open flows, persist the record, refresh the authoritative collection, then update the route. Keep transient source/conversation state separate when replacing an existing panel conversation.