# amarre · Expo cross-platform app — implementation plan

Status: **draft** · Branch: `feat/expo-app` · Base: `feat/restructure-rename-protocol` · Author: planning session 2026-04-28

This plan supersedes the native-iOS-only direction in [`apps/ios/PLAN.md`](../ios/PLAN.md). The Expo target gives us iOS + Android + web from one codebase. The iOS plan stays parked as a reference for SwiftUI design tokens and the screen-by-screen breakdown — those translate to React Native cleanly.

---

## 1. Goal & non-goals

**v0 goal (this PR).** A "hello, amarre" Expo app that boots in `expo start --web` on the dev machine. No server wiring, no design system, no auth. Just proof that the toolchain compiles, runs in the browser, and is ready to add iOS/Android target builds later **without scaffold rework**.

**v1 goal (later PRs).** Same six core screens as the iOS plan (Connect, Sessions, Chat, Streaming, Permission, PR/Result), shipped to TestFlight + Play Store via EAS Build, plus a static web export deployed somewhere on the tailnet.

**Non-goals (v0).**
- Any UI past `<Text>hello, amarre</Text>` + an accent dot.
- WS client, protocol types, design tokens — port from the iOS plan in a later PR.
- EAS Build configuration beyond the file. We don't run a cloud build until we have something worth shipping.
- Push notifications, OTA updates, deep linking — all later.
- Storybook, e2e tests, snapshot tests — later.

---

## 2. Stack (chosen for "very future-proof", 2026-04)

- **Expo SDK** — latest stable from `npx create-expo-app@latest`. Pin in `package.json` after scaffolding; bump deliberately each SDK cycle.
- **expo-router** — file-based routing (the de-facto standard, default in `create-expo-app` templates). Future-proof because it mirrors Next.js conventions and lets us share route tables with a hypothetical web build.
- **React Native New Architecture (Fabric + TurboModules)** — on by default in SDK 51+. Leave it on. It's the only forward-compatible runtime.
- **TypeScript strict** — `"strict": true`, `"noUncheckedIndexedAccess": true`. Match the server's tsconfig where possible.
- **Bun** as package manager — matches the rest of the repo. Expo officially supports Bun since SDK 50. Lockfile: `bun.lock` (the existing one at the repo root will absorb mobile deps once we wire the workspace).
- **react-native-web** — Metro bundler renders RN components to DOM. This is what makes `expo start --web` work; nothing extra to add.
- **EAS Build + EAS Submit** — for iOS and Android cloud builds. We add `eas.json` in v0 with the dev/preview/production profiles but don't trigger a build until v1.
- **Reanimated 3 + Gesture Handler** — install in v0 even though we don't use them yet, so the native modules are baked into any future dev client. Cheap to add, expensive to forget.

What we are explicitly **not** adding:
- Redux / Zustand / MobX — `@Observable` equivalent in RN is plain React state + Context, or `useSyncExternalStore` for the WS client. Pick when needed, not now.
- Tailwind / Nativewind — RN's `StyleSheet` is fine for hello-world. Revisit when porting design tokens (the iOS plan ports `tokens-v2.css` 1:1; we'll do the same in JS).
- `react-native-reanimated/babel-plugin` configuration tweaks — `babel.config.js` from the template handles it.

---

## 3. Monorepo placement

```
amarre/
├── apps/
│   ├── ios/                # SwiftUI native — parked, may be deleted later
│   └── mobile/             # this directory — Expo app, name "amarre"
│       ├── PLAN.md         # this file (delete after v1 ships)
│       ├── README.md       # build/run instructions
│       ├── app.json        # Expo config
│       ├── eas.json        # EAS profiles (added in v0, used in v1)
│       ├── package.json    # name: "amarre-mobile"
│       ├── tsconfig.json
│       ├── babel.config.js
│       ├── metro.config.js # monorepo-aware (watchFolders + nodeModulesPaths)
│       ├── app/
│       │   ├── _layout.tsx
│       │   └── index.tsx   # the "hello, amarre" screen
│       ├── assets/         # icon, splash placeholders (Expo defaults are fine)
│       └── .gitignore      # node_modules, .expo, dist, ios/, android/
├── server/
└── package.json            # gains `"workspaces": ["apps/*", "server"]` in v0
```

**Workspace decision.** Convert the root `package.json` to a Bun workspace so `apps/mobile` can later share types (e.g., `AmarreEnvelope`) with `server/`. Keep deps install-able from the worktree root — `bun install` at root resolves both. If the workspace turns out to fight Metro (some 2025 issues with hoisting were reported), fall back to a standalone `apps/mobile/package.json` and accept the duplication.

**App name.** `name` and `slug` in `app.json` are both `amarre`. The directory is `mobile/` because Expo is the *cross-platform* target — calling the dir `expo/` would name the tool, not the platform. The user-visible app name stays `amarre`.

---

## 4. Phasing

### v0 — hello-world web (this PR)

1. `cd apps/mobile && bunx create-expo-app@latest . --template default` — scaffold into the existing dir.
2. Edit `app/index.tsx` to render `hello, amarre` centered on a neutral background, plus one `<View>` colored with the amarre accent (`#7c5cff`) so we know the styling pipeline works.
3. Edit `app.json` so `name`, `slug`, `scheme` are all `amarre`. Bundle ID stub: `com.amarre.app` (iOS) / `com.amarre.app` (Android) — change when we register with Apple/Google.
4. Add `eas.json` with `development`, `preview`, `production` profiles (Expo's defaults).
5. Wire root `package.json` workspace: `"workspaces": ["apps/*", "server"]`. Run `bun install` at root.
6. Add `metro.config.js` with monorepo `watchFolders: [path.resolve(__dirname, '../..')]` so Metro can resolve workspace packages.
7. `bun run --cwd apps/mobile expo start --web` → page renders in the browser at `http://localhost:8081`.
8. Update [`apps/README.md`](../README.md) — add a "mobile/" entry pointing at this app.

**Exit criterion:** `expo start --web` shows "hello, amarre" in light + dark in a desktop browser. `bun install` at the repo root works. Git tree clean. PR mergeable.

### v1 — port the iOS plan to RN (later)

Mirrors P1–P8 from `apps/ios/PLAN.md`, translated:

- **P1 protocol layer** → `packages/protocol/` (a third workspace) with the same envelope/PiRPC types, written in TS this time. Server can import from the same package — kills the protocol-drift risk that the iOS plan has to handle by mirroring `docs/rpc.md`.
- **P2 WS client** → `packages/client/`. Plain WebSocket API works on web, iOS, and Android. Reconnect state machine is identical to the Swift one.
- **P3 design system** → `apps/mobile/src/design/` ports `tokens-v2.css` to a TS module. Atoms (`AmMark`, `AmAvatar`, `StatusOrb`, `ModePill`, `GlassPill`) become RN components. `GlassPill` uses `expo-blur` (`<BlurView>`) — the cross-platform answer to SwiftUI's `.ultraThinMaterial` and CSS `backdrop-filter`.
- **P4–P7** → screens, streaming, permission, PR — same phasing as iOS. Substitute `<FlatList>` for `ScrollViewReader`, `react-native-reanimated` for `.symbolEffect`.
- **P8 ship** → first iOS build via EAS Build (cloud, no Xcode locally), first Android build via EAS, and a static web export served from the tailnet (Caddy or a Tailscale Serve entry).

### v2 — parity polish (later still)

Native dev client, OTA updates via EAS Update, push notifications, deep linking from `amarre://session/<id>`, Apple Watch glance via SwiftWatch (separate module — Expo can't help here).

---

## 5. Open questions (resolve during their phase, not now)

1. **Workspace or standalone?** Default-stance: workspace at root. If Metro complains, downgrade to standalone — both are reversible.
2. **Keep `apps/ios/` SwiftUI plan?** Once the Expo app reaches feature parity (post-v1), the SwiftUI plan becomes a reference doc. Decide then whether to delete the dir or leave it as a parking lot for an Apple-Watch/macOS-Catalyst port that Expo can't deliver.
3. **Design system location.** `apps/mobile/src/design/` (app-local) or `packages/design/` (shared)? Default-stance: app-local until a second consumer (web-only export, watchOS) appears.
4. **Routing scheme for deep links.** `amarre://` vs `https://amarre.tailXXXX.ts.net/...`. Universal Links need TLS + apple-app-site-association — server-side work. Punt to v2.
5. **Native module additions.** Anything beyond `expo-blur`, `expo-haptics`, `react-native-reanimated`, `react-native-gesture-handler` requires a custom dev client. Default-stance: stay inside Expo Go's module set as long as we can.

---

## 6. Risks (specific to Expo / RN)

- **SDK upgrade churn.** Expo cuts a major SDK every ~6 months and drops support for the previous-previous one. Mitigation: bump on schedule, follow `expo-cli`'s `npx expo install --check`. Cheaper than letting two SDKs of debt accumulate.
- **react-native-web ≠ DOM.** Some RN APIs no-op on web (`StatusBar`, haptics, blur on Firefox). Mitigation: web is a dev convenience for v0; production target is iOS/Android. Wrap web-incompatible code in `Platform.OS !== 'web'` guards as we add it.
- **New Architecture compatibility.** A few popular packages (notably some old Reanimated v2 setups) still ship paper-only modules. Mitigation: only use libraries with a green "New Architecture: yes" badge in `react-native-directory.com`.
- **Bun + Metro edge cases.** Reported in 2025: occasional `bun.lock` desync on Linux when an Expo postinstall script runs. Mitigation: `bun install --frozen-lockfile` in CI; if it bites, switch to pnpm just for this app — the rest of the repo is unaffected.
- **Tailnet-only WS over cellular.** Same risk as the iOS plan, same mitigation: aggressive reconnect with backoff.

---

## 7. Definition of done — v0 (this PR)

- `apps/mobile/` exists with a working Expo project (TypeScript, expo-router, New Architecture on).
- `bun install` at the repo root succeeds and resolves `apps/mobile`.
- `bun run --cwd apps/mobile expo start --web` opens the browser to "hello, amarre" with the accent-colored marker visible.
- `eas.json` committed (not yet exercised).
- `apps/README.md` updated.
- No dependency on `apps/ios/`. Both apps coexist.
- PR opens against `feat/restructure-rename-protocol` (or `main` after that lands).

---

## 8. Out-of-scope follow-ups (parking lot)

- iOS / Android cloud builds via EAS.
- Web export (`expo export -p web`) deployed to tailnet (Caddy/Tailscale Serve).
- Migrating the `apps/ios/` SwiftUI plan into RN equivalents (P1–P7 above).
- Watch / TV / desktop targets — Expo SDK roadmap covers tvOS; watchOS and macOS still need a native sidecar.
