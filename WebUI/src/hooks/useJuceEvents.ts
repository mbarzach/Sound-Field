import { useState, useEffect, useCallback, useRef } from 'react';

declare global {
    interface Window {
        __JUCE__?: {
            backend: {
                addEventListener: (event: string, callback: (data: unknown) => void) => () => void;
                emitEvent: (event: string, data: unknown) => void;
            };
            initialisationData?: {
                [key: string]: {
                    properties?: {
                        scaledValue?: number;
                        value?: number;
                    };
                };
            };
            getSliderState?: (id: string) => {
                getScaledValue: () => number;
                getValue: () => number;
                setScaledValue: (value: number) => void;
                setValue: (value: number) => void;
            };
            getToggleState?: (id: string) => {
                getValue: () => boolean;
                setValue: (value: boolean) => void;
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

export function useJuceSlider(id: string, defaultValue: number = 0): [number, (value: number) => void] {
    const [value, setValue] = useState<number>(() => {
        const initData = window.__JUCE__?.initialisationData?.[id];
        return initData?.properties?.scaledValue ?? defaultValue;
    });

    const isUpdatingFromJuce = useRef(false);

    useEffect(() => {
        // Sync on mount in case initial data was stale
        if (window.__JUCE__?.getSliderState) {
            try {
                const state = window.__JUCE__.getSliderState(id);
                if (state) setValue(state.getScaledValue());
            } catch { /* ignore */ }
        }

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

        if (window.__JUCE__?.getSliderState) {
            window.__JUCE__.getSliderState(id)?.setScaledValue(newValue);
        } else if (window.__JUCE__?.backend) {
            window.__JUCE__.backend.emitEvent(id, { value: newValue });
        }
    }, [id]);

    return [value, setValueFromUI];
}

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

        if (window.__JUCE__?.getToggleState) {
            window.__JUCE__.getToggleState(id)?.setValue(newValue);
        } else if (window.__JUCE__?.backend) {
            window.__JUCE__.backend.emitEvent(id, { value: newValue });
        }
    }, [id]);

    return [value, setValueFromUI];
}

export function isRunningInJuce(): boolean {
    return typeof window.__JUCE__ !== 'undefined';
}
