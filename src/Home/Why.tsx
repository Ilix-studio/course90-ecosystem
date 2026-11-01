// Why: the reason PlayableCraft exists and who it is for. Reuses the About reveal motion (.pc-about).
import { useEffect, useRef } from 'react';
import { initAboutMotion } from './parallax';

const AUDIENCE = [
  { who: 'Teachers', text: 'Turn a topic from the lesson plan into a simulation to run in front of the class, without building one yourself.' },
  { who: 'Students', text: 'Change gravity, the push and the drop height, and see what happens. Test an idea instead of only reading about it.' },
  { who: 'Schools', text: 'Give a whole classroom the same hands-on way into ideas that are hard to draw on a board.' },
  { who: 'Colleges & universities', text: 'Bring the same interactive approach to introductory science and engineering courses.' },
];

const d = (n: number) => ({ '--d': String(n) }) as React.CSSProperties;

export function Why() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? initAboutMotion(ref.current) : undefined), []);
  return (
    <section ref={ref} id="why" aria-labelledby="why-title" className="pc-about bg-[#0B0F14] px-4 pb-4 pt-20 text-[#F4F2EC] sm:px-8 sm:pt-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 sm:gap-20">
        <div className="grid items-start gap-10 md:grid-cols-2">
          <div>
            <div data-reveal className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#7C9BFF]">Why PlayableCraft</div>
            <h2 id="why-title" data-reveal style={d(1)} className="m-0 text-3xl font-semibold leading-tight sm:text-5xl">Some ideas are hard to draw.</h2>
          </div>
          <div className="flex flex-col gap-4 text-base leading-relaxed text-[#F4F2EC]/70">
            <p data-reveal style={d(2)} className="m-0">
              Why does everything fall at the same rate? A sketched arrow on a board can only say so much about how things really move.
            </p>
            <p data-reveal style={d(3)} className="m-0">
              We created PlayableCraft so a concept can become something students test. It reads what is on the board and composes an interactive
              simulation from it, so students can change the conditions, watch the result build in real time and see why it happens.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="max-w-2xl">
            <div data-reveal className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#7C9BFF]">Who it is for</div>
            <h2 data-reveal style={d(1)} className="m-0 text-3xl font-semibold leading-tight sm:text-4xl">Built for the people in the classroom.</h2>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCE.map((a, i) => (
              <li key={a.who} data-reveal style={d(i)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 font-mono text-xs text-[#7C9BFF]">{String(i + 1).padStart(2, '0')}</div>
                <div className="text-lg font-semibold">{a.who}</div>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-[#F4F2EC]/60">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
