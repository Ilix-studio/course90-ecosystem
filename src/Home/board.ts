// Smartboard drawing: every phase of the board is painted onto a 2D canvas (used as a texture).
import { pcClamp, pcSeg, pcSmooth, pcEase, pcRR, pcArrow, pcSpacing, type Ctx } from './util';

/** Live state of the free-fall simulation as drawn on the board. */
export interface SimParams { g: number; gName: string; vx: number; h: number; vectors: boolean; t: number }

/* ---------- smartboard: ordinary lesson ---------- */
export function pcDrawLesson(ctx: Ctx, W: number, H: number, r: number): void {
  const ink = '#1E2933';
  ctx.fillStyle = '#F3F1EA'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#E0DCD1';
  for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.fillStyle = '#E6E2D8'; pcRR(ctx, W - 76, 170, 46, 262, 23); ctx.fill();
  ctx.fillStyle = '#A7A296';
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(W - 53, 200 + i * 50, 8, 0, Math.PI * 2); ctx.fill(); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  pcSpacing(ctx, 3);
  ctx.fillStyle = '#7A766C'; ctx.font = '500 20px Sora, sans-serif';
  ctx.fillText('PHYSICS  ·  CLASS IX  ·  CHAPTER 8', 70, 72);
  pcSpacing(ctx, 0);
  ctx.fillStyle = ink; ctx.font = '600 70px Caveat, cursive';
  ctx.fillText('Free fall', 64, 148);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const bx = 340, by = 250, br = 40;
  const r1 = pcSeg(r, 0, 0.14);
  if (r1 > 0) {
    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bx, by, br, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r1); ctx.stroke();
    if (r1 >= 1) {
      ctx.save(); ctx.beginPath(); ctx.arc(bx, by, br - 7, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(30,41,51,0.32)'; ctx.lineWidth = 2;
      for (let k = -70; k < 70; k += 11) { ctx.beginPath(); ctx.moveTo(bx + k, by - 50); ctx.lineTo(bx + k + 40, by + 50); ctx.stroke(); }
      ctx.restore();
    }
  }
  const r2 = pcSeg(r, 0.14, 0.32);
  if (r2 > 0) {
    const y0 = by + br + 22, y1 = y0 + (566 - y0) * r2;
    ctx.setLineDash([14, 12]); ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, y1); ctx.stroke(); ctx.setLineDash([]);
    if (r2 >= 1) { ctx.beginPath(); ctx.moveTo(bx - 16, 544); ctx.lineTo(bx, 570); ctx.lineTo(bx + 16, 544); ctx.stroke(); }
  }
  if (r > 0.3) {
    ctx.globalAlpha = pcSeg(r, 0.3, 0.36); ctx.fillStyle = ink; ctx.font = '600 56px Caveat, cursive';
    ctx.fillText('g', bx + 30, 440); ctx.globalAlpha = 1;
  }
  const r3 = pcSeg(r, 0.34, 0.44);
  if (r3 > 0) {
    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(190, 604); ctx.lineTo(190 + 300 * r3, 604); ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 0; k < 300 * r3 - 10; k += 22) { ctx.beginPath(); ctx.moveTo(200 + k, 608); ctx.lineTo(186 + k, 626); ctx.stroke(); }
    if (r3 >= 1) {
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(226, by); ctx.lineTo(212, by); ctx.lineTo(212, 600); ctx.lineTo(226, 600); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '600 48px Caveat, cursive'; ctx.fillText('h', 170, 440);
    }
  }
  const lines: [text: string, y: number, from: number, to: number, size: number][] = [
    ['Why does everything fall', 252, 0.44, 0.56, 52],
    ['at the same rate?', 310, 0.56, 0.64, 52],
    ['v = u + g t', 412, 0.66, 0.76, 54],
    ['h = ½ g t²', 482, 0.76, 0.86, 54],
    ['g ≈ 9.8 m/s²', 552, 0.86, 0.96, 54]
  ];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const k = pcSeg(r, L[2], L[3]);
    if (k <= 0) continue;
    ctx.font = '600 ' + L[4] + 'px Caveat, cursive';
    const w = ctx.measureText(L[0]).width;
    ctx.save(); ctx.beginPath(); ctx.rect(650, L[1] - 64, w * k + 6, 86); ctx.clip();
    ctx.fillStyle = ink; ctx.fillText(L[0], 650, L[1]); ctx.restore();
  }
  if (r > 0.96) {
    ctx.strokeStyle = 'rgba(30,41,51,0.55)'; ctx.lineWidth = 3;
    const k = pcSeg(r, 0.96, 1);
    ctx.beginPath(); ctx.ellipse(1166, 446, 150 * k + 1, 64 * k + 1, -0.05, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(30,41,51,0.7)'; ctx.font = '600 38px Caveat, cursive';
    ctx.globalAlpha = k; ctx.fillText('mass not needed!', 1060, 456); ctx.globalAlpha = 1;
  }
}

/* ---------- smartboard: PlayableCraft reads the lesson ---------- */
export function pcDrawDetect(ctx: Ctx, W: number, H: number, a: number, now: number): void {
  const blue = '#2E57C9';
  if (a < 0.62) {
    const sx = pcEase(pcSeg(a, 0, 0.6)) * (W + 140);
    ctx.fillStyle = 'rgba(46,87,201,0.07)'; ctx.fillRect(sx - 140, 0, 140, H);
    ctx.fillStyle = blue; ctx.fillRect(sx - 2, 0, 2, H);
  }
  const boxes: [x: number, y: number, w: number, h: number, label: string, at: number][] = [
    [272, 186, 150, 436, 'OBJECT + FORCE', 0.1],
    [636, 192, 600, 140, 'CONCEPT · FREE FALL', 0.28],
    [636, 360, 420, 222, 'MODEL · KINEMATICS', 0.44]
  ];
  ctx.font = '500 16px "IBM Plex Mono", monospace';
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const k = pcSmooth(pcSeg(a, b[5], b[5] + 0.18));
    if (k <= 0) continue;
    const x = b[0], y = b[1], w = b[2], h = b[3], c = 24 * k + 2;
    ctx.globalAlpha = k; ctx.strokeStyle = blue; ctx.lineWidth = 3; ctx.lineCap = 'square';
    ctx.fillStyle = 'rgba(46,87,201,0.05)'; ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
    ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
    ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
    ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
    ctx.stroke();
    const tw = ctx.measureText(b[4]).width;
    ctx.fillStyle = blue; pcRR(ctx, x, y - 38, tw + 24, 28, 6); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(b[4], x + 12, y - 18);
    ctx.globalAlpha = 1;
  }
  const ck = pcSmooth(pcSeg(a, 0.0, 0.14));
  if (ck > 0) {
    ctx.globalAlpha = ck;
    const x0 = W - 500;
    ctx.fillStyle = '#111A24'; pcRR(ctx, x0, 30, 440, 54, 27); ctx.fill();
    pcSpacing(ctx, 4); ctx.fillStyle = '#F4F2EC'; ctx.font = '600 18px Sora, sans-serif';
    ctx.fillText('PLAYABLECRAFT', x0 + 26, 64); pcSpacing(ctx, 0);
    ctx.fillStyle = '#8FA0B3'; ctx.font = '400 16px "IBM Plex Mono", monospace';
    ctx.fillText('reading lesson' + '...'.slice(0, 1 + Math.floor(now / 380) % 3), x0 + 250, 63);
    ctx.globalAlpha = 1;
  }
}

/* ---------- geometric tile transition ---------- */
export function pcDrawWipe(ctx: Ctx, W: number, H: number, w: number): void {
  if (w <= 0) return;
  ctx.fillStyle = '#0E151D';
  if (w >= 1) { ctx.fillRect(0, 0, W, H); return; }
  const cols = 20, rows = 9, tw = W / cols, th = H / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const d = (i / cols) * 0.78 + (j / rows) * 0.22;
      const k = pcSmooth(pcSeg(w, d * 0.6, d * 0.6 + 0.4));
      if (k <= 0) continue;
      const cx = (i + 0.5) * tw, cy = (j + 0.5) * th, sw = tw * k + 1, sh = th * k + 1;
      ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
    }
  }
}

/* ---------- AI understanding ---------- */
export function pcDrawUnderstand(ctx: Ctx, W: number, H: number, u: number, alpha: number, accent: string): void {
  if (alpha <= 0) return;
  ctx.save();
  const cx = W / 2;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(120,150,180,0.06)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.textAlign = 'center';
  pcSpacing(ctx, 9); ctx.fillStyle = '#EEF2F5'; ctx.font = '600 26px Sora, sans-serif';
  ctx.fillText('PLAYABLE CRAFT', cx + 4, 140); pcSpacing(ctx, 0);
  ctx.fillStyle = '#7F93A8'; ctx.font = '400 20px Sora, sans-serif';
  ctx.fillText('Understanding the lesson', cx, 180);
  ctx.textAlign = 'left';
  const x0 = cx - 390;
  const pk = pcSeg(u, 0.1, 1);
  ctx.globalAlpha = alpha * pcSeg(u, 0.05, 0.2);
  ctx.fillStyle = '#1C2834'; pcRR(ctx, x0, 340, 780, 6, 3); ctx.fill();
  ctx.fillStyle = accent; pcRR(ctx, x0, 340, Math.max(6, 780 * pcEase(pk)), 6, 3); ctx.fill();
  ctx.fillStyle = '#7F93A8'; ctx.font = '400 17px "IBM Plex Mono", monospace';
  ctx.fillText('Composing interactive simulation', x0, 384);
  ctx.textAlign = 'right'; ctx.fillText(Math.round(pk * 100) + '%', x0 + 780, 384); ctx.textAlign = 'left';
  ctx.restore();
}

/* ---------- interactive free-fall simulation ---------- */
export function pcDrawSim(ctx: Ctx, W: number, H: number, m: number, S: SimParams, accent: string): void {
  const blue = '#86A8FF';
  ctx.save();
  ctx.fillStyle = '#0E151D'; ctx.fillRect(0, 0, W, H);
  const VX = 44, VY = 44, VW = 1010, VH = H - 88;
  const PX = VX + VW + 28, PY = 44, PW = W - PX - 44, PH = H - 88;
  const a1 = pcSmooth(pcSeg(m, 0, 0.35)), a2 = pcSmooth(pcSeg(m, 0.2, 0.6)), a3 = pcSmooth(pcSeg(m, 0.4, 0.75)), a4 = pcSmooth(pcSeg(m, 0.6, 1));
  const T = Math.sqrt(2 * S.h / S.g);
  const xr = S.vx * T;
  const gy = VY + VH - 64, ox = VX + 200;
  const sc = Math.min((VH - 150) / (S.h + 0.6), (VW - 240) / Math.max(xr + 0.6, 1));
  const step = S.h > 12 ? 2 : 1;
  ctx.globalAlpha = a1;
  ctx.fillStyle = '#111B25'; pcRR(ctx, VX, VY, VW, VH, 20); ctx.fill();
  ctx.strokeStyle = '#1F2C39'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); pcRR(ctx, VX, VY, VW, VH, 20); ctx.clip();
  ctx.strokeStyle = 'rgba(130,160,190,0.09)'; ctx.lineWidth = 1;
  const gridReveal = pcEase(a1);
  for (let mY = 0; gy - mY * sc > VY; mY += step) { const y = gy - mY * sc; ctx.beginPath(); ctx.moveTo(ox - (ox - VX) * gridReveal, y); ctx.lineTo(ox + (VX + VW - ox) * gridReveal, y); ctx.stroke(); }
  for (let mX = 0; ox + mX * sc < VX + VW; mX += step) { const x = ox + mX * sc; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - (gy - VY) * gridReveal); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#6E8399'; ctx.font = '400 15px "IBM Plex Mono", monospace'; ctx.textAlign = 'right';
  for (let mY = 0; mY <= S.h + 0.01; mY += step) { ctx.fillText(mY + ' m', VX + 120, gy - mY * sc + 5); }
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#3B4D5F'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(VX + 24, gy); ctx.lineTo(VX + VW - 24, gy); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let x = VX + 34; x < VX + VW - 24; x += 18) { ctx.beginPath(); ctx.moveTo(x, gy + 3); ctx.lineTo(x - 10, gy + 14); ctx.stroke(); }

  const t = pcClamp(S.t, 0, T);
  const R = 15;
  const pos = function (tt: number): [number, number] { return [ox + S.vx * tt * sc, gy - (S.h - 0.5 * S.g * tt * tt) * sc - R]; };
  ctx.globalAlpha = a3 * 0.55; ctx.fillStyle = accent;
  for (let k = 0; k <= 48; k++) { const q = pos(T * k / 48); ctx.fillRect(q[0] - 1.5, q[1] - 1.5 + R, 3, 3); }
  const sdt = T > 2.6 ? 0.25 : 0.1;
  ctx.globalAlpha = a3 * 0.3; ctx.strokeStyle = accent; ctx.lineWidth = 2;
  for (let tt = 0; tt < t - 0.02; tt += sdt) { const q = pos(tt); ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, Math.PI * 2); ctx.stroke(); }
  const b = pos(t);
  const hNow = S.h - 0.5 * S.g * t * t;
  ctx.globalAlpha = a3 * (0.25 + 0.45 * (1 - hNow / S.h));
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.ellipse(b[0], gy + 2, R * (0.6 + 0.6 * (1 - hNow / S.h)), 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = a3;
  const grad = ctx.createRadialGradient(b[0] - 5, b[1] - 6, 2, b[0], b[1], R);
  grad.addColorStop(0, '#E6ECFF'); grad.addColorStop(0.35, accent); grad.addColorStop(1, accent);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b[0], b[1], R * (0.4 + 0.6 * a3), 0, Math.PI * 2); ctx.fill();

  if (S.vectors && a4 > 0) {
    ctx.save(); pcRR(ctx, VX, VY, VW, VH, 20); ctx.clip();
    const vy = S.g * t, v = Math.hypot(S.vx, vy);
    const vmax = Math.hypot(S.vx, S.g * T);
    const kv = 190 / Math.max(vmax, 0.5);
    ctx.globalAlpha = a4;
    if (v > 0.05) {
      pcArrow(ctx, b[0], b[1], b[0] + S.vx * kv, b[1] + vy * kv, 16, accent, 4);
    }
    ctx.fillStyle = accent; ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillText('v ' + v.toFixed(1) + ' m/s', b[0] + S.vx * kv + 78, Math.max(b[1] + vy * kv, b[1] + 20) + 6);
    const ax = b[0] + 40, alen = Math.max(14, S.g * 9);
    pcArrow(ctx, ax, b[1] - 8, ax, b[1] - 8 + alen, 13, blue, 3.5);
    ctx.fillStyle = blue; ctx.fillText('a = g', ax + 14, b[1] + 2);
    ctx.restore();
  }

  ctx.globalAlpha = a2;
  ctx.fillStyle = '#DCE4EC'; ctx.font = '500 20px Sora, sans-serif'; ctx.fillText('Free fall  ·  ' + S.gName, VX + 30, VY + 48);
  ctx.fillStyle = '#7F93A8'; ctx.font = '400 16px "IBM Plex Mono", monospace'; ctx.fillText('t = ' + t.toFixed(2) + ' s', VX + 30, VY + 78);
  const gx = VX + VW - 238, gyy = VY + 22;
  ctx.fillStyle = '#16222E'; pcRR(ctx, gx, gyy, 214, 48, 24); ctx.fill();
  pcArrow(ctx, gx + 30, gyy + 13, gx + 30, gyy + 36, 9, blue, 3);
  ctx.fillStyle = '#C9D6E4'; ctx.font = '500 16px "IBM Plex Mono", monospace'; ctx.fillText('g = ' + S.g.toFixed(2) + ' m/s²', gx + 50, gyy + 30);

  const off = (1 - a2) * 30;
  ctx.save(); ctx.translate(off, 0);
  ctx.fillStyle = '#121C27'; pcRR(ctx, PX, PY, PW, PH, 20); ctx.fill();
  ctx.fillStyle = '#EEF2F5'; ctx.font = '600 34px Sora, sans-serif'; ctx.fillText('Free fall', PX + 28, PY + 62);
  ctx.fillStyle = '#7F93A8'; ctx.font = '400 15px Sora, sans-serif'; ctx.fillText('Generated from today’s lesson', PX + 28, PY + 92);
  const vyNow = S.g * t;
  const rowsR = [['time', t.toFixed(2) + ' s'], ['height', Math.max(0, hNow).toFixed(2) + ' m'], ['velocity', Math.hypot(S.vx, vyNow).toFixed(2) + ' m/s'], ['acceleration', S.g.toFixed(2) + ' m/s²']];
  for (let i = 0; i < rowsR.length; i++) {
    const y = PY + 148 + i * 42;
    ctx.fillStyle = '#7F93A8'; ctx.font = '400 17px Sora, sans-serif'; ctx.fillText(rowsR[i][0], PX + 28, y);
    ctx.fillStyle = i === 2 ? accent : (i === 3 ? blue : '#EEF2F5'); ctx.font = '500 21px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right'; ctx.fillText(rowsR[i][1], PX + PW - 28, y); ctx.textAlign = 'left';
    ctx.fillStyle = '#1C2834'; ctx.fillRect(PX + 28, y + 14, PW - 56, 1);
  }
  const GX = PX + 28, GY = PY + 330, GW = PW - 56, GH = 130;
  ctx.strokeStyle = '#33465A'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(GX, GY); ctx.lineTo(GX, GY + GH); ctx.lineTo(GX + GW, GY + GH); ctx.stroke();
  ctx.fillStyle = '#6E8399'; ctx.font = '400 13px "IBM Plex Mono", monospace';
  ctx.fillText('v (m/s)', GX + 8, GY + 12); ctx.textAlign = 'right'; ctx.fillText('t (s)', GX + GW, GY + GH - 8); ctx.textAlign = 'left';
  const vmaxG = Math.hypot(S.vx, S.g * T) * 1.05;
  ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(79,115,240,0.25)';
  ctx.beginPath();
  for (let k = 0; k <= 30; k++) { const tt = T * k / 30; const x = GX + (tt / T) * GW, y = GY + GH - Math.hypot(S.vx, S.g * tt) / vmaxG * GH; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath();
  for (let k = 0; k <= 30; k++) { const tt = t * k / 30; const x = GX + (tt / T) * GW, y = GY + GH - Math.hypot(S.vx, S.g * tt) / vmaxG * GH; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  const names: [string, number][] = [['Earth', 9.81], ['Moon', 1.62], ['Mars', 3.71]];
  let px = PX + 28; const pw = (PW - 56 - 16) / 3;
  for (let i = 0; i < 3; i++) {
    const on = Math.abs(names[i][1] - S.g) < 0.01;
    ctx.fillStyle = on ? accent : 'rgba(0,0,0,0)'; ctx.strokeStyle = on ? accent : '#2A3A4A'; ctx.lineWidth = 1.5;
    pcRR(ctx, px, PY + 500, pw, 40, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#14181D' : '#9FB0C1'; ctx.font = '500 16px Sora, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(names[i][0], px + pw / 2, PY + 526); ctx.textAlign = 'left';
    px += pw + 8;
  }
  pcSpacing(ctx, 4); ctx.fillStyle = '#4F6377'; ctx.font = '600 13px Sora, sans-serif';
  ctx.fillText('PLAYABLECRAFT', PX + 28, PY + PH - 22); pcSpacing(ctx, 0);
  ctx.restore();
  ctx.restore();
}
