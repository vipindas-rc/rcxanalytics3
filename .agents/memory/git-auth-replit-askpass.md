---
name: Git authentication on Replit
description: Reliable fallback when Replit's Git askpass hook rejects otherwise valid GitHub CLI credentials.
---

If GitHub CLI API access succeeds but ordinary HTTPS Git operations still report an invalid username or token, treat Replit's injected `GIT_ASKPASS` hook as a likely override. Prefer a dedicated workspace SSH key and an SSH remote after the user approves adding the public key to their GitHub account.

**Why:** The CLI credential helper can authenticate correctly while the injected askpass path still supplies stale HTTPS credentials, causing repeated authentication failures.

**How to apply:** Confirm `gh auth status`, test HTTPS once with `GIT_ASKPASS=` to isolate the hook, then request consent before registering a workspace public key or changing the remote. Never expose the private key.