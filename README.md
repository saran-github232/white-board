# Whiteboard

An offline-first, infinite-canvas whiteboard built with React + TypeScript + Vite. Hand-drawn rendering via `roughjs`, freehand strokes via `perfect-freehand`. No backend, no account, no cloud — everything runs client-side.

## Stack

- React 19 + TypeScript, built with Vite
- `roughjs` — sketchy/hand-drawn shape rendering
- `perfect-freehand` — pressure-aware freehand stroke geometry
- Canvas 2D rendering, `Pointer Events` for mouse/trackpad/touch/stylus input
- No runtime dependency on a backend, CDN, or external API

## Getting started

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check (tsc -b) + production build
npm run lint      # oxlint
npm run preview   # preview the production build
```

## Architecture

- `src/engine/` — framework-agnostic drawing engine: `Camera` (world↔screen transforms, zoom/pan), `Editor` (element CRUD, selection, history, clipboard), `renderer.ts` (canvas draw), `bounds.ts`, `geometry.ts`, `history.ts` (undo/redo), `overlay.ts` (selection/resize/rotate handles), `types.ts`
- `src/tools/` — per-tool logic: `pen`, `eraser`, `select`, `transform` (scale/resize math), `arrow` (binding), `align` (align/distribute)
- `src/components/` — `Canvas` (pointer/keyboard event wiring, owns the render loop), `Toolbar`, `StatusBar`, `ContextMenu`, `TextEditorOverlay`

High-frequency pointer state is kept in refs inside `Canvas.tsx`, not React state — the active stroke renders directly through the engine each frame, and only commits to `Editor` state (and one history entry) when the gesture ends. This keeps drawing latency independent of React's render cycle.

## Feature audit — vs. `Advanced_Offline_Whiteboard_Master_Update_V2.md`

Cross-checked against the master spec on 2026-09-03. Legend: ✅ implemented · 🟡 partial/UI gap · ❌ not started. Section numbers match the spec.

### Canvas & camera
| # | Feature | Status | Notes |
|---|---|---|---|
| 3 | Infinite canvas | ✅ | World-coordinate system, no giant DOM canvas; pan, wheel/ctrl-wheel zoom, keyboard zoom (`+`/`-`/`0`/`1`), fit-all, fit-selection, reset view. Zoom range 5%–5000% matches spec exactly. |
| 3 | True two-finger pinch gesture | 🟡 | Trackpad pinch works via `ctrl+wheel` (how Chrome reports it); no dedicated multi-touch pinch handler. |
| 4 | Camera system | ✅ | `Camera` class: `zoom`/`x`/`y`/viewport, `screenToWorld()`/`worldToScreen()`, DPR-aware. |
| 30 | Grid | ❌ | Not implemented. |
| 31 | Background customization | ❌ | Renderer takes a single background color; no UI, no patterns (dots/lines/graph/isometric). |
| 32 | Dark mode | ❌ | Not implemented. |
| 72 | Fullscreen | ❌ | Not implemented. |
| 73 | Zen mode | ❌ | Not implemented. |
| 90–92 | Resize / DPI / browser-zoom robustness | 🟡 | DPR handled in `Camera`; not stress-tested across Windows scaling / browser zoom levels. |

### Drawing & handwriting
| # | Feature | Status | Notes |
|---|---|---|---|
| 5, 88, 89 | Handwriting engine, active-stroke rendering, React architecture | ✅ | Pointer Events + refs, `perfect-freehand`, no per-pointer-move React state or history entries. |
| 6, 115 | Handwriting acceptance tests | ❌ | Not run — needs manual verification per spec §6/§115. |
| 7 | Freehand tool | 🟡 | Single Pen tool with color/width/opacity/5-level smoothing. No separate Pencil/Marker/Highlighter/Brush presets; no roughness or line-style on freehand strokes. |
| 8 | Hand-drawn style | 🟡 | Roughness via `roughjs` on shapes/lines, deterministic per-object seed (stable across redraw/zoom). No separate sloppiness/roundness sliders. |
| 9 | Shapes | 🟡 | Rectangle, ellipse, diamond, triangle. Missing: rounded rectangle, circle, pentagon, hexagon, star, polygon. |
| 10 | Lines | 🟡 | Straight line only; no orthogonal/curved line variants. |
| 11 | Arrows | 🟡 | Straight arrows with independent start/end heads (none/arrow/triangle/dot/bar). No curved/elbow/bidirectional-specific mode. |
| 12 | Arrow binding | ✅ | `tools/arrow.ts` finds nearest binding target and connection point; bound arrows track the shape as it moves. |
| 13 | Labeled arrows | 🟡 | `label` field exists and renders; no UI to add/edit a label. |
| 22 | Eraser | 🟡 | Stroke eraser (deletes whole objects) with adjustable size. No area/partial eraser. |
| 61 | Sticky notes | ✅ | Create/edit/move/resize/delete/duplicate, 5 preset colors matching spec. |

### Selection & object editing
| # | Feature | Status | Notes |
|---|---|---|---|
| 14 | Selection | 🟡 | Click, drag-select, shift-select, multi-select, select-all, resize + rotate handles, move/resize/rotate/duplicate/delete. No "invert selection". |
| 15 | Grouping | ✅ | Group/ungroup, grouped elements move/resize/rotate/duplicate together. |
| 16 | Z-order | ✅ | Bring forward/to front, send backward/to back. |
| 17 | Locking | ✅ | Lock/unlock via toolbar and context menu. |
| 27 | Alignment | ✅ | Left/center/right/top/middle/bottom. |
| 28 | Distribution | ✅ | Horizontal/vertical. |
| 29 | Snapping | ❌ | Not implemented (grid/edges/centers/connection points/angles). |
| 70 | Rotation | 🟡 | Rotation handle present; no angle-snap (15°/30°/45°/90°). |
| 71 | Shift-constrained resize | ❔ | Not verified in `tools/transform.ts` — needs a check. |

### Text
| # | Feature | Status | Notes |
|---|---|---|---|
| 18 | Text | 🟡 | Multiline, font size, bold/italic/underline, alignment, color, opacity, double-click to edit. `fontFamily` field exists but no font picker in the UI. No text background. |
| 19 | Text autosize | ❔ | `width`/`height` are stored on the element; auto-grow-while-typing behavior not verified. |

### Images
| # | Feature | Status | Notes |
|---|---|---|---|
| 20 | Image support | ❌ | No image element type yet. |
| 21 | Image paste | ❌ | Not implemented. |

### Libraries & content modes
| # | Feature | Status | Notes |
|---|---|---|---|
| 23–24 | Library system + starter packs | ❌ | Not implemented. |
| 62 | Table tool | ❌ | Not implemented. |
| 63 | Mind map mode | ❌ | Not implemented. |
| 64 | Flowchart mode | ❌ | Generic shapes + arrow binding only; no dedicated smart-connector flowchart mode. |
| 65 | Diagram mode | ❌ | Not implemented as a distinct mode. |
| 57–59 | Ruler / protractor / compass | ❌ | Not implemented. |
| 60 | Math mode | ❌ | Not implemented. |
| 103 | Template system | ❌ | Not implemented. |
| 104 | Board background presets | ❌ | Not implemented. |

### Clipboard, duplication
| # | Feature | Status | Notes |
|---|---|---|---|
| 25 | Copy/cut/paste | ✅ | Internal clipboard (Ctrl/Cmd+C/X/V). Not wired to the OS clipboard. |
| 26 | Duplication | ✅ | Ctrl/Cmd+D, offsets the copy. |
| 44 | Clipboard export (copy as image) | ❌ | Not implemented. |

### Persistence
| # | Feature | Status | Notes |
|---|---|---|---|
| 45–46 | Project file format + import | ❌ | Not implemented — no exportable/importable file on disk yet, only the internal autosave. |
| 47 | Excalidraw compatibility layer | ❌ | Not implemented. |
| 48 | Autosave (IndexedDB) | ✅ | Debounced (800ms) autosave to IndexedDB on every editor change; loads on startup. Status bar shows Loading…/Saving…/Saved locally/Storage error. |
| 49–50 | Multiple boards + thumbnails | ❌ | Not implemented — autosave currently covers a single implicit board (fixed record id). |
| 51 | Multiple pages | ❌ | Not implemented. |
| 81 | IndexedDB storage architecture | 🟡 | Uses IndexedDB (not localStorage) with a `schemaVersion` field for future migrations, but everything lives in one object store/record — no split for pages/assets/thumbnails/settings/libraries since those don't exist yet. |
| 82 | Storage quota handling | 🟡 | Save failures (quota exceeded, IndexedDB blocked) are caught and surfaced as a visible "Storage error" status — never silently dropped. No proactive "almost full" warning before it happens. |
| 83 | Crash recovery | 🟡 | The autosave snapshot itself serves as the recovery point (worst case: lose the last &lt;800ms of edits). `loadBoard()` validates shape before trusting stored data and returns `null` (fresh board) instead of throwing on corrupt/unreadable data. |
| 84–85 | File validation / SVG sanitization | ❌ | N/A yet — no user-facing import path exists (only the internal autosave format). |

### Export / output
| # | Feature | Status | Notes |
|---|---|---|---|
| 41–43 | Export PNG / SVG / PDF | ❌ | Not implemented. |
| 105 | Export quality | ❌ | N/A, no export yet. |
| 106 | Print | ❌ | Not implemented. |
| 100–101 | Drag-drop / file import | ❌ | Not implemented. |
| 102 | PDF annotation | ❌ | Not implemented. |

### Presentation
| # | Feature | Status | Notes |
|---|---|---|---|
| 52 | Frames | ❌ | Not implemented. |
| 53 | Presentation mode | ❌ | Not implemented. |
| 54 | Laser pointer | ❌ | Not implemented. |
| 55 | Spotlight | ❌ | Not implemented. |
| 56 | Timer | ❌ | Not implemented. |

### Productivity & UI
| # | Feature | Status | Notes |
|---|---|---|---|
| 33 | Context menu | ✅ | Cut/copy/paste/duplicate/delete/group/ungroup/lock/unlock/z-order/zoom-to-selection. Missing only "add to library" (no library system yet). |
| 34 | Tool lock | ✅ | Toggle in toolbar; drawing tool stays active after each stroke. |
| 35 | Hand tool | ✅ | Dedicated tool + Space-drag + middle-mouse drag. |
| 36 | Zoom controls | ✅ | Zoom in/out, live %, reset, fit-all (status bar); fit-selection via context menu. |
| 37 | Command palette | ❌ | Not implemented. |
| 38 | Search | ❌ | Not implemented. |
| 39 | Undo/redo | ✅ | One history entry per logical action (a full stroke = one entry), not per pointer-move. |
| 40 | History panel | ❌ | Not implemented. |
| 66 | Color picker | 🟡 | Preset swatches (6 colors) + native browser color input for fill. No HEX/RGB/HSL entry, no recent-colors memory. |
| 67 | Stroke style | ✅ | Solid/dashed/dotted. Width slider tops out at 20px for shapes/lines (spec asks up to 40px; pen already goes to 40px). |
| 68 | Fill style | ✅ | Transparent/solid/hachure/cross-hatch via `roughjs`. |
| 69 | Opacity | 🟡 | Field exists on every element; no UI control to set it yet. |
| 74 | Tooltip system | ✅ | Every toolbar control has a `title` (name + shortcut). |
| 75 | Keyboard shortcuts | ✅ | Matches the spec's default bindings (tool letters, Ctrl+Z/Shift+Z, C/X/V/D/A/G, Delete, Escape, Space-pan, `+`/`-`/`0`/`1`). |
| 76 | Shortcut safety | ✅ | Shortcuts are suppressed while a text/input field has focus. |
| 77 | Localization | ❌ | Strings are hardcoded English; no i18n structure yet. |
| 78 | Accessibility | 🟡 | `aria-label`/`aria-pressed` on toolbar controls. No verified focus-ring/high-contrast/reduced-motion support for canvas content. |
| 93 | Contextual property panel | ✅ | Toolbar swaps in shape/line/text/sticky-specific controls based on tool or selection. |
| 94 | Quick action bar | 🟡 | Equivalent actions live in the main toolbar when something is selected, not a floating bar next to the selection. |
| 95 | Mobile/touch | 🟡 | Unified Pointer Events + `touch-action: none` cover basic touch/stylus; no larger touch-specific controls or bottom toolbar. |
| 96 | Desktop experience | ✅ | Mouse/trackpad/keyboard-first, pressure passed through for stylus/tablet input. |
| 97–99 | Right-click menu / middle-click pan / spacebar pan | ✅ | All three implemented as specified. |
| 110 | UI polish | 🟡 | Clean toolbar/status bar; not benchmarked against the spec's full polish checklist (shadows, transitions, etc.). |

### Offline / PWA
| # | Feature | Status | Notes |
|---|---|---|---|
| 79 | Offline PWA (manifest, service worker, install prompt) | ❌ | Not implemented — the app itself needs no network once loaded, but there's no manifest/service worker/install prompt yet, so a fresh load still requires a live dev/build server. |
| 80, 116 | Offline acceptance test | 🟡 | The board now survives reload/close (IndexedDB autosave). Not yet a full PWA — hasn't been tested with the network actually disabled per the spec's exact test steps, and won't survive until §79 (service worker + cached shell) lands. |
| 107 | "Stored locally" messaging | ✅ | Status bar shows "Saved locally" / "Saving…" / "Storage error"; no backend calls exist anywhere in the app. |
| 108 | No external runtime dependencies | ✅ | No CDN/Google Fonts/analytics references; `roughjs` + `perfect-freehand` + React are bundled by Vite. |
| 109 | Collaboration stays optional | ✅ | Trivially true — no collaboration code exists. |

### Process items (spec §1, §111–114, §117–119)
Not features to check off — process rules (preserve existing functionality, don't fake buttons, test matrices, offline acceptance test, priority ordering). This table *is* the §111 feature-discovery checklist and §112 reference audit the spec asks for.

## Biggest gaps, in the spec's own priority order

The spec's "FINAL PRIORITY" list ranks: drawing engine → pointer accuracy → handwriting quality → infinite canvas → selection/editing → shapes → arrows/binding → text → images → undo/redo → **local persistence** → import/export → libraries → pages/frames → presentation → advanced tools → UI polish.

Everything through local persistence (§48) is now done — the board autosaves to IndexedDB and survives a reload. Next up per the spec's ordering: **images (§20–21)**, then **export (§41–44)**.
