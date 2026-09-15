# RCX Analytics — conversational workspace implementation plan

Status: implementation specification; application changes have not been made by this document update.

Updated: 12 September 2026. This document consolidates the revised plan and the user's latest screenshot/video references. Where visual choices differ from earlier chat plans, this document takes precedence.

## 1. Goal and constraints

Build a clean Spring-based conversational analytics workspace. Assistant answers contain explanatory text and bounded chart, KPI, table, or report widgets. Remove the permanent right-hand analysis panel.

- Use Spring components, icons, typography, and theme tokens throughout the application and charts. Use UI/UX Pro Max for hierarchy, accessibility, and interaction guidance; Spring remains the visual source.
- Keep all analytics data synthetic and seeded locally. Preserve values through follow-ups, renderer switches, styling updates, and historical reopening.
- Retain the existing Codex integration and localhost operation. No separate API key change is planned. Do not claim that the current model is the cheapest without a separate current comparison.
- No real-data connectors, uploads, sharing, scheduling, subscriptions, deployment, or production MCP infrastructure. Exports remain playground functionality.
- Preserve the existing lockfile and dependencies unless a demonstrated compatibility issue requires a change. No commits or remote Git operations are implied.
- Preserve unrelated workspace changes and existing stored data.

## 2. Visual references and interpretation

Primary references supplied by the user:

- Empty view: `/Users/vipindas.s/Desktop/Screenshot 2026-09-12 at 2.20.42 PM.png`.
- Report answer: `/Users/vipindas.s/Desktop/Screenshot 2026-09-12 at 2.20.39 PM.png`.
- Interaction reference: `/Users/vipindas.s/Library/Application Support/CleanShot/media/media_SK7btSB2kJ/CleanShot 2026-09-12 at 14.19.03.mp4` (approximately 15 seconds).

The screenshots show a narrow application rail, secondary conversation sidebar, compact header, generous whitespace, centered welcome composer, vertically stacked starter actions, and an inline report containing KPIs above a chart. Follow-up suggestions sit below the report. The video shows the transition from welcome to conversation, reserved report skeletons, chart reveal, and a bottom follow-up composer.

Adopt that layout rhythm and answer composition. Translate the styling into Spring light tokens. Use RCX Analytics naming, not Operator/Fin branding. The supplied purple outer backdrop is presentation framing, not application chrome; the local application fills its viewport. Use Spring's font stack rather than copying the serif greeting, Spring focus styling rather than gradient borders, and Spring semantic/chart colors rather than copying the orange bars.

Reference features do not authorize adding scheduling, attachments, or knowledge management. Do not copy a "Thought" disclosure: display actual processing status such as "Preparing synthetic data" without fabricated reasoning or internal model traces.

## 3. Execution sequence and review gates

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 0 | Context preservation and baseline | New Notion handoff verified; local JSON backed up; current checks and screenshots recorded |
| 1 | Spring shell, composer, report widgets, and button states with development fixtures | Reference-based desktop/mobile visual checks pass before integrating the full backend |
| 2 | Typed datasets, adapters, theme, and renderer lifecycle | Data meaning, chart geometry, category retention, and loading completion verified |
| 3 | Persistent request/session flow and real Codex integration | Follow-ups, retries, restart, caching, and concurrent sessions verified |
| 4 | Projects, saved artifacts, and dashboards | All management and filtering flows work through controls and conversation |
| 5 | Integrated review and handoff | Automated checks, live smoke test, and visual acceptance completed |

Stage 1 fixtures are test/development inputs only, never silent replacements for model answers in the normal app. Each gate is an implementation self-review with evidence, not a repeated permission request.

## 4. Baseline and known failures

Current application: `/Users/vipindas.s/Documents/ChatGPT/Explore-Analytics/flint-chart-lab`. Development frontend: `http://127.0.0.1:5173`; backend: localhost port 5174.

Confirmed during the preceding review:

- Loading fill is hardcoded to 64%; custom CSS overrides Spring's loading-indicator positioning.
- Population-pyramid templates can silently display only the first two groups.
- ECharts donut geometry needs an explicit inner radius.
- The one-measure recipe cannot represent proper numeric X/Y scatter values.
- Renderer switching mutates stored chart artifacts.
- Whole-workspace read-modify-write operations can overwrite concurrent changes.
- Basic project/dashboard records exist, but the full management UI and dashboard rendering are incomplete.
- Thirteen tests, lint, and TypeScript checks passed. The current TypeScript configuration already includes backend files. Some tests preserve undesirable behavior, including pyramid-to-bar substitution; passing them is insufficient acceptance evidence.

Before edits, inspect applicable repository instructions, local changes, manifests, and listener ownership. Back up existing storage. Do not restart an unrelated process or reset the checkout.

Create a new Notion page under the existing RCX Analytics working notes titled "RCX Analytics concept — context handoff and UI reset — 12 Sep 2026". Include this plan, current facts, user decisions, incomplete work, source links, and verification limits. Do not overwrite the working notes or represent unresolved production scope as settled. Page creation was pending at the time this document was written; verify the resulting page and return its actual link when saved.

## 5. Reference-based application shell

### Desktop and responsive structure

- At widths of 1100px and above, use a 48px application rail, a 256px secondary sidebar, and a flexible main surface.
- The rail contains working destinations only: Conversations, Projects, Saved charts, and Dashboards. Selecting a destination updates the secondary list and central view. Give every icon a Spring tooltip and accessible label. Use a small RCX text mark at the top; no decorative imitation logo.
- Between 900px and 1099px, omit the rail and keep the sidebar; expose the four destinations in a Spring menu in the sidebar header.
- Below 900px, move navigation into a Spring drawer opened from the header. Close it after selection and restore focus correctly. No navigation becomes unreachable.
- Use a 64px main header with current conversation/object title and contextual menu. Truncate long titles without pushing controls out of view.
- Use a 720px maximum width for the welcome composer, an 820px conversation/report column, and a 960px maximum width for multi-widget dashboard views.
- Use 24px desktop and 16px mobile horizontal gutters. Keep explanatory prose near 70 characters per line. White space comes from alignment and margins, not fixed blank-height sections.
- Use a full-height shell with independently scrolling navigation and messages. Keep the composer outside the message scroller. Do not let the page and conversation compete as nested vertical scrollers.

### Sidebar and object views

- Conversation sidebar order: New session, Search, Recent conversations grouped by Today / Previous 7 days / Older, then Projects.
- Recent conversations include project chats and sort by last activity. Use one-line ellipsis and a quiet selected-row background. Do not add fake status icons to all rows.
- Projects expand to conversations, saved charts, and dashboards. Destination views provide the same content with full names and object actions.
- Search opens a Spring search dialog matching titles and message text. Results include an excerpt and project context. Selection opens the conversation and scrolls to its matching turn.
- Support session rename/delete and project create/rename/move with Spring dialogs and menus. No native browser prompts.

### Empty view and composer

- One restrained Spring headline: "What would you like to understand?" Do not invent a user's name for a personalized greeting.
- Place a wide rounded composer below the headline, centered as a group in the available main area. On short screens, use normal top spacing and allow scrolling instead of forcing vertical centering.
- Put the text area across the full composer width with controls on a bottom row. Avoid the current narrow text box beside a detached send button.
- Show a labeled Spring Send action in the bottom-right corner, with enough reserved width for "Working…" and a neutral progress fill. Use an appropriate Spring send icon through the documented slot API, not a refresh symbol.
- Do not include an inactive attachment plus icon. The bottom-left area holds explicit chart/dashboard context when selected.
- Below the welcome composer, show three stacked, quiet Spring starter rows with an icon, short title, and one-line explanation: Weekly performance, Compare queues, and Explore channel mix. Choosing one fills the composer for review; it does not immediately spend a model request.
- After sending, remove welcome starter rows and place the composer beneath the scrolling conversation. Placeholder becomes "Ask a follow-up…".
- Enter sends; Shift+Enter inserts a newline; respect IME composition. Grow the text area to six lines before internal scrolling. Preserve drafts per session while navigating.
- Persist a new session on first submission rather than creating empty records whenever New session is clicked.

## 6. Conversation and inline reports

### Answer hierarchy

1. The user's submitted question appears immediately in a compact, neutral bubble aligned to the right.
2. Actual processing status appears inline while awaiting the answer.
3. Assistant explanation uses plain text on the conversation surface.
4. A bounded report widget contains related KPIs and charts when the question calls for a summary.
5. Two or three relevant follow-up actions appear below a successful answer when useful.

Not every answer needs a report, and not every report needs three KPIs. Support text-only answers, clarification choices, standalone charts, KPI/table widgets, and compound reports. Avoid wrapping every sentence in a card or duplicating the same title inside and outside the chart.

### Report/widget anatomy

- Header: one title, a subdued synthetic-data label, and an overflow menu.
- Optional KPI row: up to three values per row on desktop; stack on narrow mobile screens. Each KPI has a descriptive label, formatted value/unit, and comparison only when both periods/baselines exist.
- Comparison labels distinguish percentage points from relative percent changes and specify the comparison period. Green/red indicate better/worse only if the metric's direction is defined; otherwise use a neutral change indicator. Never rely on color alone.
- Chart region: 360px standard desktop height and 280px mobile height, with dedicated responsive renderer hosts. Report height grows naturally around content.
- Compact renderer choices below the chart, with disabled explanations for unsupported combinations. Keep secondary controls quieter than the data.
- Collapsed data inspection with a Spring table, pagination, and total row count.
- Overflow actions: expand, export data/spec, save to project, add to dashboard, and Ask about this chart/report.
- Keep all controls within the widget. Clip only the chart viewport where needed; do not clip menus and tooltips. For long legends/tables, provide their own contained scrolling. Never solve overflow by hiding requested categories.
- An expanded widget opens in a Spring dialog. No permanent analysis panel returns at any breakpoint.

### Follow-ups and context

- Render suggestions as simple rows under a "Follow-up" label, like the reference. They use actual available fields and supported operations, without claiming nonexistent real-data access.
- Selecting a suggestion fills the composer and attaches the originating artifact/report context; sending remains explicit.
- "Ask about this chart" also sets a context chip with a clear action. In compound reports, individual chart actions target that chart; a report action targets the report's dataset/artifact collection.
- Without explicit context, use the latest successful artifact/report in the session. Clarify if the request could refer to multiple datasets. Inspecting a table or changing renderers must not change conversational context implicitly.
- Historical answers retain their exact semantic artifacts. New analyses never replace older answer cards.
- Auto-scroll only when the user is already near the end; otherwise preserve their reading position and offer a New response control.

### Progressive reveal

- Reserve space for a neutral report skeleton once the response structure is known. Before then, show a compact processing line rather than inventing three KPI placeholders for every query.
- Replace skeletons with validated KPI values and render-ready charts. Use brief Spring-compatible opacity transitions and standard chart animation only when reduced motion is off.
- Do not animate numbers through fabricated intermediate values or display arbitrary simulated thoughts. Numerically specific prose appears only after local calculations are available.
- Keep initial, loading, partial success, complete, and error layouts stable. A chart failure stays inside its report and does not remove already valid KPI/text content.

## 7. Spring implementation contract

- Use Spring light theme and its documented font stack/assets. Use only Spring color, typography, border, radius, spacing, and elevation tokens where provided. Structural grid dimensions and breakpoints are layout values, not a substitute visual system.
- Use installed Spring Button, IconButton, Icon, Textarea/TextField, Tooltip, Menu, Dialog, Drawer, list, and table primitives as supported by their actual APIs.
- Pass Spring icon symbols through supported component slots or the Icon wrapper; remove broad SVG sizing rules. Renderer controls use text names, not invented brand icons.
- Use semantic HTML for document/layout structure, styled with Spring tokens. Never replace a native semantic element merely to claim all markup is a library component.
- Keep custom CSS limited to application layout and the requested progress-fill layer. Do not override loading-slot positioning or apply a generic progress cursor to all disabled controls.
- Verify the Spring components used under installed React 19 before expanding the shell. Retain versions unless a reproducible incompatibility requires a specific change.
- UI/UX Pro Max's previous automatic recommendation leaned toward a marketing page; its unrelated palette, fonts, and hero recommendations are not this design direction.

## 8. Data and AI pipeline

Pipeline: user request → validated model intent → local seeded data/transformations → calculated facts → template-specific adapter → Flint compilation → Spring chart theme → renderer.

- Codex interprets requests and supplies structured recipes/operations. Flint compiles chart specifications; it does not interpret chat.
- Replace the single numeric measure with typed fields: stable ID, display label, category/date/numeric type, unit/precision, seeded generator parameters, and declarative derived relationships.
- Support multiple numeric fields, ordered date values, categorical identities, current/comparison periods, and explicit metric aggregation definitions.
- New topics and explicit regeneration create dataset revisions. Presentation changes reuse the dataset. Filter/group/sort operations create views over unchanged source rows.
- Preserve category names and source values through follow-ups. Build numeric summaries from local facts; AI prose may not introduce unsupported numbers or causation.
- Execute declarative validated operations only, never model-written JavaScript or SQL. Counts sum; average/ratio calculations retain their actual numerator/denominator or weighting definition. Do not sum percentages or invent missing weights.
- Generate comparison data when a request explicitly calls for a comparison. If an existing dataset cannot answer a follow-up without new fields/values, explain and clarify rather than silently replacing it.
- Keep synthetic provenance on widgets and exports. No live-data claims.

## 9. Capability registry and chart adapters

One registry owns aliases, data requirements, Flint templates/encodings, renderer support, and failure explanations. Availability depends on the chart intent and dataset, not only on a template name appearing in a package.

Initial verified representations:

| Chart/widget | Requirements |
| --- | --- |
| Bar, grouped bar, stacked bar | Category, numeric measure, optional series |
| Line | Ordered category/date, numeric measure, optional series |
| Scatter | Two numeric fields, optional category |
| Pie/donut | Category, nonnegative values, positive total |
| Funnel | Ordered stages and nonnegative values |
| Population pyramid | Category, numeric measure, exactly two explicit comparison groups |
| Bar-and-line report chart | Shared categorical axis and two explicit numeric measures with labeled units |
| KPI/table | Local calculations presented with Spring |

- Add the reference's bar-and-line combination to adapter verification. Prefer a matching installed Flint composition/template. Otherwise compile the constituent bar and line specifications through Flint and combine them in a renderer-specific adapter with explicit axis assignment. Enable a renderer only after verifying that composition. If no renderer supports it correctly, explain and offer two aligned charts instead of silently changing the representation.
- In dual-axis charts, label both units and retain the declared scale semantics. Do not add dual axes when one common scale suffices. Show a legend for each measure.
- Normalize common aliases, including donut/doughnut. Explicitly set ECharts donut inner radius.
- Clarify ambiguous pyramid requests as funnel-shaped versus population pyramid. Never truncate five groups to two or invent a mirrored comparison from one group.
- Remove silent bar substitutions. Preserve a chosen renderer when compatible; fallback order is ECharts, Chart.js, Plotly, skipping attempted engines. Try each compatible candidate once and explain fallback.
- If none is compatible, keep the answer and display a clear reason plus supported alternatives. Verify additional installed templates through this contract before advertising them.
- Renderer switching uses deterministic local compilation, not another model call.

## 10. Chart styling and render lifecycle

- Resolve one Spring chart theme with concrete palette/font values and a theme version. Apply it to series, axes, labels, legends, titles, tooltips, grids, and backgrounds.
- Persist category-to-color assignments with dataset identity so sorting/filtering/switching retains colors. When colors repeat, use labels and supported line/marker distinctions.
- Export the effective styled specification with synthetic provenance. Theme refresh recompiles presentation without regenerating rows.
- Give each chart its own host and ResizeObserver. Remove template dimensions that conflict with the host. Clean up observers, renderer instances, callbacks, and asynchronous effects on unmount.
- Lazy-load renderer libraries and mount off-screen historical charts on demand with reserved height. Long histories must not eagerly mount every chart.
- Handle ECharts render completion, Chart.js render lifecycle, and Plotly promise resolution/errors explicitly. Generation ends only after the newly visible result renders successfully; text-only/clarification answers complete when displayed. For a report, wait for its visible chart widgets to finish or report failures, not off-screen historical widgets.
- Separate server request completion from client display completion. A widget-local boundary catches errors without taking down the answer or session.

### Button progress

- Per-action states: understanding → preparing → rendering → complete, with an error exit at each step. Track session, request, widget, and target renderer independently.
- Replace hardcoded 64% with gradually advancing estimated fill capped at 92% until render success. Show no percentage. Use a contrasting Spring neutral track/fill and readable text above both.
- Reserve label/icon space so width and height stay stable. Keep active loading opacity at full strength. For mobile composer actions, retain a labeled button with stable width rather than hiding progress in a tiny icon.
- Animate the dedicated fill with a transform; keep Spring's loading-indicator slot intact. Reduced motion uses static partial fill and a static Spring icon/loading label.
- Renderer switching shows loading on the requested target, retains the old chart until replacement succeeds, and resets on failure. Unavailable renderers retain a not-allowed cursor and explanatory tooltip.
- Prevent duplicate actions, preserve unrelated navigation, clear timers on completion/error/unmount, and apply the same renderer lifecycle to cached results without artificial minimum delays.

## 11. Persistent state and APIs

Use shared runtime-validated contracts (existing Zod) and split the large application/server modules into focused conversation, widget, renderer, persistence, and inference responsibilities.

Persist versioned sessions, messages, request attempts, dataset revisions, immutable artifacts/reports, projects, saved-chart references, and dashboard revisions.

- Semantic edits produce new artifacts. Renderer switching creates a cached presentation for the same artifact; selected renderer is a separate view preference. Styling changes update presentation version only.
- Reports reference ordered KPI/chart/table artifacts rather than baking their live UI state into message text.
- Conversation requests carry session ID, idempotency/request ID, user message, artifact/report/dashboard context, and renderer preference.
- Assistant responses contain validated text, clarification choices, artifact/report references, or dashboard operations. Suggestion text includes its explicit context reference.
- Persist submitted messages/request records before inference. Perform inference outside storage transactions, then merge its result into current state.
- Use request-status polling while pending; token streaming is not required. Poll only pending requests and stop when complete/failed/unmounted.
- Allow one inference request per session, concurrent requests across sessions. Repeated delivery of a request ID must not duplicate messages or model calls. Retry reuses the user turn with a new attempt.
- Navigation never redirects an answer into the current unrelated session. Server restart marks interrupted requests retryable; it does not silently rerun them. Restore relevant conversation context after restart.
- Preserve user-renamed titles. Keep chart inspection/renderer preferences separate from conversational intent.
- Provide deterministic renderer-compilation and CRUD endpoints for sessions, projects, saved artifacts, dashboards, and widget operations. Use revision-aware updates for competing edits and return actionable errors.

### Storage and cache

- Migrate existing JSON to version 2 after making a backup; preserve existing rows and artifacts. Use atomic replacement plus serialized read-modify-write transactions.
- Treat malformed storage as a recovery error; never overwrite it with an empty workspace. Backend storage is authoritative; browser preferences/drafts must not duplicate the full workspace.
- AI cache keys include session, relevant context, dataset revision, normalized request, and interpretation version. Compilation cache keys include artifact, renderer, adapter version, and theme version.
- Explicit regeneration bypasses cached data generation. Cache validated success only. Invalidate incompatible legacy entries.
- Keep authentication server-side, inference in the existing isolated directory, localhost binding, and current SDK/model configuration. Verify installed SDK tool restrictions instead of claiming that a prompt alone enforces no tool execution.

## 12. Projects, saved charts, and dashboards

- Projects organize chats, saved charts/reports, and named dashboards; they do not implicitly share dataset values between chats.
- Saved artifacts and dashboard references survive deletion of their source conversation. Use a Spring confirmation for conversation deletion; preserve externally referenced artifacts.
- Dashboard creation uses the current project or existing Analytics project. Widgets have stable IDs, titles, artifact references, and order.
- Support add/remove/rename/reorder/reconfigure through controls and contextual conversation. Move-up/down controls provide a keyboard-accessible ordering method; drag-and-drop is not required.
- A dashboard opens in the main workspace with its composer context available. Conversational dashboard results remain inline in answers; no right-hand panel.
- Desktop dashboards use up to two columns, mobile one. Reports may span the width, with their internal KPI/chart structure preserved.
- Dashboard edits create revisions. Historical answers show their referenced revision; opening from a project shows the latest. Reconfiguration creates a new artifact/revision without changing the source chart answer.
- Filters apply by compatible field identity/type and semantics, not merely matching labels. Show unaffected widgets and the reason. Preserve original source values beneath all filters.
- Clarify ambiguous targets such as "remove that one" rather than guessing.

## 13. Verification and acceptance

### Data, API, and persistence tests

- Twelve months × five regions retains all 60 rows across rendering, follow-ups, exports, and restart.
- Donuts have an actual hole with correct category totals across three renderers; scatter axes contain genuine numeric fields.
- Pyramid ambiguity produces clarification; explicit population pyramid preserves its two groups; five-group requests never silently lose categories.
- Compound reports derive every KPI, delta, and chart measure from the same declared dataset/view or explicitly identified compatible datasets. Percent versus percentage-point labels are correct.
- Bar/line combinations preserve numeric values, category alignment, units, axes, legend semantics, and category/series colors across supported renderers.
- Filtering/grouping/sorting and chart changes retain source-row hashes. Test ratios, weighted averages, missing baselines, zero totals, empty results, and many/long categories.
- Test slow inference, malformed model output, authentication/usage failure, renderer rejection, partial report failure, caching, retry idempotency, and interrupted requests.
- Navigate between sessions during generation; verify destination isolation and retained drafts. Update projects while inference runs and confirm both writes survive.
- Restart with history, saved artifacts, preferences, dashboards, and cache present. Test migrations and malformed storage recovery without data loss.
- Dashboard filtering identifies compatible/unaffected widgets; history remains revision-stable after edits and source-chat deletion.

### Browser and visual review

Inspect 375px, 768px, 1024px, and 1440px widths, 200% zoom, reduced motion, and mobile keyboard behavior.

Compare against the supplied screenshots/video at these checkpoints:

1. Welcome: quiet navigation, restrained greeting, wide centered composer, three stacked suggestions.
2. Submission: immediate question, real status, composer transition, no layout jump.
3. Loading report: stable skeleton region, visible neutral button progress, no clipped indicators.
4. Completed report: KPI row above contained chart, one title, clear legend, compact secondary actions.
5. Follow-up: suggestion rows below the report, correct context chip, same underlying values.
6. Narrow view: working navigation drawer, stacked KPIs, contained charts/tables, accessible composer.

Reject the implementation for page-level horizontal overflow, disappearing navigation, clipping, chart/table/control overlap, inconsistent icon sizes, detached composer controls, or reappearance of a permanent side panel.

Verify keyboard use, visible focus, focus restoration, readable contrast, accessible chart names/table alternatives, stable button dimensions in every state, unavailable-renderer tooltips/cursors, expansion/resizing, and error recovery. Check actual pixels and interactions, not only CSS/class presence.

Run `npm test`, `npm run lint`, `npx tsc -b`, `npm run build`, and the implemented browser suite. Add an explicit browser-test script/configuration as part of its test setup. Replace tests that assert unwanted bar substitution with semantic-output/category-retention tests.

Perform one real Codex request and a follow-up with the existing login, separate from deterministic fixture-backed UI tests. Inspect listener ownership before startup; use `npm run dev` for the local app and verify a usable browser session.

Deliver the localhost app, verification screenshots/results, migration/restore instructions, and updated Notion handoff. State remaining limits without claiming unfinished functionality is complete.
