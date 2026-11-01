// Procedural world: school, campus, classroom, people, lights, sky and the camera path.
// Static boxes/planes are merged per material; the four swappable parts live in `W.slots`.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { pcRand, pcSpacing } from './util';
import { PC_KEYS, PC_LIGHT } from './config';

export const SLOT_NAMES = ['school', 'classroom', 'teacher', 'students'] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

export interface Walker { g: THREE.Group; l1: THREE.Mesh; l2: THREE.Mesh; off: number; lane: number; speed: number }
/** A seated student's desk position (x = seat), per-student phase and resting yaw. */
export interface Seat { x: number; z: number; ph: number; yaw: number }
/** Shoulder/elbow pivots that `poseTeacher` rotates. */
export interface ArmRig { sp: THREE.Object3D; el: THREE.Object3D }
export interface BoardState { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string }

/** Everything the engine animates or swaps; built once by `buildWorld`. */
export interface World {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; reduced: boolean;
  sky: THREE.Mesh; hemi: THREE.HemisphereLight; sunDir: THREE.Vector3; sun: THREE.DirectionalLight; shadowKey: number;
  fillRoom: THREE.PointLight; fillCorr: THREE.PointLight; boardLight: THREE.PointLight;
  walkers: Walker[]; fans: THREE.Group[]; board: BoardState;
  studs: Seat[]; heads: THREE.InstancedMesh; hairs: THREE.InstancedMesh; dummy: THREE.Object3D;
  fs: { torso: THREE.Mesh; head: THREE.Group; sh: THREE.Mesh };
  fgSeat: { x: number; z: number };
  teacher: { g: THREE.Group; armR: ArmRig | null; armL: ArmRig | null };
  shaftMat: THREE.MeshBasicMaterial; dust: THREE.Points; dustMat: THREE.PointsMaterial; dustBase: [number, number, number, number][];
  ct: number[]; cPos: THREE.CatmullRomCurve3; cLook: THREE.CatmullRomCurve3; vp: THREE.Vector3; vl: THREE.Vector3;
  slots: Record<SlotName, THREE.Group>; screen: THREE.Mesh; boardMat: THREE.MeshBasicMaterial;
  stats: { staticBoxes: number; mergedMeshes: number };
  /** Re-run every canvas texture's draw function (after web fonts load). */
  redrawTextures(): void;
}

type DrawFn = (c: CanvasRenderingContext2D, w: number, h: number) => void;

export function buildWorld(renderer: THREE.WebGLRenderer, opts: { reduced?: boolean } = {}): World {
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color('#DCE2E2');
  scene.fog = new THREE.Fog(fogCol, 70, 300);
  scene.background = fogCol.clone();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.2, 900);
  // the fields below are assigned as the scene is built; the cast keeps that incremental style
  const W = { renderer, scene, camera, reduced: !!opts.reduced } as World;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* ---- helpers ---- */
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const mats: Record<string, THREE.MeshStandardMaterial> = {};
  const matKey = (o?: THREE.MeshStandardMaterialParameters) => Object.entries(o || {}).map(([k, v]) => {
    const x = v as { isTexture?: boolean; uuid?: string; isColor?: boolean; getHex?: () => number };
    return k + ':' + (x && x.isTexture ? x.uuid : x && x.isColor && x.getHex ? x.getHex() : v);
  }).join(',');
  const M = (hex: string, o?: THREE.MeshStandardMaterialParameters) => {
    const k = hex + '|' + matKey(o);
    if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(hex), roughness: 0.88, metalness: 0 }, o || {}));
    return mats[k];
  };

  /* Swappable groups: each can be replaced by a .glb (see models.ts). `useSlot(null)` = always-procedural environment. */
  const slots = {} as Record<SlotName, THREE.Group>;
  SLOT_NAMES.forEach((n) => { const g = new THREE.Group(); g.name = 'slot:' + n; scene.add(g); slots[n] = g; });
  let cur: THREE.Object3D = scene;
  const useSlot = (n: SlotName | null) => { cur = n ? slots[n] : scene; };
  const add = <T extends THREE.Object3D>(o: T): T => { cur.add(o); return o; };

  /* Static boxes/planes are collected and merged per (material, shadow flags, slot, zone) in the merge step at the end. */
  const pending = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; target: THREE.Object3D; geos: THREE.BufferGeometry[] }>();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  let staticCount = 0;
  const stat = (geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean, recv: boolean, matrix: THREE.Matrix4) => {
    geo.applyMatrix4(matrix);
    const uvs = (mat.userData as { uvScale?: number }).uvScale;
    if (uvs) { // textured surfaces tile in metres, not per face
      const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv;
      for (let i = 0; i < pa.count; i++) {
        const ax = Math.abs(na.getX(i)), ay = Math.abs(na.getY(i)), az = Math.abs(na.getZ(i));
        if (ax >= ay && ax >= az) ua.setXY(i, pa.getZ(i) * uvs, pa.getY(i) * uvs);
        else if (ay >= az) ua.setXY(i, pa.getX(i) * uvs, pa.getZ(i) * uvs);
        else ua.setXY(i, pa.getX(i) * uvs, pa.getY(i) * uvs);
      }
    }
    // two chunks keep some frustum culling: the interior (corridor + classroom) vs everything outside
    const x = matrix.elements[12], z = matrix.elements[14];
    const zone = x > -1.7 && x < 14.1 && z > -12.8 && z < 0.05 ? 'in' : 'out';
    const key = [mat.uuid, cast, recv, cur === scene ? 'env' : cur.name, zone].join('|');
    let g = pending.get(key);
    if (!g) pending.set(key, g = { mat, cast, recv, target: cur, geos: [] });
    g.geos.push(geo); staticCount++;
  };
  /** Axis-aligned box from min/max coordinates. */
  const B = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, cast?: boolean, recv?: boolean) => {
    _m4.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(x1 - x0, y1 - y0, z1 - z0));
    stat(unitBox.clone(), mat, cast !== false, recv !== false, _m4);
  };
  const redraws: (() => void)[] = [];
  const ctex = (w: number, h: number, draw: DrawFn, rx?: number, ry?: number) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    redraws.push(() => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; }); // re-run once web fonts have loaded
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    if (rx || ry) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); }
    return t;
  };
  const P = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry?: number, rx?: number) => {
    // planes are decals/floors lying on other surfaces: polygon offset keeps them from z-fighting at any distance
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx || 0, ry || 0, 0)), _one);
    stat(new THREE.PlaneGeometry(w, h), mat, false, true, _m4);
  };
  const dummy = new THREE.Object3D();
  const setI = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry?: number, rx?: number, rz?: number) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx || 0, ry || 0, rz || 0); dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const setSeg = (mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, rad: number) => {
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.normalize();
    dummy.position.copy(a).addScaledVector(d, L / 2);
    dummy.quaternion.setFromUnitVectors(UP, d);
    dummy.scale.set(rad, L, rad); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, cast?: boolean) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = cast !== false; m.receiveShadow = true; return add(m); };
  const white = (o?: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.85 }, o || {}));

  /* ---- procedural surface textures: tileable fractal noise, tinted per pixel ---- */
  const lattice = (cells: number, seed: number) => { const r = pcRand(seed), a = new Float32Array(cells * cells); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const vnoise = (a: Float32Array, cells: number, x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = xi % cells, x1 = (xi + 1) % cells, y0 = yi % cells, y1 = (yi + 1) % cells;
    const t = a[y0 * cells + x0] * (1 - sx) + a[y0 * cells + x1] * sx, b = a[y1 * cells + x0] * (1 - sx) + a[y1 * cells + x1] * sx;
    return t * (1 - sy) + b * sy;
  };
  const fbm = (size: number, cells: number, oct: number, seed: number) => {
    const out = new Float32Array(size * size); let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const c = cells << o, lat = lattice(c, seed + o * 31);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] += amp * vnoise(lat, c, (x / size) * c, (y / size) * c);
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  };
  const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  interface SurfOpts { amp?: number; cells?: number; oct?: number; seed?: number; tint?: string; tintAmt?: number; after?: (g: CanvasRenderingContext2D, s: number, r: () => number) => void }
  const surf = (size: number, hex: string, o: SurfOpts = {}) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(size, size), d = img.data, seed = o.seed || 1, amp = (o.amp ?? 0.1) * 3;
    const n = fbm(size, o.cells || 6, o.oct || 5, seed), n2 = fbm(size, 4, 4, seed + 99);
    const b = rgb(hex), tc = o.tint ? rgb(o.tint) : b, ta = o.tintAmt ?? 0.5;
    for (let i = 0; i < size * size; i++) {
      const m = 1 + (n[i] - 0.5) * amp, t = o.tint ? Math.min(1, Math.max(0, (n2[i] - 0.38) * 3)) * ta : 0;
      for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, (b[k] * (1 - t) + tc[k] * t) * m));
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (o.after) o.after(g, size, pcRand(seed + 5));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    return t;
  };
  /** n×n tile grid with grout lines and a per-tile tint; wraps seamlessly. */
  const tileGrid = (n: number, grout: string, tintAmp: number) => (g: CanvasRenderingContext2D, s: number, r: () => number) => {
    const t = s / n, w = Math.max(2, s / 110);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '30,24,16'},${r() * tintAmp})`; g.fillRect(i * t, j * t, t, t); }
    g.fillStyle = grout;
    for (let k = 0; k < n; k++) { g.fillRect(k * t - w / 2, 0, w, s); g.fillRect(0, k * t - w / 2, s, w); }
    g.fillRect(s - w / 2, 0, w / 2, s); g.fillRect(0, s - w / 2, s, w / 2);
  };
  /** Textured material; `period` is the metres one texture repeat covers on merged static boxes. */
  const MT = (map: THREE.Texture, period: number, o?: THREE.MeshStandardMaterialParameters) => {
    const m = M('#ffffff', Object.assign({ map }, o || {}));
    m.userData.uvScale = 1 / period; return m;
  };
  const stains = (g: CanvasRenderingContext2D, s: number, r: () => number) => { // damp streaks and hairline marks on rendered walls
    for (let i = 0; i < 40; i++) { const x = r() * s, w = 6 + r() * 26, h = s * (0.1 + r() * 0.5), y = r() * (s - h); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(90,80,64,0)'); gr.addColorStop(1, `rgba(90,80,64,${0.03 + r() * 0.06})`); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  };

  /* ---- palette ---- */
  const plaster = MT(surf(512, '#ECE6DC', { amp: 0.05, cells: 5, oct: 6, seed: 3, tint: '#D8CFBD', tintAmt: 0.5, after: stains }), 5, { roughness: 0.93 });
  const plasterIn = MT(surf(512, '#EEE9E1', { amp: 0.035, cells: 5, oct: 6, seed: 4 }), 5, { roughness: 0.9 });
  const sand = MT(surf(512, '#C9A47C', { amp: 0.1, cells: 8, oct: 6, seed: 5, tint: '#B38E66', tintAmt: 0.6 }), 2, { roughness: 0.85 });
  const sandDark = MT(surf(512, '#AD8964', { amp: 0.1, cells: 8, oct: 6, seed: 6 }), 2, { roughness: 0.88 });
  const concrete = MT(surf(512, '#DCD6CC', { amp: 0.09, cells: 6, oct: 6, seed: 7, tint: '#BDB7AB', tintAmt: 0.5, after: stains }), 3, { roughness: 0.95 });
  const glassDark = M('#2B3842', { roughness: 0.12, metalness: 0.7 });
  const frame = M('#2D3236', { roughness: 0.55, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) /* frames sit on walls: depth offset avoids z-fighting */;
  const woodTex = (hex: string, seed: number) => surf(256, hex, { amp: 0.08, cells: 3, oct: 4, seed, after: (g, s, r) => { for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(55,32,16,${0.05 + r() * 0.13})`; g.fillRect(r() * s, r() * s, s * (0.3 + r() * 0.7), 1 + r() * 1.6); } } });
  const wood = MT(woodTex('#A47B55', 8), 1, { roughness: 0.62 }), woodDark = MT(woodTex('#7E5C3E', 9), 1, { roughness: 0.65 });
  const metal = M('#3A4046', { roughness: 0.5, metalness: 0.45 });
  const grassTex = surf(512, '#A4AA86', { amp: 0.2, cells: 8, oct: 6, seed: 10, tint: '#939F6E', tintAmt: 0.35, after: (g, s, r) => { for (let i = 0; i < 5000; i++) { const x = r() * s, y = r() * s; g.strokeStyle = r() < 0.5 ? 'rgba(70,86,40,0.28)' : 'rgba(190,196,140,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5); g.stroke(); } } });
  grassTex.repeat.set(220, 220);
  const grass = M('#ffffff', { map: grassTex, roughness: 1 });
  const paving = MT(surf(512, '#D8D0C1', { amp: 0.06, cells: 8, oct: 5, seed: 11, tint: '#C2B8A6', tintAmt: 0.6, after: tileGrid(2, 'rgba(90,80,66,0.55)', 0.09) }), 2, { roughness: 0.92 });
  const pathM = MT(surf(512, '#CDC2AF', { amp: 0.07, cells: 8, oct: 5, seed: 12, after: tileGrid(4, 'rgba(84,74,60,0.6)', 0.12) }), 1.6, { roughness: 0.95 });
  const hedge = MT(surf(256, '#6F7E57', { amp: 0.5, cells: 24, oct: 3, seed: 13 }), 1.2, { roughness: 1 });
  const floorIn = MT(surf(512, '#CBC1AF', { amp: 0.04, cells: 6, oct: 4, seed: 14, tint: '#B9AE9A', tintAmt: 0.5, after: tileGrid(2, 'rgba(70,62,50,0.5)', 0.07) }), 1.2, { roughness: 0.42, metalness: 0.02 });
  const asphalt = MT(surf(512, '#4A4B4C', { amp: 0.14, cells: 8, oct: 6, seed: 15, after: (g, s, r) => { for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(200,200,196,0.18)' : 'rgba(0,0,0,0.22)'; g.fillRect(r() * s, r() * s, 1 + r(), 1 + r()); } } }), 4, { roughness: 0.96 });
  const sage = M('#A9B19F', { roughness: 0.8 }), glassClear = new THREE.MeshStandardMaterial({ color: new THREE.Color('#CFE0E6'), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false });
  const lightPanel = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFF6E6') });

  /* ---- sky + lights ---- */
  const sunDir = new THREE.Vector3(0.36, -0.62, -0.7).normalize();
  W.sunDir = sunDir;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#7FA3C4') }, mid: { value: new THREE.Color('#CFDCE4') }, bot: { value: new THREE.Color('#DCE2E2') }, toSun: { value: sunDir.clone().negate() } },
    vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 toSun; varying vec3 vP;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vP - cameraPosition); float h = d.y;
  vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 2.0, 0.0, 1.0), 0.75)) : bot;
  c = mix(c, bot, exp(-abs(h) * 8.0) * 0.65); // haze band at the horizon
  float sg = max(dot(d, toSun), 0.0);
  c += vec3(1.0, 0.86, 0.64) * (pow(sg, 18.0) * 0.22 + pow(sg, 350.0) * 0.9);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.14) * 1.5 + vec2(3.7, 1.3);
    float cl = smoothstep(0.5, 0.8, fbm(uv));
    float lit = clamp(0.62 + (fbm(uv) - fbm(uv + toSun.xz * 0.09)) * 3.0, 0.0, 1.0); // sun-facing edges brighter
    vec3 cc = mix(vec3(0.74, 0.78, 0.84), vec3(1.0, 0.99, 0.96), lit);
    c = mix(c, cc, cl * smoothstep(0.0, 0.2, h) * 0.9);
  }
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  sky.frustumCulled = false; scene.add(sky); W.sky = sky;
  // soft image-based ambient so glossy/metal surfaces have something to reflect; direct light still dominates
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.22; pm.dispose(); }
  const hemi = new THREE.HemisphereLight(new THREE.Color('#E4EDF3'), new THREE.Color('#BDB6A7'), PC_LIGHT.hemiOut);
  scene.add(hemi); W.hemi = hemi;
  const sun = new THREE.DirectionalLight(new THREE.Color('#FFF0DA'), PC_LIGHT.sun);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 2; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06; // r186's PCF shows acne at the old 0.0004 / 0.03
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  scene.add(sun); scene.add(sun.target); W.sun = sun; W.shadowKey = -1;
  const fillRoom = new THREE.PointLight(new THREE.Color('#FFE6CC'), 0, 18, 2); fillRoom.position.set(8, 3.1, -6.5); scene.add(fillRoom); W.fillRoom = fillRoom;
  const fillCorr = new THREE.PointLight(new THREE.Color('#FFEFD9'), 0, 12, 2); fillCorr.position.set(0.2, 3.2, -6); scene.add(fillCorr); W.fillCorr = fillCorr;
  const boardLight = new THREE.PointLight(new THREE.Color('#DCE6F2'), 0, 7, 2); boardLight.position.set(13.1, 1.9, -7); scene.add(boardLight); W.boardLight = boardLight;

  /* ---- ground & campus ---- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const flat = (x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, rx = -Math.PI / 2) => P(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, rx);
  flat(-26, 26, 0, 15, 0.01, paving);
  flat(-2.6, 2.6, 15, 40, 0.012, pathM);
  useSlot('classroom');
  flat(-1.6, 2.0, -12.7, 0, 0.014, floorIn);
  flat(2.3, 14, -12.7, -0.3, 0.014, floorIn);
  useSlot(null);
  B(-26, -2.6, 0, 0.7, 14.6, 15.3, hedge); B(2.6, 26, 0, 0.7, 14.6, 15.3, hedge);
  B(-26, -3.4, 0, 1.3, 39.8, 40.3, plaster); B(3.4, 26, 0, 1.3, 39.8, 40.3, plaster);
  B(-26.1, -3.4, 1.3, 1.42, 39.75, 40.35, sand); B(3.4, 26.1, 1.3, 1.42, 39.75, 40.35, sand);
  B(-3.6, -2.8, 0, 2.2, 39.6, 40.5, sand); B(2.8, 3.6, 0, 2.2, 39.6, 40.5, sand);
  B(-26.3, -25.8, 0, 1.3, -30, 40.3, plaster); B(25.8, 26.3, 0, 1.3, -30, 40.3, plaster);
  for (let i = 0; i < 6; i++) { const x = -20 + i * 8; B(x - 1.2, x + 1.2, 0, 0.45, 13, 14.2, sandDark); }

  /* ---- school building ---- */
  useSlot('school');
  B(-22, -1.6, 0, 3.6, -14, 0, plaster);
  B(14, 22, 0, 3.6, -12.7, 0, plaster);
  B(-1.6, 22, 0, 3.6, -14, -12.7, plaster);
  B(-1.6, 1.6, 3.0, 3.6, -0.3, 0, plaster);
  B(1.6, 2.0, 0, 3.6, -0.3, 0, plaster);
  B(2.0, 2.3, 0, 3.6, -12.7, -8.0, plasterIn); B(2.0, 2.3, 0, 3.6, -6.0, -0.3, plasterIn); B(2.0, 2.3, 2.4, 3.6, -8.0, -6.0, plasterIn);
  // door frame sits 1 cm proud of the wall faces so no faces are coplanar (z-fighting)
  B(1.94, 2.36, 0, 2.44, -8.06, -7.99, frame); B(1.94, 2.36, 0, 2.44, -6.01, -5.94, frame); B(1.94, 2.36, 2.39, 2.46, -8.06, -5.94, frame);
  const win = [[3.2, 5.6], [6.8, 9.2], [10.4, 12.8]];
  const piers = [[2.0, 3.2], [5.6, 6.8], [9.2, 10.4], [12.8, 14.0]];
  piers.forEach((q) => B(q[0], q[1], 0, 3.6, -0.3, 0, plaster));
  win.forEach((q) => {
    B(q[0], q[1], 0, 0.9, -0.3, 0, plaster);
    B(q[0], q[1], 2.7, 3.6, -0.3, 0, plaster);
    B(q[0] - 0.05, q[1] + 0.05, 0.84, 0.91, -0.42, 0.12, sand);
    B(q[0] - 0.25, q[1] + 0.25, 2.8, 2.88, 0, 0.62, concrete);
    const cx = (q[0] + q[1]) / 2;
    B(cx - 0.03, cx + 0.03, 0.9, 2.7, -0.2, -0.1, frame, false);
    B(q[0], q[1], 2.12, 2.16, -0.2, -0.1, frame, false);
    B(q[0], q[1], 0.9, 2.7, -0.16, -0.14, glassClear, false, false);
  });
  B(-22.4, 22.4, 3.6, 4.0, -14.2, 0.25, concrete);
  B(-22, 22, 4.0, 7.4, -14, 0, plaster);
  B(-22.2, 22.2, 7.4, 8.1, -14.2, 0.1, plaster);
  B(-22.3, 22.3, 7.95, 8.15, 0.05, 0.32, sand);
  B(-21.6, 21.6, 4.5, 6.9, 0, 0.04, glassDark, false);
  B(-22.06, -1.6, 0, 0.4, 0, 0.06, sandDark); B(14.0, 22.06, 0, 0.4, 0, 0.06, sandDark);
  B(1.6, 2.0, 0, 0.4, 0, 0.06, sandDark); B(2.0, 14.0, 0, 0.4, 0, 0.06, sandDark);
  [-19.5, -15.5, -11.5, -3.6, 16.8, 20].forEach((cx) => {
    const hw = cx === -3.6 ? 0.9 : 1.2;
    B(cx - hw, cx + hw, 0.9, 2.7, 0, 0.03, glassDark, false);
    B(cx - hw - 0.08, cx + hw + 0.08, 0.84, 0.9, 0, 0.14, sand);
    B(cx - hw - 0.25, cx + hw + 0.25, 2.8, 2.88, 0, 0.62, concrete);
  });
  const finXs = [];
  for (let x = -21.2; x <= 21.2; x += 0.95) { if (x > -8.9 && x < -5.1) continue; finXs.push(x); }
  const fins = inst(unitBox, sand, finXs.length);
  finXs.forEach((x, i) => setI(fins, i, x, 5.65, 0.24, 0.12, 3.1, 0.46));
  fins.instanceMatrix.needsUpdate = true;
  const jaali = ctex(256, 256, (c, w, h) => {
    c.fillStyle = '#C8A27A'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#5E4A36';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64 + 32, y = j * 64 + 32;
      c.beginPath(); c.moveTo(x, y - 22); c.lineTo(x + 22, y); c.lineTo(x, y + 22); c.lineTo(x - 22, y); c.closePath(); c.fill();
    }
  }, 4, 12);
  B(-8.6, -5.4, 0, 9.4, -0.6, 0.9, sand);
  P(2.7, 8.4, M('#ffffff', { map: jaali, roughness: 0.9 }), -7.0, 4.9, 0.93);
  B(-4.2, 4.2, 3.2, 3.42, 0, 4.6, concrete);
  const signTex = ctex(2048, 64, (c, w, h) => {
    c.fillStyle = '#DCD6CC'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2B2F33'; c.font = '600 34px Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    pcSpacing(c, 16); c.fillText('DR. ZUBEEN GARG SCHOOL', w / 2, h / 2 + 2);
  });
  P(8.4, 0.22, M('#ffffff', { map: signTex }), 0, 3.31, 4.62);
  // rooftop lettering: transparent canvas (alpha-tested) on a low base, right of the jaali tower, facing the forecourt
  const roofTex = ctex(2048, 200, (c, w, h) => {
    c.fillStyle = '#2B2F33'; c.font = '600 168px Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    pcSpacing(c, 16); c.fillText('SMART SCHOOL', w / 2, h / 2 + 8);
  });
  B(2.5, 14.5, 8.1, 8.3, -1.12, -0.98, concrete);
  P(14, 14 * 200 / 2048, M('#ffffff', { map: roofTex, alphaTest: 0.5, roughness: 0.85 }), 8.5, 8.72, -0.9);
  const colGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 16);
  [-3.8, 3.8].forEach((x) => { const c = new THREE.Mesh(colGeo, metal); c.position.set(x, 1.6, 4.2); c.castShadow = true; add(c); });
  // entrance frame protrudes 1 cm into the opening (no faces flush with the wall ends / lintel)
  B(-1.7, -1.59, 0, 3.05, -0.32, 0.03, frame); B(1.59, 1.7, 0, 3.05, -0.32, 0.03, frame); B(-1.7, 1.7, 2.99, 3.06, -0.32, 0.03, frame);

  useSlot(null);
  /* ---- trees ---- */
  const rnd = pcRand(7);
  const trees = [[-7, 22, 1.0], [7, 25, 1.1], [-8.5, 33, 1.0], [8.5, 34, 0.95], [-18, 26, 1.3], [19, 28, 1.25], [-14, -22, 1.4], [5, -24, 1.3], [20, -20, 1.4], [-30, 18, 1.5], [31, 22, 1.4]];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 55 + rnd() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85 - 10;
    if (Math.abs(x) < 30 && z > -32 && z < 46) continue;
    trees.push([x, z, 1.2 + rnd() * 0.9]);
  }
  // keep random trees off the road beyond the compound wall
  for (let i = trees.length - 1; i >= 11; i--) if (trees[i][1] > 40 && trees[i][1] < 52) trees.splice(i, 1);
  // canopy lump: smooth icosphere, lumpy displacement and per-vertex leaf mottling baked into vertex colours
  const lumpGeo = (() => {
    const g0 = new THREE.IcosahedronGeometry(1, 2); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
    const g = mergeVertices(g0), pos = g.attributes.position, col = new Float32Array(pos.count * 3), lr = pcRand(21);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = 1 + 0.16 * Math.sin(5 * x + 1) * Math.sin(4 * y + 2) * Math.sin(6 * z) + 0.09 * Math.sin(11 * x + 7 * y) * Math.sin(9 * z + 3) + (lr() - 0.5) * 0.07;
      pos.setXYZ(i, x * r, y * r, z * r);
      const l = (0.62 + 0.38 * ((y + 1) / 2)) * (0.9 + lr() * 0.2); // darker underneath, mottled
      col[i * 3] = l; col[i * 3 + 1] = l * (0.98 + lr() * 0.06); col[i * 3 + 2] = l * 0.95;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  })();
  const barkTex = surf(128, '#6B5A4A', { amp: 0.5, cells: 3, oct: 4, seed: 17, after: (g, sz, r) => { for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(30,22,14,${0.12 + r() * 0.2})`; g.fillRect(r() * sz, 0, 1 + r() * 2, sz); } } });
  const trunks = inst(new THREE.CylinderGeometry(0.1, 0.19, 1, 9), new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 }), trees.length);
  const nLump = 5;
  const canMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true });
  const canopies = inst(lumpGeo, canMat, trees.length * nLump);
  const leafCols = ['#6C7E53', '#7B8A5B', '#5F7350', '#84906A', '#566B48'].map((h) => new THREE.Color(h));
  trees.forEach((t, i) => {
    const s = t[2], tr = 0.12 * (rnd() - 0.5);
    setI(trunks, i, t[0], 1.3 * s, t[1], s, 2.6 * s, s, 0, tr, tr);
    const base = leafCols[i % 5];
    for (let k = 0; k < nLump; k++) {
      const a = k * 2.4 + rnd(), rr = k === 0 ? 0 : (0.55 + rnd() * 0.5) * s, lh = k === 0 ? 3.9 : 3.3 + rnd() * 1.4, ls = (k === 0 ? 1.55 : 0.95 + rnd() * 0.45) * s;
      setI(canopies, i * nLump + k, t[0] + Math.cos(a) * rr, lh * s, t[1] + Math.sin(a) * rr, ls, ls * (0.8 + rnd() * 0.2), ls, rnd() * 6);
      canopies.setColorAt(i * nLump + k, base.clone().multiplyScalar(0.85 + rnd() * 0.3));
    }
  });
  trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true; canopies.instanceColor!.needsUpdate = true;
  canopies.frustumCulled = false; trunks.frustumCulled = false;

  /* ---- village houses around the campus ---- */
  {
    // [x, z, facing (rad), width, depth, wall height]; kept off the tree positions above
    const houses: [number, number, number, number, number, number][] = [
      [36, -6, -1.57, 5.5, 4.5, 2.6], [45, 7, -1.9, 4.6, 4.2, 2.4], [39, 17, -1.2, 5, 4.4, 2.5], [47, -17, -1.5, 5.2, 4.6, 2.7], [53, 24, -1.7, 4.8, 4.2, 2.4],
      [-36, -4, 1.57, 5.5, 4.5, 2.6], [-45, 8, 1.9, 4.6, 4.2, 2.4], [-39, -18, 1.4, 5, 4.4, 2.5], [-49, 25, 1.7, 5.2, 4.4, 2.5], [-37, 36, 1.2, 4.6, 4.2, 2.4],
      [-14, -36, 3.14, 5.4, 4.4, 2.6], [11, -39, 3.0, 5, 4.4, 2.5], [29, -35, 3.3, 4.8, 4.2, 2.4],
      [-23, 54, 0.2, 5, 4.4, 2.5], [17, 58, -0.2, 5.4, 4.6, 2.6], [-5, 65, 0, 4.8, 4.2, 2.4]
    ];
    const hs = houses.filter((h) => !trees.some((t) => Math.hypot(t[0] - h[0], t[1] - h[1]) < 6));
    const wallCols = ['#E8DCC8', '#D9CFC0', '#CFC6B4', '#E6D2B5', '#DDD3C2'].map((h) => new THREE.Color(h));
    const roofCols = ['#B5654A', '#8A5A44', '#7A8794', '#A3573F'].map((h) => new THREE.Color(h));
    const wallTex = surf(256, '#FFFFFF', { amp: 0.06, cells: 4, oct: 5, seed: 23, after: stains });
    const roofTex = surf(256, '#FFFFFF', { amp: 0.12, cells: 6, oct: 4, seed: 24, after: (g, sz) => { g.fillStyle = 'rgba(40,24,16,0.35)'; for (let y = 0; y < sz; y += 16) g.fillRect(0, y, sz, 2); } });
    roofTex.repeat.set(1, 2);
    const mk = (geo: THREE.BufferGeometry, o: THREE.MeshStandardMaterialParameters, n = hs.length) => inst(geo, new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.9 }, o)), n);
    const walls = mk(unitBox, { map: wallTex }), roofs = mk(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), { map: roofTex, roughness: 0.8 }), doors = mk(unitBox, { map: wood.map, roughness: 0.7 });
    const plinths = mk(unitBox, { map: wallTex }), glass = mk(unitBox, { roughness: 0.12, metalness: 0.4 }, hs.length * 2), sills = mk(unitBox, {}, hs.length * 2);
    const frameC = new THREE.Color('#EFE9DD'), glassC = new THREE.Color('#2E3E4A'), plC = new THREE.Color('#A89E8C');
    hs.forEach((h, i) => {
      const [x, z, ry, w, d, hh] = h;
      const rh = 1.5, fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
      setI(walls, i, x, hh / 2, z, w, hh, d, ry);
      setI(plinths, i, x, 0.17, z, w + 0.06, 0.34, d + 0.06, ry);
      setI(roofs, i, x, hh + rh / 2, z, (w / Math.SQRT2) * 1.18, rh, (d / Math.SQRT2) * 1.18, ry);
      setI(doors, i, x + fx * (d / 2 + 0.03) + rx * w * 0.08, 0.57, z + fz * (d / 2 + 0.03) + rz * w * 0.08, 0.84, 1.14, 0.06, ry);
      [-1, 1].forEach((sd, k) => {
        const off = sd > 0 ? w * 0.33 : -w * 0.3, px = x + fx * (d / 2 + 0.02) + rx * off, pz = z + fz * (d / 2 + 0.02) + rz * off;
        setI(sills, i * 2 + k, px, 1.12, pz, 0.88, 0.96, 0.05, ry); sills.setColorAt(i * 2 + k, frameC);
        setI(glass, i * 2 + k, px + fx * 0.02, 1.12, pz + fz * 0.02, 0.7, 0.8, 0.05, ry); glass.setColorAt(i * 2 + k, glassC);
      });
      walls.setColorAt(i, wallCols[i % 5]); roofs.setColorAt(i, roofCols[i % 4]); doors.setColorAt(i, new THREE.Color('#6A503C')); plinths.setColorAt(i, plC);
    });
    [walls, roofs, doors, plinths, glass, sills].forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; });
  }

  /* ---- students walking in ---- */
  const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.45, 8, 16);
  const headGeo = new THREE.SphereGeometry(0.1, 24, 18);
  const hairGeo = new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const legGeo = new THREE.CylinderGeometry(0.052, 0.045, 0.62, 10);
  const armGeo = new THREE.CapsuleGeometry(0.036, 0.36, 4, 10);
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.06, 0.2);
  const neckGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.08, 10);
  const bagGeo = new THREE.BoxGeometry(0.28, 0.34, 0.14);
  const skinCols = ['#8D5B3F', '#A06D4E', '#B07C5C', '#7A4E35', '#9A6648'];
  const bagCols = ['#4A5A6E', '#8A6A4A', '#5E6B52', '#6B4F5C', '#3F4E5E'];
  W.walkers = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.Group(), skinM = M(skinCols[i % 5], { roughness: 0.65 }), shirtM = M(i % 3 === 0 ? '#DCE5EE' : '#F1F0EC', { roughness: 0.9 });
    const trM = M(i % 4 === 1 ? '#3A2F4A' : '#2A3346', { roughness: 0.9 });
    const body = new THREE.Mesh(bodyGeo, shirtM); body.position.y = 1.0; body.scale.set(0.95, 1, 0.78); body.castShadow = true; g.add(body);
    const neck = new THREE.Mesh(neckGeo, skinM); neck.position.y = 1.36; g.add(neck);
    const head = new THREE.Mesh(headGeo, skinM); head.position.y = 1.44; head.scale.set(0.92, 1.06, 0.95); head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(hairGeo, M(i % 5 === 3 ? '#3A2A20' : '#1E1A17', { roughness: 0.8 })); hair.position.set(0, 1.455, -0.012); hair.scale.set(1, 1.06, 1.02); g.add(hair);
    if (i % 3 === 1) { const plait = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.26, 4, 8), M('#1E1A17')); plait.position.set(0, 1.28, -0.11); plait.castShadow = true; g.add(plait); }
    [-1, 1].forEach((sd) => { const arm = new THREE.Mesh(armGeo, shirtM); arm.position.set(sd * 0.2, 1.1, 0); arm.rotation.z = sd * 0.05; arm.castShadow = true; g.add(arm); const hnd = new THREE.Mesh(neckGeo, skinM); hnd.scale.set(1.1, 1.1, 1.1); hnd.position.set(sd * 0.215, 0.88, 0); g.add(hnd); });
    const mkLeg = (x: number) => { const l = new THREE.Mesh(legGeo, trM); l.position.set(x, 0.36, 0); l.castShadow = true; const sh = new THREE.Mesh(shoeGeo, M('#1E1A17', { roughness: 0.6 })); sh.position.set(0, -0.3, 0.04); l.add(sh); g.add(l); return l; };
    const l1 = mkLeg(-0.07), l2 = mkLeg(0.07);
    const bag = new THREE.Mesh(bagGeo, M(bagCols[i % 5], { roughness: 0.75 })); bag.position.set(0, 1.08, -0.17); bag.castShadow = true; g.add(bag);
    const sc = 0.82 + (i % 4) * 0.05; g.scale.setScalar(sc);
    add(g);
    W.walkers.push({ g: g, l1: l1, l2: l2, off: i * 3.4 + (i % 2) * 1.3, lane: [-1.1, 0.2, 1.0, -0.4][i % 4], speed: 1.05 + (i % 3) * 0.12 });
  }

  /* ---- campus props: shrubs, road, street lamps, flag ---- */
  useSlot(null);
  {
    const pr = pcRand(41);
    // foundation planting along the facade, with a few flowering shrubs
    const shrubXs: number[] = [];
    for (let x = -21; x <= 21; x += 1.9) { if ((x > -10.4 && x < -4.2) || Math.abs(x) < 4.4) continue; shrubXs.push(x + (pr() - 0.5) * 0.6); }
    const shrubs = inst(lumpGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true }), shrubXs.length);
    const shrubCols = ['#587448', '#667F4E', '#4E6A42', '#738656'].map((h) => new THREE.Color(h));
    shrubXs.forEach((x, i) => { const sc = 0.42 + pr() * 0.22; setI(shrubs, i, x, sc * 0.75, 1.0 + pr() * 0.25, sc * 1.15, sc * 0.85, sc, pr() * 6); shrubs.setColorAt(i, shrubCols[i % 4]); });
    shrubs.instanceMatrix.needsUpdate = true; shrubs.instanceColor!.needsUpdate = true;
    const nFl = 90, flowers = inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), nFl, false);
    const flCols = ['#E8C23A', '#D86A8C', '#F4EFE4', '#E07B39'].map((h) => new THREE.Color(h));
    for (let i = 0; i < nFl; i++) { const sx = shrubXs[Math.floor(pr() * shrubXs.length)] + (pr() - 0.5) * 0.7; setI(flowers, i, sx, 0.4 + pr() * 0.3, 1.2 + pr() * 0.2, 0.035, 0.035, 0.035); flowers.setColorAt(i, flCols[i % 4]); }
    flowers.instanceMatrix.needsUpdate = true; flowers.instanceColor!.needsUpdate = true;

    // road past the gate, with kerb and centre dashes
    flat(-120, 120, 42.5, 50.5, 0.016, asphalt);
    flat(-2.6, 2.6, 40, 42.5, 0.012, pathM);
    B(-120, 120, 0, 0.14, 41.9, 42.5, concrete); B(-120, 120, 0, 0.14, 50.5, 51.1, concrete);
    const dash = M('#E9E5DA', { roughness: 0.8 });
    for (let x = -112; x < 112; x += 6) flat(x, x + 3, 46.35, 46.65, 0.02, dash);

    // street lamps along the entrance path
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 4.2, 10);
    [[-3.3, 18], [3.3, 18], [-3.3, 30], [3.3, 30], [-9, 8], [9, 8]].forEach((q) => {
      const pole = new THREE.Mesh(poleGeo, metal); pole.position.set(q[0], 2.1, q[1]); pole.castShadow = true; add(pole);
      B(q[0] - 0.05, q[0] + 0.05, 4.1, 4.16, q[1] - 0.12, q[1] + 0.12, metal);
      B(q[0] - 0.14, q[0] + 0.14, 4.16, 4.24, q[1] - 0.2, q[1] + 0.2, metal);
      B(q[0] - 0.11, q[0] + 0.11, 4.12, 4.16, q[1] - 0.16, q[1] + 0.16, lightPanel, false, false);
    });

    // flagpole on the forecourt
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 7, 10), M('#C9CCD0', { metalness: 0.7, roughness: 0.35 })); pole.position.set(-13, 3.5, 9); pole.castShadow = true; add(pole);
    B(-13.5, -12.5, 0, 0.3, 8.5, 9.5, concrete);
    const flagTex = ctex(300, 200, (c, w, h) => { c.fillStyle = '#E8892B'; c.fillRect(0, 0, w, h / 3); c.fillStyle = '#F5F3EC'; c.fillRect(0, h / 3, w, h / 3); c.fillStyle = '#2E8B4A'; c.fillRect(0, 2 * h / 3, w, h / 3); c.strokeStyle = '#2B3A8C'; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, h / 2, 26, 0, Math.PI * 2); c.stroke(); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * 26, h / 2 + Math.sin(a) * 26); c.stroke(); } });
    const flagGeo = new THREE.PlaneGeometry(1.5, 1, 14, 1); const fp = flagGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) { const u = (fp.getX(i) + 0.75) / 1.5; fp.setZ(i, Math.sin(u * 7) * 0.05 * u); }
    flagGeo.computeVertexNormals();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.85, side: THREE.DoubleSide })); flag.position.set(-12.2, 6.2, 9); flag.rotation.y = 0.35; flag.castShadow = true; add(flag);
  }

  /* ---- corridor ---- */
  useSlot('classroom');
  const corkTex = ctex(512, 256, (c, w, h) => {
    c.fillStyle = '#B99B72'; c.fillRect(0, 0, w, h);
    const r2 = pcRand(3); const cols = ['#F6F3EC', '#E9E2D2', '#DCE5EE', '#F1E3C8'];
    for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % 4]; c.save(); c.translate(30 + (i % 5) * 96 + r2() * 12, 30 + Math.floor(i / 5) * 110 + r2() * 14); c.rotate((r2() - 0.5) * 0.08); c.fillRect(0, 0, 70 + r2() * 20, 82); c.fillStyle = '#B9B2A4'; for (let k = 0; k < 5; k++) c.fillRect(8, 14 + k * 12, 50, 3); c.restore(); }
  });
  const corkMat = M('#ffffff', { map: corkTex });
  P(2.6, 1.2, corkMat, -1.585, 1.6, -5.5, Math.PI / 2);
  B(-1.6, -1.2, 0, 0.45, -10.5, -8.5, wood);
  // closed door at the far end of the corridor (centred on the corridor, frame proud of the wall)
  { const cx = 0.2;
    const dOff = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const dFrame = M('#2D3236', Object.assign({ roughness: 0.55, metalness: 0.3 }, dOff)), dLeaf = M('#A47B55', Object.assign({ roughness: 0.7 }, dOff));
    const dPanel = M('#7E5C3E', Object.assign({ roughness: 0.7 }, dOff)), dMetal = M('#3A4046', Object.assign({ roughness: 0.5, metalness: 0.45 }, dOff));
    B(cx - 0.56, cx - 0.5, 0, 2.16, -12.78, -12.7, dFrame, false); B(cx + 0.5, cx + 0.56, 0, 2.16, -12.78, -12.7, dFrame, false); B(cx - 0.56, cx + 0.56, 2.1, 2.16, -12.78, -12.7, dFrame, false);
    B(cx - 0.5, cx + 0.5, 0, 2.1, -12.74, -12.7, dLeaf, false);
    B(cx - 0.36, cx + 0.36, 1.2, 1.95, -12.755, -12.74, dPanel, false); B(cx - 0.36, cx + 0.36, 0.15, 1.05, -12.755, -12.74, dPanel, false);
    B(cx + 0.33, cx + 0.45, 1.0, 1.04, -12.79, -12.755, dMetal, false); B(cx + 0.4, cx + 0.44, 0.96, 1.08, -12.76, -12.755, dMetal, false); }
  [-2.5, -6.5, -10.5].forEach((z) => B(-0.1, 0.5, 3.57, 3.6, z - 0.6, z + 0.6, lightPanel, false, false));
  const plateTex = ctex(256, 128, (c, w, h) => { c.fillStyle = '#2B3036'; c.fillRect(0, 0, w, h); c.fillStyle = '#F2EFE8'; c.font = '600 54px Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('IX – B', w / 2, h / 2 + 2); });
  P(0.42, 0.21, M('#ffffff', { map: plateTex }), 1.985, 2.0, -8.5, -Math.PI / 2);
  // memorial portrait on the left-hand corridor wall
  const portrait = new Image();
  portrait.onload = () => W.redrawTextures && W.redrawTextures();
  portrait.src = import.meta.env.BASE_URL + 'zubeen-garg.png';
  const portraitTex = ctex(640, 1120, (c, w, h) => {
    c.fillStyle = '#16120F'; c.fillRect(0, 0, w, h);
    if (portrait.complete && portrait.naturalWidth) c.drawImage(portrait, 0, 0, w, 790);
    c.fillStyle = '#1B1613'; c.fillRect(0, 790, w, h - 790);
    c.fillStyle = '#E8D9B5'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 44px Sora, sans-serif'; c.fillText('Dr. Zubeen Garg', w / 2, 850);
    c.fillStyle = '#C9A47C'; c.font = '500 34px Sora, sans-serif'; c.fillText('Nov 18, 1972 – Sept 19, 2025', w / 2, 920);
    c.fillStyle = '#E8D9B5'; c.font = '700 76px "Noto Sans Bengali", "Bangla Sangam MN", "Kohinoor Bangla", sans-serif'; c.fillText('শ্ৰদ্ধাঞ্জলি', w / 2, 1022);
    c.fillStyle = '#C9A47C'; c.font = 'italic 400 28px Sora, sans-serif'; c.fillText('(srod.dhan.jo.li)', w / 2, 1088);
  });
  P(1.2, 2.1, M('#ffffff', { map: portraitTex, roughness: 0.6 }), -1.585, 1.85, -2.8, Math.PI / 2);
  if (document.fonts) document.fonts.load('700 76px "Noto Sans Bengali"', 'শ্ৰ').then(() => W.redrawTextures && W.redrawTextures()).catch(() => {});
  const ceilMat = M('#F1EEE8', { emissive: new THREE.Color('#4A4740'), roughness: 0.95 });
  flat(-1.6, 2.0, -12.7, 0, 3.595, ceilMat, Math.PI / 2);

  /* ---- classroom shell details ---- */
  B(2.3, 14, 0, 0.95, -12.7, -12.66, sage, false);
  B(2.3, 2.34, 0, 0.95, -12.7, -8.0, sage, false); B(2.3, 2.34, 0, 0.95, -6.0, -0.3, sage, false);
  [[5, -3.4], [8.6, -3.4], [12.2, -3.4], [5, -10.4], [8.6, -10.4], [12.2, -10.4]].forEach((q) => B(q[0] - 0.6, q[0] + 0.6, 3.575, 3.6, q[1] - 0.3, q[1] + 0.3, lightPanel, false, false));
  flat(2.3, 14, -12.7, -0.3, 3.595, ceilMat, Math.PI / 2);
  W.fans = [];
  const bladeGeo = new THREE.BoxGeometry(0.62, 0.012, 0.11);
  const fanMat = M('#E8E5DE', { roughness: 0.6 });
  [[6.2, -4.6], [10.2, -4.6], [6.2, -9.4], [10.2, -9.4]].forEach((q, i) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 8), fanMat); rod.position.set(q[0], 3.39, q[1]); add(rod);
    const g = new THREE.Group(); g.position.set(q[0], 3.15, q[1]);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 16), fanMat); g.add(hub);
    for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(bladeGeo, fanMat); const a = k * Math.PI * 2 / 3; bl.position.set(Math.cos(a) * 0.38, -0.01, Math.sin(a) * 0.38); bl.rotation.y = -a; bl.castShadow = true; g.add(bl); }
    g.rotation.y = i; add(g); W.fans.push(g);
  });
  const posterTex = [
    ctex(320, 420, (c, w, h) => { c.fillStyle = '#F5F2EA'; c.fillRect(0, 0, w, h); c.fillStyle = '#2B3540'; c.font = '600 22px Sora, sans-serif'; c.fillText('LAWS OF MOTION', 28, 52); c.strokeStyle = '#2B3540'; c.lineWidth = 4; for (let i = 0; i < 3; i++) { const y = 120 + i * 100; c.strokeRect(30, y, 60, 40); c.beginPath(); c.moveTo(110, y + 20); c.lineTo(200, y + 20); c.stroke(); c.beginPath(); c.moveTo(200, y + 20); c.lineTo(186, y + 10); c.moveTo(200, y + 20); c.lineTo(186, y + 30); c.stroke(); c.fillStyle = '#C9A47C'; c.fillRect(220, y + 8, 60, 24); c.fillStyle = '#2B3540'; } }),
    ctex(320, 420, (c, w, h) => { c.fillStyle = '#1F2A36'; c.fillRect(0, 0, w, h); c.fillStyle = '#E8E2D4'; c.font = '600 22px Sora, sans-serif'; c.fillText('SOLAR SYSTEM', 28, 52); c.fillStyle = '#E2B464'; c.beginPath(); c.arc(-40, 250, 120, 0, Math.PI * 2); c.fill(); const pl: [number, number, string][] = [[110, 7, '#B8B2A6'], [140, 10, '#D9B98A'], [175, 11, '#7FA2C2'], [205, 8, '#C27C5C'], [250, 22, '#D8BC94'], [290, 18, '#E1CFA3']]; pl.forEach((q) => { c.fillStyle = q[2]; c.beginPath(); c.arc(q[0], 250, q[1], 0, Math.PI * 2); c.fill(); }); }),
    ctex(320, 420, (c, w, h) => { c.fillStyle = '#F5F2EA'; c.fillRect(0, 0, w, h); c.fillStyle = '#2B3540'; c.font = '600 22px Sora, sans-serif'; c.fillText('PERIODIC TABLE', 28, 52); const cl = ['#C9D6CF', '#E5D3B8', '#D3D9E6', '#E6CFC8']; for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) { if (j < 2 && i > 0 && i < 8) continue; c.fillStyle = cl[(i + j) % 4]; c.fillRect(28 + i * 30, 90 + j * 34, 26, 30); } })
  ];
  posterTex.forEach((t, i) => P(0.8, 1.05, M('#ffffff', { map: t }), 5.0 + i * 2.6, 1.95, -12.685));
  P(1.6, 1.0, corkMat, 2.315, 1.7, -10.6, Math.PI / 2);
  const clockTex = ctex(256, 256, (c, w, h) => { c.fillStyle = '#F5F3EE'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#2B3036'; c.lineWidth = 10; c.stroke(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.lineWidth = 6; c.beginPath(); c.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); c.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); c.stroke(); } c.lineWidth = 8; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 50, 128 - 30); c.stroke(); c.lineWidth = 5; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 10, 128 - 90); c.stroke(); });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.6 })); clock.position.set(2.315, 2.85, -3.4); clock.rotation.y = Math.PI / 2; add(clock);
  B(2.3, 2.72, 0, 1.9, -12.6, -11.0, wood);
  const bookCols = ['#5B6E8C', '#9C6B4F', '#6F7E57', '#C9A47C', '#7A5C6E', '#3F4E5E'];
  const shelfBooks = inst(unitBox, white(), 30, false);
  for (let i = 0; i < 30; i++) { const row = Math.floor(i / 10), k = i % 10; setI(shelfBooks, i, 2.55, 0.35 + row * 0.6 + 0.12, -12.45 + k * 0.14, 0.24, 0.24 + (k % 3) * 0.03, 0.1); shelfBooks.setColorAt(i, new THREE.Color(bookCols[(i * 7) % 6])); }
  shelfBooks.instanceMatrix.needsUpdate = true; shelfBooks.instanceColor!.needsUpdate = true;
  for (let s = 0; s < 3; s++) B(2.3, 2.75, 0.3 + s * 0.6, 0.33 + s * 0.6, -12.6, -11.0, woodDark, false);
  win.forEach((q) => B(q[0], q[1], 0.86, 0.92, -0.44, -0.3, plasterIn, false));

  /* ---- smartboard ---- */
  B(13.9, 13.99, 0.95, 2.9, -9.25, -4.75, M('#1D2126', { roughness: 0.4, metalness: 0.3 }));
  B(13.82, 13.99, 0.86, 0.95, -9.0, -5.0, M('#2A2F35', { roughness: 0.5, metalness: 0.3 }));
  B(13.97, 14.0, 1.0, 2.8, -11.7, -9.9, M('#F1F0EC', { roughness: 0.4 }));
  B(13.97, 14.0, 1.0, 2.8, -4.1, -2.3, M('#F1F0EC', { roughness: 0.4 }));
  const bc = document.createElement('canvas'); bc.width = 1600; bc.height = 686;
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = maxAniso; btex.generateMipmaps = false; btex.minFilter = THREE.LinearFilter;
  const boardMat = new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, color: new THREE.Color(0.93, 0.93, 0.93) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.8), boardMat);
  screen.position.set(13.885, 1.925, -7); screen.rotation.y = -Math.PI / 2; scene.add(screen);
  W.board = { canvas: bc, ctx: bc.getContext('2d') as CanvasRenderingContext2D, tex: btex, key: '' };

  /* ---- teacher desk ---- */
  B(11.4, 12.2, 0.74, 0.78, -11.7, -10.0, wood);
  B(11.42, 11.46, 0.05, 0.74, -11.68, -10.02, woodDark);
  B(11.46, 12.18, 0, 0.74, -11.7, -11.62, woodDark); B(11.46, 12.18, 0, 0.74, -10.08, -10.0, woodDark);
  B(11.7, 12.0, 0.78, 0.795, -11.0, -10.55, M('#B9BDC2', { metalness: 0.5, roughness: 0.35 }));
  const lid = new THREE.Mesh(unitBox, M('#B9BDC2', { metalness: 0.5, roughness: 0.35 })); lid.scale.set(0.012, 0.28, 0.45); lid.position.set(12.04, 0.92, -10.775); lid.rotation.z = 0.25; lid.castShadow = true; add(lid);
  B(11.5, 11.78, 0.78, 0.86, -11.6, -11.25, M('#5B6E8C')); B(11.52, 11.76, 0.86, 0.9, -11.58, -11.28, M('#C9A47C'));

  /* ---- desks, chairs, students ---- */
  const rows = [4.6, 5.85, 7.1, 8.35, 9.6, 10.85];
  const cols = [-10.9, -8.9, -7.0, -5.1, -3.1]; // five columns; the centre one fills the aisle (camera keys in config.js keep to the 1 m aisle beside it)
  const desks: [number, number][] = [];
  rows.forEach((dx) => cols.forEach((cz) => desks.push([dx, cz])));
  const FS = desks.findIndex((d) => d[0] === 7.1 && d[1] === -5.1); // desk of the foreground (over-the-shoulder) student
  const nD = desks.length;
  const deskTop = inst(unitBox, wood, nD);
  const legs = inst(unitBox, metal, nD * 8);
  const seats = inst(unitBox, woodDark, nD * 2);
  const books = inst(unitBox, white({ roughness: 0.9 }), nD * 2);
  let li = 0;
  desks.forEach((d, i) => {
    const dx = d[0], cz = d[1], sx = dx - 0.5;
    setI(deskTop, i, dx, 0.735, cz, 0.5, 0.03, 0.9);
    [[-0.22, -0.42], [0.22, -0.42], [-0.22, 0.42], [0.22, 0.42]].forEach((o) => setI(legs, li++, dx + o[0], 0.36, cz + o[1], 0.03, 0.72, 0.03));
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach((o) => setI(legs, li++, sx + o[0], 0.22, cz + o[1], 0.025, 0.44, 0.025));
    setI(seats, i * 2, sx, 0.455, cz, 0.4, 0.03, 0.4);
    setI(seats, i * 2 + 1, sx - 0.21, 0.66, cz, 0.025, 0.38, 0.4);
    const rr = ((i * 37) % 11) / 11 - 0.5;
    setI(books, i * 2, dx - 0.04, 0.755, cz + 0.12, 0.26, 0.012, 0.36, rr * 0.3);
    books.setColorAt(i * 2, new THREE.Color('#F4F2EC'));
    setI(books, i * 2 + 1, dx + 0.08, 0.765, cz - 0.24, 0.2, 0.03, 0.26, rr * 0.5);
    books.setColorAt(i * 2 + 1, new THREE.Color(bookCols[i % 6]));
  });
  [deskTop, legs, seats, books].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  books.instanceColor!.needsUpdate = true;
  useSlot('students');
  const studs = desks.filter((d, i) => i !== FS);
  const nS = studs.length;
  const torsoGeo = new THREE.CapsuleGeometry(0.15, 0.3, 4, 12);
  const unitSphere = new THREE.SphereGeometry(1, 20, 14);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const torsos = inst(torsoGeo, white(), nS);
  const heads = inst(unitSphere, white({ roughness: 0.7 }), nS);
  const hairs = inst(unitSphere, M('#1E1A17', { roughness: 0.8 }), nS);
  const arms = inst(unitCyl, white(), nS * 4);
  const trousers = M('#2A3346', { roughness: 0.9 });
  const thighs = inst(unitCyl, trousers, nS * 2), shins = inst(unitCyl, trousers, nS * 2), shoes = inst(unitBox, M('#1E1A17', { roughness: 0.7 }), nS * 2);
  const shirtCols = ['#F1F0EC', '#F1F0EC', '#DCE5EE', '#2A3346', '#F1F0EC'];
  W.studs = []; let ai = 0;
  studs.forEach((d, i) => {
    const sx = d[0] - 0.5, cz = d[1];
    const sh = shirtCols[(i * 3) % 5];
    setI(torsos, i, sx, 0.79, cz, 0.82, 1, 1.25);
    torsos.setColorAt(i, new THREE.Color(sh));
    heads.setColorAt(i, new THREE.Color(skinCols[(i * 7) % 5]));
    [-1, 1].forEach((sd) => {
      const s = new THREE.Vector3(sx + 0.02, 1.0, cz + sd * 0.19), e = new THREE.Vector3(sx + 0.16, 0.8, cz + sd * 0.17), h = new THREE.Vector3(sx + 0.44, 0.79, cz + sd * 0.09);
      setSeg(arms, ai, s, e, 0.045); arms.setColorAt(ai++, new THREE.Color(sh));
      setSeg(arms, ai, e, h, 0.04); arms.setColorAt(ai++, new THREE.Color(skinCols[(i * 7) % 5]));
    });
    [-1, 1].forEach((sd, k) => { // seated legs: thigh along the seat, shin down to the floor, shoe on it
      const z = cz + sd * 0.1, hip = new THREE.Vector3(sx + 0.02, 0.55, z), knee = new THREE.Vector3(sx + 0.4, 0.54, z), foot = new THREE.Vector3(sx + 0.42, 0.06, z);
      setSeg(thighs, i * 2 + k, hip, knee, 0.065); setSeg(shins, i * 2 + k, knee, foot, 0.05);
      setI(shoes, i * 2 + k, foot.x + 0.04, 0.035, z, 0.2, 0.07, 0.09);
    });
    W.studs.push({ x: sx, z: cz, ph: i * 1.7, yaw: (cz < -7.5 ? -0.12 : cz > -6.5 ? 0.12 : 0) * (1 - (d[0] - 4.6) / 8) });
  });
  torsos.instanceMatrix.needsUpdate = true; torsos.instanceColor!.needsUpdate = true;
  thighs.instanceMatrix.needsUpdate = true; shins.instanceMatrix.needsUpdate = true; shoes.instanceMatrix.needsUpdate = true;
  heads.instanceColor!.needsUpdate = true; arms.instanceMatrix.needsUpdate = true; arms.instanceColor!.needsUpdate = true;
  W.heads = heads; W.hairs = hairs; W.dummy = dummy;
  // matrices are written per frame, after the first render would have cached an origin-only bounding sphere
  heads.frustumCulled = hairs.frustumCulled = false;
  // heads/hairs are positioned per frame once the classroom is visible; until then collapse them (an identity matrix is a unit sphere at the origin: the black dome at the entrance)
  dummy.position.set(0, -10, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix();
  for (let i = 0; i < nS; i++) { heads.setMatrixAt(i, dummy.matrix); hairs.setMatrixAt(i, dummy.matrix); }
  heads.instanceMatrix.needsUpdate = hairs.instanceMatrix.needsUpdate = true;

  /* ---- foreground student (camera sits behind) ---- */
  const fsd = desks[FS]; const fx = fsd[0] - 0.5, fz = fsd[1];
  W.fgSeat = { x: fx, z: fz };
  const fg = new THREE.Group(); fg.position.set(fx, 0, fz); add(fg);
  const navy = M('#283247', { roughness: 0.9 }), shirt = M('#F1F0EC', { roughness: 0.85 }), skin = M('#9A6648', { roughness: 0.65 }), hairM = M('#1B1714', { roughness: 0.75 });
  const fTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 8, 24), navy); fTorso.position.y = 0.79; fTorso.scale.set(0.82, 1, 1.28); fTorso.castShadow = true; fg.add(fTorso);
  const fSh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 8, 20), navy); fSh.position.set(0, 0.97, 0); fSh.rotation.x = Math.PI / 2; fSh.castShadow = true; fg.add(fSh);
  const fCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.07, 20), shirt); fCollar.position.y = 1.07; fg.add(fCollar);
  const fNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 16), skin); fNeck.position.y = 1.12; fg.add(fNeck);
  const fHeadG = new THREE.Group(); fHeadG.position.y = 1.13; fg.add(fHeadG);
  const fHead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), skin); fHead.position.y = 0.1; fHead.scale.set(0.95, 1.08, 0.9); fHeadG.add(fHead);
  const fHair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM); fHair.position.set(-0.012, 0.115, 0); fHair.scale.set(1.0, 1.05, 0.95); fHair.rotation.z = 0.28; fHeadG.add(fHair);
  const fEarL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), skin); fEarL.position.set(0, 0.09, 0.098); fHeadG.add(fEarL);
  const fEarR = fEarL.clone(); fEarR.position.z = -0.098; fHeadG.add(fEarR);
  [-1, 1].forEach((sd) => {
    const ua = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 6, 14), navy);
    const s = new THREE.Vector3(0.02, 0.97, sd * 0.2), e = new THREE.Vector3(0.17, 0.79, sd * 0.18);
    const d = new THREE.Vector3().subVectors(e, s); ua.position.copy(s).addScaledVector(d, 0.5); ua.quaternion.setFromUnitVectors(UP, d.clone().normalize()); ua.castShadow = true; fg.add(ua);
    const fa = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 6, 14), shirt);
    const h = new THREE.Vector3(0.44, 0.785, sd * 0.08); const d2 = new THREE.Vector3().subVectors(h, e); fa.position.copy(e).addScaledVector(d2, 0.5); fa.quaternion.setFromUnitVectors(UP, d2.clone().normalize()); fa.castShadow = true; fg.add(fa);
  });
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8), M('#2E57C9')); pen.position.set(0.47, 0.775, -0.06); pen.rotation.set(Math.PI / 2, 0.6, 0); fg.add(pen);
  const fTrousers = M('#1F2736', { roughness: 0.9 }), fShoe = M('#1E1A17', { roughness: 0.7 });
  [-1, 1].forEach((sd) => {
    const hip = new THREE.Vector3(0.02, 0.55, sd * 0.1), knee = new THREE.Vector3(0.4, 0.54, sd * 0.1), foot = new THREE.Vector3(0.42, 0.06, sd * 0.1), UPv = new THREE.Vector3(0, 1, 0);
    [[hip, knee, 0.065], [knee, foot, 0.05]].forEach((q) => {
      const a = q[0] as THREE.Vector3, b = q[1] as THREE.Vector3, d2 = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(q[2] as number, q[2] as number, d2.length(), 12), fTrousers);
      m.position.copy(a).addScaledVector(d2, 0.5); m.quaternion.setFromUnitVectors(UPv, d2.clone().normalize()); m.castShadow = true; fg.add(m);
    });
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.09), fShoe); sh.position.set(foot.x + 0.04, 0.035, foot.z); sh.castShadow = true; fg.add(sh);
  });
  W.fs = { torso: fTorso, head: fHeadG, sh: fSh };

  /* ---- teacher ---- */
  useSlot('teacher');
  const tg = new THREE.Group(); tg.position.set(13.05, 0, -9.4); add(tg);
  const kurta = M('#3D5D61', { roughness: 0.9 }), trou = M('#E9E3D6'), tSkin = M('#A87556', { roughness: 0.65 });
  const tLegGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.62, 12);
  [-0.085, 0.085].forEach((x) => { const l = new THREE.Mesh(tLegGeo, trou); l.position.set(x, 0.31, 0); l.castShadow = true; tg.add(l); });
  const kb = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.25, 1.04, 20), kurta); kb.position.y = 0.94; kb.castShadow = true; tg.add(kb);
  const ks = new THREE.Mesh(new THREE.SphereGeometry(0.168, 20, 12), kurta); ks.position.y = 1.44; ks.scale.set(1.18, 0.42, 0.82); ks.castShadow = true; tg.add(ks);
  const stole = new THREE.Mesh(unitBox, M('#C9A47C')); stole.scale.set(0.09, 0.85, 0.02); stole.position.set(0.05, 1.08, 0.15); stole.rotation.z = 0.32; tg.add(stole);
  const tn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12), tSkin); tn.position.y = 1.52; tg.add(tn);
  const th = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 18), tSkin); th.position.y = 1.65; th.scale.set(0.92, 1.08, 0.95); th.castShadow = true; tg.add(th);
  const thr = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), hairM); thr.position.set(0, 1.665, -0.012); tg.add(thr);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 12), hairM); bun.position.set(0, 1.62, -0.115); tg.add(bun);
  const mkArm = (sd: number) => {
    const sp = new THREE.Group(); sp.position.set(sd * 0.2, 1.43, 0); tg.add(sp);
    const ua = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.22, 6, 12), kurta); ua.position.y = -0.15; ua.castShadow = true; sp.add(ua);
    const el = new THREE.Group(); el.position.y = -0.3; sp.add(el);
    const fa = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 6, 12), tSkin); fa.position.y = -0.13; fa.castShadow = true; el.add(fa);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), tSkin); hand.position.y = -0.28; el.add(hand);
    return { sp: sp, el: el, hand: hand };
  };
  const armR = mkArm(-1), armL = mkArm(1);
  const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8), M('#2A2F35')); stylus.position.set(0, -0.32, 0.03); stylus.rotation.x = 0.5; armR.el.add(stylus);
  W.teacher = { g: tg, armR: armR, armL: armL };

  useSlot(null);
  /* ---- light shafts + dust ---- */
  const sp: number[] = [], sc: number[] = [];
  const warm = [0.085, 0.065, 0.04], cool = [0.0, 0.0, 0.0];
  win.forEach((q) => {
    const z = -0.3;
    const pts = [[q[0], 0.92], [q[1], 0.92], [q[1], 2.68], [q[0], 2.68]].map((a) => new THREE.Vector3(a[0], a[1], z));
    const pr = pts.map((v) => v.clone().addScaledVector(sunDir, (v.y / -sunDir.y) * 0.97));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      [pts[i], pts[j], pr[j], pts[i], pr[j], pr[i]].forEach((v, k) => { sp.push(v.x, v.y, v.z); const c = (k === 0 || k === 1 || k === 3) ? warm : cool; sc.push(c[0], c[1], c[2]); });
    }
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const shaftMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shafts = new THREE.Mesh(sg, shaftMat); shafts.frustumCulled = false; scene.add(shafts); W.shaftMat = shaftMat;
  const nDust = 160, dpos = new Float32Array(nDust * 3), dr = pcRand(11);
  W.dustBase = [];
  for (let i = 0; i < nDust; i++) { const b: [number, number, number, number] = [3 + dr() * 10.5, 0.3 + dr() * 2.6, -0.6 - dr() * 3.6, dr() * 6.28]; W.dustBase.push(b); dpos[i * 3] = b[0]; dpos[i * 3 + 1] = b[1]; dpos[i * 3 + 2] = b[2]; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dustMat = new THREE.PointsMaterial({ color: new THREE.Color('#FFE6C2'), size: 0.014, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; scene.add(dust); W.dust = dust; W.dustMat = dustMat;

  /* ---- camera path ---- */
  W.ct = PC_KEYS.map((k) => k[0]);
  W.cPos = new THREE.CatmullRomCurve3(PC_KEYS.map((k) => new THREE.Vector3(k[1][0], k[1][1], k[1][2])), false, 'centripetal');
  W.cLook = new THREE.CatmullRomCurve3(PC_KEYS.map((k) => new THREE.Vector3(k[2][0], k[2][1], k[2][2])), false, 'centripetal');
  W.vp = new THREE.Vector3(); W.vl = new THREE.Vector3();

  /* ---- merge static geometry ---- */
  let merged = 0;
  pending.forEach((g) => {
    const geo = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false);
    if (g.geos.length > 1) g.geos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(geo, g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
    g.target.add(mesh); merged++;
  });
  pending.clear();

  W.redrawTextures = () => redraws.forEach((f) => f());
  W.slots = slots; W.screen = screen; W.boardMat = boardMat;
  W.stats = { staticBoxes: staticCount, mergedMeshes: merged };
  return W;
}
