import { useState, useCallback } from 'react';
import type { TuningParams } from './ParticleField';
import { DEFAULT_TUNING } from './ParticleField';

interface TuningSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function TuningSlider({ label, value, min, max, step, onChange }: TuningSliderProps) {
  return (
    <div className="tuning-slider">
      <label className="tuning-label">
        <span className="tuning-name">{label}</span>
        <span className="tuning-value">{value.toFixed(step < 0.01 ? 5 : step < 1 ? 2 : 0)}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="tuning-input"
      />
    </div>
  );
}

interface ParticleTuningProps {
  tuning: TuningParams;
  onTuningChange: (tuning: TuningParams) => void;
}

export function ParticleTuning({ tuning, onTuningChange }: ParticleTuningProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const updateParam = <K extends keyof TuningParams>(key: K, value: TuningParams[K]) => {
    onTuningChange({ ...tuning, [key]: value });
  };

  const resetToDefaults = () => {
    onTuningChange({ ...DEFAULT_TUNING });
  };

  const copySettings = useCallback(() => {
    const settingsText = JSON.stringify(tuning, null, 2);
    navigator.clipboard.writeText(settingsText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tuning]);

  return (
    <div className={`tuning-panel ${isOpen ? 'open' : ''}`}>
      <button className="tuning-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? 'HIDE TUNING' : 'TUNING'}
      </button>

      {isOpen && (
        <div className="tuning-content">
          <div className="tuning-header">
            <span className="tuning-title">Particle Tuning</span>
            <div className="tuning-header-buttons">
              <button className="tuning-copy" onClick={copySettings}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button className="tuning-reset" onClick={resetToDefaults}>
                Reset
              </button>
            </div>
          </div>

          <div className="tuning-section">
            <div className="tuning-section-title">Position & Scale</div>
            <TuningSlider
              label="Position X"
              value={tuning.positionX}
              min={-3.0}
              max={3.0}
              step={0.05}
              onChange={(v) => updateParam('positionX', v)}
            />
            <TuningSlider
              label="Position Y"
              value={tuning.positionY}
              min={-3.0}
              max={3.0}
              step={0.05}
              onChange={(v) => updateParam('positionY', v)}
            />
            <TuningSlider
              label="Position Z"
              value={tuning.positionZ}
              min={-3.0}
              max={3.0}
              step={0.05}
              onChange={(v) => updateParam('positionZ', v)}
            />
            <TuningSlider
              label="Scale"
              value={tuning.scale}
              min={0.2}
              max={3.0}
              step={0.05}
              onChange={(v) => updateParam('scale', v)}
            />
          </div>

          <div className="tuning-section">
            <div className="tuning-section-title">Geometry</div>
            <TuningSlider
              label="Particle Count"
              value={tuning.particleCount}
              min={5000}
              max={30000}
              step={1000}
              onChange={(v) => updateParam('particleCount', v)}
            />
            <TuningSlider
              label="Bounds Width"
              value={tuning.boundsWidth}
              min={2.0}
              max={8.0}
              step={0.1}
              onChange={(v) => updateParam('boundsWidth', v)}
            />
            <TuningSlider
              label="Bounds Height"
              value={tuning.boundsHeight}
              min={1.0}
              max={5.0}
              step={0.1}
              onChange={(v) => updateParam('boundsHeight', v)}
            />
            <TuningSlider
              label="Bounds Depth"
              value={tuning.boundsDepth}
              min={0.5}
              max={3.0}
              step={0.1}
              onChange={(v) => updateParam('boundsDepth', v)}
            />
          </div>

          <div className="tuning-section">
            <div className="tuning-section-title">Physics</div>
            <TuningSlider
              label="Turbulence"
              value={tuning.turbulenceStrength}
              min={0}
              max={0.05}
              step={0.0005}
              onChange={(v) => updateParam('turbulenceStrength', v)}
            />
            <TuningSlider
              label="Upward Force"
              value={tuning.upwardForce}
              min={0}
              max={0.01}
              step={0.0001}
              onChange={(v) => updateParam('upwardForce', v)}
            />
            <TuningSlider
              label="Gravity"
              value={tuning.gravity}
              min={0}
              max={0.001}
              step={0.00001}
              onChange={(v) => updateParam('gravity', v)}
            />
            <TuningSlider
              label="Damping"
              value={tuning.damping}
              min={0.9}
              max={0.99}
              step={0.001}
              onChange={(v) => updateParam('damping', v)}
            />
          </div>

          <div className="tuning-section">
            <div className="tuning-section-title">Noise</div>
            <TuningSlider
              label="Noise Scale"
              value={tuning.noiseScale}
              min={0.1}
              max={5.0}
              step={0.05}
              onChange={(v) => updateParam('noiseScale', v)}
            />
            <TuningSlider
              label="Noise Speed"
              value={tuning.noiseSpeed}
              min={0.1}
              max={3.0}
              step={0.05}
              onChange={(v) => updateParam('noiseSpeed', v)}
            />
            <TuningSlider
              label="Bulge Amount"
              value={tuning.bulgeAmount}
              min={0}
              max={1.0}
              step={0.01}
              onChange={(v) => updateParam('bulgeAmount', v)}
            />
          </div>

          <div className="tuning-section">
            <div className="tuning-section-title">Appearance</div>
            <TuningSlider
              label="Particle Size"
              value={tuning.particleSize}
              min={0.1}
              max={1.0}
              step={0.01}
              onChange={(v) => updateParam('particleSize', v)}
            />
            <TuningSlider
              label="Base Alpha"
              value={tuning.baseAlpha}
              min={0.2}
              max={1.0}
              step={0.01}
              onChange={(v) => updateParam('baseAlpha', v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
