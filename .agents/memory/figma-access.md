---
name: Figma design access
description: How to fetch Figma frames for design-matching work in this workspace
---

No Figma connector exists on Replit. The workspace has a `FIGMA_ACCESS_TOKEN` secret (user-provided personal access token).

**How to apply:** To render a frame from a Figma URL like `.../design/<fileKey>/<name>?node-id=30-1169`, call
`curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" "https://api.figma.com/v1/images/<fileKey>?ids=30-1169&format=png&scale=2"`
then download the returned S3 URL. Node id in the URL uses `-`; the API response keys use `:`.

**Why:** Figma share links require login, so external screenshots fail; the REST images endpoint is the reliable path.
