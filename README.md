<p align="center">
  <img src="public/plugin/icons/Blendon.png" alt="Blendon" width="200">
</p>

<p align="center">
  <b>The website for Blendon - Blender-style Scene view navigation, transform gizmos and pie menus for the Unity Editor.</b>
</p>

<p align="center">
  React 19 &nbsp;·&nbsp; TypeScript &nbsp;·&nbsp; Vite &nbsp;·&nbsp; static, prerendered, deployed to GitHub Pages
</p>

<p align="center">
  <a href="https://blendon.drygiel.com"><b>Live site</b></a> &nbsp;·&nbsp;
  <a href="https://blendon.drygiel.com/playground/">Playground</a> &nbsp;·&nbsp;
  <a href="https://blendon.drygiel.com/docs/Blendon_Manual.pdf">User Manual (PDF)</a> &nbsp;·&nbsp;
  <a href="https://assetstore.unity.com/packages/slug/415610">Asset Store</a> &nbsp;·&nbsp;
  <a href="#getting-started">Getting started</a> &nbsp;·&nbsp;
  <a href="#deployment">Deployment</a>
</p>

<p align="center">
  <a href="https://blendon.drygiel.com"><img src="public/og.jpg" alt="Blendon website" width="100%"></a>
</p>

This repository is mounted as a Git submodule at `Web~/` in the main [Blendon](https://github.com/drygiel/Blendon)
repository. Unity skips folders ending with `~`, so nothing here (including `node_modules`) is imported into the
project.

---

## What's on the site

- **A working Scene view in the browser.** The Playground runs Blendon's navigation, gizmos and pie menus on a real 3D
  scene, so you can try the keys before buying. The landing page embeds the same dock in its _Try it_ section.
- **The real settings window.** The window is rebuilt from the plugin's own `DrawSettings` code and a dump of the Unity
  Editor, so every page, label, tooltip and default matches the asset. Changing a setting changes the Scene view next
  to it.
- **A clip for every feature.** Eighteen short loops in the tooltip style, the same ones the plugin's tooltip cards use,
  and one for each tutorial task that shows a still in the plugin.
- **The tour.** Promo video, what changes against stock Unity, features, precision tools, pie menus, the in-editor
  tutorial, setup, keyboard and feature presets, the Try it dock, shortcuts, under the hood, FAQ.
- **Static and fast.** Prerendered landing with JSON-LD, the Scene view and the window load as their own chunks when
  they come near, and every animation stops under `prefers-reduced-motion`.

---

## Navigation

<table>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/OrbitSelected.webp" alt="Orbit Selected" width="100%">
<br><b>Orbit Selected</b> &nbsp; <kbd>Mouse 2</kbd> drag<br>
Orbit around the selection. Hold <kbd>Alt</kbd> to snap to a world axis, flick <kbd>Alt</kbd>+<kbd>Mouse 2</kbd> to roll 90°.
</td>
<td width="50%" valign="top">
<img src=".github/readme/Pan.webp" alt="Camera Pan" width="100%">
<br><b>Camera Pan</b> &nbsp; <kbd>Shift</kbd>+<kbd>Mouse 2</kbd><br>
The point under the cursor stays under the cursor, and the drag wraps past the view edge.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/Zoom.webp" alt="Zoom" width="100%">
<br><b>Zoom</b> &nbsp; <kbd>Scroll</kbd> &nbsp; <kbd>Num +</kbd> <kbd>Num -</kbd><br>
Blender's Scale, Dolly and Continue methods, toward the cursor.
</td>
<td width="50%" valign="top">
<img src=".github/readme/NumpadViews.webp" alt="Numpad Views" width="100%">
<br><b>Numpad Views</b> &nbsp; <kbd>1</kbd> <kbd>3</kbd> <kbd>7</kbd> <kbd>5</kbd> <kbd>0</kbd><br>
Axis views, perspective toggle, orbit steps, reverse view and looking through the camera.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/OrientationGizmo.webp" alt="Orientation Gizmo" width="100%">
<br><b>Orientation Gizmo</b><br>
Blender's axis ball in the corner. Click an axis to look down it, drag to orbit, middle-click to toggle perspective.
</td>
<td width="50%" valign="top">
<img src=".github/readme/ViewHistory.webp" alt="View History" width="100%">
<br><b>View History</b> &nbsp; <kbd>Shift</kbd>+<kbd>Mouse 3</kbd> / <kbd>Mouse 4</kbd><br>
Back and forward through camera positions, like a browser.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/SelectionHistory.webp" alt="Selection History" width="100%">
<br><b>Selection History</b> &nbsp; <kbd>Mouse 3</kbd> / <kbd>Mouse 4</kbd><br>
The same for selections: step back to what you had selected a moment ago.
</td>
<td width="50%" valign="top">
<img src=".github/readme/FrameSelected.webp" alt="Frame Selected" width="100%">
<br><b>Frame Selected</b> &nbsp; <kbd>Num .</kbd><br>
Each press steps on: the selection, its pivot, a close-up, then back to where you started.
</td>
</tr>
</table>

---

## Transform Gizmos

Blender-style **Move**, **Rotate**, **Scale** and **Transform** gizmos. They live in a tool context of their own,
**Game Object (Blendon)**, which switches itself on and <kbd>B</kbd> toggles from any window. In Game Object, Splines or
ProBuilder the grab, vertex-snap and box-select keys, and <kbd>Z</kbd> / <kbd>Q</kbd> while the Draw Mode and Tools pies
sit on them, are the Editor's own again. Each one can be switched off on its own and falls back to Unity's gizmo. All of them honor Local/Global and Blendon's pivot modes, work with multi-selection and
Unity's grid snapping, and cancel on right-click.

<table>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/Move.webp" alt="Move" width="100%">
<br><b>Move</b> &nbsp; <kbd>W</kbd><br>
Arrows, plane handles and a free-move ring. Hold <kbd>Alt</kbd> to drop the selection onto the surface under the cursor.
</td>
<td width="50%" valign="top">
<img src=".github/readme/Rotate.webp" alt="Rotate" width="100%">
<br><b>Rotate</b> &nbsp; <kbd>E</kbd><br>
Rings that follow the cursor, a trackball and an angle arc. Hold <kbd>Alt</kbd> to aim the selection at a surface.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/Scale.webp" alt="Scale" width="100%">
<br><b>Scale</b> &nbsp; <kbd>R</kbd><br>
Box-tipped axes, plane handles and a uniform-scale circle, with Blender's Global/Local behavior. In Blendon's tool context <kbd>R</kbd> alone starts a grab rotate; in other windows and tool contexts, and on the Unity keyboard preset, <kbd>R</kbd> is the Scale tool.
</td>
<td width="50%" valign="top">
<img src=".github/readme/Transform.webp" alt="Transform" width="100%">
<br><b>Transform</b> &nbsp; <kbd>Y</kbd><br>
All three in one, nested so they never fight.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="public/plugin/tips/Move_Grab.webp" alt="Grab" width="100%">
<br><b>Grab and type</b> &nbsp; <kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd><br>
No handle to click. Constrain with <kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd>, type an exact value, confirm with <kbd>Enter</kbd>. Typing works mid-drag on any handle too.
</td>
<td width="50%" valign="top">
<img src=".github/readme/AllTools.webp" alt="Drag feedback" width="100%">
<br><b>Drag feedback</b><br>
Live readout, drag ghost, constraint line and snap ticks. Hold <kbd>Shift</kbd> for a slow, precise drag.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="public/plugin/tips/AllTools_VertexSnapping.webp" alt="Vertex snapping" width="100%">
<br><b>Vertex snapping</b> &nbsp; hold <kbd>V</kbd> &nbsp; <kbd>Shift</kbd>+<kbd>V</kbd><br>
Snap a vertex onto another object's vertex, or pick any vertex as a virtual pivot. Skinned meshes included.
</td>
<td width="50%" valign="top">
<img src="public/plugin/tips/AllTools_PivotPointMenu.webp" alt="Pivot Point" width="100%">
<br><b>Pivot Point</b><br>
Blendon's tools put a Pivot Point dropdown in Tool Settings, with four of Blender's pivot modes for both rotating and scaling.
</td>
</tr>
</table>

---

## Scene Tools and Menus

<table>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/BoxSelect.webp" alt="Box Select" width="100%">
<br><b>Box Select</b> &nbsp; <kbd>Mouse 0</kbd> drag<br>
Selects everything the box touches, tested against real triangles. <kbd>C</kbd> includes hidden objects, <kbd>Space</kbd> moves the box.
</td>
<td width="50%" valign="top">
<img src=".github/readme/IsolateView.webp" alt="Isolate View" width="100%">
<br><b>Isolate View</b> &nbsp; <kbd>Num /</kbd><br>
Hides everything but the selection. Press again to bring the scene back.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/SnapToFloor.webp" alt="Snap to Floor" width="100%">
<br><b>Snap to Floor</b> &nbsp; <kbd>End</kbd><br>
Drops the selection onto whatever is below it, optionally aligned to the slope.
</td>
<td width="50%" valign="top">
<img src=".github/readme/PieMenus.webp" alt="Pie Menus" width="100%">
<br><b>Pie Menus</b> &nbsp; <kbd>Z</kbd> <kbd>Q</kbd> <kbd>Shift</kbd>+<kbd>A</kbd> ...<br>
Hold, flick, let go, or tap to keep it open. Eight built-in pies, plus a visual editor for your own.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src=".github/readme/ContextMenu.webp" alt="Context Menu" width="100%">
<br><b>Context Menu</b> &nbsp; <kbd>Mouse 1</kbd><br>
Searchable, holds every entry Unity's menu has, plus Add, Snap to Floor, Align and Copy Transform. On the Unity keyboard preset it moves to <kbd>Alt</kbd>+<kbd>Mouse 1</kbd>.
</td>
<td width="50%" valign="top">
<img src="public/plugin/tips/Overview_KeyboardBlendon.webp" alt="Keyboard presets" width="100%">
<br><b>Keyboard presets</b><br>
<b>Blendon</b> answers the Blender keys in the Scene view and writes nothing but the right-click menu's handover; Unity's commands on them keep working everywhere else, and one click moves most of them aside. <b>Unity</b> leaves the Editor's keys alone and moves Blendon's instead.
</td>
</tr>
</table>

The clips above are animated WebP copies of `public/plugin/video/*.mp4` (see [README clips](#readme-clips)). The stills
come straight from `public/plugin/`, so this page needs nothing outside the repository.

---

## Getting started

Requirements:

- Node 24 LTS (see `.nvmrc`; Node 22.12+ also works)
- pnpm 12, pinned in `package.json` - run `corepack enable` once and the right version is used automatically. An
  older pnpm rewrites `pnpm-lock.yaml` in its own format, which CI then rejects.

```bash
corepack enable
pnpm install
pnpm dev
```

Playwright needs its browsers once: `pnpm exec playwright install`.

### Scripts

| Command            | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm install`     | Install dependencies                                                                            |
| `pnpm dev`         | Dev server with hot reload                                                                      |
| `pnpm build`       | Type-check, build the static site into `dist/` and prerender                                    |
| `pnpm prerender`   | Render the landing and its JSON-LD into `dist/index.html`                                       |
| `pnpm preview`     | Serve the production build locally                                                              |
| `pnpm check`       | Type-check, lint, format check and unit tests (what CI runs)                                    |
| `pnpm test`        | Unit tests (Vitest)                                                                             |
| `pnpm test:e2e`    | End-to-end tests in Chromium, Firefox and WebKit (Playwright)                                   |
| `pnpm format`      | Format everything with Prettier                                                                 |
| `pnpm sync`        | Rebuild the plugin's data and assets (see below); `--check` reads everything and writes nothing |
| `pnpm perf:frames` | Long animation frames while the Try It dock mounts, on desktop and on a 4x slower touch device  |
| `pnpm perf:reflow` | Forced reflows on a phone while the landing scrolls                                             |

## Stack

React 19, TypeScript (strict), Vite, SCSS (CSS Modules), Vitest, Playwright, ESLint and Prettier. No CSS framework.

## Settings window data

The site shows Blendon's settings window, rebuilt from the plugin itself. `pnpm sync` reads the plugin this repository
is mounted in (`../`, or `BLENDON_DIR`):

- `Editor/**/*Settings.cs` - each page's `DrawSettings` code, turned into the window's layout
- `Editor/Tutorial/TutorialCurriculum.cs` - the tutorial's chapters, task text and pictures. How each task is ticked
  is ported by hand in `src/scene/blendon/tutorial/curriculum.ts`, and a unit test fails when the two lists drift
- `Editor/Icons` - tooltip images, page header images and Blendon's own icons
- `Metadata~/PlaygroundRef` - labels, tooltips, defaults and constants, the keys of both keyboard presets, the
  contested keys and the Editor's built-in icons, dumped from the Unity Editor (`meta.json`, `model*.json`, `ui/`).
  `BLENDON_REF` points the sync at another dump folder, e.g. a trial dump that is not committed
- `Metadata~/Video` - the feature clips, and in `Tutorial/` the tutorial's own: a task whose picture has a clip of the same
  name there plays its 360p copy over the picture. The plugin doesn't ship those, it shows the still
- `Documentation/Blendon_Manual.pdf` - the manual the page links to

It writes `src/plugin/generated/` (`window-data.json`, `tutorial.json`), `public/plugin/` and `public/docs/`. Both are
committed, so CI never needs the plugin. Run it after changing the plugin's settings pages, then commit the result.

```bash
pnpm sync --check
pnpm sync
BLENDON_DIR=<plugin checkout> BLENDON_REF=<dump folder> pnpm sync
```

The sync stages everything first and swaps `public/plugin`, `public/docs` and the JSON files in only at the end, so a
failure leaves the committed data as it was. A dev server watching the folder can block that swap on Windows; stop
it for the sync.

Tooltips come in twice: `text` as shown on the Blender keys, and `source` with Blendon's live key tokens still in
(`{key:<shortcut id>}`, `{setting:<Class>.<Property>}`). The site fills the tokens in itself from the dump's
`keymap`, so a tooltip follows the keyboard preset and a rebound key the way it does in the Editor.

### Refreshing the Unity dump

`Metadata~/PlaygroundRef` holds what only a running Editor can answer: labels, tooltips and defaults resolved through
the settings classes, the shortcut tables, the pie menus, and the built-in icons. The exporter lives in the plugin, as
a dev tool in its test assembly (`Tests/Editor/Tools/WebExport/BlendonWebExport.cs`), so it compiles and is tested with
the code it reads and never ships. When the dump has to change:

1. Use a test bed project, never your working project: Unity 6000.4 with the Test Framework and URP, its
   `Assets/Blendon` a junction to the plugin checkout to export from. Close every editor that has the bed open.
2. Wrap the run in the prefs guard (`E:/Unity/_wt/tools/prefs-guard.py`), Unity started from a shell rewrites the
   machine-wide EditorPrefs: `python -I prefs-guard.py snapshot <file.reg>` before, `restore <file.reg>` after. Use
   a python that is not the Microsoft Store one, which only sees its own copy of the registry. Copy
   `%APPDATA%\Unity\Editor-5.x\Preferences\shortcuts` first and compare it afterwards.
3. Run the export in batch mode:

   ```bash
   Unity.exe -batchmode -quit -projectPath <bed> \
     -executeMethod Blendon.Editor.Tests.Tools.BlendonWebExport.ExportFromCommandLine \
     -blendonWebOut <folder> -logFile <log>
   ```

   Without `-blendonWebOut` it rewrites the plugin's own `Metadata~/PlaygroundRef`; delete its `ui/` first, the export
   only adds files. It exits with 0, or with 1 and a
   `[WebExport]` line in the log saying why. Inside an open editor the same export is **Blendon > Dev > Export Web
   Data**.

4. Run `pnpm sync` with `BLENDON_DIR` on that plugin checkout (and `BLENDON_REF` on the folder when it is not the
   plugin's own), then commit.

The export never reads the machine's state: it runs on an in-memory shortcut manager and in-memory preferences, so
the keys are the Blender preset's declared ones, every value is its default, and the pie menus are the shipped ones.
It then switches that manager to the Unity preset and reads every key a second time. Under `-executeMethod` and in
batch mode the first-run keyboard question never shows, and the shortcut profile on disk is left as it was.

### README clips

GitHub does not play an `.mp4` linked by a relative path, so the animations on this page are animated WebP files in
`.github/readme/`, outside `public/` so they never ship with the site. After `pnpm sync` brings new clips, rebuild them
with ffmpeg:

```bash
for f in public/plugin/video/*.mp4; do ffmpeg -v error -y -i "$f" -vf "fps=25,scale=640:-1:flags=lanczos" -c:v libwebp_anim -quality 70 -compression_level 6 -loop 0 ".github/readme/$(basename "$f" .mp4).webp"; done
```

## Layout

| Path                      | Contents                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| `src/landing/`            | The landing page: one folder per section under `sections/`, shared bits in `ui/` |
| `src/landing/plotter/`    | The background plotter; `contract.ts` lists what the page marks up for it        |
| `src/playground/`         | The Playground page and its dock, which the landing's Try It section embeds too  |
| `src/scene/`              | The Scene view running Blendon, loaded as its own chunk                          |
| `src/window/`             | The settings window, loaded as its own chunk when its section comes near         |
| `src/window/core/`        | Layout builder, settings model and helpers - plain TypeScript, unit-tested       |
| `src/window/gizmo/`       | The 3D gizmo preview, a port of the plugin's `GizmoPreview` to canvas            |
| `src/window/styles/`      | The window's styles, scoped under `.uw`                                          |
| `src/bridge/`             | What the Scene view and the settings window share: settings and events           |
| `src/plugin/`             | Data from the plugin: `pnpm sync` output in `generated/` and its typed loaders   |
| `src/lib/`                | Small helpers every part uses                                                    |
| `scripts/sync/`           | `pnpm sync`: reads the plugin's C# sources and the Unity dump                    |
| `src/entry-server.tsx`    | `pnpm prerender`'s server entry; `scripts/prerender.ts` writes its output        |
| `.github/readme/`         | Animated WebP clips for this README                                              |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites                                                     |

Animations stop under `prefers-reduced-motion`: the hero holds still, clips don't autoplay and the gizmo preview
stops turning.
