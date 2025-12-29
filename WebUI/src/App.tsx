import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { DualBlob } from './components/DualBlob';
import EntityBlob from './components/EntityBlob';
import { ImmersiveControls } from './components/ImmersiveControls';
import { useJuceAudioAnalysis, useJuceSlider, useJuceToggle } from './hooks/useJuceEvents';
import { useState, useMemo } from 'react';
import './App.css';

type BlobMode = 'blob' | 'entity';

function App() {
    const audioData = useJuceAudioAnalysis();

    // Parameter bindings to JUCE backend
    const [expansion, setExpansion] = useJuceSlider('expansion', 0.0);
    const [excitation, setExcitation] = useJuceSlider('excitation', 0.0);
    const [mix, setMix] = useJuceSlider('mix', 1.0);
    const [inputGain, setInputGain] = useJuceSlider('inputGain', 0.0);
    const [outputGain, setOutputGain] = useJuceSlider('outputGain', 0.0);
    const [bypass, setBypass] = useJuceToggle('bypass', false);

    const [blobMode, setBlobMode] = useState<BlobMode>('blob');

    // Entity mode parameters derived from audio analysis
    const entityDeformIntensity = useMemo(() => {
        if (expansion <= 0) {
            const normalized = (expansion + 100) / 100;
            return 0.4 + normalized * 0.2;
        }
        const normalized = expansion / 100;
        return 0.6 + normalized * 0.2;
    }, [expansion]);

    // Intensity curve based on signal level
    const entityDrive = useMemo(() => {
        const rms = audioData.wetRms;
        const db60 = 0.001;
        const db30 = 0.0316;
        const db10 = 0.316;

        if (rms <= db60) return 3.0;
        if (rms <= db30) {
            const normalized = (rms - db60) / (db30 - db60);
            return 3.0 - normalized * 1.8;
        }
        if (rms <= db10) {
            const normalized = (rms - db30) / (db10 - db30);
            return 1.2 - normalized * 0.2;
        }
        return 1.0;
    }, [audioData.wetRms]);

    // Surface tension derived from RMS and excitation
    const entityTension = useMemo(() => {
        const rms = audioData.wetRms;
        const db20 = 0.1;
        const db10 = 0.316;

        let baseTension: number;
        if (rms <= db20) {
            baseTension = 1.0 + (rms / db20) * 0.8;
        } else if (rms <= db10) {
            const normalized = (rms - db20) / (db10 - db20);
            baseTension = 1.8 + normalized * 0.87;
        } else {
            baseTension = 2.67;
        }

        const excitationMultiplier = 1.0 + excitation / 200;
        return baseTension * excitationMultiplier;
    }, [audioData.wetRms, excitation]);

    // Deformation scale combines expansion setting with RMS reactivity
    const entityDeformScale = useMemo(() => {
        const rms = audioData.wetRms;

        let baseDeform: number;
        if (expansion <= 0) {
            const normalized = (expansion + 100) / 100;
            baseDeform = 0.1 + normalized * 0.2;
        } else {
            const normalized = expansion / 100;
            baseDeform = 0.3 + normalized * 0.3;
        }

        const rmsComponent = Math.min(rms * 2, 1.0) * 0.4;
        return Math.min(baseDeform + rmsComponent, 1.5);
    }, [expansion, audioData.wetRms]);

    const entityAuraScale = useMemo(() => 1.05 + mix * 0.15, [mix]);

    return (
        <div className="app">
            <div className="canvas-container">
                <Canvas
                    camera={{ position: [0, 0, 5], fov: 45 }}
                    gl={{ antialias: true, alpha: false }}
                    style={{ width: 800, height: 600 }}
                >
                    <color attach="background" args={['#050508']} />
                    <ambientLight intensity={0.4} />
                    <pointLight position={[10, 10, 10]} intensity={0.8} />
                    <pointLight position={[-10, -10, -10]} intensity={0.3} color="#4060ff" />

                    {blobMode === 'blob' ? (
                        <DualBlob
                            dryRms={audioData.dryRms}
                            wetRms={audioData.wetRms}
                            dryWidth={audioData.dryWidth}
                            wetWidth={audioData.wetWidth}
                            mix={mix}
                            bypass={bypass}
                            spectral={{
                                low: audioData.spectralLow || 0,
                                mid: audioData.spectralMid || 0,
                                high: audioData.spectralHigh || 0
                            }}
                            spectralBands={audioData.spectralBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}
                        />
                    ) : (
                        <EntityBlob
                            wetRms={audioData.wetRms}
                            spectralBands={audioData.spectralBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}
                            mix={mix}
                            bypass={bypass}
                            deformScale={entityDeformScale}
                            tension={entityTension}
                            drive={entityDrive}
                            auraScale={entityAuraScale}
                            deformIntensity={entityDeformIntensity}
                        />
                    )}

                    <OrbitControls
                        enableZoom={false}
                        enablePan={false}
                        autoRotate
                        autoRotateSpeed={0.3}
                        minPolarAngle={Math.PI / 3}
                        maxPolarAngle={Math.PI * 2 / 3}
                    />

                    {blobMode === 'entity' && (
                        <EffectComposer>
                            <Bloom
                                luminanceThreshold={0.6}
                                luminanceSmoothing={0.9}
                                intensity={0.3}
                            />
                        </EffectComposer>
                    )}
                </Canvas>
            </div>

            <ImmersiveControls
                expansion={expansion}
                excitation={excitation}
                mix={mix * 100}
                inputGain={inputGain}
                outputGain={outputGain}
                bypass={bypass}
                onExpansionChange={setExpansion}
                onExcitationChange={setExcitation}
                onMixChange={(v) => setMix(v / 100)}
                onInputGainChange={setInputGain}
                onOutputGainChange={setOutputGain}
                onBypassChange={setBypass}
                data={audioData}
                blobMode={blobMode}
                onBlobModeChange={setBlobMode}
            />
        </div>
    );
}

export default App;
