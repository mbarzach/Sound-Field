// Simplex 3D noise implementation
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
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

    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const ENTITY_VERTEX_SHADER = `
${NOISE_GLSL}

uniform float uTime;
uniform float uExpansion;
uniform float uTension;
uniform float uComplex;
uniform float uIsAura;
uniform float uDeformIntensity;
uniform float uBands[10];

varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vOriginalNormal;
varying float vBeam;
varying float vPoleMask;
varying float vSpectralEnergy;

void main() {
    vOriginalNormal = normalize(normalMatrix * normal);

    float poleMask = 1.0 - smoothstep(0.85, 1.0, abs(normal.y));
    vPoleMask = poleMask;

    float yNorm = clamp((position.y + 0.5) / 1.0, 0.0, 1.0);
    float localPower = 0.0;
    float totalEnergy = 0.0;

    for (int i = 0; i < 10; i++) {
        float bandCenter = float(i) / 9.0;
        float dist = abs(yNorm - bandCenter);
        float influence = max(0.0, 1.0 - dist * 3.0);
        float energy = uBands[i];
        localPower += energy * influence;
        totalEnergy += energy;
    }

    float logPower = log(1.0 + localPower * 5.0) / log(6.0);
    logPower = min(logPower, 0.6);

    float avgEnergy = totalEnergy / 10.0;
    float logAvg = log(1.0 + avgEnergy * 5.0) / log(6.0);
    logAvg = min(logAvg, 0.5);

    vSpectralEnergy = logAvg;

    float tensionFactor = uTension * (1.0 + logAvg * 2.0);
    float baseNoise = snoise(position * 0.8 + vec3(uTime * 0.2));
    float detailNoise = snoise(position * (2.0 * tensionFactor) + vec3(uTime * 0.5));
    float combinedNoise = baseNoise + (detailNoise * 0.4);

    float shapeBulge = logPower * 0.5;
    float globalPulse = logAvg * 0.3;
    float spectralReactivity = shapeBulge + globalPulse;
    float expansionMult = 0.3 + (uExpansion * 1.1);

    float effectiveDisplacement;

    if (uIsAura < 0.5) {
        float coreIntensity = uDeformIntensity * uDeformIntensity;
        float coreSpectralMod = 1.0 + (logPower * 0.3);
        effectiveDisplacement = combinedNoise * 0.3 * coreIntensity * expansionMult * coreSpectralMod;
    } else {
        float baseTexture = combinedNoise * 0.15 * uDeformIntensity * expansionMult;
        float spectralModulation = spectralReactivity * 0.2;
        effectiveDisplacement = baseTexture * (1.0 + spectralModulation);
    }

    float audioBeam = logAvg * poleMask;
    vBeam = audioBeam;

    vec3 newPos = position + normal * effectiveDisplacement;
    vDisplacement = effectiveDisplacement;
    vWorldPosition = (modelMatrix * vec4(newPos, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

export const ENTITY_FRAGMENT_SHADER = `
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;
varying vec3 vOriginalNormal;
varying float vBeam;
varying float vPoleMask;
varying float vSpectralEnergy;

uniform float uOpacity;
uniform float uTime;
uniform float uIsAura;
uniform float uDeformScale;

void main() {
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 deformedNormal = normalize(cross(fdx, fdy));
    vec3 normal = normalize(mix(vOriginalNormal, deformedNormal, 0.5));

    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    float energy = smoothstep(-0.2, 0.5, vDisplacement);

    if (uIsAura > 0.5) {
        float logEnergy = log(1.0 + vSpectralEnergy * 6.0) / log(7.0);
        logEnergy = clamp(logEnergy, 0.0, 0.7);

        float flux = sin((vWorldPosition.y * 8.0) + (vWorldPosition.x * 4.0) - uTime * 0.5);
        float fluxIntensity = smoothstep(0.3, 0.7, flux) * (0.15 + logEnergy * 0.25);
        float excitement = logEnergy * fluxIntensity * 0.4;

        vec3 deepField = vec3(0.02, 0.08, 0.2);
        vec3 brightField = vec3(0.15, 0.45, 0.8);
        vec3 hotField = vec3(0.6, 0.3, 0.15);

        vec3 auraColor = mix(deepField, brightField, fresnel * 0.7 + fluxIntensity * 0.3);
        auraColor = mix(auraColor, hotField, logEnergy * 0.25);
        auraColor += vec3(0.3, 0.15, 0.4) * excitement * 0.2;
        auraColor += vec3(0.5, 0.6, 0.8) * excitement * 0.05;
        auraColor = clamp(auraColor, vec3(0.0), vec3(0.85));

        float baseAlpha = fresnel * 0.35;
        float spectralAlpha = logEnergy * 0.25;
        float fluxAlpha = fluxIntensity * 0.1;
        float alpha = (baseAlpha + spectralAlpha + fluxAlpha) * vPoleMask * uOpacity;

        gl_FragColor = vec4(auraColor, alpha);
    } else {
        vec3 mainLight = normalize(vec3(1.0, 1.0, 2.0));
        vec3 fillLight = normalize(vec3(-0.5, 0.5, -1.0));

        float mainDiffuse = max(dot(normal, mainLight), 0.0);
        float fillDiffuse = max(dot(normal, fillLight), 0.0) * 0.3;
        float totalDiffuse = mainDiffuse + fillDiffuse;

        float rim = 1.0 - max(dot(normal, -viewDir), 0.0);
        rim = pow(rim, 2.5) * 0.4;

        float spec = pow(max(dot(normal, normalize(mainLight + viewDir)), 0.0), 40.0);

        vec3 darkBase = vec3(0.08, 0.12, 0.2);
        vec3 midTone = vec3(0.15, 0.4, 0.7);
        vec3 hotSpot = vec3(0.5, 0.3, 0.8);
        vec3 warmAccent = vec3(0.6, 0.35, 0.15);

        float clampedEnergy = clamp(vSpectralEnergy, 0.0, 0.6);

        vec3 baseColor = mix(darkBase, midTone, 0.4 + energy * 0.3);
        baseColor = mix(baseColor, warmAccent, clampedEnergy * 0.4);
        baseColor = mix(baseColor, hotSpot, clampedEnergy * fresnel * 0.3);

        vec3 finalColor = baseColor * (0.35 + totalDiffuse * 0.65);
        finalColor += vec3(0.8, 0.85, 1.0) * spec * 0.4;
        finalColor += vec3(0.3, 0.5, 0.9) * rim;
        finalColor += vec3(0.2, 0.4, 0.7) * fresnel * 0.25;
        finalColor = clamp(finalColor, vec3(0.05), vec3(0.85));

        gl_FragColor = vec4(finalColor, uOpacity);
    }
}
`;
