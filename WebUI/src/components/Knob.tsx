interface KnobProps {
    value: number;
    min: number;
    max: number;
    label: string;
    unit?: string;
    onChange: (value: number) => void;
}

export function Knob({ value, min, max, label, unit = '', onChange }: KnobProps) {
    const normalized = (value - min) / (max - min);
    const rotation = normalized * 270 - 135;

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startValue = value;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = (startY - moveEvent.clientY) / 150;
            const newValue = Math.max(min, Math.min(max, startValue + delta * (max - min)));
            onChange(newValue);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    let displayValue = '';
    let displayUnit = unit;

    if (label === 'EXPANSION' || label === 'EXCITATION' || label === 'MIX') {
        displayValue = value.toFixed(0);
        displayUnit = '%';
    } else if (label === 'INPUT' || label === 'OUTPUT') {
        displayValue = (value > 0 ? '+' : '') + value.toFixed(1);
        displayUnit = 'dB';
    } else {
        displayValue = (value * 100).toFixed(0);
    }

    return (
        <div className="knob-container" onMouseDown={handleMouseDown}>
            <div className="knob">
                <div className="knob-track" />
                <div
                    className="knob-indicator"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        height: '6px',
                        width: '6px',
                        backgroundColor: '#ffffff',
                        borderRadius: '50%',
                        top: '6px',
                        left: 'calc(50% - 3px)',
                        position: 'absolute',
                        transformOrigin: '50% 24px',
                        boxShadow: '0 0 4px rgba(255, 255, 255, 0.5)'
                    }}
                />
                <div className="knob-center">
                    <span className="knob-value">{displayValue}</span>
                    <span className="knob-unit">{displayUnit}</span>
                </div>
            </div>
            <span className="knob-label">{label}</span>
        </div>
    );
}
