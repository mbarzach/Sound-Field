/**
 * Converts linear amplitude to normalized 0-1 range using dB scaling.
 * Maps -60 dB to +10 dB range for better perceptual response and headroom.
 */
function linearToNormalizedDb(linear: number, minDb: number = -60, maxDb: number = 10): number {
  if (linear <= 0) return 0;

  // Convert to dB: 20 * log10(linear)
  const db = 20 * Math.log10(linear);

  // Normalize to 0-1 range
  const normalized = (db - minDb) / (maxDb - minDb);

  // Clamp to 0-1
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Interpolates 10 spectral bands to 32 bins using cosine interpolation.
 * Applies dB scaling for perceptually accurate visualization.
 */
export function interpolateBands(sourceBands: number[]): Float32Array {
  const output = new Float32Array(32);
  const sourceCount = sourceBands.length;
  const targetCount = 32;

  for (let i = 0; i < targetCount; i++) {
    const sourcePos = (i / (targetCount - 1)) * (sourceCount - 1);
    const sourceIndex = Math.floor(sourcePos);
    const fraction = sourcePos - sourceIndex;

    // Get linear values
    const linear0 = sourceBands[Math.min(sourceIndex, sourceCount - 1)] || 0;
    const linear1 = sourceBands[Math.min(sourceIndex + 1, sourceCount - 1)] || 0;

    // Convert to dB-scaled normalized values
    const v0 = linearToNormalizedDb(linear0);
    const v1 = linearToNormalizedDb(linear1);

    // Cosine interpolation
    const t = (1 - Math.cos(fraction * Math.PI)) / 2;
    output[i] = v0 * (1 - t) + v1 * t;
  }

  return output;
}

/**
 * Smooths a Float32Array toward target values.
 * Used for frame-to-frame interpolation of spectral data.
 */
export function smoothBins(
  current: Float32Array,
  target: Float32Array,
  smoothing: number
): void {
  for (let i = 0; i < current.length; i++) {
    current[i] += (target[i] - current[i]) * smoothing;
  }
}
