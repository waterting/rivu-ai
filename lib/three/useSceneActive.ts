"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useSceneActive — decides whether a WebGL canvas should actually render frames.
 *
 * Returns false when any of these hold, so the caller can set
 * `frameloop="never"` and stop burning GPU:
 *   - the element is scrolled out of view (IntersectionObserver)
 *   - the browser tab is hidden
 *   - the user prefers reduced motion
 *
 * This is the single biggest scroll-smoothness win for a page with several
 * canvases: offscreen scenes cost nothing while the user reads further down.
 * It never changes what is drawn, only whether frames are produced.
 */
export function useSceneActive<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [motionOk, setMotionOk] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "150px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionOk(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return [ref, inView && tabVisible && motionOk];
}