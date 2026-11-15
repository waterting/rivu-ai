"use client";

import { useSyncExternalStore } from "react";

/**
 * useIsDesktop — true only when the viewport is at least `minWidth` CSS pixels.
 *
 * Phones get the static CSS fallback instead of a live WebGL canvas. A 140-node
 * instanced globe at 3x DPR is not worth the battery or the jank on a mid-range
 * phone, and the fallback reads the same in a still frame.
 *
 * useSyncExternalStore keeps the matchMedia subscription to one listener and
 * avoids a render cascade on resize.
 */
const QUERY = "(min-width: 768px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}