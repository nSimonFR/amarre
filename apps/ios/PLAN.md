# amarre · iOS app — implementation plan

Status: **draft** · Branch: `feat/ios-app` · Author: planning session 2026-04-28
Design source: `/mnt/data/cloud/amarre.zip` (extracted to `/tmp/amarre-design/` during planning)

---

## 1. Goal & non-goals

**Goal.** A native SwiftUI iPhone client that talks to an `amarre` server over a tailnet WebSocket and drives a remote `pi` coding agent. Six core screens (Connect, Sessions, Chat, Streaming, Permission, PR/Result) plus Empty/Error states, in light + dark.

**Non-goals (v1).**
- iPad / macOS Catalyst layouts.
- Multi-server support (one server profile is enough; multi comes later).
- Push notifications (background reconnect is enough — server has no push channel today).
- Authentication beyond tailnet ACL (matches the protocol — see `docs/PROTOCOL.md` §1).
- Voice / radial / dual-pane chat variants from the wireframes (`wireframes/screens-chat.jsx` C/D/E).
- Onboarding analytics, crash reporting (add later if needed).

---

## 2. Stack

- **UI:** SwiftUI, iOS 17+. Uses `@Observable`, `ScrollViewReader`, `.contentMargins`, `.symbolEffect`, animation stack — none need backports.
- **Networking:** `URLSessionWebSocketTask` (Foundation, no third-party). `swift-async-algorithms` for stream merging if needed.
- **Concurrency:** Swift Concurrency (async/await, AsyncSequence). Each WS connection exposed as an `AsyncStream<ServerEnvelope>`.
- **Project tooling:** **Tuist** 4.x.
  - `Project.swift` declares targets. `.xcodeproj` is generated, gitignored.
  - Why Tuist over XcodeGen: better modular target story, mature dependency graph, scaffold templates we can reuse for future apps under `apps/`.
- **Lint/fmt:** `swift-format` (Apple, in toolchain). `.swift-format` config at `apps/ios/`.
- **Testing:** XCTest + `swift-testing` for the protocol layer (pure Swift, no iOS SDK needed → fast CI).

---

## 3. Repo layout

```
apps/ios/
├── PLAN.md                  # this file (delete after MVP ships)
├── README.md                # build / run instructions (overwrite the placeholder)
├── .gitignore               # Derived/, *.xcodeproj/, *.xcworkspace/
├── .swift-format
├── Tuist/
│   ├── Package.swift        # external SwiftPM deps (start empty)
│   └── ProjectDescriptionHelpers/
├── Project.swift            # target graph
├── Workspace.swift          # workspace (single project for now)
└── Sources/
    ├── AmarreProtocol/      # pure Swift, no UIKit — Layer 3 + Layer 4 types
    │   ├── Envelope.swift           # command/event/response/extension_*
    │   ├── PiRPC/                   # Layer 4 (pi-coding-agent schema)
    │   │   ├── Commands.swift
    │   │   ├── Events.swift
    │   │   └── State.swift
    │   ├── Codec.swift              # JSON encode/decode w/ snake_case strategy
    │   └── Tests/
    ├── AmarreClient/        # WS client, reconnect, state machine
    │   ├── WSClient.swift           # URLSessionWebSocketTask wrapper
    │   ├── Connection.swift         # state machine: idle | connecting | open | reconnecting | failed
    │   ├── Session.swift            # @Observable — current chat, status, pending perms
    │   ├── Inbox.swift              # AsyncStream<Envelope>
    │   └── Tests/
    ├── AmarreDesign/        # design tokens + atoms (no app logic)
    │   ├── Tokens.swift             # ports tokens-v2.css 1:1
    │   ├── Theme.swift              # ColorScheme bindings
    │   ├── Atoms/
    │   │   ├── AmMark.swift
    │   │   ├── AmAvatar.swift
    │   │   ├── StatusOrb.swift
    │   │   ├── ModePill.swift
    │   │   ├── HeaderPill.swift
    │   │   ├── GlassPill.swift
    │   │   └── Icons.swift          # SF Symbols-first; custom SVG only where Apple has none
    │   └── Previews/                # SwiftUI #Preview on every atom
    └── AmarreApp/           # screens, navigation, app entry point
        ├── AmarreApp.swift          # @main
        ├── AppRoot.swift            # routes: Connect → Sessions → Chat
        ├── Screens/
        │   ├── Connect/
        │   ├── Sessions/
        │   ├── Chat/                # composer, message list, tool rows, perm card
        │   ├── PR/
        │   └── States/              # Empty, Error
        ├── Navigation/
        └── Persistence/             # SwiftData for server profile, last session
```

**Module dependency graph:**
```
AmarreApp → AmarreClient → AmarreProtocol
         ↘ AmarreDesign  ↗
```

`AmarreProtocol` and `AmarreDesign` build on Linux too (no UIKit/SwiftUI imports in `AmarreProtocol`) → CI can run protocol tests on a Nix runner without macOS.

---

## 4. Phasing

Each phase ends in something runnable on a real iPhone over Tailscale. No dead code parked.

### P0 — foundation (½ day)
- `tuist init` + commit `Project.swift`, `.gitignore`, `README.md`, `.swift-format`.
- Empty four targets (`AmarreProtocol`, `AmarreClient`, `AmarreDesign`, `AmarreApp`).
- App entry point that prints "amarre" and renders `AmMark` — proves the chain (Tuist generates, Xcode builds, app runs).
- CI: `tuist generate && xcodebuild` smoke build (no devices).

### P1 — protocol layer (1–1.5 days)
- Layer 3 envelope types (`response`, `event`, `extension_ui_request`, `extension_ui_response`, `error`) — round-trip codable tests against fixtures captured from the running server.
- Layer 4 pi RPC: ingest the schema from `@mariozechner/pi-coding-agent` `docs/rpc.md` (mirror in `Sources/AmarreProtocol/PiRPC/Reference/`). Generate Swift types — start hand-written for the 21 commands + 13 events listed in the explore inventory; codegen optional later.
- `Codec` with snake_case ↔ camelCase strategy, lenient unknown-field handling (forward-compat per protocol §1).
- **Exit criterion:** `swift test` green. `AmarreProtocol` has zero deps on `AmarreClient`/`AmarreApp`.

### P2 — WS client + reconnect (1 day)
- `WSClient` wraps `URLSessionWebSocketTask`, parses one JSONL record per text frame, exposes `AsyncStream<Envelope>` + `send(Envelope)`.
- `Connection` state machine with exponential backoff (200ms→8s, jittered) and `URLSessionConfiguration` for tailnet TLS trust.
- `Session` `@Observable` aggregator: turns the inbox into rendered state (messages array, status, current perm request).
- Wire to a "debug screen" (raw JSONL dump) so we can shake out bugs before any UI is built.
- **Exit criterion:** connect to `wss://rpi5:4344/`, send `get_state`, see live event stream in the debug screen.

### P3 — design system (1 day, parallelizable with P2)
- `Tokens.swift` — ports `tokens-v2.css` exactly. Use `Color(light:dark:)` extensions.
- All atoms with `#Preview` blocks, both color schemes. Snapshot test optional.
- `GlassPill` uses `.background(.ultraThinMaterial)` + custom inner-shine overlay for fidelity. Test on device — Simulator misrepresents blur.
- Typography: load Inter + JetBrains Mono + Instrument Serif via `Fonts/` bundle. Fallback to SF Pro / SF Mono / system serif if a font fails to load.
- **Exit criterion:** every atom in the inventory renders identically to the JSX in light + dark.

### P4 — Connect → Sessions → Chat spine (2–3 days)
- **Connect** screen: form (host, port, mode), QR fallback (deferred — gated behind a feature flag, link to system camera). Persist last server in SwiftData. AmAvatar with `am-breathe` animation (Timeline + scale).
- **Sessions** list: cards with `StatusOrb`, host:branch, preview, time. Filter chips (All / Live / Waiting / Done). "Today / Yesterday" section grouping. Swipe-to-archive deferred.
- **Chat**: scroll-pinned-to-bottom message list, composer with mode toggle (Code/Plan — local-only until we know it controls a server flag, see §6 Q2). Status strip with pulsing dot.
- **Exit criterion:** end-to-end: launch → connect → pick session → see history → send a prompt → see assistant reply.

### P5 — streaming + tool rows (2 days)
- Token-delta rendering: append to the active assistant message, animate caret with `.symbolEffect(.pulse)`. No keyframe-based fake stream — we render real deltas as they arrive.
- `ToolRow` and expanded `ToolCardLive` with state transitions (run → ok / err) driven by `tool_execution_*` events.
- Code diff slab uses `AttributedString` with monospace + per-line bg tint for `+` / `−`.
- **Exit criterion:** triggering a tool from the agent produces a row that animates correctly through start → update → end.

### P6 — permission flow (1 day) — **the differentiator**
- `extension_ui_request` arrives → inject permission card inline in the active chat (not a modal — design uses inline card with accent rail).
- Countdown chip driven client-side from `timeoutMs` field (re-check on tab switch / background return).
- Allow / Deny send `extension_ui_response`. Optimistically dismiss the card; reconcile on the agent's next event.
- "Always allow on [host]" checkbox: stage as **client-side preference for v1** (Keychain-backed, scoped per-host) — see §6 Q5 before we wire it server-side.
- **Exit criterion:** a real `Edit` tool from the agent triggers the card; tapping Allow continues the agent; tapping Deny aborts.

### P7 — polish (1–1.5 days)
- PR/Result screen — file summary card with +/− per file. "Open PR" button uses `SFSafariViewController`.
- Empty + Error states (Connection lost, Permission denied at OS level, etc.).
- Settings screen (host card, theme override, version) — wire-frame fidelity is fine, doesn't need full hi-fi.
- Haptics on tool-end, permission-prompt arrival, session status flips.
- App icon, launch screen.

### P8 — ship (½ day)
- TestFlight build via `xcodebuild archive` from CI; manual upload first, automate later.
- Doc: `apps/ios/README.md` — install Tuist, `tuist generate`, build/run, point `Info.plist` at default tailnet host (`rpi5:4344`).

**Total estimate:** ~10 working days for one engineer. Doubles if the WS protocol surfaces ambiguities we have to chase upstream (likely — see open questions).

---

## 5. Design tokens → Swift mapping (cheat-sheet for P3)

| CSS (`tokens-v2.css`) | Swift (`AmarreDesign.Tokens`) |
|---|---|
| `--am-accent #7c5cff` | `Color.amAccent` (light/dark identical) |
| `--am-bg #f6f5f1` / `#0c0c0e` | `Color.amBg(light: …, dark: …)` |
| `--am-r-xs/sm/md/lg/xl` | `enum Radius: CGFloat { case xs = 8, sm = 12, md = 16, lg = 22, xl = 28 }` |
| `--am-fast 160ms` / `--am-med 280ms` | `Animation.amFast / .amMed` |
| `--am-ease cubic-bezier(.32,.72,0,1)` | `Animation.timingCurve(0.32, 0.72, 0, 1, duration:)` |
| `am-pulse` keyframe | `.symbolEffect(.pulse)` for SF Symbols, custom `TimelineView` for orbs |
| Glass blur 28px + saturate 180% | `.background(.ultraThinMaterial)` + custom border + inner shine overlay |

Inter / JetBrains Mono / Instrument Serif need to be added to the bundle and registered with `UIFont.register` at app start. Fall back gracefully — the design is iOS-feeling enough on SF if a font fails to load.

---

## 6. Open questions (resolve before / during their phase)

These map to questions 1–12 in the design inventory; condensed to the load-bearing ones.

1. **Code/Plan mode (P4).** Is the toggle a server-side `set_steering_mode` command on pi RPC, or a pure local UI hint? **Action:** read pi RPC schema; if there's no command, treat as local. Default-stance: local hint.
2. **Session resume on reconnect (P2/P4).** Does the server replay history on reconnect, or do we issue `get_messages`? **Action:** test against the live server during P2.
3. **"Always allow" persistence (P6).** Local Keychain (per-device) or server-side allow-list? Multi-device implications differ. **Default-stance:** local Keychain in v1; flag a follow-up for server-side once second-client behaviour matters.
4. **Permission timeout source (P6).** Decremented client-side from `timeoutMs`, or driven by server tick events? **Default-stance:** client-side; if events arrive, snap to them.
5. **Multi-client perm race (P6).** What does the *losing* client see when the other phone responded first? Card auto-dismisses? **Action:** read PROTOCOL.md §7 carefully; instrument a test with two simulators.
6. **Diff viewer scope (P7).** Inline tool-card diffs only, or a full-screen diff viewer per the wireframe? **Default-stance:** inline only for v1; full viewer is a P9 follow-up.

Items 1, 7, 8, 11, 12 from the inventory either fold into "default-stance: render real deltas" (no fake animation timing) or are styling details settled by walking the JSX during P3/P5.

---

## 7. Risks

- **Glass / blur fidelity.** SwiftUI `.ultraThinMaterial` is close but not pixel-perfect to the JSX `backdrop-filter: blur(28px) saturate(180%)`. Mitigation: side-by-side check on device in P3; if unacceptable, fall back to a custom `UIVisualEffectView` wrapper.
- **Font licensing / size.** Inter + JetBrains Mono + Instrument Serif are all OFL — fine. Bundle size +~3 MB. Acceptable.
- **WS reliability over Tailscale on cellular.** Backoff is well-trodden; the unknown is server-side state on reconnect — directly tied to Q2 above.
- **pi RPC schema drift.** `@mariozechner/pi-coding-agent` evolves. Mitigation: pin a snapshot of `docs/rpc.md` in `Sources/AmarreProtocol/PiRPC/Reference/` and bump deliberately.

---

## 8. Out-of-scope follow-ups (parking lot)

- Voice input / radial composer (wireframe E).
- Workspace dual-pane (wireframe D).
- Diff viewer full-screen.
- Multi-server profile picker.
- Apple Watch glance ("session needs you" → tap to acknowledge).
- macOS Catalyst port — design grids already accommodate it.
- Push notifications — needs a server-side bridge (separate `apns-relay` service).

---

## 9. Definition of done (for the v1 milestone)

- App connects to `wss://rpi5:4344/` on launch using the persisted profile.
- I can list sessions, open one, send a prompt, watch the assistant stream a reply with at least one tool call rendered live.
- A real `Edit` permission prompt routes through the inline card and the agent resumes after Allow.
- Light + dark both look like the JSX mockups within ~5 % visual delta on a real iPhone 15.
- TestFlight build available.
