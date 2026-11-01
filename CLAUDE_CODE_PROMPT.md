You are working in `playablecraft-hero`, a Vite + three.js (r149) project for the PlayableCraft website hero. Read `README.md`, `src/hero.js`, `src/main.js`, `index.html` and `src/style.css` before changing anything.

## What exists
A scroll-driven WebGL scene. A hidden scroll container (`#pc-scroller`) gives progress 0–1, smoothed in `frame()`, which drives:
- a Catmull-Rom camera path (`PC_KEYS`): drone view of an Indian school → entrance → corridor → classroom → over-the-shoulder behind one student → slow push to the smartboard
- a smartboard drawn on a 2D canvas texture (`drawBoard()`): handwritten lesson → PlayableCraft detection boxes → tile wipe → "understanding" panel → interactive free-fall simulation
- teacher pose animation (`poseTeacher()`), ambient student motion, fans, light shafts, dust
- HTML overlay (captions per chapter, chapter rail, play/pause, live sim controls) bound in `src/main.js`

All geometry is procedural (boxes, capsules, instanced meshes). No external models.

## Goals for this pass (do them in order, run `npm run dev` and check visually after each)
1. **Upgrade three.js to the latest version.** Replace `sRGBEncoding` → `SRGBColorSpace`, `outputEncoding` → `outputColorSpace`, `ColorManagement.legacyMode` → `ColorManagement.enabled`, the `encodings_fragment` shader chunk → `colorspace_fragment`, and re-tune light intensities (physically-correct lighting is the default from r155; point lights need higher intensities and `decay: 2`). The look must match the current build.
2. **Make the page scroll real.** Replace the inner scroll container with window scroll: a tall section (`height: 700vh`) with the canvas and overlay in a `position: sticky; top: 0; height: 100vh` stage. Progress = scroll through that section. Keep chapter buttons and autoplay working (`window.scrollTo`).
3. **Performance.** Merge static boxes per material with `BufferGeometryUtils.mergeGeometries`, cap devicePixelRatio at 1.5 on mobile, only upload the smartboard texture when it changes (already keyed, keep that), pause rendering when the hero is offscreen (IntersectionObserver), and respect `prefers-reduced-motion` (no autoplay, shorter damping, no dust).
4. **Model hooks.** Add an optional GLTF loading path (`GLTFLoader` + `DRACOLoader`) so the procedural school, classroom, teacher and students can each be swapped for a `.glb` in `public/models/` without touching the camera path. Keep the procedural versions as fallback.
5. **Componentise.** Expose the hero as `createPlayableCraftHero(rootElement, options)` with options `{ accent, autoplay, onChapterChange }` and a `destroy()` method that disposes geometries, materials, textures and the renderer. Keep `index.html` as the demo page.

## Constraints
- Keep the visual direction: calm, premium, natural light, minimal colour; not cartoonish, no neon or sci-fi.
- Branding stays subtle: "PLAYABLECRAFT" appears mainly on the smartboard and in the nav; tagline "Where thinking meets doing."
- Keep the simulation scientifically correct (y = h − ½gt², x = vₓt, v = √(vₓ² + (gt)²)).
- Overlay must stay accessible: real buttons and labels, 44px touch targets, works at 375px width.
- Don't add frameworks unless asked. Plain ES modules + Vite.

When done, summarise what changed, and list anything you couldn't verify visually.
