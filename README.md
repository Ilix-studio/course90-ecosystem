# PlayableCraft — Hero scene

Scroll-driven WebGL hero: school exterior → corridor → classroom → over-the-shoulder → smartboard → interactive free-fall simulation.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (strict)
npm run build      # typecheck + static files in dist/
npm run preview
```

## Embedding

The source is TypeScript (strict). `HeroOptions`, `HeroHandle` (from `src/Home/hero.ts`) and `ModelsSpec` (from `src/Home/models.ts`) are exported.

```js
import { createPlayableCraftHero } from './src/Home/hero';
import './src/Home/style.css';

const hero = createPlayableCraftHero(document.getElementById('pc-root'), {
  accent: '#F2A93B',                       // simulation highlight colour
  autoplay: false,                         // auto-scroll the journey once ready (ignored with prefers-reduced-motion)
  onChapterChange: (index, name) => {},    // 0 School · 1 Classroom · 2 Lesson · 3 Understand · 4 Simulate
  models: '/models/models.json'            // optional .glb swaps, see public/models/README.md
});

hero.play(); hero.pause(); hero.goTo(2);
await hero.ready;                          // resolves true when the scene (and any models) are ready
hero.destroy();                            // stops the loop, removes listeners, disposes geometries/materials/textures/renderer
```

The root element is the **tall scroll section**; the page's own scroll through it drives the journey. Markup contract
(see `index.html` for the full overlay):

```html
<section id="pc-root" class="pc-hero">          <!-- height: 700vh -->
  <div class="pc-stage" data-pc="stage">        <!-- position: sticky; top: 0; height: 100svh -->
    <canvas data-pc="canvas"></canvas>
    …overlay (data-pc="loading|play|dock|pct|…", data-go="0-4", data-cap="0-4", data-grav="earth|moon|mars")
  </div>
</section>
```

Scroll length = the root's height in `style.css` (`.pc-hero { height: 700vh }`). The stage is `100svh` so mobile
browser-chrome changes don't resize the canvas. Chapter buttons use `window.scrollTo`; scrolling by hand while
autoplay runs stops it.

## Project layout

```
index.html        Demo page: overlay markup + a follow-on section
src/Home/hero.ts       createPlayableCraftHero() + HeroOptions/HeroHandle types + engine: scroll → progress, camera, lights, board, lifecycle
src/Home/world.ts      Procedural world (static boxes merged per material) and the four swappable slots
src/Home/models.ts     Optional GLTF/Draco loading (lazy, code-split)
src/Home/board.ts      Smartboard canvas drawing (lesson → detect → wipe → understand → simulation)
src/Home/overlay.ts    Binds engine values/events to the overlay DOM inside the root
src/Home/config.ts     PC_KEYS (camera), PC_CAPS, PC_GOTO, PC_GRAVS, PC_LIGHT
src/Home/util.ts       Math/canvas helpers, disposeTree()
src/main.ts       Demo bootstrap
public/draco/     Draco decoder (copied from three/examples/jsm/libs/draco/gltf — refresh when upgrading three)
public/models/    Optional .glb files + models.json manifest
```

## Key tuning points

| What | Where |
|---|---|
| Camera journey (scroll progress → position/look-at) | `PC_KEYS` in `config.ts` |
| Caption timing / chapter jump targets / gravity presets | `PC_CAPS` / `PC_GOTO` / `PC_GRAVS` |
| Light intensities (physically based) | `PC_LIGHT` in `config.ts`, "light" block in `frame()` |
| Smartboard phases | `drawBoard()` in `hero.ts`, draw functions in `board.ts` |
| Teacher animation | `poseTeacher()` |
| Autoplay length | `JOURNEY_SECONDS` in `hero.ts` |

## Performance & accessibility notes

- Static boxes/planes are merged per (material, shadow flags, slot, interior/exterior) into ~60 meshes.
- Pixel ratio is capped at 1.5 on touch devices / narrow screens (1.75 on desktop).
- Rendering stops while the hero is off-screen (IntersectionObserver) and resumes on return.
- The smartboard texture is only redrawn/uploaded when its state key changes.
- `prefers-reduced-motion`: no autoplay (button hidden), much shorter scroll damping, no dust, no pointer parallax,
  camera sway, fan spin, ambient sway or walking students. The simulation itself still runs.
- Controls are real buttons/inputs/labels with ≥44px targets; the chapter rail collapses to a compact row ≤860px.

## three.js

Pinned to **0.186.1** (physically-based lights, `SRGBColorSpace`, `outputColorSpace`, `colorspace_fragment`).
`PCFSoftShadowMap` no longer exists, so `PCFShadowMap` is used. Light intensities were re-derived from the r149
values (×π for hemisphere/sun; point lights re-matched for inverse-square falloff) and checked against screenshots.
