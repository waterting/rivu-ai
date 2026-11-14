"use client";

import { useSyncExternalStore } from "react";

/**
 * use3D — decides whether to mount a live WebGL scene.
 *
 * Returns:
 *  - "pending": still checking (render nothing heavy)
 *  - "on": WebGL available and motion allowed
 *  - "reduced": user prefers reduced motion -> caller shows static fallback
 *  - "off": WebGL unavailable -> caller shows static fallback
 *
 * Uses useSyncExternalStore so capability detection happens once and never
 * triggers cascading renders. The server snapshot is "pending" so SSR renders
 * the lightweight fallback, then the client corrects it.
 */
function detect(): "on" | "reduced" | "off" {
  if (typeof window === "undefined") return "off";
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return "reduced";
  try {
    const canvas = document.createElement("canvas");
    const webgl = !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
    return webgl ? "on" : "off";
  } catch {
    return "off";
  }
}

let cached: "on" | "reduced" | "off" | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): "on" | "reduced" | "off" {
  if (cached === null) {
    cached = detect();
  }
  return cached;
}

export function use3D(): "pending" | "on" | "reduced" | "off" {
  return useSyncExternalStore<"pending" | "on" | "reduced" | "off">(
    subscribe,
    getSnapshot,
    () => "pending",
  );
}