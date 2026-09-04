import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Shared URL-state hooks (wouter-compatible).
 *
 * URL key registry — every search param the app uses. New features must reuse
 * these conventions (namespaced keys, default value omitted, invalid values
 * cleaned up with history replace) and never repurpose an existing key.
 *
 * Paths (wouter routes):
 *   /                                   table (Agents / Interactions / Queue)
 *   /interactions/:engagementId/:mode   digital interaction preview
 *                                       (mode: preview | expanded | takeover)
 *   /queue/:engagementId/:mode          queue IVR-transcript preview
 *                                       (mode: preview | expanded)
 *
 * Search params (omitted at their defaults so clean URLs stay short):
 *   view      flow: supervisor-2 | agent-2
 *             (default: Supervisor 1 — no param; unknown values normalize)
 *   tab       supervisor sub-tab: agents (default: interactions)
 *   nav       top tab: queue (Supervisor 2 / Agent 2 flows only;
 *             default: Supervisor / My team)
 *   filters   filter toolbar visibility: open (default: hidden)
 *   modal     THE one open dialog (mutually exclusive by sharing this key):
 *             transfer | reassign | agent-state | rollup | table-settings |
 *             categorize
 *   agentId   companion to modal=agent-state / modal=rollup: target agent id
 *   agentType, agent, channel, queue, state, category
 *             Interactions-tab filters (comma-separated multi-select values)
 *
 * Kept OUT of the URL on purpose:
 *   - search-box text, row highlight blink, drag drafts, menu anchors and the
 *     floating view-switcher menu (transient input / cosmetic chrome)
 *   - table column visibility & order (personal preference — localStorage)
 */

/** All dialog ids that may appear in `?modal=`. */
export const MODAL_IDS = [
  "transfer",
  "reassign",
  "agent-state",
  "rollup",
  "table-settings",
  "queue-transfer",
  "queue-requeue",
  "categorize",
] as const;
export type ModalId = (typeof MODAL_IDS)[number];

export type UrlWriteOptions = {
  /** Use history.replaceState — for cleaning invalid/stale params. */
  replace?: boolean;
  /** Navigate to a different pathname while rewriting the search string. */
  path?: string;
};

/**
 * Low-level updater: mutate a draft of the CURRENT search params and navigate.
 * Always reads the latest window.location.search before writing so multiple
 * writes in the same tick don't clobber each other.
 */
export function useUrlSearchUpdater() {
  const [, navigate] = useLocation();
  return useCallback(
    (
      update: (draft: URLSearchParams) => void,
      options: UrlWriteOptions = {},
    ) => {
      const next = new URLSearchParams(window.location.search);
      update(next);
      const qs = next.toString();
      const path = options.path ?? window.location.pathname;
      navigate(qs ? `${path}?${qs}` : path, {
        replace: options.replace ?? false,
      });
    },
    [navigate],
  );
}

/** Read/write a single search param. Passing null removes it from the URL. */
export function useUrlParam(
  key: string,
): [string | null, (value: string | null, options?: UrlWriteOptions) => void] {
  const search = useSearch();
  const updateSearch = useUrlSearchUpdater();
  const value = new URLSearchParams(search).get(key);
  const setValue = useCallback(
    (newValue: string | null, options?: UrlWriteOptions) => {
      updateSearch((next) => {
        if (newValue == null) next.delete(key);
        else next.set(key, newValue);
      }, options);
    },
    [key, updateSearch],
  );
  return [value, setValue];
}

/**
 * Boolean flag bound to a (key, value) pair. Multiple flags can share a key
 * (e.g. `?modal=transfer` vs `?modal=reassign`) and only the matching one is
 * "on" — turning one on closes the others for free.
 */
export function useUrlFlag(
  key: string,
  value: string,
): [boolean, (on: boolean, options?: UrlWriteOptions) => void] {
  const [raw, setRaw] = useUrlParam(key);
  const isOn = raw === value;
  const setOn = useCallback(
    (on: boolean, options?: UrlWriteOptions) => {
      if (on) setRaw(value, options);
      else if (window.location.search.includes(key)) {
        // Only clear when this flag's value is the one set.
        const cur = new URLSearchParams(window.location.search).get(key);
        if (cur === value) setRaw(null, options);
      }
    },
    [key, value, setRaw],
  );
  return [isOn, setOn];
}

/**
 * Enum param with a default: the default value is omitted from the URL and
 * invalid values fall back to the default (third return value reports
 * validity so callers can clean the URL with { replace: true }).
 */
export function useEnumUrlParam<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T,
): [T, (value: T, options?: UrlWriteOptions) => void, boolean] {
  const [rawValue, setRawValue] = useUrlParam(key);
  const isAllowed =
    rawValue == null || allowedValues.includes(rawValue as T);
  const value = isAllowed && rawValue != null ? (rawValue as T) : defaultValue;
  const setValue = useCallback(
    (nextValue: T, options?: UrlWriteOptions) => {
      setRawValue(nextValue === defaultValue ? null : nextValue, options);
    },
    [defaultValue, setRawValue],
  );
  return [value, setValue, isAllowed];
}
