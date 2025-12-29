// Simplex 3D noise implementation
const noiseGLSL = /* glsl */ `
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float turbulence(vec3 p) {
    float t = 0.0;
    float scale = 1.0;
    for (int i = 0; i < 4; i++) {
        t += abs(snoise(p * scale)) / scale;
        scale *= 2.0;
    }
    return t;
}
`;

// Logarithmic scaling for visual response
const logScaleGLSL = /* glsl */ `
float toLog(float value) {
    if (value <= 0.001) return 0.0;
    return max(0.0, (log(value) / 2.302585 + 3.0) / 3.0);
}
`;

// Heatmap gradient from grey (silence) through blue, green, yellow to red
const heatmapGLSL = /* glsl */ `
vec3 getHeatmapColor(float t) {
    vec3 grey = vec3(0.4);
    vec3 blue = vec3(0.0, 0.4, 1.0);
    vec3 green = vec3(0.0, 1.0, 0.6);
    vec3 yellow = vec3(1.0, 1.0, 0.0);
    vec3 red = vec3(1.0, 0.3, 0.0);

    float t1 = smoothstep(0.0, 1.0, clamp(t * 2.5, 0.0, 1.0));
    float t2 = smoothstep(0.0, 1.0, clamp((t - 0.35) * 3.5, 0.0, 1.0));
    float t3 = smoothstep(0.0, 1.0, clamp((t - 0.55) * 4.0, 0.0, 1.0));
    float t4 = smoothstep(0.0, 1.0, clamp((t - 0.75) * 4.0, 0.0, 1.0));

    vec3 c = mix(grey, blue, t1);
    c = mix(c, green, t2);
    c = mix(c, yellow, t3);
    c = mix(c, red, t4);

    return c;
}
`;

export const dryVertexShader = /* glsl */ `
uniform float uRMS;
uniform float uWidth;
uniform float uTime;
uniform float uBypass;
uniform float uMin;
uniform float uMax;
uniform float uBands[10];

varying float vNoise;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

${noiseGLSL}
${heatmapGLSL}
${logScaleGLSL}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    float widthFactor = 1.0 + uWidth * 2.0;
    float timeOffset = uTime * 0.3;

    float noise = turbulence(position * widthFactor * 0.5 + timeOffset);
    vNoise = noise;

    // Map spectral bands to Y-axis position
    float yNorm = clamp((position.y + 1.2) / 2.4, 0.0, 1.0);
    float localPower = 0.0;

    for (int i = 0; i < 10; i++) {
        float bandCenter = float(i) / 9.0;
        float dist = abs(yNorm - bandCenter);
        float influence = max(0.0, 1.0 - dist * 3.5);
        float energy = uBands[i];
        localPower += energy * influence;
    }

    // Compute relative heatmap color
    float logP = toLog(localPower);
    float logMin = toLog(uMin);
    float logMax = toLog(uMax);
    float rel = clamp((logP - logMin) / (logMax - logMin + 0.0001), 0.0, 1.0);
    vec3 heatColor = getHeatmapColor(rel);

    float silenceFade = smoothstep(0.02, 0.06, uMax);
    vColor = mix(vec3(0.4), heatColor, silenceFade);

    // Displacement with reduced intensity for dry signal
    float logRMS = toLog(uRMS);
    float logPower = toLog(localPower);
    float effectiveRMS = max(0.0, logRMS - 0.4);
    float shapeBulge = logPower * 0.2;
    float globalShake = effectiveRMS * 0.15;

    float displacement = noise * (0.03 + shapeBulge * 0.4 + globalShake * 0.2);
    vec3 newPosition = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

export const dryFragmentShader = /* glsl */ `
uniform float uMix;
uniform float uTime;
uniform float uBypass;

varying float vNoise;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

void main() {
    vec3 baseColor = max(vColor, vec3(0.4));
    float luminance = dot(baseColor, vec3(0.299, 0.587, 0.114));
    baseColor = mix(vec3(luminance), baseColor, 0.15);

    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.4 + 0.6;

    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);
    baseColor = mix(baseColor, vec3(0.5), fresnel * 0.15);
    baseColor *= diffuse;

    vec3 neutral = vec3(0.4, 0.4, 0.45);
    float easedBypass = smoothstep(0.0, 1.0, uBypass);
    baseColor = mix(baseColor, neutral, easedBypass);

    gl_FragColor = vec4(baseColor, 1.0);
}
`;

export const wetVertexShader = /* glsl */ `
uniform float uRMS;
uniform float uWidth;
uniform float uTime;
uniform float uBypass;
uniform float uMin;
uniform float uMax;
uniform float uBands[10];

varying float vNoise;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

${noiseGLSL}
${heatmapGLSL}
${logScaleGLSL}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    float widthFactor = 1.0 + uWidth * 2.0;
    float timeOffset = uTime * 0.3;
    float noise = turbulence(position * widthFactor * 0.5 + timeOffset);
    vNoise = noise;

    float yNorm = clamp((position.y + 1.2) / 2.4, 0.0, 1.0);
    float localPower = 0.0;

    for (int i = 0; i < 10; i++) {
        float bandCenter = float(i) / 9.0;
        float dist = abs(yNorm - bandCenter);
        float influence = max(0.0, 1.0 - dist * 3.5);
        float energy = uBands[i];
        localPower += energy * influence;
    }

    float logP = toLog(localPower);
    float logMin = toLog(uMin);
    float logMax = toLog(uMax);
    float rel = clamp((logP - logMin) / (logMax - logMin + 0.0001), 0.0, 1.0);
    vec3 heatColor = getHeatmapColor(rel);

    float silenceFade = smoothstep(0.02, 0.06, uMax);
    vColor = mix(vec3(0.4), heatColor, silenceFade);

    // Enhanced displacement for wet signal
    float logRMS = toLog(uRMS);
    float logPower = toLog(localPower);
    float effectiveRMS = max(0.0, logRMS - 0.4);
    float shapeBulge = logPower * 0.45;
    float globalShake = effectiveRMS * 0.4;

    float displacement = noise * (0.05 + shapeBulge * 0.7 + globalShake * 0.3);
    displacement *= (1.0 - uBypass);

    vec3 newPosition = position + normal * displacement;
    float stretch = (1.0 + uWidth * 1.5) * (1.0 - uBypass) + uBypass;
    newPosition.x *= stretch;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

export const wetFragmentShader = /* glsl */ `
uniform float uMix;
uniform float uTime;
uniform float uBypass;

varying float vNoise;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

void main() {
    vec3 primary = max(vColor, vec3(0.15));
    vec3 secondary = vec3(0.8) - primary * 0.3;
    float noiseFactor = clamp(vNoise * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(primary, secondary, noiseFactor * 0.1);

    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;

    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);
    color = mix(color, vec3(0.9), fresnel * 0.15);
    color *= diffuse;

    float wetOpacity = (uMix * 0.98 + 0.01) * (1.0 - uBypass);
    gl_FragColor = vec4(color, wetOpacity);
}
`;
