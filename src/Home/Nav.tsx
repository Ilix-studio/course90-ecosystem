import { useEffect, useRef, useState } from 'react';

const AUDIENCES = ['For schools', 'For colleges', 'For universities'];

const PLAYABLECRAFT_URL = 'https://playablecraft.live/';

/** The product list shared by the desktop dropdown and the mobile menu. */
function ProductItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="pc-item" role="menuitem">
        <div><strong>PlayableCraft</strong><small>Interactive simulations from any lesson</small></div>
        <a className="pc-visit" href={PLAYABLECRAFT_URL} target="_blank" rel="noopener noreferrer" onClick={onNavigate} aria-label="Visit PlayableCraft (opens in a new tab)">
          Visit
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 5H8M5.5 2.5L8 5L5.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
      <div className="pc-item" role="menuitem" aria-disabled="true">
        <div><strong>Remote Compute Acceleration</strong><small>Repair for laggy smart boards</small></div>
        <span className="pc-rnd">In R&amp;D</span>
      </div>
    </>
  );
}

function ProductDropdown() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, []);

  return (
    <div
      ref={wrap}
      className={'pc-dd' + (open ? ' is-open' : '')}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <button ref={btn} type="button" className="pc-dd-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Our Product
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="pc-dd-menu" role="menu">
        <ProductItems />
      </div>
    </div>
  );
}

/** The audience link cycles For schools / colleges / universities on an interval. */
function AudienceRotor() {
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let swap = 0;
    const iv = window.setInterval(() => {
      setLeaving(true);
      swap = window.setTimeout(() => { setI((n) => (n + 1) % AUDIENCES.length); setLeaving(false); }, 280);
    }, 2800);
    return () => { clearInterval(iv); clearTimeout(swap); };
  }, []);

  return (
    <a href="#" className="pc-rotor" aria-live="off">
      <span key={i} className={leaving ? 'is-out' : undefined}>{AUDIENCES[i]}</span>
    </a>
  );
}

/** Mobile menu: hamburger (shown ≤860px) opening a panel with every nav destination. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  return (
    <div ref={wrap} className={'pc-mm' + (open ? ' is-open' : '')}>
      <button type="button" className="pc-mm-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="pc-mm-panel" onClick={() => setOpen((o) => !o)}>
        <span /><span /><span />
      </button>
      <div id="pc-mm-panel" className="pc-mm-panel" hidden={!open}>
        <div className="pc-mm-group">Our Product</div>
        <ProductItems onNavigate={close} />
        <div className="pc-mm-group">Who it's for</div>
        {AUDIENCES.map((a) => <a key={a} href="#" onClick={close}>{a}</a>)}
        <div className="pc-mm-group">Learn more</div>
        <a href="#" onClick={close}>Research</a>
      </div>
    </div>
  );
}

export function Nav() {
  return (
    <header className="pc-top">
      <a href="#" className="pc-pill pc-brand">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="15" height="15" rx="4.5" stroke="#14181D" strokeWidth="1.6" />
          <path d="M7.2 5.6L12.4 9L7.2 12.4Z" fill="#14181D" />
        </svg>
        <span>COURSE90</span>
      </a>
      <nav className="pc-pill pc-nav" aria-label="Main">
        <div className="pc-navlinks">
          <ProductDropdown />
          <AudienceRotor />
          <a href="#">Research</a>
        </div>
        <a href="#" className="pc-cta">Take the survey</a>
        <MobileMenu />
      </nav>
    </header>
  );
}
