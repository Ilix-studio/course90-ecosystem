import { useRef, type CSSProperties } from 'react';
import './Loading.css';

const LETTERS = 'Course90'.split('');

/** Branded loading screen: the route fallback (`fixed`) and the hero's scene loader. The engine toggles `is-done` / aria-hidden and the status text on these nodes
 *  (see overlay.ts); the cursor effects below write CSS variables straight to the DOM. */
export function Loading({ fixed = false }: { fixed?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const ball = useRef<HTMLButtonElement>(null);

  const onMove = (e: React.PointerEvent) => {
    root.current?.style.setProperty('--mx', e.clientX + 'px');
    root.current?.style.setProperty('--my', e.clientY + 'px');
    mark.current?.style.setProperty('--px', (e.clientX / innerWidth - 0.5) * 24 + 'px');
    mark.current?.style.setProperty('--py', (e.clientY / innerHeight - 0.5) * 16 + 'px');
  };
  const onBall = () => {
    const b = ball.current;
    if (!b) return;
    b.classList.remove('is-hit'); void b.offsetWidth; b.classList.add('is-hit');
    b.addEventListener('animationend', () => b.classList.remove('is-hit'), { once: true });
  };

  return (
    <div ref={root} className={'pc-loading' + (fixed ? ' pc-loading--fixed' : '')} data-pc="loading" role="status" onPointerMove={onMove}>
      <div className="pc-loading-glow" />
      <div ref={mark} className="pc-loading-mark" aria-label="Course90">
        {LETTERS.map((l, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{l}</span>)}
      </div>
      <div className="pc-loading-company">Course90 is the name of the company</div>
      <button ref={ball} type="button" className="pc-loading-ball" aria-label="Drop the ball" onClick={onBall} />
      <div className="pc-loading-floor" />
      <div className="pc-loading-ring" aria-hidden="true">
        <svg viewBox="0 0 80 80"><circle className="pc-ring-track" cx="40" cy="40" r="34" pathLength="100" /><circle className="pc-ring-bar" cx="40" cy="40" r="34" pathLength="100" /></svg>
        <span className="pc-ring-pct" />
      </div>
      <div className="pc-loading-text" data-pc="loading-text">Loading scene</div>
      <div className="pc-loading-tip">Move your cursor, click the ball</div>
    </div>
  );
}
