import { useEffect, useRef } from "react";
import { initAboutMotion } from "./parallax";

// About: company, team and ecosystem. Placeholder copy (lorem ipsum) until the real text is ready.
const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const LOREM_SHORT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.";

const TEAM = [
  { name: "Team Member One", role: "Founder & CEO" },
  { name: "Team Member Two", role: "Head of Product" },
  { name: "Team Member Three", role: "Lead Engineer" },
  { name: "Team Member Four", role: "Learning Design" },
];

const ECOSYSTEM = [
  {
    name: "PlayableCraft",
    tag: "Live",
    href: "https://playablecraft.live/",
    subtitle: "Interactive simulations from any lesson",
    text: "An AI-driven platform that turns what is on the board, or curriculum text (NCERT / SEBA), into a live, interactive simulation in the browser. No prep for teachers; students change the conditions and watch the result in real time.",
  },
  {
    name: "Remote Compute Acceleration",
    tag: "In R&D",
    subtitle: "Repair for laggy smart boards",
    text: "Servicing for slow, ageing smart boards so they can run interactive lessons again. Offered to institutions and government schools that already have smart boards but lack the performance to use them.",
  },
  { name: "Recommendation System", tag: "In R&D" },
];

// Partners: who supplies the smart-board hardware, and who finances it for schools.
const PARTNERS = [
  {
    role: "Hardware partner",
    name: "Brio Interactive Technologies Limited",
    items: [
      {
        title: "Manufacture to destination",
        text: "Smart boards built and delivered straight to the school, from the factory to the classroom.",
      },
    ],
  },
  {
    role: "Finance partner",
    name: "Varthana",
    items: [
      {
        title: "Easy financing",
        text: "Flexible financing so a school can put smart boards in its classrooms without paying the full cost up front.",
      },
    ],
  },
];

const PITCH = [
  {
    label: "The problem",
    title: "Static learning.",
    text: "Textbook learning is static and leans on rote memorisation. It gives students little interactive, physical intuition for complex science concepts.",
  },
  {
    label: "The solution",
    title: "PlayableCraft.",
    text: "An AI-driven platform that turns static curriculum text (NCERT / SEBA) into real-time, interactive, browser-based visualization.",
  },
  {
    label: "Market & traction",
    title: "Built to scale in schools.",
    text: "Designed to scale across schools through interactive smart boards, on an efficient cloud-native stack: Cloud Run, FastAPI and MongoDB Atlas.",
  },
  {
    label: "Vision & ask",
    title: "Regional EdTech infrastructure.",
    text: "Expanding regional EdTech infrastructure, deploying pilot programmes and accelerating R&D for remote compute acceleration.",
  },
];

function Heading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className='max-w-2xl'>
      <div
        data-reveal
        className='mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#7C9BFF]'
      >
        {kicker}
      </div>
      <h2
        data-reveal
        style={{ "--d": "1" } as React.CSSProperties}
        className='m-0 text-3xl font-semibold leading-tight text-[#F4F2EC] sm:text-4xl'
      >
        {title}
      </h2>
      {children && (
        <p
          data-reveal
          style={{ "--d": "2" } as React.CSSProperties}
          className='mt-4 text-base leading-relaxed text-[#F4F2EC]/70'
        >
          {children}
        </p>
      )}
    </div>
  );
}

export function About() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? initAboutMotion(ref.current) : undefined), []);
  return (
    <section
      ref={ref}
      id='about'
      aria-labelledby='about-title'
      className='pc-about bg-[#0B0F14] px-4 py-20 text-[#F4F2EC] sm:px-8 sm:py-28'
    >
      <div className='mx-auto flex max-w-6xl flex-col gap-20 sm:gap-28'>
        {/* company */}
        <div className='grid items-start gap-10 md:grid-cols-2'>
          <div>
            <div
              data-reveal
              className='mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#7C9BFF]'
            >
              About Course90
            </div>
            <h2
              id='about-title'
              data-reveal
              style={{ "--d": "1" } as React.CSSProperties}
              className='m-0 text-3xl font-semibold leading-tight sm:text-5xl'
            >
              Lorem ipsum dolor sit amet.
            </h2>
          </div>
          <div className='flex flex-col gap-4 text-base leading-relaxed text-[#F4F2EC]/70'>
            <p
              data-reveal
              style={{ "--d": "2" } as React.CSSProperties}
              className='m-0'
            >
              {LOREM}
            </p>
            <p
              data-reveal
              style={{ "--d": "3" } as React.CSSProperties}
              className='m-0'
            >
              {LOREM}
            </p>
            <div className='grid grid-cols-3 gap-4 pt-4'>
              {[
                ["00+", "Lorem"],
                ["00K", "Ipsum"],
                ["00", "Dolor"],
              ].map(([n, l], i) => (
                <div
                  key={l}
                  data-reveal
                  style={{ "--d": String(5 + i) } as React.CSSProperties}
                  className='border-t border-white/15 pt-3'
                >
                  <div className='text-2xl font-semibold text-[#F4F2EC]'>
                    {n}
                  </div>
                  <div className='text-xs text-[#F4F2EC]/50'>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* team */}
        <div className='flex flex-col gap-10'>
          <Heading
            kicker='The team'
            title='Lorem ipsum, the people behind Course90.'
          >
            {LOREM}
          </Heading>
          <ul
            data-depth-grid
            className='pc-team m-0 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-4'
          >
            {TEAM.map((m, i) => (
              <li
                key={m.name}
                data-reveal
                style={
                  {
                    "--d": String(i),
                    "--depth": i % 2 ? 1 : 2,
                  } as React.CSSProperties
                }
                className='pc-card rounded-2xl border border-white/10  p-4 sm:p-5'
              >
                <div className='mb-4 flex aspect-square items-center justify-center rounded-xl  from-[#4F73F0]/30 to-white/5 text-3xl font-semibold text-[#F4F2EC]/80'>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className='text-sm font-semibold sm:text-base'>
                  {m.name}
                </div>
                <div className='mt-1 text-xs text-[#F4F2EC]/55 sm:text-sm'>
                  {m.role}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ecosystem */}
        <div className='flex flex-col gap-10'>
          <Heading
            kicker='The ecosystem'
            title='Lorem ipsum dolor sit amet consectetur.'
          >
            {LOREM}
          </Heading>
          <ul className='m-0 grid list-none gap-4 p-0 sm:grid-cols-2'>
            {ECOSYSTEM.map((e, i) => (
              <li
                key={e.name}
                data-reveal
                style={{ "--d": String(i % 2) } as React.CSSProperties}
                className='flex flex-col justify-between gap-6 rounded-2xl border border-white/10  p-5 sm:p-6'
              >
                <div>
                  <div className='text-lg font-semibold'>{e.name}</div>
                  {e.subtitle && (
                    <div className='mt-1 text-sm font-medium text-[#7C9BFF]'>
                      {e.subtitle}
                    </div>
                  )}
                  <p className='mb-0 mt-2 text-sm leading-relaxed text-[#F4F2EC]/60'>
                    {e.text ?? LOREM_SHORT}
                  </p>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='rounded-full border border-white/20 px-3 py-1 font-mono text-[11px] text-[#F4F2EC]/70'>
                    {e.tag}
                  </span>
                  {e.href && (
                    <a
                      href={e.href}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-sm font-medium text-[#7C9BFF] no-underline hover:text-[#B8C9FF]'
                    >
                      Visit →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* partners: hardware & finance */}
        <div className='flex flex-col gap-10'>
          <Heading
            kicker='Our partners'
            title='The boards in the classroom, and the way schools pay for them.'
          >
            {PARTNERS[0].name} builds and delivers the smart boards
            PlayableCraft runs on. {PARTNERS[1].name} helps schools finance
            them.
          </Heading>
          <ul className='m-0 grid list-none gap-4 p-0 md:grid-cols-2'>
            {PARTNERS.map((p, i) => (
              <li
                key={p.name}
                data-reveal
                style={{ "--d": String(i) } as React.CSSProperties}
                className='flex flex-col gap-5 rounded-2xl border border-white/10 p-5 sm:p-6'
              >
                <div className='border-b border-white/10 pb-5'>
                  <span className='rounded-full border border-white/20 px-3 py-1 font-mono text-[11px] text-[#F4F2EC]/70'>
                    {p.role}
                  </span>
                  <div className='mt-4 text-lg font-semibold sm:text-xl'>
                    {p.name}
                  </div>
                </div>
                <ul className='m-0 flex list-none flex-col gap-5 p-0'>
                  {p.items.map((it) => (
                    <li key={it.title}>
                      <div className='text-base font-semibold'>{it.title}</div>
                      <p className='mb-0 mt-1 text-sm leading-relaxed text-[#F4F2EC]/60'>
                        {it.text}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {/* investment: vision & traction */}
        <div className='flex flex-col gap-10'>
          <Heading
            kicker='Investment · Vision & traction'
            title='Making science something students can play with.'
          >
            From a static textbook problem to an interactive, scalable platform:
            where PlayableCraft is going and what it needs to get there.
          </Heading>
          <ol className='m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4'>
            {PITCH.map((p, i) => (
              <li
                key={p.label}
                data-reveal
                style={{ "--d": String(i) } as React.CSSProperties}
                className='flex flex-col gap-3 rounded-2xl border border-white/10  p-5 sm:p-6'
              >
                <div className='font-mono text-xs uppercase tracking-[0.18em] text-[#7C9BFF]'>
                  {String(i + 1).padStart(2, "0")} · {p.label}
                </div>
                <div className='text-lg font-semibold leading-snug'>
                  {p.title}
                </div>
                <p className='m-0 text-sm leading-relaxed text-[#F4F2EC]/60'>
                  {p.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
