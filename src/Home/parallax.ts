// Scroll-linked motion helpers. One passive scroll listener per consumer, batched in rAF, writing CSS
// custom properties only (no React state). Layout/transform rules live in style.css.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Calls `read` once per animation frame while scrolling/resizing. Returns cleanup. */
function onScrollFrame(read: () => void): () => void {
  let raf = 0;
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; read(); }); };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  read();
  return () => {
    window.removeEventListener('scroll', queue);
    window.removeEventListener('resize', queue);
    cancelAnimationFrame(raf);
  };
}

/**
 * Hero layers. Sets on `root`:
 *   --pc-p  journey progress 0..1 (read-only mirror of the engine's scroll model)
 *   --pc-e  exit progress 0..1 while the hero scrolls away into the About section
 */
export function initHeroParallax(root: HTMLElement): () => void {
  if (reducedMotion()) return () => {};
  let lp = -1, le = -1;
  const stop = onScrollFrame(() => {
    const r = root.getBoundingClientRect();
    const vh = window.innerHeight;
    const max = r.height - vh;
    const p = max > 0 ? clamp(-r.top / max) : 0;
    const e = clamp((vh - r.bottom) / (vh * 0.8));
    if (Math.abs(p - lp) > 0.0005) { lp = p; root.style.setProperty('--pc-p', p.toFixed(4)); }
    if (Math.abs(e - le) > 0.0005) { le = e; root.style.setProperty('--pc-e', e.toFixed(4)); }
  });
  return () => { stop(); root.style.removeProperty('--pc-p'); root.style.removeProperty('--pc-e'); };
}

/**
 * About/Team motion. Adds `.is-motion` to `section` (hidden initial states only exist under it, so the
 * content stays visible if this never runs), reveals `[data-reveal]` elements on entry, and while the
 * team grid is on screen sets `--tp` (0..1 through the viewport) on it for per-card depth.
 */
export function initAboutMotion(section: HTMLElement): () => void {
  if (reducedMotion() || !('IntersectionObserver' in window)) return () => {};
  section.classList.add('is-motion');

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  section.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  let stopDepth: () => void = noop;
  const grid = section.querySelector<HTMLElement>('[data-depth-grid]');
  let dio: IntersectionObserver | undefined;
  if (grid) {
    let visible = false;
    dio = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && stopDepth === noop) stopDepth = onScrollFrame(() => {
        const r = grid.getBoundingClientRect();
        grid.style.setProperty('--tp', clamp((window.innerHeight - r.top) / (window.innerHeight + r.height)).toFixed(4));
      });
      else if (!visible) { stopDepth(); stopDepth = noop; }
    }, { rootMargin: '10% 0px' });
    dio.observe(grid);
  }
  return () => { io.disconnect(); dio?.disconnect(); stopDepth(); section.classList.remove('is-motion'); };
}
const noop = () => {};
