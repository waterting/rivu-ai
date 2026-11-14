"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";

/**
 * SceneCanvas — shared R3F canvas wrapper.
 *
 * - Fixed, capped DPR for performance.
 * - Transparent so it composites over CSS backgrounds.
 * - Suspense boundary for lazy scene assets.
 * - Caller is responsible for reduced-motion / WebGL fallback (see use3D guard).
 */
export default function SceneCanvas({
  children,
  camera = { position: [0, 0, 9], fov: 42 },
  dpr = [1, 1.8] as [number, number],
  className,
}: {
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number };
  dpr?: [number, number];
  className?: string;
}) {
  return (
    <Canvas
      className={className}
      dpr={dpr}
      camera={camera}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}