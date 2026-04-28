# amarre · mobile (Expo)

Cross-platform client for the `amarre` server. iOS + Android + web, one codebase.

Status: **v0 — hello-world only**. See [`PLAN.md`](./PLAN.md) for the full roadmap.

## Stack

- Expo SDK 54 · React Native 0.81 · React 19 · New Architecture on
- expo-router (file-based routes, typed)
- TypeScript · React Compiler experiment enabled

## Run on web

```sh
cd apps/mobile
bun install
bun run web   # serves at http://localhost:8081
```

> **NixOS/RPi5 note.** Watchman ships in `home-manager` and refuses to start when the parent process runs at non-zero `nice`. Symptom: `bun run web` hangs at "Waiting for Watchman `watch-project` …". Workaround until we add a `metro.config.js` watcher override: hide watchman from `PATH` for the run, e.g.
>
> ```sh
> PATH=$(echo "$PATH" | tr ':' '\n' | grep -v 'home-manager\|per-user/nsimon' | paste -sd:) bun run web
> ```
>
> Metro then falls back to its built-in node watcher.

## Run on iOS / Android

Not yet wired. Phase v1 in [`PLAN.md`](./PLAN.md) covers EAS Build configuration — you won't need a Mac or Android Studio locally; EAS builds in the cloud.

## Project layout

```
app/
  _layout.tsx     # expo-router root stack
  index.tsx       # the "hello, amarre" screen
app.json          # Expo config (name/slug = "amarre")
package.json      # name = "amarre-mobile"
tsconfig.json
```
