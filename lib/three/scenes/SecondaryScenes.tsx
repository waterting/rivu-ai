"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, Sparkles, Environment } from "@react-three/drei";
import * as THREE from "three";

const VIOLET = "#7540d7";
const DEEP = "#4b22a5";
const LAV = "#c9a8ec";

/** Deterministic pseudo-random so scene geometry is pure during render. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Flowing particle stream — represents raw data moving through the refinery. */
export function DataStreamScene() {
  const points = useRef<THREE.Points>(null);
  const count = 900;

  const positions = useMemo(() => {
    const rng = makeRng(1337);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rng() - 0.5) * 4; // x: narrow column
      arr[i * 3 + 1] = (rng() - 0.5) * 12; // y: long stream
      arr[i * 3 + 2] = (rng() - 0.5) * 4;
    }
    return arr;
  }, []);

  useFrame((state, dt) => {
    if (!points.current) return;
    const geo = points.current.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + dt * (0.6 + (i % 5) * 0.08);
      if (y > 6) y = -6;
      pos.setY(i, y);
      pos.setX(i, Math.sin(t * 0.5 + i) * 0.4 + (i % 7) * 0.05 - 0.15);
    }
    pos.needsUpdate = true;
    points.current.rotation.y = Math.sin(t * 0.1) * 0.2;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 4, 5]} intensity={90} color={VIOLET} />
      <Environment preset="night" />
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          color={LAV}
          transparent
          opacity={0.85}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <Sparkles count={40} scale={[8, 8, 6]} size={1.6} speed={0.2} color={VIOLET} opacity={0.6} />
    </>
  );
}

/** A deforming wireframe torus-knot — "quality mesh" / engine core. */
export function QualityMeshScene() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += dt * 0.15;
    mesh.current.rotation.y += dt * 0.22;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * 0.8) * 0.04;
    mesh.current.scale.set(s, s, s);
  });
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 4, 5]} intensity={110} color={VIOLET} />
      <pointLight position={[-4, -2, 3]} intensity={50} color={LAV} />
      <Environment preset="city" />
      <mesh ref={mesh}>
        <torusKnotGeometry args={[1.4, 0.42, 180, 28]} />
        <meshStandardMaterial
          color={VIOLET}
          emissive={DEEP}
          emissiveIntensity={0.4}
          metalness={0.65}
          roughness={0.22}
          wireframe
        />
      </mesh>
      <Sparkles count={50} scale={[7, 7, 7]} size={2} speed={0.25} color={LAV} opacity={0.6} />
    </>
  );
}

/** A globe of connected nodes — represents integrations / ecosystem. */
export function NodeGlobeScene() {
  const group = useRef<THREE.Group>(null);
  const nodes = 140;
  const radius = 2.6;

  const positions = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let i = 0; i < nodes; i++) {
      const phi = Math.acos(-1 + (2 * i) / nodes);
      const theta = Math.sqrt(nodes * Math.PI) * phi;
      arr.push([
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi),
      ]);
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.12;
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={100} color={VIOLET} />
      <Environment preset="night" />
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshBasicMaterial color={VIOLET} wireframe transparent opacity={0.14} />
        </mesh>
        {positions.map((p, i) => (
          <Float key={i} speed={1.2} floatIntensity={0.4} rotationIntensity={0}>
            <mesh position={p}>
              <sphereGeometry args={[0.035 + (i % 3) * 0.012, 10, 10]} />
              <meshStandardMaterial
                color={i % 4 === 0 ? "#ffffff" : LAV}
                emissive={VIOLET}
                emissiveIntensity={0.8}
                toneMapped={false}
              />
            </mesh>
          </Float>
        ))}
      </group>
      <Sparkles count={60} scale={[9, 9, 9]} size={1.8} speed={0.2} color={LAV} opacity={0.5} />
    </>
  );
}