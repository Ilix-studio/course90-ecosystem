// Small math / canvas helpers shared by the scene and the smartboard.
import type { Material, Mesh, Object3D, Texture } from 'three';

export type Ctx = CanvasRenderingContext2D;

export function pcClamp(v: number, a: number, b: number): number { return v < a ? a : (v > b ? b : v); }
export function pcSeg(p: number, a: number, b: number): number { return pcClamp((p - a) / (b - a), 0, 1); }
export function pcSmooth(t: number): number { return t * t * (3 - 2 * t); }
export function pcLerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function pcEase(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function pcRand(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pcRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function pcArrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, head: number, color: string, width: number): void {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 2) return;
  const ux = dx / L, uy = dy / L;
  const hd = Math.min(head, L * 0.6);
  const hx = x2 - ux * hd, hy = y2 - uy * hd;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(hx - uy * hd * 0.55, hy + ux * hd * 0.55);
  ctx.lineTo(hx + uy * hd * 0.55, hy - ux * hd * 0.55);
  ctx.closePath(); ctx.fill();
}
export function pcSpacing(ctx: Ctx, px: number): void { try { ctx.letterSpacing = px + 'px'; } catch { /* older browsers: no letterSpacing */ } }

/** Dispose geometries, materials and textures of everything under `root`. */
export function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    const o = node as Mesh & { isInstancedMesh?: boolean; dispose?: () => void; isLight?: boolean };
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh && o.dispose) o.dispose();
    if (o.isLight && o.dispose) o.dispose(); // frees shadow maps
    const ms: Material[] = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => {
      for (const v of Object.values(m)) { if (v && (v as Texture).isTexture) (v as Texture).dispose(); }
      m.dispose();
    });
  });
}
