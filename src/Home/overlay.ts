// Binds the engine's UI values (renderVals) and events to the overlay markup inside `root`.
// Elements are found by [data-pc="…"] so the markup can live anywhere and several heroes can coexist.
import type { GravId } from './config';

export interface CaptionVals { opacity: string; y: string; visibility: 'visible' | 'hidden' }

/** Everything the overlay needs to paint, produced by the engine each time its state changes. */
export interface UiVals {
  loading: boolean;
  loadingText: string;
  failed: boolean;
  playing: boolean;
  canPlay: boolean;
  playLabel: string;
  playIcon: string; // SVG path data
  hintO: string;
  pct: string;
  pctLabel: string;
  pushLabel: string;
  heightLabel: string;
  caps: CaptionVals[];
  /** Index of the active chapter (drives `aria-current` on the rail). */
  current: number;
  dockO: string;
  dockY: string;
  dockV: 'visible' | 'hidden';
  dockPE: 'auto' | 'none';
  gravs: { label: string; val: string; on: boolean }[];
}

/** The slice of the engine the overlay talks to. */
export interface OverlayEngine {
  gos: (() => void)[];
  pickG: Record<GravId, () => void>;
  togglePlay(): void;
  onPush(e: Event): void;
  onHeight(e: Event): void;
  onVectors(e: Event): void;
  dropAgain(): void;
  renderVals(): UiVals;
  onStateChange: (() => void) | null;
}

export interface Overlay { render(): void; destroy(): void }

export function bindOverlay(root: HTMLElement, engine: OverlayEngine): Overlay {
  const ac = new AbortController();
  const on = (el: Element | null, type: string, fn: (e: Event) => void) => { if (el) el.addEventListener(type, fn, { signal: ac.signal }); };
  const one = <T extends Element = HTMLElement>(n: string) => root.querySelector<T>('[data-pc="' + n + '"]');
  const all = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  const caps = all('[data-cap]');
  const rail = all('[data-go]');
  const gravBtns = all('[data-grav]');
  const el = {
    loading: one('loading'), loadingText: one('loading-text'), play: one<HTMLButtonElement>('play'), playLabel: one('play-label'), playIcon: one<SVGPathElement>('play-icon'),
    hint: one('hint'), pct: one('pct'), pctLabel: one('pct-label'), dock: one('dock'), pushLabel: one('push-label'), heightLabel: one('height-label'),
    playSep: one('play-sep')
  };

  on(el.play, 'click', () => engine.togglePlay());
  rail.forEach((b) => on(b, 'click', () => engine.gos[Number(b.dataset.go)]()));
  gravBtns.forEach((b) => on(b, 'click', () => engine.pickG[b.dataset.grav as GravId]()));
  on(one('push'), 'input', (e) => engine.onPush(e));
  on(one('height'), 'input', (e) => engine.onHeight(e));
  on(one('vec'), 'change', (e) => engine.onVectors(e));
  on(one('drop'), 'click', () => engine.dropAgain());

  function render(): void {
    const v = engine.renderVals();
    if (el.loading) {
      const l = el.loading;
      // engine ready: freeze the ring where it is, then take it to 100% (the 90% hold means "engine still loading")
      if (!v.loading && !l.classList.contains('is-complete')) {
        l.style.setProperty('--p', getComputedStyle(l).getPropertyValue('--p'));
        l.classList.add('is-complete'); void l.offsetWidth;
        l.style.setProperty('--p', v.failed ? getComputedStyle(l).getPropertyValue('--p') : '100');
      }
      l.classList.toggle('is-failed', v.failed);
      l.classList.toggle('is-done', !v.loading);
      l.setAttribute('aria-hidden', String(!v.loading));
    }
    if (el.loadingText) el.loadingText.textContent = v.loadingText;

    caps.forEach((c, i) => {
      const cv = v.caps[i];
      c.style.opacity = cv.opacity;
      c.style.transform = 'translateY(' + cv.y + 'px)';
      c.style.visibility = cv.visibility;
    });
    rail.forEach((b, i) => b.setAttribute('aria-current', i === v.current ? 'step' : 'false'));

    if (el.play) {
      el.play.hidden = !v.canPlay; if (el.playSep) el.playSep.hidden = !v.canPlay;
      el.play.setAttribute('aria-pressed', String(v.playing));
    }
    if (el.playLabel) el.playLabel.textContent = v.playLabel;
    if (el.playIcon) el.playIcon.setAttribute('d', v.playIcon);

    if (el.hint) el.hint.style.opacity = v.hintO;
    if (el.pct) el.pct.style.width = v.pct + '%';
    if (el.pctLabel) el.pctLabel.textContent = v.pctLabel;

    if (el.dock) {
      el.dock.style.opacity = v.dockO;
      el.dock.style.transform = 'translateY(' + v.dockY + 'px)';
      el.dock.style.visibility = v.dockV;
      el.dock.style.display = v.dockV === 'visible' ? '' : 'none'; // no reserved space while hidden
      el.dock.style.pointerEvents = v.dockPE;
    }
    gravBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(v.gravs[i].on)));
    if (el.pushLabel) el.pushLabel.textContent = v.pushLabel;
    if (el.heightLabel) el.heightLabel.textContent = v.heightLabel;
  }

  let queued = 0;
  engine.onStateChange = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; render(); });
  };
  render();

  return { render, destroy() { ac.abort(); if (queued) cancelAnimationFrame(queued); queued = 0; engine.onStateChange = null; } };
}
