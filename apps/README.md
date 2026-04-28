# Apps

Native and web client apps that connect to an `amarre` server.

Each app is its own self-contained subdirectory. The server exposes a single WebSocket endpoint speaking the protocol documented in [`docs/PROTOCOL.md`](../docs/PROTOCOL.md). Apps consume that protocol and render their own UI.

## Subdirectories

- [`ios/`](./ios/) — placeholder for the native iOS client. Empty for now.

## Adding an app

1. Create a directory under `apps/<name>/`.
2. Use any tech stack appropriate to the platform (Swift/SwiftUI, React, Tauri, native CLI, …).
3. Speak the documented protocol — don't introduce alternative wire formats.
4. Add a `README.md` documenting how to build and how it connects to the server.
