# Categorise dialog parity

Validated against `attached_assets/image_1788428720753.png` and the vendored
`ringcx/ui` source.

## Ownership

- **Vendored:** generic Dialog (including backdrop, Escape handling, focus trap,
  close button, dialog semantics, and focus restoration), Autocomplete, Tag,
  Button, and their icons.
- **Local composition:** category taxonomy and grouping, selected-chip colors,
  field labels, conversation comment, persistence, and URL targeting.
- No purpose-built Categorise dialog exists in the vendored tree.

## Reference matrix

| Area | Result |
| --- | --- |
| Title and close affordance | Matches reference spelling, hierarchy, and vendored close control |
| Dialog/backdrop | Vendored dimensions, spacing, elevation, and 30% backdrop |
| Categories | Vendored grouped multi-select with dropdown, removable chips, and clear-all |
| Comment | Matching label and three-line text area; saved with the mock interaction |
| Primary action | Vendored contained primary Save button |
| Cancel behavior | Close, Escape, and backdrop discard the draft; Save commits both fields |
| Accessibility | Vendored modal naming/focus trap plus explicit labels for both fields |
| Routing | `modal=categorize&engagementId=…`; invalid, stale, and voice targets self-clean |

## Intentional differences

- The reference uses UK product spelling, so the dialog title uses
  **Categorise** and action copy uses **Recategorise** throughout.
- Persistence is local mock-model persistence (`localStorage`), not a production
  API. Categories and the latest saved conversation comment survive refresh.
