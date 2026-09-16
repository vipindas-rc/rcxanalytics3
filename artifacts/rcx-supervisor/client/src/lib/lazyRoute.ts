import { lazy, type ComponentType } from "react";

/**
 * Recover once from a stale Vite module graph after a hot update. A full
 * reload is preferable to leaving a lazy route in React's rejected state.
 */
export function lazyRoute(
  name: string,
  loader: () => Promise<{ default: ComponentType }>,
) {
  return lazy(async () => {
    try {
      const module = await loader();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`rcx-supervisor:route-reload:${name}`);
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined") {
        const key = `rcx-supervisor:route-reload:${name}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          await new Promise<never>(() => {});
        }
      }
      throw error;
    }
  });
}