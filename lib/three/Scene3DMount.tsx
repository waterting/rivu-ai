"use client";

import dynamic from "next/dynamic";
import type { SceneKind } from "./Scene3D";

const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => null,
});

export default function Scene3DMount({
  kind = "hero",
  className = "",
  camera,
}: {
  kind?: SceneKind;
  className?: string;
  camera?: { position: [number, number, number]; fov?: number };
}) {
  return <Scene3D kind={kind} className={className} camera={camera} />;
}