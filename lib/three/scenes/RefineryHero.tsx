"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial, Environment, Sparkles } from "@react-three/drei";
import * as THREE from "three";

const VIOLET = "#7540d7";
const DEEP = "#4b22a5";
const LAV = "#c9a8ec";

/** A single glassy data cube. */
function GlassCube({
  position,
  scale = 1,
  color = VIOLET,
  speed = 1,
}: {
  position: [number, number, number];
  scale?: number;
  color?: string;
  speed?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.x += dt * 0.18 * speed;
    ref.current.rotation.y += dt * 0.24 * speed;
  });
  return (
    <Float speed={1.4 * speed} rotationIntensity={0.5} floatIntensity={0.9}>
      <mesh ref={ref} position={position} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <MeshTransmissionMaterial
          color={color}
          transmission={0.92}
          thickness={0.7}
          roughness={0.12}
          ior={1.3}
          chromaticAberration={0.5}
          anisotropy={0.3}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.1}
          attenuationColor={DEEP}
          attenuationDistance={2.4}
        />
      </mesh>
    </Float>
  );
}

/** Hero centerpiece: a cluster of glassy data cubes orbiting a glowing core. */
export function RefineryHeroScene() {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (core.current) {
      core.current.rotation.y += dt * 0.3;
      core.current.rotation.x += dt * 0.12;
    }
    if (ring.current) ring.current.rotation.z += dt * 0.15;
    // subtle camera drift
    state.camera.position.x = Math.sin(state.clock.elapsedTime * 0.15) * 0.4;
    state.camera.lookAt(0, 0, 0);
  });

  const satellites = useMemo(
    () =>
      [
        { p: [2.4, 0.6, 0.4] as [number, number, number], s: 0.7, c: VIOLET, sp: 1 },
        { p: [-2.2, -0.5, 0.8] as [number, number, number], s: 0.55, c: LAV, sp: 1.3 },
        { p: [1.1, -1.3, -0.6] as [number, number, number], s: 0.42, c: DEEP, sp: 0.8 },
        { p: [-1.4, 1.4, -0.4] as [number, number, number], s: 0.48, c: VIOLET, sp: 1.1 },
        { p: [0.2, 1.7, 0.7] as [number, number, number], s: 0.36, c: LAV, sp: 1.5 },
      ] as const,
    [],
  );

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={120} color={VIOLET} />
      <pointLight position={[-5, -3, 2]} intensity={60} color={LAV} />
      <Environment preset="city" />

      {/* glowing inner core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial
          color={VIOLET}
          emissive={VIOLET}
          emissiveIntensity={0.7}
          metalness={0.4}
          roughness={0.25}
          wireframe
        />
      </mesh>

      {/* orbit ring */}
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.8, 0.015, 12, 90]} />
        <meshStandardMaterial color={LAV} emissive={VIOLET} emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 1.7, 0.6, 0]}>
        <torusGeometry args={[3.4, 0.01, 12, 100]} />
        <meshStandardMaterial color={DEEP} emissive={VIOLET} emissiveIntensity={0.35} />
      </mesh>

      {satellites.map((s, i) => (
        <GlassCube key={i} position={s.p as unknown as [number, number, number]} scale={s.s} color={s.c} speed={s.sp} />
      ))}

      <Sparkles count={60} scale={[9, 6, 6]} size={2.2} speed={0.3} color={LAV} opacity={0.7} />
    </>
  );
}