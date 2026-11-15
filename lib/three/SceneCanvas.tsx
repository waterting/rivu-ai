"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";

/**
 * SceneCanvas — shared R3F canvas wrapper.
 *
 * - DPR is capped at 1.5 instead of the display's full devicePixelRatio. On a
 *   2x/3x screen that renders ~44-56% fewer pixels with no visible difference
 *   for this soft, glow-heavy art direction.
 * - `frameloop` lets the caller stop producing frames entirely when the canvas
 *   is offscreen or the tab is hidden (see useSceneActive), which is what keeps
 *   scrolling smooth with several scenes on one page.
 * - Transparent so it composites over CSS backgrounds.
 * - Suspense boundary for lazy scene assets.
 * - Caller is responsible for reduced-motion / WebGL fallback (see use3D guard).
 */
export default function SceneCanvas({
  children,
  camera = { position: [0, 0, 9], fov: 42 },
  dpr = [1, 1.5] as [number, number],
  frameloop = "always",
  className,
}: {
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number };
  dpr?: [number, number];
  frameloop?: "always" | "demand" | "never";
  className?: string;
}) {
  return (
    <Canvas
      className={className}
      dpr={dpr}
      frameloop={frameloop}
      camera={camera}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}