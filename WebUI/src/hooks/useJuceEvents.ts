import { useState, useEffect, useCallback, useRef } from 'react';

declare global {
    interface Window {
        __JUCE__?: {
            backend: {
                addEventListener: (event: string, callback: (data: unknown) => void) => () => void;
                emitEvent: (event: string, data: unknown) => void;
            };
        };
    }
}

export interface AudioAnalysisData {
    dryRms: number;
    wetRms: number;
    dryWidth: number;
    wetWidth: number;
    inputL: number;
    inputR: number;
    outputL: number;
    outputR: number;
    spectralLow: number;
    spectralMid: number;
    spectralHigh: number;
    spectralBands?: number[];
    cppBypass?: boolean;
}

const defaultAudioData: AudioAnalysisData = {
    dryRms: 0,
    wetRms: 0,
    dryWidth: 0,
    wetWidth: 0,
    inputL: 0,
    inputR: 0,
    outputL: 0,
    outputR: 0,
    spectralLow: 0,
    spectralMid: 0,
    spectralHigh: 0,
    spectralBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    cppBypass: false
};

/** Subscribe to high-frequency audio analysis data from C++ */
export function useJuceAudioAnalysis(): AudioAnalysisData {
    const [data, setData] = useState<AudioAnalysisData>(defaultAudioData);

    useEffect(() => {
        const backend = window.__JUCE__?.backend;
        if (!backend?.addEventListener) return;

        const unsubscribe = backend.addEventListener(
            'audioAnalysis',
            (eventData) => setData(eventData as AudioAnalysisData)
        );

        return () => unsubscribe?.();
    }, []);

    return data;
}

/** Bidirectional binding for WebSliderRelay parameters */
export function useJuceSlider(id: string, defaultValue: number = 0): [number, (value: number) => void] {
    const [value, setValue] = useState<number>(defaultValue);
    const isUpdatingFromJuce = useRef(false);

    useEffect(() => {
        const backend = window.__JUCE__?.backend;
        if (!backend?.addEventListener) return;

        const unsubscribe = backend.addEventListener(id, (data) => {
            const eventData = data as { scaledValue?: number };
            if (eventData.scaledValue !== undefined) {
                isUpdatingFromJuce.current = true;
                setValue(eventData.scaledValue);
                isUpdatingFromJuce.current = false;
            }
        });

        return () => unsubscribe?.();
    }, [id]);

    const setValueFromUI = useCallback((newValue: number) => {
        setValue(newValue);
        if (isUpdatingFromJuce.current) return;

        window.__JUCE__?.backend?.emitEvent(id, { value: newValue });
    }, [id]);

    return [value, setValueFromUI];
}

/** Bidirectional binding for WebToggleButtonRelay parameters */
export function useJuceToggle(id: string, defaultValue: boolean = false): [boolean, (value: boolean) => void] {
    const [value, setValue] = useState<boolean>(defaultValue);
    const isUpdatingFromJuce = useRef(false);

    useEffect(() => {
        const backend = window.__JUCE__?.backend;
        if (!backend?.addEventListener) return;

        const unsubscribe = backend.addEventListener(id, (data) => {
            const eventData = data as { value?: boolean };
            if (eventData?.value !== undefined) {
                isUpdatingFromJuce.current = true;
                setValue(eventData.value);
                isUpdatingFromJuce.current = false;
            }
        });

        return () => unsubscribe?.();
    }, [id]);

    const setValueFromUI = useCallback((newValue: boolean) => {
        setValue(newValue);
        if (isUpdatingFromJuce.current) return;

        window.__JUCE__?.backend?.emitEvent(id, { value: newValue });
    }, [id]);

    return [value, setValueFromUI];
}

export function isRunningInJuce(): boolean {
    return typeof window.__JUCE__ !== 'undefined';
}
