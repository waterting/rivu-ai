"use client";

import dynamic from "next/dynamic";
import { use3D } from "./use3D";
import SceneCanvas from "./SceneCanvas";
import { RefineryHeroScene } from "./scenes/RefineryHero";
import { DataStreamScene, QualityMeshScene, NodeGlobeScene } from "./scenes/SecondaryScenes";
import styles from "./scene3d.module.css";

export type SceneKind = "hero" | "stream" | "mesh" | "globe";

const SCENES: Record<SceneKind, () => React.ReactElement> = {
  hero: RefineryHeroScene,
  stream: DataStreamScene,
  mesh: QualityMeshScene,
  globe: NodeGlobeScene,
};

/**
 * Scene3D — the single 3D entry point for pages.
 *
 * Mounts a WebGL scene only when appropriate; otherwise renders a static
 * CSS depth fallback. `variant` controls the camera framing.
 */
export default function Scene3D({
  kind = "hero",
  className = "",
  camera,
}: {
  kind?: SceneKind;
  className?: string;
  camera?: { position: [number, number, number]; fov?: number };
}) {
  const mode = use3D();
  const Scene = SCENES[kind];

  const cam = camera ?? (kind === "hero" ? { position: [0, 0, 9], fov: 42 } : { position: [0, 0, 8], fov: 45 });

  return (
    <div className={`${styles.wrap} ${className}`} aria-hidden="true">
      {mode === "on" ? (
        <SceneCanvas camera={cam}>
          <Scene />
        </SceneCanvas>
      ) : (
        <div className={`${styles.fallback} ${styles[kind]}`} />
      )}
    </div>
  );
}