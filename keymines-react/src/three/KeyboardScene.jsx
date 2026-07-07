import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { KB_ROWS } from '../config.js';

/* ---- layout constants (1 unit = 1u keycap) ---- */
const U = 1;
const GAP = 0.14;
const KEY_H = 0.5;
const KEY_D = 0.92;
const ROW_ADV = KEY_D + GAP + 0.06;
const GRAVITY = 14;
const DESK_Y = -0.7;

/* ---- palette ---- */
const COL = {
  alphaFace: '#d8d2c4',
  alphaLegend: '#3a342a',
  decoFace: '#55565a',
  decoLegend: '#c8c9cd',
  safe: '#4bc47e',
  safeEmissive: '#00e676',
  mine: '#c62828',
  mineEmissive: '#ff1744',
  ghost: '#4a1515',
};

/** Flatten KB_ROWS into positioned key descriptors (index matches BOARD_KEYS order). */
function useLayout() {
  return useMemo(() => {
    const keys = [];
    const rowWidths = KB_ROWS.map((row) =>
      row.reduce((acc, k) => acc + k.w * U + (k.w - 1) * GAP + GAP, -GAP)
    );
    const maxW = Math.max(...rowWidths);
    const totalD = KB_ROWS.length * ROW_ADV - GAP;

    let flatIndex = 0;
    KB_ROWS.forEach((row, ri) => {
      let x = -maxW / 2;
      row.forEach((def) => {
        const w = def.w * U + (def.w - 1) * GAP;
        keys.push({
          id: flatIndex,
          keyId: flatIndex,
          def,
          w,
          x: x + w / 2,
          z: ri * ROW_ADV - totalD / 2 + KEY_D / 2,
        });
        flatIndex += 1;
        x += w + GAP;
      });
    });
    return { keys, maxW, totalD };
  }, []);
}

/** Rising, spinning diamond above a safely revealed key. */
function Gem({ startY }) {
  const ref = useRef();
  const matRef = useRef();
  const t0 = useRef(null);

  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const k = Math.min(t / 1.1, 1);
    if (ref.current) {
      ref.current.position.y = startY + k * 1.5;
      ref.current.rotation.y += 0.08;
      const s = 0.22 * (k < 0.2 ? k / 0.2 : 1);
      ref.current.scale.setScalar(s);
    }
    if (matRef.current) matRef.current.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  });

  return (
    <mesh ref={ref} position-y={startY}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        ref={matRef}
        color="#7de8a8"
        emissive="#00e676"
        emissiveIntensity={1.4}
        transparent
        roughness={0.1}
        metalness={0.3}
      />
    </mesh>
  );
}

/** Fiery debris burst where a mine detonates. */
function MineBurst() {
  const COUNT = 16;
  const parts = useMemo(() =>
    Array.from({ length: COUNT }, () => ({
      v: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 7),
      r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    })), []);
  const refs = useRef([]);
  const t0 = useRef(null);

  useFrame(({ clock }, dt) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    parts.forEach((p, i) => {
      const m = refs.current[i];
      if (!m) return;
      p.v.y -= GRAVITY * dt;
      m.position.addScaledVector(p.v, dt);
      m.rotation.x += p.r.x * dt;
      m.rotation.y += p.r.y * dt;
      m.material.opacity = Math.max(0, 1 - t / 0.9);
    });
  });

  return parts.map((_, i) => (
    <mesh key={i} ref={(el) => (refs.current[i] = el)}>
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshStandardMaterial
        color={i % 2 ? '#ff7043' : '#ffca28'}
        emissive={i % 2 ? '#ff3d00' : '#ffab00'}
        emissiveIntensity={2}
        transparent
      />
    </mesh>
  ));
}

/**
 * One 3D keycap: press dip, reveal colors, gem/burst effects,
 * and free-flight physics when the board explodes.
 * Every key on the board is playable; the cream/grey split is cosmetic.
 */
function Keycap({ k, slot, gameStatus, exploded, pressed, onPress }) {
  const group = useRef();
  const isAlphaLook = k.def.l.length === 1;
  const ended = gameStatus === 'gameover' || gameStatus === 'cashedout';

  const [gemKey, setGemKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const prevRevealed = useRef(false);

  /* physics state for the explosion flight */
  const phys = useRef({ active: false, v: new THREE.Vector3(), av: new THREE.Vector3() });
  const pressT = useRef(-1);

  /* trigger press dip on matching press signal */
  useEffect(() => {
    if (pressed && pressed.keyId === k.keyId) pressT.current = performance.now();
  }, [pressed, k.keyId]);

  /* reveal side-effects: gem for safe, burst for mine */
  useEffect(() => {
    const revealed = !!slot?.isRevealed;
    if (revealed && !prevRevealed.current) {
      if (slot.isMine) setBurstKey((n) => n + 1);
      else setGemKey((n) => n + 1);
    }
    prevRevealed.current = revealed;
  }, [slot?.isRevealed, slot?.isMine]);

  useFrame((_, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.05);
    const p = phys.current;

    if (exploded) {
      if (!p.active) {
        p.active = true;
        p.v.set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
        p.av.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
      p.v.y -= GRAVITY * dt;
      g.position.addScaledVector(p.v, dt);
      g.rotation.x += p.av.x * dt;
      g.rotation.y += p.av.y * dt;
      g.rotation.z += p.av.z * dt;

      // bounce off the desk with damping
      if (g.position.y < DESK_Y + KEY_H / 2 && p.v.y < 0) {
        g.position.y = DESK_Y + KEY_H / 2;
        if (Math.abs(p.v.y) > 1) {
          p.v.y *= -0.35;
          p.v.x *= 0.7;
          p.v.z *= 0.7;
          p.av.multiplyScalar(0.5);
        } else {
          p.v.set(0, 0, 0);
          p.av.set(0, 0, 0);
        }
      }
      return;
    }

    if (p.active) {
      // board reassembled: snap back to home position
      p.active = false;
      g.position.set(k.x, KEY_H / 2, k.z);
      g.rotation.set(0, 0, 0);
    }

    // press dip animation
    const since = pressT.current < 0 ? Infinity : (performance.now() - pressT.current) / 1000;
    const targetY = since < 0.12 ? KEY_H / 2 - 0.16 : KEY_H / 2;
    g.position.y += (targetY - g.position.y) * Math.min(1, dt * 30);
  });

  /* face color */
  let face = isAlphaLook ? COL.alphaFace : COL.decoFace;
  let legend = isAlphaLook ? COL.alphaLegend : COL.decoLegend;
  let emissive = '#000000';
  let emissiveIntensity = 0;
  const label = k.def.l;

  if (slot) {
    if (slot.isRevealed) {
      if (slot.isMine) {
        face = COL.mine; emissive = COL.mineEmissive; emissiveIntensity = 0.6; legend = '#ffdddd';
      } else {
        face = COL.safe; emissive = COL.safeEmissive; emissiveIntensity = 0.45; legend = '#0d3a20';
      }
    } else if (ended && slot.isMine) {
      face = COL.ghost; legend = '#c98080';
    }
  }

  const clickProps = {
    onClick: (e) => { e.stopPropagation(); onPress(k.keyId); },
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'default'),
  };

  return (
    <group ref={group} position={[k.x, KEY_H / 2, k.z]}>
      <RoundedBox
        args={[k.w, KEY_H, KEY_D]}
        radius={0.07}
        smoothness={3}
        castShadow
        receiveShadow
        {...clickProps}
      >
        <meshStandardMaterial
          color={face}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.45}
          metalness={0.08}
        />
      </RoundedBox>
      <Text
        position={[0, KEY_H / 2 + 0.011, 0.06]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={k.def.l.length > 1 ? 0.22 : 0.34}
        color={legend}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
      {gemKey > 0 && !exploded && slot?.isRevealed && !slot.isMine && (
        <Gem key={gemKey} startY={KEY_H} />
      )}
      {burstKey > 0 && <MineBurst key={burstKey} />}
    </group>
  );
}

function Rig({ maxW, totalD }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 12, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {/* RGB accent lights */}
      <pointLight position={[-maxW / 2, 2.5, totalD]} intensity={14} color="#00e5ff" distance={14} />
      <pointLight position={[maxW / 2, 2.5, totalD]} intensity={14} color="#d500f9" distance={14} />

      {/* mounting plate */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[maxW + 0.7, 0.3, totalD + 0.7]} />
        <meshStandardMaterial color="#141414" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* case with brass trim */}
      <mesh position={[0, -0.46, 0]} receiveShadow castShadow>
        <boxGeometry args={[maxW + 1.3, 0.42, totalD + 1.3]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.31, 0]}>
        <boxGeometry args={[maxW + 1.34, 0.05, totalD + 1.34]} />
        <meshStandardMaterial color="#b8860b" roughness={0.25} metalness={0.9} />
      </mesh>

      {/* desk */}
      <mesh position={[0, DESK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>
    </>
  );
}

/** Fixed bird's-eye camera — no user orbiting. */
function BirdsEyeCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 16.5, 2.6);
    camera.lookAt(0, 0, 0.2);
  }, [camera]);
  return null;
}

export default function KeyboardScene({ grid, gameStatus, exploded, pressed, onPress }) {
  const { keys, maxW, totalD } = useLayout();

  return (
    <div className="kb3d">
      <Canvas shadows camera={{ fov: 34 }} dpr={[1, 2]}>
        <color attach="background" args={['#0c0c0c']} />
        <fog attach="fog" args={['#0c0c0c', 25, 55]} />
        <BirdsEyeCamera />
        <Rig maxW={maxW} totalD={totalD} />
        {keys.map((k) => (
          <Keycap
            key={k.id}
            k={k}
            slot={grid[k.keyId] ?? null}
            gameStatus={gameStatus}
            exploded={exploded}
            pressed={pressed}
            onPress={onPress}
          />
        ))}
      </Canvas>
    </div>
  );
}
