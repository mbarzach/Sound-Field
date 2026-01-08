import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  AdditiveBlending,
  Points
} from 'three';
import { interpolateBands, smoothBins } from '../utils/spectralInterpolation';
import { noise3D } from '../utils/noise';

const NUM_BINS = 32;

export interface TuningParams {
  particleCount: number;
  boundsWidth: number;
  boundsHeight: number;
  boundsDepth: number;
  turbulenceStrength: number;
  upwardForce: number;
  gravity: number;
  damping: number;
  noiseScale: number;
  noiseSpeed: number;
  bulgeAmount: number;
  particleSize: number;
  baseAlpha: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  scale: number;
}

// Tuning presets for particle reactivity and visual design - tweak these to change the feel
export const DEFAULT_TUNING: TuningParams = {
  particleCount: 13000,
  boundsWidth: 4,
  boundsHeight: 2.8,
  boundsDepth: 3,
  turbulenceStrength: 0.0215,
  upwardForce: 0,
  gravity: 0.001,
  damping: 0.99,
  noiseScale: 5,
  noiseSpeed: 1.6,
  bulgeAmount: 0.17,
  particleSize: 0.4,
  baseAlpha: 0.2,
  positionX: 0,
  positionY: -0.65,
  positionZ: -1.65,
  scale: 1.0
};

interface ParticleFieldProps {
  dryRms: number;
  wetRms: number;
  dryWidth: number;
  wetWidth: number;
  spectralBands: number[];
  expansion: number;
  excitation: number;
  mix: number;
  bypass: boolean;
  tuning?: TuningParams;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseX: number;        // Home X position (for drift return)
  baseZ: number;        // Home Z position
  binIndex: number;     // Assigned frequency bin column
  heightOffset: number; // Particle's relative position within column (0-1)
  life: number;
  seed: number;
  size: number;
}

const VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uPixelRatio;

void main() {
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (12.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.1, d) * vAlpha;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}
`;

function ParticleField({
  dryRms: _dryRms,
  wetRms: _wetRms,
  spectralBands,
  expansion,
  excitation,
  mix,
  bypass,
  tuning = DEFAULT_TUNING
}: ParticleFieldProps) {
  // RMS values (_dryRms, _wetRms) are available but not used since each column
  // responds only to its spectral bin for FFT-like visualization
  const { gl } = useThree();
  const pointsRef = useRef<Points>(null);
  const geometryRef = useRef<BufferGeometry>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const particlesRef = useRef<Particle[]>([]);
  const initializedRef = useRef(false);

  const smoothedRef = useRef({
    bins: new Float32Array(NUM_BINS),
    localBins: new Float32Array(NUM_BINS)  // Local contrast normalized bins
  });

  const uniforms = useMemo(
    () => ({
      uPixelRatio: { value: gl.getPixelRatio() }
    }),
    [gl]
  );

  const baseY = -0.5;

  useEffect(() => {
    const count = tuning.particleCount;
    const particles: Particle[] = [];

    // Continuous field - no gaps between columns
    const columnWidth = tuning.boundsWidth / NUM_BINS;
    const particlesPerBin = Math.floor(count / NUM_BINS);

    for (let i = 0; i < count; i++) {
      // Assign particle to a bin based on X position
      const binIndex = i % NUM_BINS;
      const particleIndexInBin = Math.floor(i / NUM_BINS);

      // Calculate column center X position
      const columnCenterX = -tuning.boundsWidth / 2 + columnWidth * (binIndex + 0.5);

      // Wider distribution within column - particles can overlap neighboring bins slightly
      // This creates a continuous field while still having a "home" bin
      const offsetX = (Math.random() - 0.5) * columnWidth * 1.2;
      const x = columnCenterX + offsetX;

      // Height offset for layered vertical response (0-1)
      const heightOffset = particleIndexInBin / particlesPerBin;

      // Start particles at varying heights for organic initial look
      const initialY = baseY + Math.random() * tuning.boundsHeight * 0.1;
      const z = (Math.random() - 0.5) * tuning.boundsDepth * 0.8;

      particles.push({
        x,
        y: initialY,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        baseX: x,
        baseZ: z,
        binIndex,
        heightOffset,
        life: Math.random(),
        seed: Math.random() * 1000,
        size: tuning.particleSize + Math.random() * 0.2
      });
    }

    particlesRef.current = particles;

    if (geometryRef.current) {
      const positions = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const alphas = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const p = particles[i];
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        sizes[i] = 1;
        alphas[i] = tuning.baseAlpha;
      }

      geometryRef.current.setAttribute('position', new BufferAttribute(positions, 3));
      geometryRef.current.setAttribute('aSize', new BufferAttribute(sizes, 1));
      geometryRef.current.setAttribute('aAlpha', new BufferAttribute(alphas, 1));
    }

    initializedRef.current = true;
  }, [tuning.particleCount, tuning.boundsWidth, tuning.boundsHeight, tuning.boundsDepth, tuning.particleSize, tuning.baseAlpha, baseY]);

  useFrame((state) => {
    if (!geometryRef.current || !initializedRef.current) return;

    const particles = particlesRef.current;
    if (particles.length === 0) return;

    const t = state.clock.getElapsedTime();
    const smoothed = smoothedRef.current;

    const audioReactivity = bypass ? 0.0 : 1.0;
    const alphaMultiplier = bypass ? 0.3 : 1.0;

    // Mix effect: 0% = gentle drift (dry), 100% = full audio response (wet)
    const mixHeightScale = 0.1 + mix * 0.9;
    const mixAudioBoost = mix;
    const mixAlphaScale = 0.4 + mix * 0.6;

    const interpolated = interpolateBands(spectralBands);
    smoothBins(smoothed.bins, interpolated, 0.2);

    // Apply frequency weighting to reduce bass dominance
    // Lower bins get attenuated, higher bins get slight boost
    for (let i = 0; i < NUM_BINS; i++) {
      const binVal = smoothed.bins[i];

      // Frequency weighting curve: bass reduction, treble boost
      // Bin 0 = lowest freq, Bin 31 = highest freq
      const normalizedBin = i / (NUM_BINS - 1);  // 0 to 1
      // Weight curve: 0.4 at low end, 1.0 at mid, 1.2 at high end
      const freqWeight = 0.4 + normalizedBin * 0.8;

      const weightedVal = binVal * freqWeight;

      // Get neighbor average (wider window for smoother comparison)
      let neighborSum = 0;
      let neighborCount = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(NUM_BINS - 1, i + 4); j++) {
        if (j !== i) {
          neighborSum += smoothed.bins[j] * (0.4 + (j / (NUM_BINS - 1)) * 0.8);
          neighborCount++;
        }
      }
      const neighborAvg = neighborCount > 0 ? neighborSum / neighborCount : 0;

      // Local contrast: how much this bin exceeds its neighbors
      const contrast = Math.max(0, weightedVal - neighborAvg * 0.7);

      // Combine: base response + boosted contrast
      const localValue = weightedVal * 0.35 + contrast * 2.0;

      // Apply noise floor - very quiet bins don't react
      const noiseFloor = 0.05;
      smoothed.localBins[i] = Math.max(0, localValue - noiseFloor) / (1 - noiseFloor);
    }

    const normalizedExpansion = expansion / 100;
    const normalizedExcitation = excitation / 100;

    const positions = geometryRef.current.attributes.position.array as Float32Array;
    const sizes = geometryRef.current.attributes.aSize.array as Float32Array;
    const alphas = geometryRef.current.attributes.aAlpha.array as Float32Array;

    // Expansion affects WIDTH, not height
    const widthMultiplier = 1.0 + normalizedExpansion * 0.4;
    const halfWidth = (tuning.boundsWidth * widthMultiplier) / 2;
    const halfDepth = tuning.boundsDepth / 2;
    const maxColumnHeight = tuning.boundsHeight;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Get this particle's bin intensity (using local contrast for better separation)
      const binIntensity = smoothed.localBins[p.binIndex] || 0;

      // Excitation affects SENSITIVITY (lower threshold) not raw boost
      // At 0% excitation: linear response
      // At 100% excitation: more sensitive to quieter signals, compressed dynamic range
      const sensitivityCurve = 1.0 - normalizedExcitation * 0.3;  // 1.0 to 0.7
      const clampedIntensity = Math.min(1.0, Math.pow(binIntensity, sensitivityCurve));

      // FFT-style vertical movement: target Y based on bin intensity
      const columnHeight = clampedIntensity * maxColumnHeight * mixHeightScale * audioReactivity;
      const baseTargetY = baseY + p.heightOffset * 0.12 * tuning.boundsHeight; // Slight base spread
      const targetY = baseTargetY + p.heightOffset * columnHeight;

      // Constant organic noise movement - ALWAYS active
      const noiseTime = t * tuning.noiseSpeed;
      const nx = noise3D(p.x * tuning.noiseScale, p.y * tuning.noiseScale, noiseTime + p.seed);
      const ny = noise3D(p.x * tuning.noiseScale + 50, p.y * tuning.noiseScale, noiseTime + p.seed);
      const nz = noise3D(p.x * tuning.noiseScale + 100, p.y * tuning.noiseScale, noiseTime + p.seed);

      // Per-column turbulence driven by frequency bin level
      // Maps bin intensity to turbulence: 0.02 at -60dB (silence) to 0.05 at 0dBFS (full scale)
      const binTurbulence = 0.02 + clampedIntensity * 0.03;

      // Excitation boosts turbulence response
      const excitationTurbulenceBoost = 1.0 + normalizedExcitation * 1.5;
      const totalTurbulence = binTurbulence * excitationTurbulenceBoost * (bypass ? 0.5 : 1.0);

      p.vx += nx * totalTurbulence;
      p.vy += ny * totalTurbulence * 0.3; // Less vertical noise, more spring-driven
      p.vz += nz * totalTurbulence * 0.6;

      // Gentle return-to-home force (looser than before for more drift)
      // Excitation loosens the home force for more chaotic movement
      const homeForce = (0.025 - normalizedExcitation * 0.01) + clampedIntensity * 0.02;
      // Expansion spreads particles outward - scale baseX by width multiplier
      const expandedBaseX = p.baseX * widthMultiplier;
      p.vx += (expandedBaseX - p.x) * homeForce;
      p.vz += (p.baseZ - p.z) * homeForce;

      // Vertical spring toward target
      const yDiff = targetY - p.y;
      const springStrength = 0.08 + clampedIntensity * 0.08;
      p.vy += yDiff * springStrength;

      // Upward boost when bin is active (excitation increases this)
      if (clampedIntensity > 0.1) {
        p.vy += clampedIntensity * 0.002 * (1 + normalizedExcitation * 0.5) * mixAudioBoost * audioReactivity;
      }

      // Light gravity pulls particles down when not energized
      p.vy -= 0.0004 * (1 - clampedIntensity * 0.7);

      // Damping - excitation reduces damping for more lively movement
      const excitationDampingReduction = normalizedExcitation * 0.03;
      const dampingFactor = 0.96 - clampedIntensity * 0.03 - excitationDampingReduction;
      p.vx *= dampingFactor;
      p.vy *= 0.91;
      p.vz *= dampingFactor;

      // Apply velocities
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

      // Keep Y above base with bounce
      if (p.y < baseY) {
        p.y = baseY;
        p.vy = Math.abs(p.vy) * 0.4;
      }

      // Soft ceiling
      const maxY = baseY + maxColumnHeight;
      if (p.y > maxY) {
        p.y = maxY;
        p.vy = -Math.abs(p.vy) * 0.3;
      }

      // Soft bounds
      if (p.x < -halfWidth) { p.x = -halfWidth; p.vx *= -0.5; }
      if (p.x > halfWidth) { p.x = halfWidth; p.vx *= -0.5; }
      if (p.z < -halfDepth) { p.z = -halfDepth; p.vz *= -0.5; }
      if (p.z > halfDepth) { p.z = halfDepth; p.vz *= -0.5; }

      p.life += 0.012 + clampedIntensity * 0.02;

      // Height ratio for visual effects
      const heightRatio = Math.max(0, (p.y - baseY) / maxColumnHeight);
      const pulse = Math.sin(p.life * 3 + p.seed) * 0.15 + 1;

      // Size: base size + intensity boost
      const intensityBoost = 1 + clampedIntensity * 1.5;
      sizes[i] = p.size * pulse * intensityBoost * (1.0 - heightRatio * 0.1);

      // Position output
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      // Alpha: dim base + bright when bin is active
      const baseAlphaVal = 0.15;
      const intensityAlpha = Math.pow(clampedIntensity, 0.4) * 0.85;
      const topFade = 1 - heightRatio * 0.2;
      const edgeFade = 1 - Math.pow(Math.abs(p.x) / halfWidth, 3) * 0.15;

      alphas[i] =
        (baseAlphaVal + intensityAlpha) *
        topFade *
        edgeFade *
        (0.85 + pulse * 0.15) *
        alphaMultiplier *
        mixAlphaScale;
    }

    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.attributes.aSize.needsUpdate = true;
    geometryRef.current.attributes.aAlpha.needsUpdate = true;
  });

  const initialData = useMemo(() => {
    const count = tuning.particleCount;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);

    // Continuous field - no gaps
    const columnWidth = tuning.boundsWidth / NUM_BINS;

    for (let i = 0; i < count; i++) {
      const binIndex = i % NUM_BINS;
      const columnCenterX = -tuning.boundsWidth / 2 + columnWidth * (binIndex + 0.5);
      const offsetX = (Math.random() - 0.5) * columnWidth * 1.2;

      positions[i * 3] = columnCenterX + offsetX;
      positions[i * 3 + 1] = baseY + Math.random() * tuning.boundsHeight * 0.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * tuning.boundsDepth * 0.8;
      sizes[i] = 1;
      alphas[i] = tuning.baseAlpha;
    }

    return { positions, sizes, alphas };
  }, [tuning.particleCount, tuning.boundsWidth, tuning.boundsHeight, tuning.boundsDepth, tuning.baseAlpha, baseY]);

  return (
    <group
      position={[tuning.positionX, tuning.positionY, tuning.positionZ]}
      scale={[tuning.scale, tuning.scale, tuning.scale]}
    >
      <points ref={pointsRef}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[initialData.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-aSize"
            args={[initialData.sizes, 1]}
          />
          <bufferAttribute
            attach="attributes-aAlpha"
            args={[initialData.alphas, 1]}
          />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default ParticleField;
