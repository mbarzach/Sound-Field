import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { ShaderMaterial, DoubleSide, Group, AdditiveBlending } from 'three';
import { ENTITY_VERTEX_SHADER, ENTITY_FRAGMENT_SHADER } from '../constants/entityShaders';

interface EntityBlobProps {
    wetRms: number;
    spectralBands: number[];
    mix: number;
    bypass: boolean;
    deformScale: number;
    tension: number;
    drive: number;
    auraScale: number;
    deformIntensity: number;
}

function EntityBlob({
    wetRms,
    spectralBands,
    mix,
    bypass,
    deformScale,
    tension,
    drive,
    auraScale,
    deformIntensity
}: EntityBlobProps) {
    const coreMaterialRef = useRef<ShaderMaterial>(null);
    const auraMaterialRef = useRef<ShaderMaterial>(null);
    const groupRef = useRef<Group>(null);

    const smoothedRef = useRef({
        rms: 0,
        bands: new Array(10).fill(0),
        tension: 1.5,
        deformScale: 0.1
    });

    const coreUniforms = useMemo(() => ({
        uTime: { value: 0 },
        uExpansion: { value: 0.1 },
        uTension: { value: 1.5 },
        uComplex: { value: 1.0 },
        uOpacity: { value: 1.0 },
        uIsAura: { value: 0.0 },
        uDeformScale: { value: 0.0 },
        uDeformIntensity: { value: 1.0 },
        uBands: { value: new Array(10).fill(0) }
    }), []);

    const auraUniforms = useMemo(() => ({
        uTime: { value: 0 },
        uExpansion: { value: 0.1 },
        uTension: { value: 1.5 },
        uComplex: { value: 1.0 },
        uOpacity: { value: 0.0 },
        uIsAura: { value: 1.0 },
        uDeformScale: { value: 0.0 },
        uDeformIntensity: { value: 1.0 },
        uBands: { value: new Array(10).fill(0) }
    }), []);

    useFrame((state, delta) => {
        const time = state.clock.getElapsedTime();
        const audioSmoothing = 0.7;  // Fast for audio data (oscilloscope-like)
        const uiSmoothing = 0.15;    // Slower for UI transitions
        const smoothed = smoothedRef.current;

        smoothed.rms += (wetRms - smoothed.rms) * audioSmoothing;

        // Fast response for spectral bands
        for (let i = 0; i < 10; i++) {
            const target = spectralBands[i] || 0;
            smoothed.bands[i] += (target - smoothed.bands[i]) * audioSmoothing;
        }

        smoothed.tension += (tension - smoothed.tension) * audioSmoothing;
        smoothed.deformScale += (deformScale - smoothed.deformScale) * uiSmoothing;

        const energy = smoothed.bands.reduce((a, b) => a + b, 0) / 10;

        if (groupRef.current) {
            const rotationSpeed = 0.03 + energy * 0.1;
            groupRef.current.rotation.y += rotationSpeed * delta;
        }

        const audioKick = energy * drive * 0.8;
        const totalDeform = bypass ? 0.05 : smoothed.deformScale + audioKick;
        const effectiveMix = bypass ? 0 : mix;

        if (coreMaterialRef.current) {
            const u = coreMaterialRef.current.uniforms;
            u.uTime.value = time;
            u.uExpansion.value = totalDeform;
            u.uTension.value = smoothed.tension;
            u.uBands.value = smoothed.bands;
            u.uDeformScale.value = deformScale;
            u.uDeformIntensity.value = deformIntensity;
            u.uOpacity.value = bypass ? 0.3 : 1.0;
        }

        if (auraMaterialRef.current) {
            const u = auraMaterialRef.current.uniforms;
            u.uTime.value = time;
            u.uExpansion.value = totalDeform;
            u.uTension.value = smoothed.tension;
            u.uBands.value = smoothed.bands;
            u.uDeformScale.value = deformScale;
            u.uDeformIntensity.value = deformIntensity;
            u.uOpacity.value = effectiveMix;
        }
    });

    return (
        <group ref={groupRef}>
            <Stars
                radius={50}
                depth={50}
                count={2000}
                factor={3}
                saturation={0.3}
                fade
                speed={0.5}
            />

            <mesh>
                <sphereGeometry args={[0.9, 128, 128]} />
                <shaderMaterial
                    ref={coreMaterialRef}
                    vertexShader={ENTITY_VERTEX_SHADER}
                    fragmentShader={ENTITY_FRAGMENT_SHADER}
                    uniforms={coreUniforms}
                    transparent={false}
                    side={DoubleSide}
                />
            </mesh>

            <mesh scale={[auraScale, auraScale, auraScale]}>
                <sphereGeometry args={[0.9, 128, 128]} />
                <shaderMaterial
                    ref={auraMaterialRef}
                    vertexShader={ENTITY_VERTEX_SHADER}
                    fragmentShader={ENTITY_FRAGMENT_SHADER}
                    uniforms={auraUniforms}
                    transparent={true}
                    depthWrite={false}
                    side={DoubleSide}
                    blending={AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

export default EntityBlob;
