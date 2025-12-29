import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    dryVertexShader,
    dryFragmentShader,
    wetVertexShader,
    wetFragmentShader
} from '../shaders/dualBlobShaders';

interface DualBlobProps {
    dryRms: number;
    wetRms: number;
    dryWidth: number;
    wetWidth: number;
    mix: number;
    bypass: boolean;
    spectral: { low: number; mid: number; high: number };
    spectralBands: number[];
}

export function DualBlob({
    dryRms,
    wetRms,
    dryWidth,
    wetWidth,
    mix,
    spectralBands,
    bypass
}: DualBlobProps) {
    const groupRef = useRef<THREE.Group>(null);
    const dryMaterialRef = useRef<THREE.ShaderMaterial>(null);
    const wetMaterialRef = useRef<THREE.ShaderMaterial>(null);

    const dryUniforms = useMemo(() => ({
        uRMS: { value: 0 },
        uWidth: { value: 0 },
        uTime: { value: 0 },
        uMix: { value: 0 },
        uBypass: { value: 0 },
        uMin: { value: 0 },
        uMax: { value: 1 },
        uBands: { value: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    }), []);

    const wetUniforms = useMemo(() => ({
        uRMS: { value: 0 },
        uWidth: { value: 0 },
        uTime: { value: 0 },
        uMix: { value: 0 },
        uBypass: { value: 0 },
        uMin: { value: 0 },
        uMax: { value: 1 },
        uBands: { value: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    }), []);

    const spectralBandsRef = useRef(spectralBands);
    const smoothedBandsRef = useRef(new Float32Array(10));

    useEffect(() => {
        spectralBandsRef.current = spectralBands;
    }, [spectralBands]);

    useFrame(({ clock }) => {
        // High reactivity like an oscilloscope - fast response to all changes
        const audioSmoothing = 0.7;  // Fast for audio data
        const uiSmoothing = 0.15;    // Slower for UI transitions
        const time = clock.getElapsedTime();
        const rawBands = spectralBandsRef.current;
        const smoothedBands = smoothedBandsRef.current;

        // Near-instant response to spectral changes
        for (let i = 0; i < 10; i++) {
            const raw = rawBands[i] || 0;
            smoothedBands[i] += (raw - smoothedBands[i]) * audioSmoothing;
        }

        // Calculate min/max for relative heatmap
        let minE = 1000.0;
        let maxE = 0.0;
        for (let i = 0; i < 10; i++) {
            const v = smoothedBands[i];
            if (v < minE) minE = v;
            if (v > maxE) maxE = v;
        }

        const targetBypass = bypass ? 1.0 : 0.0;
        const targetMix = bypass ? 0.0 : mix;

        if (dryMaterialRef.current) {
            const u = dryMaterialRef.current.uniforms;
            u.uRMS.value += (dryRms - u.uRMS.value) * audioSmoothing;
            u.uWidth.value += (dryWidth - u.uWidth.value) * audioSmoothing;
            u.uTime.value = time;
            u.uMix.value += (targetMix - u.uMix.value) * uiSmoothing;
            u.uBypass.value += (targetBypass - u.uBypass.value) * uiSmoothing;
            u.uMin.value += (minE - u.uMin.value) * audioSmoothing;
            u.uMax.value += (maxE - u.uMax.value) * audioSmoothing;
            u.uBands.value = smoothedBands;
        }

        if (wetMaterialRef.current) {
            const u = wetMaterialRef.current.uniforms;
            u.uRMS.value += (wetRms - u.uRMS.value) * audioSmoothing;
            u.uWidth.value += (wetWidth - u.uWidth.value) * audioSmoothing;
            u.uTime.value = time;
            u.uMix.value += (targetMix - u.uMix.value) * uiSmoothing;
            u.uBypass.value += (targetBypass - u.uBypass.value) * uiSmoothing;
            u.uMin.value += (minE - u.uMin.value) * audioSmoothing;
            u.uMax.value += (maxE - u.uMax.value) * audioSmoothing;
            u.uBands.value = smoothedBands;
        }

        if (groupRef.current) {
            groupRef.current.rotation.y += 0.002;
            groupRef.current.rotation.x += 0.001;
        }
    });

    return (
        <group ref={groupRef}>
            <mesh renderOrder={1}>
                <icosahedronGeometry args={[0.6, 48]} />
                <shaderMaterial
                    ref={dryMaterialRef}
                    vertexShader={dryVertexShader}
                    fragmentShader={dryFragmentShader}
                    uniforms={dryUniforms}
                    transparent
                    depthWrite={true}
                />
            </mesh>

            <mesh renderOrder={2}>
                <icosahedronGeometry args={[0.72, 48]} />
                <shaderMaterial
                    ref={wetMaterialRef}
                    vertexShader={wetVertexShader}
                    fragmentShader={wetFragmentShader}
                    uniforms={wetUniforms}
                    transparent
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}
