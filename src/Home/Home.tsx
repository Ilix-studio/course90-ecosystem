// Home: the hero journey (three.js engine mounted on the section below) plus the page chrome.
import { memo, useEffect, useRef } from 'react';
import './style.css';
import { createPlayableCraftHero } from './hero';
import { Loading } from '../mainComponents/Loading';
import { Nav } from './Nav';
import { About } from './About';
import { Why } from './Why';
import { initHeroParallax } from './parallax';

const CHAPTERS = ['School', 'Classroom', 'Lesson', 'Understand', 'Visualize'];

/** The engine owns and mutates the DOM inside this section (opacity, aria, text, canvas), so it
 *  is memoised with no props: React renders it once and never touches it again. */
const Hero = memo(function Hero({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  return (
    // Root = the tall scroll section (700vh). Page scroll through it drives the journey.
    // Inside it, the stage is sticky and exactly one viewport tall.
    <section ref={rootRef} className="pc-hero" id="pc-root" aria-label="Course90 hero">
      <div className="pc-stage" data-pc="stage">
        <canvas
          data-pc="canvas"
          role="img"
          aria-label="A camera journey from a school building into a classroom, ending on a smartboard running a free-fall simulation"
        />
        <Loading />
        <div className="pc-scrim" />
        <Nav />

        <nav className="pc-rail" aria-label="Journey chapters">
          {CHAPTERS.map((c, i) => (
            <button key={c} type="button" data-go={i}>
              <span className="pc-lbl">{c}</span><span className="pc-tick" />
            </button>
          ))}
          <div className="pc-rail-sep" data-pc="play-sep" />
          <button type="button" className="pc-play" data-pc="play" aria-pressed="false">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path data-pc="play-icon" d="M2.5 1L10.5 6L2.5 11Z" fill="#F4F2EC" />
            </svg>
            <span className="pc-lbl" data-pc="play-label">Play journey</span>
          </button>
        </nav>

        <div className="pc-hint" data-pc="hint" aria-hidden="true">
          <div>SCROLL TO ENTER THE CLASSROOM</div>
          <div className="pc-hint-track"><div className="pc-hintline" /></div>
        </div>

        <div className="pc-bottom">
          <div className="pc-bottom-row">
            <div className="pc-captions">
              <div className="pc-cap" data-cap="0">
                <div className="pc-kicker">01 · THE SCHOOL</div>
                <h1>This is where learning happens.</h1>
                <p>Every school day starts the same way: a teacher, a room full of students, and an idea that has to land.</p>
              </div>
              <div className="pc-cap" data-cap="1">
                <div className="pc-kicker">02 · THE CLASSROOM</div>
                <h2>Twenty-four minds, one board.</h2>
                <p>Notebooks open, attention forward. Class IX-B is about to start physics.</p>
              </div>
              <div className="pc-cap" data-cap="2">
                <div className="pc-kicker">03 · THE LESSON</div>
                <h2>Some ideas are hard to draw.</h2>
                <p>Why does everything fall at the same rate? A sketched arrow can only say so much about how things really move.</p>
              </div>
              <div className="pc-cap" data-cap="3">
                <div className="pc-kicker">04 · PLAYABLECRAFT</div>
                <h2>On-Demand Visualization</h2>
                <p>Any concept, visualized the moment a teacher asks. PlayableCraft turns what is on the board into a live, interactive simulation, with no prep and no waiting.</p>
              </div>
              <div className="pc-cap" data-cap="4">
                <div className="pc-kicker">05 · THE SIMULATION</div>
                <h2>Where thinking meets doing.</h2>
                <p>Students change gravity, give the ball a push and watch velocity build in real time. The concept becomes something they can test.</p>
              </div>
            </div>

            <div className="pc-dock" data-pc="dock" role="group" aria-label="Simulation controls">
              <div className="pc-dock-head">
                <div>
                  <div className="pc-dock-title">Try the simulation</div>
                  <div className="pc-dock-sub">Changes update the board live</div>
                </div>
                <button type="button" className="pc-drop" data-pc="drop">Drop again</button>
              </div>
              <div className="pc-grav-row">
                <div className="pc-label" aria-hidden="true">Gravity</div>
                <div className="pc-grav" role="group" aria-label="Gravity">
                  <button type="button" data-grav="earth" aria-pressed="true">Earth <span>9.81</span></button>
                  <button type="button" data-grav="moon" aria-pressed="false">Moon <span>1.62</span></button>
                  <button type="button" data-grav="mars" aria-pressed="false">Mars <span>3.71</span></button>
                </div>
              </div>
              <div className="pc-sliders">
                <label className="pc-field">
                  <span className="pc-field-row">Horizontal push <output data-pc="push-label">0.0 m/s</output></span>
                  <input data-pc="push" type="range" min="0" max="6" step="0.5" defaultValue="0" />
                </label>
                <label className="pc-field">
                  <span className="pc-field-row">Drop height <output data-pc="height-label">10 m</output></span>
                  <input data-pc="height" type="range" min="2" max="20" step="1" defaultValue="10" />
                </label>
              </div>
              <label className="pc-check">
                <input data-pc="vec" type="checkbox" defaultChecked />Show velocity and acceleration vectors
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export default function Home() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!root.current) return;
    const hero = createPlayableCraftHero(root.current, {
      accent: '#4F73F0', // simulation highlight colour
      autoplay: false,
      // optional .glb swaps — edit public/models/models.json (see public/models/README.md)
      models: import.meta.env.BASE_URL + 'models/models.json',
      onChapterChange: (index, name) => console.debug('[playablecraft] chapter', index, name)
    });
    const stopParallax = initHeroParallax(root.current);
    return () => { stopParallax(); hero.destroy(); };
  }, []);

  return (
    <>
      <Hero rootRef={root} />
      <Why />
      <About />
    </>
  );
}
