// PlayableCraft hero — public entry point.
//
//   const hero = createPlayableCraftHero(rootElement, { accent, autoplay, onChapterChange, models });
//   hero.destroy();
//
// `rootElement` is the tall scroll section (e.g. height: 700vh) containing a sticky `[data-pc="stage"]`.
// Progress 0–1 is the page scroll through that section. See README.md for the required markup.
import * as THREE from "three";
import { pcClamp, pcSeg, pcSmooth, pcLerp, disposeTree } from "./util";
import {
  pcDrawLesson,
  pcDrawDetect,
  pcDrawWipe,
  pcDrawUnderstand,
  pcDrawSim,
} from "./board";
import {
  PC_CAPS,
  PC_GOTO,
  PC_GRAVS,
  PC_LIGHT,
  PC_CHAPTERS,
  type GravId,
} from "./config";
import { buildWorld, type World } from "./world";
import { bindOverlay, type OverlayEngine, type UiVals } from "./overlay";
import type { ModelsHandle, ModelsSpec } from "./models";

export interface HeroOptions {
  /** Simulation highlight colour (any CSS colour). Default `#4F73F0`. */
  accent?: string;
  /** Start the auto-scroll journey once the scene is ready (ignored under prefers-reduced-motion). */
  autoplay?: boolean;
  /** Called when the visible chapter changes: 0 School · 1 Classroom · 2 Lesson · 3 Understand · 4 Visualize. */
  onChapterChange?: (index: number, name: string) => void;
  /** Optional .glb models: a manifest URL, or `{ school, classroom, teacher, students }`. See public/models/README.md. */
  models?: ModelsSpec | null;
  /** Folder holding the Draco decoder. Default `<base>/draco/`. */
  dracoPath?: string;
  /** Max ms to wait for models before showing the procedural scene. Default 10000. */
  modelTimeout?: number;
}

export interface HeroHandle {
  /** Stops the loop, removes listeners and disposes geometries, materials, textures and the renderer. */
  destroy(): void;
  play(): void;
  pause(): void;
  /** Scroll to a chapter (0–4). */
  goTo(chapter: number): void;
  /** Resolves `true` once the scene (and any models) are ready, `false` if WebGL failed or the hero was destroyed first. */
  readonly ready: Promise<boolean>;
  /** Currently visible chapter index, or -1 before the first frame. */
  readonly chapter: number;
}

type ResolvedOptions = Required<
  Omit<HeroOptions, "onChapterChange" | "models">
> &
  Pick<HeroOptions, "onChapterChange" | "models">;

interface UiState {
  p: number;
  playing: boolean;
  grav: GravId;
  push: number;
  height: number;
  vectors: boolean;
  ready: boolean;
  failed: boolean;
}
interface SimState {
  g: number;
  gName: string;
  vx: number;
  h: number;
  vectors: boolean;
  t0: number;
  started: boolean;
}

const DEFAULTS: ResolvedOptions = {
  accent: "#4F73F0",
  autoplay: false,
  models: null,
  dracoPath: ((import.meta.env && import.meta.env.BASE_URL) || "/") + "draco/",
  modelTimeout: 10000,
};
const JOURNEY_SECONDS = 42;

const chapterOf = (p: number): number =>
  p < 0.2 ? 0 : p < 0.4 ? 1 : p < 0.6 ? 2 : p < 0.8 ? 3 : 4;

class Engine implements OverlayEngine {
  readonly root: HTMLElement;
  readonly opts: ResolvedOptions;
  readonly stage: HTMLElement;
  readonly canvasEl: HTMLCanvasElement;
  state: UiState;
  pTarget = 0;
  pSmooth = 0;
  lastUi = 0;
  lastT = 0;
  snapped = false;
  sim: SimState;
  ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  chapter = -1;
  visible = true;
  alive = true;
  readonly motionQuery: MediaQueryList | null;
  reduced: boolean;
  readonly abort = new AbortController();
  autoY: number | null = null;
  autoSet: number | null = null;
  raf = 0;
  renderer!: THREE.WebGLRenderer;
  w: World | null = null;
  models: ModelsHandle | null = null;
  ro?: ResizeObserver;
  io?: IntersectionObserver;
  onStateChange: (() => void) | null = null;
  readonly ready: Promise<boolean>;
  private resolveReady!: (ok: boolean) => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly togglePlay: () => void;
  readonly gos: (() => void)[];
  readonly pickG = {} as Record<GravId, () => void>;
  readonly onPush: (e: Event) => void;
  readonly onHeight: (e: Event) => void;
  readonly onVectors: (e: Event) => void;
  readonly dropAgain: () => void;
  private readonly loop: (now: number) => void;

  constructor(root: HTMLElement, opts: ResolvedOptions) {
    this.root = root;
    this.opts = opts;
    this.stage = root.querySelector('[data-pc="stage"]') || root;
    this.canvasEl = root.querySelector(
      '[data-pc="canvas"]',
    ) as HTMLCanvasElement;
    this.state = {
      p: 0,
      playing: false,
      grav: "earth",
      push: 0,
      height: 10,
      vectors: true,
      ready: false,
      failed: false,
    };
    this.sim = {
      g: 9.81,
      gName: "Earth",
      vx: 0,
      h: 10,
      vectors: true,
      t0: 0,
      started: false,
    };
    this.motionQuery = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    this.reduced = !!(this.motionQuery && this.motionQuery.matches);

    this.onPointerMove = (e: PointerEvent) => {
      if (this.reduced) return;
      const r = this.stage.getBoundingClientRect();
      if (!r.width) return;
      this.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ptr.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    this.togglePlay = () => (this.state.playing ? this.pause() : this.play());
    this.gos = PC_GOTO.map((v) => () => this.goTo(v));
    PC_GRAVS.forEach((g) => {
      this.pickG[g[0]] = () => {
        this.sim.g = g[2];
        this.sim.gName = g[1];
        this.restartSim();
        this.setState({ grav: g[0] });
      };
    });
    this.onPush = (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.sim.vx = v;
      this.restartSim();
      this.setState({ push: v });
    };
    this.onHeight = (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value) || 10;
      this.sim.h = v;
      this.restartSim();
      this.setState({ height: v });
    };
    this.onVectors = (e) => {
      this.sim.vectors = !!(e.target as HTMLInputElement).checked;
      this.setState({ vectors: this.sim.vectors });
    };
    this.dropAgain = () => this.restartSim();
    this.loop = (now) => {
      if (!this.alive || !this.visible) {
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(this.loop);
      this.frame(now);
    };
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  setState(patch: Partial<UiState>): void {
    Object.assign(this.state, patch);
    if (this.onStateChange) this.onStateChange();
  }

  restartSim(): void {
    this.sim.t0 = performance.now();
  }

  /* ---------- scroll model: progress = page scroll through the root section ---------- */
  scrollInfo(): { top: number; max: number; p: number } {
    const r = this.root.getBoundingClientRect();
    const max = Math.max(0, this.root.offsetHeight - this.stage.clientHeight);
    return {
      top: window.scrollY + r.top,
      max,
      p: max > 0 ? pcClamp(-r.top / max, 0, 1) : 0,
    };
  }

  goTo(v: number): void {
    if (this.state.playing) this.pause();
    const s = this.scrollInfo();
    window.scrollTo({
      top: s.top + v * s.max,
      behavior: this.reduced ? "instant" : "smooth",
    });
  }

  play(): void {
    if (this.reduced || this.state.playing) return;
    const s = this.scrollInfo();
    const restart = s.p > 0.985;
    if (restart) {
      window.scrollTo({ top: s.top, behavior: "instant" });
      this.pTarget = 0;
      this.pSmooth = 0;
    }
    this.autoY = restart ? s.top : window.scrollY;
    this.autoSet = null;
    this.setState({ playing: true });
  }

  pause(): void {
    if (this.state.playing) this.setState({ playing: false });
  }

  /* ---------- lifecycle ---------- */
  start(): void {
    const signal = this.abort.signal;
    try {
      this.initRenderer();
    } catch (err) {
      console.error(err);
      this.setState({ failed: true });
      this.resolveReady(false);
      return;
    }
    this.root.addEventListener("pointermove", this.onPointerMove, { signal });
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.stage);
    } else window.addEventListener("resize", () => this.resize(), { signal });
    if (window.IntersectionObserver) {
      this.io = new IntersectionObserver(
        (entries) => {
          this.visible = entries[entries.length - 1].isIntersecting;
          if (this.visible) this.startLoop();
          else this.stopLoop();
        },
        { threshold: 0 },
      );
      this.io.observe(this.root);
    }
    if (this.motionQuery) {
      const mq = this.motionQuery;
      mq.addEventListener(
        "change",
        () => {
          this.reduced = mq.matches;
          const W = this.w as World;
          W.reduced = this.reduced;
          W.dust.visible = !this.reduced;
          if (this.reduced) this.pause();
          this.setState({});
        },
        { signal },
      );
    }
    if (document.fonts && document.fonts.load) {
      [
        "600 40px Caveat",
        "500 20px Sora",
        "600 20px Sora",
        '400 16px "IBM Plex Mono"',
        '500 16px "IBM Plex Mono"',
      ].forEach((f) => {
        document.fonts
          .load(f)
          .then(() => {
            if (this.w) {
              this.w.board.key = "";
              this.w.redrawTextures();
            }
          })
          .catch(() => {});
      });
    }
    this.startLoop();

    // optional .glb models: wait for them (bounded) before revealing the scene, procedural fallback otherwise
    const models = this.opts.models
      ? import("./models")
          .then((m) =>
            m.loadModels(this.w as World, this.opts.models as ModelsSpec, {
              dracoPath: this.opts.dracoPath,
              signal,
            }),
          )
          .then((h) => {
            this.models = h;
          })
          .catch((err) =>
            console.warn("[playablecraft] models unavailable:", err),
          )
      : Promise.resolve();
    const timeout = new Promise<void>((r) =>
      setTimeout(r, this.opts.modelTimeout),
    );
    Promise.race([models, timeout]).then(() => {
      if (!this.alive) return;
      this.setState({ ready: true });
      this.resolveReady(true);
      if (this.opts.autoplay && !this.reduced) this.play();
    });
  }

  initRenderer(): void {
    THREE.ColorManagement.enabled = true;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvasEl,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.w = buildWorld(renderer, { reduced: this.reduced });
    this.w.dust.visible = !this.reduced;
    this.resize();
  }

  resize(): void {
    const W = this.w;
    if (!W) return;
    const w = Math.max(2, Math.round(this.stage.clientWidth)),
      h = Math.max(2, Math.round(this.stage.clientHeight));
    // phones/tablets: cap at 1.5 (fill-rate); desktop keeps the original 1.75
    const coarse =
      window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const cap = coarse || w < 768 ? 1.5 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    const asp = w / h,
      cam = W.camera;
    cam.aspect = asp;
    cam.fov = asp < 1.3 ? Math.min(70, 40 * Math.pow(1.6 / asp, 0.6)) : 40;
    cam.updateProjectionMatrix();
  }

  startLoop(): void {
    if (this.raf || !this.alive || !this.w) return;
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.stopLoop();
    this.abort.abort();
    if (this.ro) this.ro.disconnect();
    if (this.io) this.io.disconnect();
    if (this.models) this.models.dispose();
    if (this.w) {
      disposeTree(this.w.scene);
      this.w.board.canvas.width = this.w.board.canvas.height = 1;
      this.w.scene.clear();
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
    this.w = null;
    this.resolveReady(false);
  }

  /* ---------- per-frame ---------- */
  frame(now: number): void {
    const W = this.w as World,
      reduced = this.reduced;
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0.016;
    this.lastT = now;

    let si = this.scrollInfo();
    if (this.state.playing && si.max > 0) {
      if (this.autoSet != null && Math.abs(window.scrollY - this.autoSet) > 6) {
        this.pause(); // the reader took over
      } else {
        const end = si.top + si.max;
        this.autoY = Math.min(
          end,
          (this.autoY == null ? window.scrollY : this.autoY) +
            (dt * si.max) / JOURNEY_SECONDS +
            0.0001,
        );
        window.scrollTo({ top: this.autoY, behavior: "instant" });
        this.autoSet = this.autoY;
        si = this.scrollInfo();
        if (this.autoY >= end - 1) this.pause();
      }
    }
    this.pTarget = si.p;
    if (!this.snapped) {
      this.pSmooth = this.pTarget;
      this.snapped = true;
    } // reload mid-scroll: start there
    this.pSmooth +=
      (this.pTarget - this.pSmooth) *
      (1 - Math.exp(-dt * (reduced ? 14 : 3.2)));
    if (Math.abs(this.pTarget - this.pSmooth) < 0.00005)
      this.pSmooth = this.pTarget;
    const p = this.pSmooth;
    const t = now / 1000,
      ta = reduced ? 0 : t; // ambient time: frozen under prefers-reduced-motion
    const par = reduced ? 0 : 1;
    this.ptr.sx += (this.ptr.x - this.ptr.sx) * (1 - Math.exp(-dt * 2.5));
    this.ptr.sy += (this.ptr.y - this.ptr.sy) * (1 - Math.exp(-dt * 2.5));

    const act = chapterOf(p);
    if (act !== this.chapter) {
      const first = this.chapter < 0;
      this.chapter = act;
      if (!first && this.opts.onChapterChange) {
        try {
          this.opts.onChapterChange(act, PC_CHAPTERS[act]);
        } catch (e) {
          console.error(e);
        }
      }
    }

    /* camera */
    const ct = W.ct;
    let i = 0;
    while (i < ct.length - 2 && p > ct[i + 1]) i++;
    const f = pcClamp((p - ct[i]) / (ct[i + 1] - ct[i]), 0, 1);
    const u = (i + pcSmooth(f) * 0.5 + f * 0.5) / (ct.length - 1);
    W.cPos.getPoint(u, W.vp);
    W.cLook.getPoint(u, W.vl);
    const cam = W.camera;
    cam.position.copy(W.vp);
    cam.position.y += Math.sin(ta * 0.7) * 0.006;
    cam.lookAt(W.vl);
    cam.rotateY(-this.ptr.sx * 0.018 * par);
    cam.rotateX(-this.ptr.sy * 0.012 * par);
    cam.rotateZ(Math.sin(ta * 0.37) * 0.0015);
    W.sky.position.copy(cam.position);

    /* light: bright exterior, softer interior */
    const e = pcSmooth(pcSeg(p, 0.26, 0.35));
    W.hemi.intensity = pcLerp(PC_LIGHT.hemiOut, PC_LIGHT.hemiIn, e);
    W.renderer.toneMappingExposure = pcLerp(1.0, 1.15, e);
    W.fillRoom.intensity = e * 0.75 * PC_LIGHT.room * pcSeg(p, 0.33, 0.45);
    W.fillCorr.intensity = (0.12 + e * 0.45) * PC_LIGHT.corr;
    // two shadow frustums (campus / classroom), switched once with hysteresis: re-fitting continuously
    // re-grids the shadow map every frame of the entrance transition and makes shadow edges shimmer
    const key = e > 0.55 ? 1 : e < 0.45 ? 0 : W.shadowKey < 0 ? 0 : W.shadowKey;
    if (key !== W.shadowKey) {
      W.shadowKey = key;
      const cx = key ? 8 : 0,
        cz = key ? -6.5 : 4,
        size = key ? 9.5 : 42;
      const sun = W.sun;
      sun.target.position.set(cx, 0, cz);
      sun.target.updateMatrixWorld();
      sun.position.set(cx, 0, cz).addScaledVector(W.sunDir, -70);
      const sc = sun.shadow.camera;
      sc.left = -size;
      sc.right = size;
      sc.top = size;
      sc.bottom = -size;
      sc.updateProjectionMatrix();
    }
    W.shaftMat.opacity = e * 0.9;
    if (!reduced) {
      W.dustMat.opacity = e * 0.55;
      if (e > 0.01) {
        const arr = W.dust.geometry.attributes.position.array;
        for (let k = 0; k < W.dustBase.length; k++) {
          const b = W.dustBase[k];
          arr[k * 3] = b[0] + Math.sin(t * 0.13 + b[3]) * 0.25;
          arr[k * 3 + 1] = b[1] + Math.sin(t * 0.09 + b[3] * 2) * 0.18;
          arr[k * 3 + 2] = b[2] + Math.cos(t * 0.11 + b[3]) * 0.2;
        }
        W.dust.geometry.attributes.position.needsUpdate = true;
      }
    }

    /* exterior life */
    if (e < 0.99) {
      for (let k = 0; k < W.walkers.length; k++) {
        const w = W.walkers[k];
        const L = 40,
          d = (ta * w.speed + w.off * 3.1) % L;
        const z = 38 - d;
        w.g.visible = z > -0.4 && !(p > 0.22 && z < 7);
        w.g.position.set(
          w.lane * Math.min(1, Math.max(0, z / 12)) +
            Math.sin(d * 0.3 + k) * 0.08,
          Math.abs(Math.sin(d * 4.2)) * 0.025,
          z,
        );
        w.g.rotation.y = Math.PI;
        const sw = Math.sin(d * 4.2) * 0.45;
        w.l1.rotation.x = sw;
        w.l2.rotation.x = -sw;
      }
    }

    /* classroom life */
    if (e > 0.01) {
      const focus = pcSmooth(pcSeg(p, 0.78, 0.9));
      if (W.slots.classroom.visible && !reduced)
        for (let k = 0; k < W.fans.length; k++)
          W.fans[k].rotation.y += dt * 2.4;
      if (W.slots.students.visible) {
        const D = W.dummy;
        for (let k = 0; k < W.studs.length; k++) {
          const st = W.studs[k];
          const yaw =
            st.yaw * (1 - focus * 0.5) + Math.sin(ta * 0.35 + st.ph) * 0.06;
          const lean = 0.02 + focus * 0.03 + Math.sin(ta * 0.5 + st.ph) * 0.01;
          const hx = st.x + 0.02 + lean,
            hy = 1.2 + Math.sin(ta * 0.8 + st.ph) * 0.004;
          D.position.set(hx, hy, st.z);
          D.rotation.set(0, yaw, 0);
          D.scale.set(0.095, 0.105, 0.088);
          D.updateMatrix();
          W.heads.setMatrixAt(k, D.matrix);
          D.position.set(hx - 0.012, hy + 0.025, st.z);
          D.scale.set(0.1, 0.09, 0.094);
          D.updateMatrix();
          W.hairs.setMatrixAt(k, D.matrix);
        }
        W.heads.instanceMatrix.needsUpdate = true;
        W.hairs.instanceMatrix.needsUpdate = true;
        const br = 1 + Math.sin(ta * 1.6) * 0.006;
        W.fs.torso.scale.set(0.82, br, 1.28);
        W.fs.head.rotation.set(
          Math.sin(ta * 0.4) * 0.03,
          Math.sin(ta * 0.27) * 0.05 - 0.05,
          Math.sin(ta * 0.33) * 0.02,
        );
      }
      if (this.models) this.models.update(reduced ? 0 : dt, ta, focus);
      this.poseTeacher(p, ta);
    }

    /* smartboard */
    if (p > 0.2) this.drawBoard(p, now);
    const sim = pcSmooth(pcSeg(p, 0.66, 0.76));
    W.boardLight.color.setRGB(
      pcLerp(0.86, 0.55, sim),
      pcLerp(0.9, 0.65, sim),
      pcLerp(0.95, 0.95, sim),
    );
    W.boardLight.intensity = e * pcLerp(0.6, 0.9, sim) * PC_LIGHT.board;

    W.renderer.render(W.scene, cam);

    if (now - this.lastUi > 50 && Math.abs(this.state.p - p) > 0.0012) {
      this.lastUi = now;
      this.setState({ p: p });
    }
  }

  poseTeacher(p: number, t: number): void {
    const T = (this.w as World).teacher;
    const wIn = pcSmooth(pcSeg(p, 0.43, 0.48));
    const wOut = pcSmooth(pcSeg(p, 0.64, 0.72));
    T.g.rotation.y =
      pcLerp(pcLerp(-1.15, 0.95, wIn), -0.75, wOut) + Math.sin(t * 0.6) * 0.03;
    if (T.armR) {
      const tap = pcSmooth(pcSeg(p, 0.585, 0.6)) * (1 - wOut);
      const wr = wIn * (1 - pcSeg(p, 0.585, 0.6));
      let thR = 0.12 + Math.sin(t * 1.3) * 0.04;
      thR = pcLerp(thR, 1.7 + Math.sin(t * 4.5) * 0.1, wr);
      thR = pcLerp(thR, 1.4 + Math.max(0, Math.sin(t * 6)) * 0.1, tap);
      T.armR.sp.rotation.set(-thR, 0, -0.06 + Math.sin(t * 3.1) * 0.04 * wr);
      T.armR.el.rotation.x = -pcLerp(0.25, 0.3, wr + tap);
    }
    if (T.armL) {
      const pr = wOut;
      let thL = 0.1 + Math.sin(t * 1.1 + 1) * 0.04;
      thL = pcLerp(thL, 0.95 + Math.sin(t * 0.9) * 0.12, pr);
      const idleGesture = (1 - wIn) * Math.max(0, Math.sin(t * 0.8)) * 0.5;
      T.armL.sp.rotation.set(-thL - idleGesture, 0, pcLerp(0.06, 0.42, pr));
      T.armL.el.rotation.x = -pcLerp(0.3, 0.55, pr) - idleGesture * 0.8;
    }
  }

  drawBoard(p: number, now: number): void {
    const Bd = (this.w as World).board,
      ctx = Bd.ctx,
      W = Bd.canvas.width,
      H = Bd.canvas.height;
    const accent = this.opts.accent;
    const r = pcSeg(p, 0.42, 0.585);
    const a = pcSeg(p, 0.595, 0.68);
    const w = pcSeg(p, 0.655, 0.735);
    const u = pcSeg(p, 0.7, 0.8);
    const m = pcSeg(p, 0.785, 0.88);
    const S = this.sim;
    if (p > 0.79) {
      if (!S.started) {
        S.started = true;
        S.t0 = performance.now();
      }
    } else {
      S.started = false;
    }
    let simT = 0;
    if (S.started) {
      const T = Math.sqrt((2 * S.h) / S.g);
      const cyc = 0.8 + T + 1.6;
      const lt = ((now - S.t0) / 1000) % cyc;
      simT = pcClamp(lt - 0.8, 0, T);
    }
    const live =
      (a > 0 && a < 1) || (w > 0 && w < 1) || (u > 0 && u < 1) || m > 0;
    const key = [
      r.toFixed(3),
      a.toFixed(3),
      w.toFixed(3),
      u.toFixed(3),
      m.toFixed(3),
      live ? Math.floor(now / 33) : 0,
      accent,
    ].join("|");
    if (key === Bd.key) return; // texture is only redrawn + re-uploaded when something changed
    Bd.key = key;
    const sim = {
      g: S.g,
      gName: S.gName,
      vx: S.vx,
      h: S.h,
      vectors: S.vectors,
      t: simT,
    };
    if (m >= 1) {
      pcDrawSim(ctx, W, H, 1, sim, accent);
    } else {
      if (w < 1) {
        pcDrawLesson(ctx, W, H, r);
        if (a > 0) pcDrawDetect(ctx, W, H, a, now);
      }
      pcDrawWipe(ctx, W, H, w);
      if (w > 0.6) {
        const ua = pcSeg(w, 0.6, 1) * (1 - pcSmooth(pcSeg(m, 0, 0.35)));
        pcDrawUnderstand(ctx, W, H, u, ua, accent);
      }
      if (m > 0) {
        ctx.save();
        ctx.globalAlpha = pcSmooth(pcSeg(m, 0.15, 0.5));
        pcDrawSim(ctx, W, H, m, sim, accent);
        ctx.restore();
      }
    }
    Bd.tex.needsUpdate = true;
  }

  renderVals(): UiVals {
    const p = this.state.p;
    const d = pcSmooth(pcSeg(p, 0.86, 0.92));
    return {
      loading: !this.state.ready,
      failed: this.state.failed,
      loadingText: this.state.failed
        ? "Engine failed to start (WebGL unavailable)"
        : this.state.ready ? "Engine ready" : "Loading engine…",
      playing: this.state.playing,
      canPlay: !this.reduced,
      playLabel: this.state.playing
        ? "Pause"
        : p > 0.985
          ? "Replay"
          : "Play journey",
      playIcon: this.state.playing
        ? "M2 1H5V11H2Z M7 1H10V11H7Z"
        : "M2.5 1L10.5 6L2.5 11Z",
      hintO: (1 - pcSeg(p, 0.005, 0.04)).toFixed(3),
      pct: (p * 100).toFixed(1),
      pctLabel: String(Math.round(p * 100)).padStart(2, "0") + "%",
      pushLabel: this.state.push.toFixed(1) + " m/s",
      heightLabel: this.state.height + " m",
      caps: PC_CAPS.map((c) => {
        const o = Math.min(
          pcSeg(p, c[0] - 0.035, c[0]),
          1 - pcSeg(p, c[1], c[1] + 0.035),
        );
        return {
          opacity: o.toFixed(3),
          y: ((1 - o) * 18).toFixed(1),
          visibility: o > 0.001 ? "visible" : "hidden",
        } as const;
      }),
      current: chapterOf(p),
      dockO: d.toFixed(3),
      dockY: ((1 - d) * 16).toFixed(1),
      dockV: d > 0.001 ? "visible" : "hidden",
      dockPE: d > 0.5 ? "auto" : "none",
      gravs: PC_GRAVS.map((g) => ({
        label: g[1],
        val: g[2].toFixed(2),
        on: this.state.grav === g[0],
      })),
    };
  }
}

/**
 * Create the hero inside `root` (the tall scroll section).
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {string} [options.accent]            simulation highlight colour (CSS colour, default #4F73F0)
 * @param {boolean} [options.autoplay]         start the auto-scroll journey once the scene is ready (ignored with prefers-reduced-motion)
 * @param {(index:number, name:string)=>void} [options.onChapterChange]  called when the visible chapter changes
 * @param {string|object} [options.models]     optional .glb models (see public/models/README.md)
 * @param {string} [options.dracoPath]         folder holding the Draco decoder (default `<base>/draco/`)
 * @returns {{ destroy(): void, play(): void, pause(): void, goTo(chapter:number): void, ready: Promise<boolean>, readonly chapter: number }}
 */
export function createPlayableCraftHero(
  root: HTMLElement,
  options: HeroOptions = {},
): HeroHandle {
  if (!root || root.nodeType !== 1)
    throw new TypeError(
      "createPlayableCraftHero: first argument must be an element",
    );
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };
  root.style.setProperty("--accent", opts.accent);
  const engine = new Engine(root, opts);
  const overlay = bindOverlay(root, engine);
  engine.start();
  return {
    ready: engine.ready,
    get chapter() {
      return engine.chapter;
    },
    play() {
      engine.play();
    },
    pause() {
      engine.pause();
    },
    goTo(i: number) {
      if (engine.gos[i]) engine.gos[i]();
    },
    destroy() {
      overlay.destroy();
      engine.destroy();
    },
  };
}
