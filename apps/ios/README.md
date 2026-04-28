# amarre · iOS

Native SwiftUI client for the [amarre](../../README.md) WebSocket bridge.

Status: hello-world scaffold — dev builds only. Implementation plan in [`PLAN.md`](./PLAN.md).

## Requirements

- macOS with Xcode 16+
- [Tuist](https://tuist.dev) 4.x (`brew install --formula tuist`, or `mise install tuist@4`)
- iOS 17+ device or simulator

## Build & run (dev)

```sh
cd apps/ios
tuist install        # first time only
tuist generate       # creates Amarre.xcworkspace
open Amarre.xcworkspace
```

In Xcode: pick the `Amarre` scheme, choose a simulator or your device, and ⌘R.

For device builds, set your team once in Xcode → target `Amarre` → Signing & Capabilities → Team. Tuist won't pin a team in `Project.swift`, so each developer's choice stays local.

After pulling new commits, re-run `tuist generate` to refresh the workspace.

## Layout

```
apps/ios/
├── Project.swift              # Tuist target definition
├── Sources/Amarre/            # SwiftUI sources
│   ├── AmarreApp.swift        # @main
│   └── ContentView.swift
├── Resources/Assets.xcassets/ # AppIcon + AccentColor
├── PLAN.md                    # full implementation plan
└── README.md                  # this file
```

The generated `Amarre.xcodeproj` and `Amarre.xcworkspace` are gitignored — regenerate with `tuist generate`.

## Identifiers

- Bundle ID: `dev.amarre.ios` — placeholder, change in `Project.swift` before any production signing.
- Display name: `amarre`
- Min deployment target: iOS 17.0
- Swift language version: 5.9
