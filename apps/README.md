# Apps

Native and web client apps that connect to an `amarre` server.

Each app is its own self-contained subdirectory. The server exposes a single WebSocket endpoint speaking the protocol documented in [`docs/PROTOCOL.md`](../docs/PROTOCOL.md). Apps consume that protocol and render their own UI.

## Subdirectories

- [`expo/`](./expo/) — Expo cross-platform client (iOS + Android + web). Active. See [`expo/PLAN.md`](./expo/PLAN.md).
- [`ios/`](./ios/) — placeholder for a native SwiftUI iOS client. Parked behind the Expo target; see [`ios/PLAN.md`](./ios/PLAN.md) for the original native plan.

## Adding an app

1. Create a directory under `apps/<name>/`.
2. Use any tech stack appropriate to the platform (Swift/SwiftUI, React, Tauri, native CLI, …).
3. Speak the documented protocol — don't introduce alternative wire formats.
4. Add a `README.md` documenting how to build and how it connects to the server.
