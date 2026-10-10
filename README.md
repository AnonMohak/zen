# Zen Garden 庭

A real-time 3D Japanese temple garden in spring that runs in the browser. It is built with [Three.js](https://threejs.org/), TypeScript and Vite.

The scene shows a raked karesansui gravel bed with photo-scanned rocks, a koi pond with an arched bridge, cherry trees that drop petals, a temple hall, a stone lantern, a tsukubai basin and a shishi-odoshi water feature. A clay wall, a bamboo fence, a cedar grove, a distant pagoda and misty mountain ridges surround the garden. The sound (wind, water, chimes, birds and the shishi-odoshi knock) is generated live with the Web Audio API.

---

## Contents

- [Quick start](#quick-start)
- [Controls](#controls)
- [URL parameters](#url-parameters)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
  - [Start-up sequence](#start-up-sequence)
  - [Garden layout](#garden-layout)
  - [Lighting and post-processing](#lighting-and-post-processing)
  - [Ground shader](#ground-shader)
  - [Vegetation](#vegetation)
  - [Water, koi and petals](#water-koi-and-petals)
  - [Edo buildings and props](#edo-buildings-and-props)
  - [Procedural textures](#procedural-textures)
  - [Procedural audio](#procedural-audio)
- [Performance](#performance)
  - [Quality presets](#quality-presets)
  - [Adaptive quality ladder](#adaptive-quality-ladder)
  - [Load-time optimisations](#load-time-optimisations)
- [Assets](#assets)
- [Adding or changing assets](#adding-or-changing-assets)
- [Debugging](#debugging)
- [Browser support](#browser-support)
- [Credits](#credits)

---

## Quick start

You need [Bun](https://bun.sh/) or Node.js 20+ (npm, pnpm and yarn also work). The repository includes a `bun.lock` file.

```sh
bun install       # install three, vite and typescript
bun run dev       # start the Vite dev server (http://localhost:5173)
bun run build     # type-check with tsc, then build to dist/
bun run preview   # serve the dist/ build locally
```

| Script    | Command               | Purpose                                   |
| --------- | --------------------- | ----------------------------------------- |
| `dev`     | `vite`                | Dev server with hot reload                |
| `build`   | `tsc && vite build`   | Type-check, then make a production bundle |
| `preview` | `vite preview`        | Serve the production bundle               |

The output in `dist/` is a static site. You can host it on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3 and so on). All asset URLs use `import.meta.env.BASE_URL`, so you can deploy to a sub-path with `vite build --base=/my/path/`.

---

## Controls

| Action        | Mouse                | Touch              |
| ------------- | -------------------- | ------------------ |
| Orbit         | Left-drag            | One-finger drag    |
| Zoom          | Scroll wheel         | Pinch              |
| Pan           | Right-drag           | Two-finger drag    |
| Sound on/off  | **Sound off** button (bottom right) | Tap the button |

The camera has limits:

- Zoom distance is 2.5 m to 40 m.
- The camera cannot go below the horizon (`maxPolarAngle` is just under 90°).
- The camera stays at least 0.45 m above the ground or the pond surface.
- The orbit target stays inside the garden box from `(-22, 0.3, -12)` to `(16, 4, 12)`.

Sound starts off. Browsers block audio until the user interacts with the page, so the `AudioContext` is created on the first click of the button.

---

## URL parameters

The quality settings come from a preset. You can override them with query parameters.

| Parameter      | Values             | Effect                                                   |
| -------------- | ------------------ | -------------------------------------------------------- |
| `quality`      | `low`, `high`      | Force a preset. This also disables GPU auto-detection.   |
| `tex`          | `1k`, `2k`         | Maximum PBR texture resolution                           |
| `shadow`       | number             | Sun shadow-map size in pixels (for example `4096`)       |
| `grass`        | number             | Target number of grass blades                            |
| `petals`       | number             | Number of petal particles                                |
| `forest`       | number             | Number of cedar trees                                    |
| `dpr`          | number             | Maximum device pixel ratio                               |
| `ao`           | `0`/`1`/`true`/`false` | Ground-truth ambient occlusion (GTAO) pass           |
| `bloom`        | `0`/`1`/`true`/`false` | Bloom pass                                           |
| `hdri`         | `0`/`1`/`true`/`false` | HDRI lighting (`1`) or the baked painted sky (`0`)   |
| `aniso`        | number             | Texture anisotropic filtering                            |
| `groundLow`    | `0`/`1`/`true`/`false` | Cheaper ground shader (one texture sample per map)   |
| `debug`        | (no value)         | Expose debug handles on `window` (see [Debugging](#debugging)) |

Examples:

```
http://localhost:5173/?quality=low
http://localhost:5173/?quality=high&shadow=4096&grass=120000
http://localhost:5173/?ao=0&bloom=0&debug
```

---

## Project structure

```
zen/
├── index.html            Page shell, inline loading screen (SVG ink painting + CSS petals)
├── package.json          Scripts and dependencies
├── tsconfig.json         Strict bundler-mode TypeScript settings
├── public/
│   ├── favicon.svg
│   ├── models/           glTF models (meshopt-compressed .glb, WebP textures)
│   └── textures/         Poly Haven PBR sets (.webp) and the HDRI (.hdr)
└── src/
    ├── main.ts           Entry point: renderer, lights, post-processing, build, camera, loop, quality ladder
    ├── quality.ts        Quality presets, URL overrides, integrated-GPU detection
    ├── layout.ts         Shared garden layout constants, signed-distance functions, groundHeight()
    ├── sky.ts            Gradient sky dome shader and baked sky environment map
    ├── ground.ts         Terrain mesh and the raked-gravel / moss / mud shader
    ├── grass.ts          Instanced, wind-animated grass in 10 m culling tiles
    ├── scenery.ts        Cherry trees, scanned rocks, stone lantern, clay wall, sand curb
    ├── edo.ts            Temple, fence, bridge, pagoda, pines, water features, cedar forest, mountains
    ├── pond.ts           Water surface shader and swimming koi
    ├── petals.ts         Falling, resting and drifting cherry petals
    ├── materials.ts      PBR texture loading, texture upgrades, Edo materials, canvas textures
    ├── textures.ts       Canvas-drawn textures (sakura flower, petal, bark, wall, tiles)
    ├── shaders.ts        Shared GLSL: noise, world-position varying, stone detail, wind sway
    ├── gltf.ts           Cached GLTFLoader with the meshopt decoder
    ├── audio.ts          Procedural Web Audio ambience
    └── style.css         Title, sound button and canvas styles
```

---

## How it works

### Start-up sequence

`src/main.ts` controls the start-up. The order is important for a smooth first frame.

1. **Paint the loading screen first.** `index.html` holds the loading art inline (an SVG sumi-e painting of a cherry branch and Mt. Fuji, CSS petals and a progress bar). The critical CSS is inline too, so the first paint is never a white page. `main.ts` waits one animation frame before it creates the WebGL context.
2. **Create the renderer.** It uses ACES Filmic tone mapping and PCF shadows. Per-shader error checks are on only in dev builds (`renderer.debug.checkShaderErrors = import.meta.env.DEV`). This lets the GPU driver compile shaders in parallel, which is a large gain on Windows/ANGLE.
3. **Detect the GPU.** `refineForGpu()` reads `WEBGL_debug_renderer_info`. If the GPU is an integrated Intel GPU (not Arc), it applies a medium preset.
4. **Start all downloads at the same time.** `build()` starts every model load in parallel. The ground waits only for the rock positions, because the ripple rings in the gravel go around the rocks.
5. **Build the procedural parts** (ground, wall, water, grass, mountains, cedars) while the models download.
6. **Wait** for all textures (through `THREE.DefaultLoadingManager`) and the environment map.
7. **Pre-compile every shader** with `renderer.compileAsync()`. The render target is the composer's buffer, so the shaders compile once for the configuration that the first frame uses.
8. **Render one frame behind the loading screen.** This frame links the shadow and post-processing programs. Then the loading screen fades out over 2.4 s.
9. **Upgrade the textures.** After 2.5 s, `upgradeTextures()` replaces the 1k colour and normal maps with 2k maps (only on the high preset).

If the build fails, the loading caption changes to "Could not load the garden." and the error goes to the console.

### Garden layout

`src/layout.ts` is the single source of truth for the garden plan. World units are metres and Y is up. It contains:

- Positions and sizes: `SAND`, `POND`, `WALL`, `TEMPLE`, `FENCE`, `BRIDGE`, `TSUKUBAI`, `SHISHI`, `LANTERN`, `PAGODA`, `SAND_ROCKS`, `WATER_Y` and `SUN_DIR`.
- Signed-distance functions: `sandSdf()` (rounded box), `templeSdf()` (temple footprint) and `pondE()` (elliptical distance to the pond).
- `groundHeight(x, z)`: the terrain height. It digs the pond bowl, adds gentle rolling hills away from the sand, pond and temple, and raises the land toward the back (−z).

The terrain mesh, the grass, the petals, the trees, the camera floor and the prop placement all use `groundHeight()`. So everything sits on the same surface. The ground shader in GLSL repeats the same sand rounded-box SDF.

The approximate plan (top view, +x to the right, +z toward the viewer):

```
                cedars · pagoda · mountains
   ┌───────────── clay wall ────────────┬── bamboo fence ──┐
   │                         pine        │                  │
 temple      ┌──── raked sand ────┐  lantern     ╭──pond──╮  gate
  hall       │   rocks   rocks    │  stepping   │ bridge │  │
   │         └────────────────────┘  stones     ╰────────╯  │
   │  tsukubai                     shishi-odoshi     pine   │
```

### Lighting and post-processing

- **Sky:** `sky.ts` draws a back-faced sphere with a gradient shader (pale blue zenith, peach horizon, a warm sun glow and a sun disc). `HORIZON` (`#f2d3cc`) is also the fog colour and the mountain mist colour.
- **Image-based light:** On the high preset, the scene loads the Poly Haven `bloem_field_sunrise` HDRI and runs it through `PMREMGenerator`. On the low preset, `skyEnvironment()` bakes the painted sky into an environment map instead. Only one environment is set, so shaders compile one time.
- **Direct light:** A warm `DirectionalLight` (the sun) casts shadows over a 52 m × 40 m area. A `HemisphereLight` adds sky and ground fill. The stone lantern has a small `PointLight`.
- **Fog:** `FogExp2` with density 0.013. The mountains are beyond the fog range, so they get manual aerial perspective from vertex colours.
- **Post-processing chain** (`EffectComposer`):
  1. `RenderPass`
  2. `GTAOPass` (high preset). It renders at half resolution. Objects with `userData.noAO` (grass, cedars, petals) are hidden during the AO pass, because their contact shadows are not visible but they cost millions of triangles.
  3. `UnrealBloomPass` (high preset), at half resolution.
  4. A custom `ShaderPass` for a vignette and a slight warm grade.
  5. `OutputPass` for tone mapping and colour-space conversion.

### Ground shader

`ground.ts` makes a 110 m × 110 m plane (300 × 300 segments, or 200 × 200 on low) displaced by `groundHeight()`. A `MeshStandardMaterial` is patched with `onBeforeCompile`:

- **Regions:** Raked gravel inside the sand box, moss outside it, moss islands around each rock and dark mud in the pond bowl.
- **Raking:** The rake lines follow concentric rings within 1.25 m of a rock and straight lines elsewhere. The rake phase drives the colour and a bent normal. The lines fade out where they would alias (`fwidth`).
- **Textures:** The Poly Haven `gravel_floor` and `forest_leaves_02` sets are re-graded in the shader (the gravel becomes white, the moss becomes green).
- **No visible tiling:** Each map is sampled at two scales and two rotations, mixed by noise. `GROUND_LOW` uses one sample.
- **Cheap sampling:** Each texture set is sampled only where it is visible.

### Vegetation

- **Cherry trees** (`scenery.ts`): Three glTF models (`cherrya`, `cherryb`, `cherryc`) are placed nine times. Every tree material sways in the wind through `swayVertex()`. Blossom clumps get a noise "lace" shader: it discards fragments to make a ragged, see-through edge. Flower cards use a canvas sakura texture. Vertices of the near blossoms become petal spawn points.
- **Pines** (`edo.ts`): Two pine models with alpha-tested needle cards and knotted pine bark.
- **Grass** (`grass.ts`): Up to 70,000 instanced, tapered, curved blades with vertex colours. A vertex shader animates them in the wind. Blades appear in noisy clumps, denser near the pond, and thinner far from the centre. They avoid the sand, pond, wall, fence and temple. The blades are grouped into 10 m tiles, so the camera frustum culls tiles that are off screen.
- **Cedar grove** (`edo.ts`): Up to 260 instanced sugi trees outside the wall, fence and temple. Each crown is made of merged low-poly blobs with a noise-discard shader that makes the edges look like foliage.
- **Mountains** (`edo.ts`): Three rings of ridges at 130 m, 200 m and 300 m, made from summed sine waves. They are tallest behind the wall and blend into the horizon colour.

### Water, koi and petals

- **Pond water** (`pond.ts`): An elliptical disc with roughness 0.04. A shader adds moving ripple normals (sines and noise) and Fresnel transparency: the water is more see-through when you look down and more reflective at grazing angles.
- **Koi** (`pond.ts`): Six fish from three koi meshes. They swim slow Lissajous-like loops at different depths. A vertex shader bends the tail.
- **Petals** (`petals.ts`): Up to 3,500 instanced, curved petals.
  - They start in the trees, flutter down with gusting wind and spin on random axes.
  - They land on the ground or float on the pond for 10 to 35 s. Floating petals drift and bob.
  - They shrink away and respawn in a tree.
  - When the page opens, some petals are already in the air and about 35% are already on the ground.
- **Shishi-odoshi** (`edo.ts`): A small state machine (`fill` → `tip` → `pour` → `back`). The tube fills slowly for 7 s, tips, pours, and swings back. When it hits the stone, the update function returns `true` and the audio plays a bamboo knock (if sound is on).
- **Water streams:** Thin transparent cylinders show the water that runs into the tsukubai and the shishi-odoshi.

### Edo buildings and props

`edo.ts` loads the Blender-made Edo-period models (`temple`, `fence`, `bridge`, `pagoda`, `pine`, `tsukubai`). `applyEdoMaterials()` replaces the placeholder glTF materials by Blender material name:

| Blender name | Material                                         |
| ------------ | ------------------------------------------------ |
| `Wood`, `DarkWood` | Poly Haven `dark_wooden_planks`, tinted    |
| `Stone`      | Poly Haven `rock_01`                             |
| `Plaster`    | Poly Haven `plastered_wall_02`                   |
| `Roof`       | Poly Haven `clay_roof_tiles`, re-graded to grey  |
| `Shoji`      | Canvas shoji paper and kumiko lattice, slightly emissive |
| `Tatami`     | Canvas woven igusa straw with cloth borders      |
| `Bamboo`, `BambooDry` | Canvas bamboo culm with nodes           |
| `Needles`    | Canvas pine-needle tuft with alpha               |
| `PineBark`   | Poly Haven `knotted_pine_bark` (1k only)         |
| `Foliage`    | Swaying noise-discard foliage                    |
| `Rope`, `Water`, `Lacquer`, `Gold` | Plain colour materials     |

The Blender models have UVs in metres, so a texture repeat equals `1 / tileSizeInMetres` (see `pbr()` in `materials.ts`).

`scenery.ts` adds the other props:

- **Rocks:** Seven photo-scanned mossy rocks from one glTF (`Scan0` to `Scan6`). Five sit in the sand, 22 small stones ring the pond (with gaps for the lantern view and the bridge), and four flat stones make a stepping path.
- **Stone lantern:** Vertex-coloured stone with procedural grit (`stoneDetail()`), a glowing window and a point light.
- **Clay wall:** An ochre box in the style of Ryoan-ji with a canvas stain texture, a plaster normal map, an extruded gable tile roof and a ridge.
- **Sand curb:** An extruded, bevelled rounded rectangle around the gravel.

### Procedural textures

`textures.ts` and `materials.ts` draw small textures on a `<canvas>` at start-up, so there are fewer files to download:

- Sakura flower (five notched petals, a pink heart, stamens)
- A single falling petal
- Cherry bark, the earthen wall, roof tiles
- Shoji, tatami, bamboo (green and dry) and pine needles

`shaders.ts` holds the shared GLSL:

- `NOISE`: 2D and 3D value noise and fBm.
- `withWorldPos()`: adds a world-space position varying (`vWPos`) to any built-in material. It works with instancing.
- `stoneDetail()`: grit colour and bumped normals from 3D noise.
- `swayVertex()`: wind sway that increases with height above a base, with optional fast flutter for blossoms.
- `uTime`: one shared time uniform. The render loop updates it each frame.

### Procedural audio

`audio.ts` makes all sound with the Web Audio API. There are no audio files.

| Sound           | How it is made                                                      |
| --------------- | ------------------------------------------------------------------- |
| Wind            | Looped brown noise → low-pass filter. Slow LFOs move the cutoff and the gain. |
| Water trickle   | Looped white noise → band-pass filter. The gain and frequency change randomly every 120 ms. |
| Wind chime      | 1–3 notes from a pentatonic-like set, each with three inharmonic partials and a 4 s decay. Plays every 7–19 s. |
| Birds           | 2–4 rising chirps. Plays every 9–27 s.                              |
| Shishi-odoshi   | Two pitched thumps that drop in pitch, plus a band-passed noise click. |

The chime, birds and knock also go through a feedback delay (0.37 s) for a soft echo. The master gain fades in and out over about 0.6 s when you toggle the sound.

---

## Performance

### Quality presets

`quality.ts` selects a preset when the page loads.

| Setting      | High (desktop) | Medium (Intel iGPU) | Low (phone / small screen) |
| ------------ | -------------- | ------------------- | -------------------------- |
| `tex`        | 2k             | 2k                  | 1k                         |
| `shadow`     | 2048           | 2048                | 2048                       |
| `grass`      | 70,000         | 45,000              | 30,000                     |
| `petals`     | 3,500          | 2,500               | 1,500                      |
| `forest`     | 260            | 150                 | 90                         |
| `dpr` (max)  | 2              | 1.5                 | 1.5                        |
| `ao`         | on             | off                 | off                        |
| `bloom`      | on             | on                  | off                        |
| `hdri`       | on             | on                  | off (baked sky)            |
| `aniso`      | 8              | 4                   | 4                          |
| `groundLow`  | off            | on                  | on                         |

- **Low** applies when the device has a coarse pointer (touch) or the smaller screen side is less than 720 px.
- **Medium** applies when the WebGL renderer string contains "Intel" but not "Arc". This happens only when you do not set `?quality`.
- URL overrides apply after the preset (see [URL parameters](#url-parameters)).

### Adaptive quality ladder

While the garden runs, `main.ts` measures the frame rate in 2-second windows. The first 4 seconds are skipped (fade-in and texture uploads).

- If the frame rate is **below 40 fps**, it goes down one step.
- If the frame rate is **above 58 fps** for three windows in a row, it goes up one step.
- It does not measure while the tab is hidden.

The steps remove the most costly effect with the least visible change first:

1. Pixel ratio 1.5
2. AO off
3. Pixel ratio 1.25
4. Pixel ratio 1
5. Bloom off
6. Grass and cedar density 60%
7. Pixel ratio 0.85
8. Pixel ratio 0.75

Steps that do not change anything on the current device are skipped.

### Load-time optimisations

- The models are compressed with meshopt and use WebP textures (`gltf-transform optimize`). `gltf.ts` caches each model, so the three cherry models and other shared files download one time.
- The PBR textures are WebP. They load with `ImageBitmapLoader`, which decodes images off the main thread. `THREE.Cache` shares downloads between textures that use the same file.
- Colour and normal maps start at 1k and change to 2k after the fade. Roughness maps stay at 1k.
- The HDRI is 1k. The PMREM filter makes it soft, so a larger file does not look different.
- All shaders compile before the first frame, with `compileAsync` and parallel compilation.
- AO and bloom run at half resolution. AO skips the grass, cedars and petals.
- The grass is split into culling tiles. The far grass is thinner.
- The total asset size is about 4 MB of models and 17 MB of textures (including both the 1k and 2k sets).

---

## Assets

| Path                    | Content                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `public/models/cherrya.glb`, `cherryb.glb`, `cherryc.glb` | Cherry trees. Meshes end in `_bark`, `_blossom` or `_flowers`. |
| `public/models/koi.glb` | Three koi meshes with vertex colours                                    |
| `public/models/lantern.glb` | Stone lantern (`Lantern`, `LanternGlow`)                            |
| `public/models/rocks_scan.glb` | Seven scanned mossy rocks (`Scan0` to `Scan6`)                   |
| `public/models/temple.glb` | Temple hall                                                          |
| `public/models/fence.glb` | Bamboo fence segment (`FenceSeg`) and `Gate`                          |
| `public/models/bridge.glb` | Arched bridge                                                        |
| `public/models/pagoda.glb` | Distant pagoda                                                       |
| `public/models/pine.glb` | `PineA`, `PineB` and their `_needles` meshes                           |
| `public/models/tsukubai.glb` | `Tsukubai` basin, `ShishiBase`, `ShishiTube`                       |
| `public/textures/*_diff_*.webp` | Colour (albedo) maps, 1k and 2k                                 |
| `public/textures/*_nor_*.webp` | Normal maps (OpenGL convention), 1k and 2k                       |
| `public/textures/*_rough_1k.webp` | Roughness maps, 1k only                                       |
| `public/textures/bloem_field_sunrise_1k.hdr` | Environment HDRI                                   |

The code looks up model nodes by name. If you rename a node in Blender, update the matching name in the code.

---

## Adding or changing assets

**Add a glTF model:**

1. Export it from Blender as `.glb`.
2. Compress it: `npx @gltf-transform/cli optimize in.glb public/models/name.glb --compress meshopt --texture-compress webp`.
3. Load it with `loadModel('name')` from `src/gltf.ts`.
4. To use the shared Edo materials, give the Blender materials the names in the [material table](#edo-buildings-and-props) and call `applyEdoMaterials(root)`.
5. Place it with `groundHeight(x, z)` so it sits on the terrain. Add its position to `layout.ts` if other systems must avoid it.

**Add a PBR texture set:**

1. Put `<name>_diff_1k.webp`, `<name>_nor_1k.webp` and `<name>_rough_1k.webp` in `public/textures/`. Add `<name>_diff_2k.webp` and `<name>_nor_2k.webp` for the high preset.
2. Call `pbr('<name>', tileSizeInMetres)` and spread the result into a `MeshStandardMaterial`.

**Move things in the garden:** Change the constants in `src/layout.ts`. The terrain, grass, petals and camera limits follow the new values. The ground shader receives the sand box and rock positions as uniforms.

---

## Debugging

In dev builds, or in any build with `?debug`, these handles are on `window`:

- `camera`: the `PerspectiveCamera`
- `controls`: the `OrbitControls`
- `__three`: `{ scene, renderer, composer, Q }`

Examples in the browser console:

```js
camera.position                       // current camera position
controls.target                       // current orbit target
__three.renderer.info.render          // draw calls and triangles in the last frame
__three.Q                             // active quality settings
```

Shader compile errors show only in dev builds. Production builds skip the check for faster loading.

---

## Browser support

- You need a browser with **WebGL 2** (current Chrome, Edge, Firefox and Safari).
- The code uses top-level `await` and ES2023, so it does not run in old browsers.
- The loading screen hides its falling petals when `prefers-reduced-motion: reduce` is set.
- On phones, the low preset applies automatically.

---

## Credits

- 3D engine: [Three.js](https://threejs.org/) (MIT)
- Build tool: [Vite](https://vite.dev/) and [TypeScript](https://www.typescriptlang.org/)
- HDRI, PBR textures and scanned rocks: [Poly Haven](https://polyhaven.com/) (CC0). The sets are `bloem_field_sunrise`, `bark_brown_02`, `clay_roof_tiles`, `dark_wooden_planks`, `forest_leaves_02`, `gravel_floor`, `knotted_pine_bark`, `plastered_wall_02`, `rock_01` and `rock_moss_set_02`.
- Edo-period buildings and props: Blender models (`public/models/`).
- All other textures and all audio are procedural.
