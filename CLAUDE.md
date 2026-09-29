# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules (from the owner)

- **Use the installed skills and plugins.** Before starting a task, check the available skills and use the relevant ones rather than doing everything by hand. At minimum:
  - `security-review` and `code-review` on any significant change before pushing (anything touching the preview protocol, saving, IPC, or file handling counts as significant). Fix what they find.
  - `run` to launch and screenshot the app when verifying UI changes.
  - `simplify` after large rewrites.
  - `learn` when the owner asks to be taught how the code works.
- The owner is learning to code: explain changes in plain language and keep answers practical.

## What this is

**Aerowis Compressor**: an offline Electron desktop app (Windows + macOS) for compressing, converting and editing images, PDFs and Office documents. Everything runs locally; there is no server.

## Commands

```bash
npm install          # also runs electron-builder install-app-deps (postinstall)
npm run dev          # app with hot reload (renderer HMR; main/worker changes restart the app)
npm run typecheck    # tsc for both halves: tsconfig.node.json (main/preload/shared) + tsconfig.web.json (renderer)
npm run smoke        # scripts/smoke-test.ts — runs every tool on generated fixtures via the real engines
npm run build        # electron-vite build → out/
npm run dist:win     # Windows NSIS installer → dist/ (must run on Windows)
npm run dist:mac     # macOS dmg (arm64 + x64) → dist/ (must run on a Mac)
```

- There is no linter and no unit-test framework. `npm run smoke` is the test suite: it calls `runJob()` directly (no Electron) and prints ✓/✗ per case. To run one tool, temporarily trim the `cases` array in `scripts/smoke-test.ts`. Office cases run only if LibreOffice (or MS Office on Windows) is installed.
- UI verification in a headless container: `xvfb-run -a node script.cjs` using `playwright-core`'s `_electron.launch({ executablePath: 'node_modules/electron/dist/electron', args: ['--no-sandbox', '.'] })` after `npm run build`. Stub file pickers with `app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }) }, files)`. Opened tool views stay mounted but hidden, so use `.filter({ visible: true })` on locators.

## Architecture

Four runtimes that talk only via messages:

1. **Main** (`src/main/index.ts`): window, dialogs, IPC handlers, the `preview://` protocol, the review (staging) area, and routing between the renderer and the worker.
2. **Preload** (`src/preload/index.ts`): the only bridge to the renderer (`window.api`). Sandbox + context isolation are on, so the renderer cannot touch Node or the filesystem.
3. **Renderer** (`src/renderer/src`): React 19 + Tailwind v4 + framer-motion.
4. **Worker** (`src/main/worker.ts`): an Electron `utilityProcess` doing all heavy work so the UI never blocks. It is a second rollup entry in `electron.vite.config.ts` (`out/main/worker.js`). Main respawns it if it crashes and fails the in-flight jobs.

### Job flow

The renderer calls `api.runJob(JobRequest)`. Main **overrides `outDir` with `STAGING_ROOT/<jobId>`** (a per-process temp folder) and posts it to the worker. In `engines/runner.ts`, `runJob` looks the tool up in `PER_FILE` (one task per input, optionally parallel via `PARALLEL`) or `COMBINE` (one task for all inputs, e.g. merge and images → PDF), and emits `JobEvent`s (`start` → `task-start` → `task-done` → `done`/`fatal`). Main forwards these to the renderer on `job:event`.

**Results are never written next to the user's files by a job.** The renderer shows them for review. `api.saveResults(SaveItem[])` → main `results:save` copies staged outputs to the destination with `uniquePath`/`uniqueDir` (never overwrites) after checking that every source is inside `STAGING_ROOT`. Multi-output results (split, PDF → images) are saved as a folder. `job:discard` deletes a job's staging folder. The whole staging root is removed on `will-quit`, and folders older than a day are cleaned on startup.

### Preview protocol

`preview://file/?path=…&page=N` (registered privileged before `app.ready`) serves only (a) files the user added (recorded in `userFiles` by `files:describe`) and (b) files under `STAGING_ROOT`. Native image formats are streamed directly. HEIC/TIFF and PDF pages are rendered by the worker (`render` message → `renderImagePreview` / `renderPdfPage`). The renderer CSP in `src/renderer/index.html` must keep `preview:` in `img-src`.

### Engines (`src/main/engines`)

- **image.ts**: sharp. `openImage` handles EXIF rotation, and handles HEIC via `heic-convert` because prebuilt sharp can't decode HEIC. Target-size mode decodes once to raw pixels, binary-searches quality, then downsizes and repeats if needed. In quality mode, a same-format result that is bigger than the input falls back to the original.
- **pdf.ts**: pdf-lib for structure edits (merge/split/rotate/remove/images → PDF). Ghostscript for compression (presets light → extreme; target mode tries them in order), PDF → images and preview rendering. qpdf for protect/unlock.
- **wasm.ts**: runs Ghostscript and qpdf as WebAssembly with a **fresh instance per call** (they keep global state). The binary is passed via the `instantiateWasm` hook, because the Emscripten loaders' URL/fetch logic breaks on file paths. The qpdf build ignores `print`/`printErr` and binds `console.*` at creation, so `console.log`/`error` are globally routed through a `sink` during `callMain` to capture its errors. In packaged builds the `.wasm` files live in `app.asar.unpacked` (see `asarUnpack` in `electron-builder.yml`).
- **office.ts**: LibreOffice headless with a private `-env:UserInstallation` profile, so it works while the user has LibreOffice open. On Windows, when installed, MS Office is used via a PowerShell COM script. Each conversion uses its own temp folder, deleted after the copy.
- **util.ts**: `uniquePath`/`uniqueDir`, and `parseRanges` (the `"1-3, 5, 8-"` syntax used by split/remove/rotate).

### Renderer

- `tools/registry.ts` is the single source of truth for tools: id, category, accepted extensions, `combine`/`minFiles`, action label, and `fields` (typed controls with optional `show(values)` conditions) plus `defaults`. `components/Fields.tsx` renders the fields generically. Per-tool options persist in localStorage (`options:<toolId>`, passwords excluded).
- `App.tsx` keeps every opened `ToolView` mounted (hidden when inactive), so switching tools preserves files, jobs and review state.
- `ToolView.tsx` owns the flow: files → run → review/save. `blocker()` holds the per-tool validation that disables the action button. `applyEvent()` folds `JobEvent`s into `JobState`.
- `PreviewModal.tsx` chooses before/after panes by file kind (`lib/paths.ts#kindOf`): an image compare slider, PDF pages side by side, PDF → images page next to its image, or a result-only view for combine tools.
- Design tokens (navy surfaces, the single `accent` colour) live in `@theme` in `styles.css`. The UI deliberately avoids backdrop blur and ambient animations, for performance and a professional look.

### Adding a tool

1. Add a `ToolId` in `src/shared/types.ts`.
2. Add a definition in `registry.ts` (and a `blocker()` rule in `ToolView.tsx` if it needs validation).
3. Implement the engine function `(input | inputs, options, outDir) => { outputs, note? }`.
4. Register it in `PER_FILE` or `COMBINE` in `runner.ts`.
5. Add a smoke-test case.

## Releases

- `.github/workflows/build.yml` runs on every push to `claude/practical-goodall-gzwdz9` or `main`, on `v*` tags, and on manual dispatch. It builds on Windows and macOS runners (typecheck + smoke test first), then the `release` job publishes a GitHub Release tagged `v<package.json version>`.
- **Bump `version` in package.json for each user-facing release.** Pushing without a bump overwrites the assets of the existing release.
- Installer file names are fixed (`Aerowis-Compressor-Setup.exe`, `Aerowis-Compressor-mac-{arm64,x64}.dmg` in `electron-builder.yml`) because the README links use `releases/latest/download/<name>`. Keep all three places in sync.
- macOS: ad-hoc signing (`identity: '-'`, `hardenedRuntime: false`), since Apple Silicon refuses fully unsigned apps. CI also installs the Intel `@img/sharp-darwin-x64` binaries so the x64 dmg works.
- Ghostscript is AGPL, so the app is AGPL-3.0 (fine for the owner's personal use).
