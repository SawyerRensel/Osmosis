# Plan: Set Up Playwright E2E Testing for Osmosis

## Context

Osmosis is a UI-heavy Obsidian plugin (SVG mind maps, drag-and-drop, pan/zoom, keyboard nav). Currently only has Vitest unit tests for parser/layout/cache. No E2E tests exist. The plugin runs inside Obsidian (Electron app), installed via Flatpak on this system.

A proven reference implementation exists at `ref/tasknotes/e2e/` that uses CDP (Chrome DevTools Protocol) to connect Playwright to a running Obsidian instance. We'll adapt that pattern for Osmosis, modified for the Flatpak installation.

## Approach: CDP over `_electron.launch()`

Obsidian isn't a standard Electron app — it has custom bootstrapping. The proven approach (from tasknotes) is:
1. Launch Obsidian with `--remote-debugging-port=9222`
2. Connect via `chromium.connectOverCDP()`
3. Drive the UI with standard Playwright APIs

For Flatpak: `flatpak run md.obsidian.Obsidian --remote-debugging-port=9222 obsidian://open?path=...`

## Files to Create

### 1. `playwright.config.ts`
Standard Playwright config: `testDir: "./e2e"`, single worker (Obsidian is one instance), 60s timeout, trace/video on failure.

### 2. `e2e/obsidian.ts` — Obsidian launcher/fixture
Adapted from `ref/tasknotes/e2e/obsidian.ts`:
- `launchObsidian()` — spawns Obsidian via `flatpak run`, waits for CDP, connects Playwright
- `closeObsidian()` — tears down (keeps existing instances alive)
- `openCommandPalette()` / `runCommand()` — helpers for Obsidian commands
- `openMindMap()` — Osmosis-specific helper
- Dialog dismissal for trust/community-plugin prompts

Key difference from tasknotes: uses `flatpak run md.obsidian.Obsidian` instead of a local unpacked binary.

### 3. `e2e/osmosis.spec.ts` — Smoke test
Three initial tests:
- Plugin loads (ribbon icon "Open mind map" visible)
- Mind map opens via command palette
- SVG nodes render from a known markdown file

### 4. `e2e/fixtures/test-note.md` — Test fixture
Known markdown file with headings and lists that produces a predictable mind map.

### 5. `e2e-vault/` — Isolated test vault (created by setup script)
Copies `vault/` and symlinks the plugin build output so rebuilds are picked up automatically. Includes `.obsidian/community-plugins.json` with `["osmosis"]` pre-configured.

### 6. `e2e-setup.sh` — One-time setup script
- Builds the plugin (`npm run build`)
- Creates `e2e-vault/` from `vault/`
- Symlinks plugin build output into `e2e-vault/.obsidian/plugins/Osmosis/`
- Copies test fixtures into the vault
- Pre-configures community plugins JSON

## Files to Modify

### 7. `package.json` — Add dependency and scripts
- Add `@playwright/test` devDependency
- Add scripts: `e2e`, `e2e:setup`, `e2e:launch`

### 8. `eslint.config.mts` — Add ignores
Add `e2e`, `e2e-vault`, `playwright.config.ts` to `globalIgnores`.

### 9. `.gitignore` — Add generated artifacts
```
e2e-vault/
.obsidian-config-e2e/
test-results/
playwright-report/
```

## Implementation Order

1. `npm install --save-dev @playwright/test`
2. Create `playwright.config.ts`
3. Create `e2e/obsidian.ts` (launcher fixture)
4. Create `e2e/fixtures/test-note.md`
5. Create `e2e-setup.sh` + `chmod +x`
6. Create `e2e/osmosis.spec.ts` (smoke tests)
7. Update `package.json` scripts
8. Update `eslint.config.mts` ignores
9. Update `.gitignore`
10. Run `npm run e2e:setup` to prepare the vault
11. Run `npm run e2e:launch` for first-time manual plugin enablement
12. Run `npm run e2e` to validate

## Verification

1. `npm run e2e:setup` succeeds (vault created, symlinks in place)
2. `npm run e2e:launch` opens Obsidian with the test vault
3. `npm run e2e` passes all 3 smoke tests
4. `npm run lint` still passes (e2e files excluded)
5. `npm run test` still passes (Vitest unaffected)
