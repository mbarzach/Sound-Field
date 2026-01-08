/**
 * Shader material for particle field visualization.
 * Renders point sprites with size/alpha attributes and energy-based coloring.
 */

export const PARTICLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;

uniform float uPixelRatio;
uniform float uSizeScale;

varying float vAlpha;

void main() {
  vAlpha = aAlpha;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  float sizeAttenuation = uSizeScale * uPixelRatio * (12.0 / -mvPosition.z);
  gl_PointSize = aSize * sizeAttenuation;

  gl_Position = projectionMatrix * mvPosition;
}
`;

export const PARTICLE_FRAGMENT_SHADER = `
varying float vAlpha;

uniform vec3 uColorCold;
uniform vec3 uColorWarm;
uniform vec3 uColorHot;
uniform float uEnergy;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  float softEdge = smoothstep(0.5, 0.1, dist);

  vec3 color = mix(uColorCold, uColorWarm, uEnergy);
  color = mix(color, uColorHot, uEnergy * uEnergy);

  float alpha = vAlpha * softEdge;

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Default color palette for particle field.
 */
export const PARTICLE_COLORS = {
  cold: [0.1, 0.2, 0.5],   // Deep blue
  warm: [0.3, 0.6, 0.9],   // Bright cyan
  hot: [0.9, 0.5, 0.2]     // Orange
} as const;
