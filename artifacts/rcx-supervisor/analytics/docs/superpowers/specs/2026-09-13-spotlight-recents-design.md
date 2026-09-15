# Spotlight Recents Design

## Goal

Make recent conversations scan like a native Spotlight list: one compact line per result, a stable dialog position while filtering, and access to the original conversation title when the display title is shortened.

## Approved interaction

- Each result is a single 44px row.
- Prefer the latest analytical artifact title as the concise display title. Fall back to a cleaned conversation title when no artifact exists.
- Preserve the original conversation title in the button tooltip and accessible label.
- Keep five items in Recents; search may return all matches inside the dialog's scrollable result area.
- Keep the dialog height stable while search results change.
- Preserve keyboard navigation and the existing Spring focus treatment.

## Boundaries

This is a presentation change. It does not rename stored conversations or modify saved workspace data.
