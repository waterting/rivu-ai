"use client";

import dynamic from "next/dynamic";
import { use3D } from "./use3D";
import { useIsDesktop } from "./useIsDesktop";
import { useSceneActive } from "./useSceneActive";
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
 * Mounts a live WebGL scene only when it is worth the GPU: WebGL available,
 * motion allowed, the viewport is wide enough, and the canvas is actually
 * visible. Otherwise it renders a static CSS depth fallback that looks the same
 * in a still frame.
 *
 * When the scene scrolls out of view or the tab is hidden, `frameloop` drops to
 * "never" so no frames are produced; it resumes on re-entry. This keeps
 * scrolling smooth on pages that stack several scenes.
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
  const isDesktop = useIsDesktop();
  const [containerRef, isActive] = useSceneActive<HTMLDivElement>();
  const Scene = SCENES[kind];

  const cam = camera ?? (kind === "hero" ? { position: [0, 0, 9], fov: 42 } : { position: [0, 0, 8], fov: 45 });
  const live = mode === "on" && isDesktop;

  return (
    <div ref={containerRef} className={`${styles.wrap} ${className}`} aria-hidden="true">
      {live ? (
        <SceneCanvas camera={cam} frameloop={isActive ? "always" : "never"}>
          <Scene />
        </SceneCanvas>
      ) : (
        <div className={`${styles.fallback} ${styles[kind]}`} />
      )}
    </div>
  );
}