# Analytics Spring color inventory

## Verified source

The installed host packages are `@ringcentral/spring-theme@1.11.1` and
`@ringcentral/spring-ui@1.11.1`. Token names below were verified in
`node_modules/@ringcentral/spring-theme/tailwind/themes/{light,dark}.js`.
They are deliberately referenced as CSS custom properties so Spring's active
theme supplies the value.

The UI/UX Pro Max pinned skill was reviewed for this scoped accessibility
work. Its applicable guidance was semantic color use, visible focus, reduced
motion, and not relying on chart color alone. No skill palette, theme, or
library was adopted.

## Editable UI mapping

| Original value / surface | Spring token | Rationale |
| --- | --- | --- |
| `#fff` tables, surfaces, availability control, dialog actions | `--sui-colors-neutral-base` | Spring base surface in every supported theme. |
| `#f7f8fa`, `#f9f9f9` table headers and rail | `--sui-colors-neutral-b5` | Low-emphasis neutral surface. |
| `#d9dce1`, `#e6e8eb`, `#e5e5e5` table and rail borders | `--sui-colors-neutral-b4` | Standard Spring divider/border. |
| `#24272b`, `#121212` headings, availability and rail text | `--sui-colors-neutral-b1` | Primary semantic foreground; follows dark/high-contrast themes. |
| `#066fac` active rail/header brand | `--sui-colors-primary-f` | Spring primary foreground/action token. |
| `#509ac4` header accent | `--sui-colors-extra-denim` | Verified Spring supplementary palette color; closest blue accent. |
| `rgba(0,0,0,.12)` header edge | `--sui-colors-neutral-static-b0-t10` | Closest installed neutral static divider transparency. |
| `rgba(255,255,255,.14)` header round controls/search | `--sui-colors-neutral-static-w0-t20` | Closest installed on-dark translucent surface. |
| `rgba(255,255,255,.48)` header search placeholder | `--sui-colors-cobranding-on-accent-t50` | Installed on-accent token preserves the original readable on-brand intent. |
| `#f80` notification badge | `--sui-colors-warning` | Spring warning state; the numeric badge still carries text. |
| literal white text in selected composer controls | `--sui-colors-neutral-base` | Spring on-primary surface text. |
| local `color-mix(...)` shadows/focus treatment | `--sui-box-shadow-xs`, `--sui-box-shadow-sm`, `--sui-box-shadow-xs-primary` | Verified Spring elevation/focus-adjacent semantic shadow tokens; no local alpha colors remain. |
| normal text, muted metadata, canvas, chips and dividers | `neutral-b1`, `neutral-b2`, `neutral-b4-t50`, `neutral-b5`, `neutral-b4` aliases | The Analytics root aliases only verified Spring neutral semantics. |
| primary selection/focus | `primary-f`, `primary-t10`, `primary-f-high-contrast` (Spring control defaults) | Maintains a visible semantic active and focus state. |
| error, warning, success, information-like briefing states | `danger-f`, `warning-f`, `success-f`, `primary-f` | Existing severity labels retain their semantic status mapping and text labels. |
| shared Supervisor app-bar avatar/control surfaces | `--sui-colors-neutral-base`, `--sui-colors-neutral-b5` | Base and hover surfaces follow the active Spring theme. |
| shared Supervisor app-bar on-blue text and masked SVG icons | `--sui-colors-neutral-static-w0`, `--sui-colors-neutral-static-w0-t10`, `--sui-colors-neutral-static-w0-t20` | Static on-accent foreground and translucent on-accent controls preserve contrast. |
| shared Supervisor active-call bar | `--sui-colors-extra-denim-high-contrast` | Verified supplementary blue semantic for the active-call state. |
| shared Supervisor active-call destructive controls and status | `--sui-colors-danger-f` | Verified destructive semantic; inline SVGs inherit `currentColor`. |
| shared Supervisor neutral action icons/text | `--sui-colors-neutral-b1` | Verified primary neutral foreground; fixed-color SVG sources are applied by `ShellIcon` masks. |

No editable Analytics CSS/TypeScript UI/chart or shared Supervisor app-bar
color literal (`#`, `rgb[a]`, or `hsl[a]`) remains after this audit.

## Chart mapping

Charts retain their stable `dataset.colors` index. `chartTheme.ts` maps those
indices, in order, to the verified Spring palette:

1. `--sui-colors-primary-f`
2. `--sui-colors-extra-amethyst`
3. `--sui-colors-extra-tiffany`
4. `--sui-colors-extra-olive`
5. `--sui-colors-extra-wildberry`

The chart adapters resolve these CSS variables to concrete computed values for
ECharts, Chart.js, and Plotly. Foreground, muted labels, grid, and surfaces
resolve respectively from `neutral-b1`, `neutral-b2`, `neutral-b4`, and
`neutral-base`. `RendererCanvas` observes the nearest Spring theme scope and
the injected Spring theme style, then re-creates only the affected lazy chart
when resolved values change. Excess series keep the existing dashed/alternate
marker treatment, so color is not the sole series cue.

## Native mounting and portal contract

The host must:

1. Import the Spring component stylesheet once at the host boundary and mount
   Analytics under `ThemeProvider` with a non-global scope. This gives the
   Analytics root a `data-sui-theme-scope` attribute and all verified tokens.
2. Give the native content slot a definite flex/grid height. `.analytics-app`
   is now `height: 100%; min-height: 0`, never viewport height.
3. Route Spring `Dialog`, menu, tooltip, drawer, and popper portals to a host
   container carrying `class="analytics-portal"` and the same
   `data-sui-theme-scope` attribute/value. Spring's `PortalProps` expose
   `container`; this prevents scoped overlay rules and tokens from escaping to
   Supervisor's document body.

Analytics CSS is enclosed in `@scope` roots `.analytics-app` and
`.analytics-portal`; CoreFrame's legacy demo CSS is separately scoped to
`.core-frame`. Animation names are `analytics-*` to avoid global keyframe
collisions. The Advisor panel and notice use absolute positioning within the
native Analytics content root so they remain below the Supervisor host header.

## Exceptions

There are no editable CSS, TypeScript UI/chart, or shared Supervisor app-bar
color exceptions. Shared header SVG icons are masked with `ShellIcon` or use
`currentColor`; the avatar remains a permitted raster photo. The unmounted,
standalone `CoreFrame` reference component retains legacy icon assets:
`agent.svg`, `apps.svg`, `chevron-down.svg`, `contacts.svg`, `engage.svg`,
`help.svg`, `message.svg`, `more.svg`, `phone.svg`, `presence.svg`,
`settings.svg`, and `video.svg` have baked legacy fills (`#121212`, `#666666`,
or `#3C9949`). They are not mounted by the native Supervisor shell. If that
reference component is ever shipped again, convert its icons to `currentColor`
before it becomes an editable product surface. `avatar.png` and `hero.png` are
raster content assets and cannot be tokenized.