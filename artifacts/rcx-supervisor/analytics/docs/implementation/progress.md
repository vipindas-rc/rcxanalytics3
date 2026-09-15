# Implementation progress
- Context handoff saved in Notion: https://app.notion.com/p/3d934de61dc680a1b3d2f8b83281ffee
- Existing workspace backed up in server/data/backups/workspace-before-inline-20260912.json.
- Shape of AI Initial CTA reference read from the user-selected Chrome tab.
- Shared v2 contracts: src/lib/model.ts. Root owns UI/theme/rendering; agents own backend, data/adapters, tests independently.
- Replaced the split form and permanent chart panel with the Spring-based conversational workspace: collapsible navigation, search, projects, saved charts, dashboards, a centered welcome composer, and inline report widgets.
- Added versioned local workspace persistence, immutable chart/dataset artifacts, atomic writes, request recovery, dashboard revision checks, and a bounded persistent cache of validated model interpretations.
- Added Flint-backed adapters for bar, line, grouped/stacked bar, scatter, pie/donut, funnel, population pyramid, combo, KPI, and table views. Unsupported renderer/chart pairs are disabled with a tooltip, with render fallback where another compatible renderer exists.
- Fixed loading lifecycle regressions: each active action owns its neutral fill, labels remain stable, renderer changes do not block the composer, and charts only complete after their renderer mounts.
- Removed the redundant icon rail; the full sidebar is now the only navigation. Renderer selection is a compact accessible segmented control, and dashboard widgets flow into an adaptive grid as charts are added.
- Empty filter arrays are accepted by the render endpoint. Synthetic follow-ups that need unavailable fields now create a relevant fictional dataset and chart instead of asking the user to restore or provide data.
- Verified a real Codex request and same-dataset follow-up locally. The live donut rendered in ECharts, Chart.js, and Plotly without another inference request.

## Verification

- `npm test`: 19 tests passed.
- `npm run test:e2e`: 8 Playwright tests passed at 375, 768, 1024, and 1440 px.
- `npm run build`: passed.
- `npm run lint`: completed with existing React-hook/fast-refresh warnings; no lint errors.
- Live verification: a grouped closure-count request returned an inline synthetic chart with 959 generated closures; an empty-filter ECharts render returned HTTP 200.

## Persistent reporting — 14 September 2026

- Added local PostgreSQL migrations, pooled access, deterministic operational generation, immutable batches/revisions, and a protected test-database contract. Docker Compose remains available; this Mac currently uses a loopback-only Homebrew PostgreSQL fallback because its container runtime cannot verify the registry certificate.
- Agent Activity is the first evidence-backed report: opening it generates only missing coverage, reuses committed records, returns an Agent Activity table, supports AI-versus-human counts, and persists the immutable revision/evidence reference with the workspace artifact.
- The report query endpoint supports typed `agentType` filters, stable server pagination and activity/count/comparison intents. Empty results remain valid empty results; numeric filters are numerical; renderer compilation accepts already grouped database rows without aggregating them again.
- Legacy JSON workspace snapshots remain readable and unchanged. PostgreSQL holds operational records and immutable query revisions; it does not replace the workspace store.

### Coverage status

| Catalog area | Status | Evidence |
| --- | --- | --- |
| Agent Activity | verified first vertical slice | PostgreSQL generator, immutable revision, direct report query, evidence-backed conversation and integration suite |
| Agent states, dispositions and scorecards | planned | Registry/generator/query not yet implemented |
| Queues, inbound and contact-center dashboards | planned | Registry/generator/query not yet implemented |
| Workflow and outbound | planned | Registry/generator/query not yet implemented |
| Customer, billing and remaining dashboards | planned | Registry/generator/query not yet implemented |

The catalog is therefore not fully covered yet; unsupported entries must remain explicitly unavailable rather than presenting fixture data as evidence.
