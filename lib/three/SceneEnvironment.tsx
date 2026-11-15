"use client";

import { Environment, Lightformer } from "@react-three/drei";

/**
 * SceneEnvironment — local studio lighting for the 3D scenes.
 *
 * Replaces drei's `<Environment preset="city" />`, which downloads a 1K HDRI
 * from a third-party CDN (raw.githack.com) and suspends the whole scene until it
 * arrives. On a cold cache that is a 1-2 MB blocking fetch, and it fails
 * entirely offline or when the CDN is unreachable.
 *
 * Building the environment from Lightformers renders it locally into a small
 * cube render target, once (`frames={1}`), so there is no network dependency
 * and the scene paints immediately. The palette matches the violet/lavender
 * brand so the glass and metal still read the same way.
 */
export function SceneEnvironment({ tint = "#7540d7" }: { tint?: string }) {
  return (
    <Environment resolution={64} frames={1}>
      <Lightformer intensity={2.2} color={tint} position={[0, 5, -9]} scale={[10, 10, 1]} />
      <Lightformer intensity={1.1} color="#ffffff" position={[-5, 1, -1]} scale={[10, 2, 1]} />
      <Lightformer intensity={1.0} color="#c9a8ec" position={[5, 1, 0]} scale={[10, 2, 1]} />
      <Lightformer intensity={0.5} color="#4b22a5" position={[0, -5, 2]} scale={[10, 5, 1]} />
    </Environment>
  );
}