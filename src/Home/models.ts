// Optional GLTF/Draco models. Each slot (school, classroom, teacher, students) can be swapped for a .glb;
// anything missing or failing to load silently keeps the procedural version. Loaded lazily (dynamic import)
// so the loaders cost nothing unless a model is configured. See public/models/README.md for the contract.
import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SlotName, World } from './world';

/** One slot's model: a URL, plus optional placement tweaks (the camera path never changes, so nudge the model instead). */
export interface ModelEntry { url: string; position?: [number, number, number]; rotationY?: number; scale?: number }
/** `models` option: a manifest URL (JSON of slot → entry) or the map itself. Missing/null slots stay procedural. */
export type ModelsSpec = string | Partial<Record<SlotName, string | ModelEntry | null>>;

interface StudentModel { g: THREE.Group; st: { yaw: number } | null; head: THREE.Object3D | undefined; phase: number }
export interface ModelsHandle {
  /** Slots that were actually replaced. */
  loaded: SlotName[];
  students: StudentModel[] | null;
  /** Advance mixers and sway students; `t` is ambient time, `focus` 0–1 as the camera closes in on the board. */
  update(dt: number, t: number, focus: number): void;
  dispose(): void;
}

/** Normalise `spec` (manifest URL or { slot: url | { url, position, rotationY, scale } }) to absolute URLs. */
async function resolveSpec(spec: ModelsSpec, signal?: AbortSignal): Promise<Partial<Record<SlotName, ModelEntry>>> {
  let base = new URL(location.href);
  let map: Exclude<ModelsSpec, string> = {};
  if (typeof spec === 'string') {
    base = new URL(spec, location.href);
    try {
      const res = await fetch(base, { signal });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      map = (await res.json()) as Exclude<ModelsSpec, string>;
    } catch (err) {
      if (!signal || !signal.aborted) console.warn('[playablecraft] model manifest unavailable (' + errMsg(err) + '). Using procedural models.');
      return {};
    }
  } else {
    map = spec;
  }
  const out: Partial<Record<SlotName, ModelEntry>> = {};
  (Object.keys(map || {}) as SlotName[]).forEach((k) => {
    const v = map[k];
    if (!v) return;
    const cfg = typeof v === 'string' ? { url: v } : v;
    if (cfg.url) out[k] = Object.assign({}, cfg, { url: new URL(cfg.url, base).href });
  });
  return out;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function fetchGltf(loader: GLTFLoader, url: string, signal?: AbortSignal): Promise<GLTF> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  const buf = await res.arrayBuffer();
  const isGlb = buf.byteLength > 12 && new DataView(buf).getUint32(0, true) === 0x46546c67; // 'glTF'
  // a dev server's SPA fallback answers 200 with HTML for missing files — reject anything that isn't glTF
  if (!isGlb && new Uint8Array(buf, 0, 1)[0] !== 0x7b) throw new Error('not a glTF/GLB file');
  return loader.parseAsync(isGlb ? buf : new TextDecoder().decode(buf), url.slice(0, url.lastIndexOf('/') + 1));
}

function place(obj: THREE.Object3D, cfg: ModelEntry): void {
  if (cfg.position) obj.position.fromArray(cfg.position);
  if (cfg.rotationY) obj.rotation.y = cfg.rotationY;
  if (cfg.scale) obj.scale.setScalar(cfg.scale);
}

/** Shadows on, embedded lights dropped (the scene has its own rig), `PC_Screen` mesh receives the smartboard. */
function prep(root: THREE.Object3D, W: World): void {
  const lights: THREE.Object3D[] = [];
  root.traverse((node) => {
    if ((node as THREE.Light).isLight) lights.push(node);
    const o = node as THREE.Mesh;
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.name === 'PC_Screen') {
      const geo = o.geometry.clone(), uv = geo.attributes.uv; // canvas texture is flipY, glTF UVs are not
      if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      o.geometry = geo; o.material = W.boardMat; o.castShadow = false;
      W.screen.visible = false;
    }
  });
  lights.forEach((l) => l.removeFromParent());
}

function pickClip(gltf: GLTF): THREE.AnimationClip | null {
  return gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0] || null;
}

export async function loadModels(W: World, spec: ModelsSpec, { dracoPath, signal }: { dracoPath: string; signal?: AbortSignal }): Promise<ModelsHandle> {
  const handle: ModelsHandle = { loaded: [], students: null, update() {}, dispose() {} };
  const entries = await resolveSpec(spec, signal);
  const names = (Object.keys(entries) as SlotName[]).filter((n) => W.slots[n]);
  if (!names.length || (signal && signal.aborted)) return handle;

  const [{ GLTFLoader }, { DRACOLoader }, SkeletonUtils] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
    import('three/examples/jsm/utils/SkeletonUtils.js')
  ]);
  const draco = new DRACOLoader().setDecoderPath(dracoPath);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const mixers: THREE.AnimationMixer[] = [];
  const players: SlotName[] = [];

  const apply: Record<SlotName, (gltf: GLTF, cfg: ModelEntry) => void> = {
    school: (gltf, cfg) => { place(gltf.scene, cfg); prep(gltf.scene, W); W.scene.add(gltf.scene); W.slots.school.visible = false; },
    classroom: (gltf, cfg) => { place(gltf.scene, cfg); prep(gltf.scene, W); W.scene.add(gltf.scene); W.slots.classroom.visible = false; },
    teacher: (gltf, cfg) => {
      const root = gltf.scene, T = W.teacher;
      place(root, cfg); prep(root, W);
      T.g.children.forEach((c) => { c.visible = false; });
      T.g.add(root);
      const clip = pickClip(gltf);
      if (clip) {
        const mx = new THREE.AnimationMixer(root); mx.clipAction(clip).play(); mixers.push(mx);
        T.armR = T.armL = null; // the clip owns the arms
      } else {
        // optional pivots: PC_ArmR / PC_ArmL (shoulder, arm hangs along -Y at rest) and PC_ElbowR / PC_ElbowL
        const pivot = (a: string, e: string) => { const sp = root.getObjectByName(a); return sp ? { sp, el: root.getObjectByName(e) || new THREE.Object3D() } : null; };
        T.armR = pivot('PC_ArmR', 'PC_ElbowR'); T.armL = pivot('PC_ArmL', 'PC_ElbowL');
      }
    },
    students: (gltf, cfg) => {
      const seats: { x: number; z: number; st: { yaw: number } | null }[] = W.studs.map((s) => ({ x: s.x, z: s.z, st: s }));
      seats.push({ x: W.fgSeat.x, z: W.fgSeat.z, st: null });
      const clip = pickClip(gltf), group = new THREE.Group();
      group.name = 'students-glb'; W.scene.add(group);
      handle.students = seats.map((seat, i) => {
        const o = SkeletonUtils.clone(gltf.scene);
        place(o, cfg); prep(o, W);
        const g = new THREE.Group(); g.position.set(seat.x, 0, seat.z); g.rotation.y = Math.PI / 2; // authored facing +Z → face the board (+X)
        g.add(o); group.add(g);
        if (clip) { const mx = new THREE.AnimationMixer(o), a = mx.clipAction(clip); a.play(); a.time = (i * 0.37) % clip.duration; mixers.push(mx); }
        return { g, st: seat.st, head: o.getObjectByName('PC_Head'), phase: i * 1.7 };
      });
      W.slots.students.visible = false;
    }
  };

  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await fetchGltf(loader, (entries[name] as ModelEntry).url, signal);
      if (signal && signal.aborted) return;
      apply[name](gltf, entries[name] as ModelEntry);
      players.push(name);
    } catch (err) {
      if (signal && signal.aborted) return;
      console.warn('[playablecraft] models.' + name + ' failed (' + errMsg(err) + '). Using the procedural ' + name + '.');
    }
  }));

  handle.loaded = players;
  handle.update = (dt: number, t: number, focus: number) => {
    mixers.forEach((m) => m.update(dt));
    if (!handle.students) return;
    handle.students.forEach((m) => {
      const k = m.st ? m.st.yaw * (1 - focus * 0.5) + Math.sin(t * 0.35 + m.phase) * 0.06 : Math.sin(t * 0.27) * 0.04;
      m.g.rotation.y = Math.PI / 2 + k * 0.5;
      if (m.head) m.head.rotation.set(Math.sin(t * 0.4 + m.phase) * 0.03, k * 0.5, 0);
    });
  };
  handle.dispose = () => { mixers.forEach((m) => m.stopAllAction()); draco.dispose(); };
  return handle;
}
