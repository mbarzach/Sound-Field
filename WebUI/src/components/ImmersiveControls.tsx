import { Knob } from './Knob';

type BlobMode = 'blob' | 'entity';

interface AudioData {
    inputL: number;
    inputR: number;
    outputL: number;
    outputR: number;
}

interface ImmersiveControlsProps {
    expansion: number;
    excitation: number;
    mix: number;
    inputGain: number;
    outputGain: number;
    bypass: boolean;
    onExpansionChange: (value: number) => void;
    onExcitationChange: (value: number) => void;
    onMixChange: (value: number) => void;
    onInputGainChange: (value: number) => void;
    onOutputGainChange: (value: number) => void;
    onBypassChange: (value: boolean) => void;
    data: AudioData;
    blobMode: BlobMode;
    onBlobModeChange: (mode: BlobMode) => void;
}

function toDbPercent(linearValue: number): number {
    if (linearValue <= 0.001) return 0;
    const db = 20 * Math.log10(linearValue);
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export function ImmersiveControls({
    expansion,
    excitation,
    mix,
    inputGain,
    outputGain,
    bypass,
    onExpansionChange,
    onExcitationChange,
    onMixChange,
    onInputGainChange,
    onOutputGainChange,
    onBypassChange,
    data,
    blobMode,
    onBlobModeChange
}: ImmersiveControlsProps) {
    const meterGradient = `linear-gradient(to top,
        #00ff88 0%,
        #00ff88 75%,
        #ffcc00 75%,
        #ffcc00 90%,
        #ff2020 90%,
        #ff2020 100%)`;

    const renderMeter = (level: number, applyInputGain = false) => {
        const gainLinear = applyInputGain ? Math.pow(10, inputGain / 20) : 1;
        const percent = toDbPercent(level * gainLinear);
        return (
            <div className="meter-mask" style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: `${percent}%`,
                overflow: 'hidden',
                transition: 'height 0.1s ease-out'
            }}>
                <div className="meter-gradient" style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '200px',
                    background: meterGradient
                }} />
            </div>
        );
    };

    return (
        <>
            <div className={`meter-bar left ${bypass ? 'disabled' : ''}`}>
                <div className="meter-label">IN</div>
                <div className="meter-track" style={{ background: '#1a1a1a', position: 'relative' }}>
                    {renderMeter(Math.max(data.inputL || 0, data.inputR || 0), true)}
                </div>
            </div>

            <div className={`meter-bar right ${bypass ? 'disabled' : ''}`}>
                <div className="meter-label">OUT</div>
                <div className="meter-track" style={{ background: '#1a1a1a', position: 'relative' }}>
                    {renderMeter(Math.max(data.outputL || 0, data.outputR || 0))}
                </div>
            </div>

            <div className="controls-container">
                <div className="header-bar">
                    <div className="header-left">
                        <div className="logo">SOUND FIELD</div>
                    </div>
                    <div className="header-center">
                        <div className="mode-toggle">
                            <button
                                className={`mode-btn ${blobMode === 'blob' ? 'active' : ''}`}
                                onClick={() => onBlobModeChange('blob')}
                            >
                                BLOB
                            </button>
                            <button
                                className={`mode-btn ${blobMode === 'entity' ? 'active' : ''}`}
                                onClick={() => onBlobModeChange('entity')}
                            >
                                ENTITY
                            </button>
                        </div>
                    </div>
                    <div className="header-right">
                        <div
                            className={`bypass-toggle ${bypass ? 'active' : ''}`}
                            onClick={() => onBypassChange(!bypass)}
                        >
                            {bypass ? 'BYPASSED' : 'ACTIVE'}
                        </div>
                    </div>
                </div>

                <div className="knobs-row">
                    <Knob
                        value={inputGain}
                        min={-12}
                        max={12}
                        label="INPUT"
                        onChange={onInputGainChange}
                    />
                    <Knob
                        value={excitation}
                        min={0}
                        max={100}
                        label="EXCITATION"
                        onChange={onExcitationChange}
                    />
                    <Knob
                        value={expansion}
                        min={-100}
                        max={100}
                        label="EXPANSION"
                        onChange={onExpansionChange}
                    />
                    <Knob
                        value={mix}
                        min={0}
                        max={100}
                        label="MIX"
                        onChange={onMixChange}
                    />
                    <Knob
                        value={outputGain}
                        min={-12}
                        max={12}
                        label="OUTPUT"
                        onChange={onOutputGainChange}
                    />
                </div>
            </div>
        </>
    );
}
