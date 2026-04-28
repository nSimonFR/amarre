import Foundation

struct SessionItem: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let state: SessionState
    let host: String
    let branch: String
    let preview: String
    let time: String
    let badge: String?
}

enum MockSession {
    static let today: [SessionItem] = [
        .init(
            title: "Permission gate UX",
            state: .running,
            host: "rpi5:nic-os",
            branch: "feat/perm",
            preview: "Editing src/extensions/perm.ts…",
            time: "now",
            badge: nil
        ),
        .init(
            title: "Auth · tailnet token",
            state: .waiting,
            host: "mac-studio",
            branch: "main",
            preview: "Needs approval — Edit ~/.zshrc",
            time: "2m",
            badge: "needs you"
        ),
        .init(
            title: "Refactor WS bridge",
            state: .idle,
            host: "rpi5:nic-os",
            branch: "main",
            preview: "Last: 14 files changed",
            time: "1h",
            badge: nil
        ),
        .init(
            title: "ProtonMail integration",
            state: .done,
            host: "rpi5:nic-os",
            branch: "feat/proton",
            preview: "✓ All tests pass · 23 / 0",
            time: "3h",
            badge: nil
        ),
    ]

    static let yesterday: [SessionItem] = [
        .init(
            title: "MEM cache eviction",
            state: .done,
            host: "mac-studio",
            branch: "cache-2",
            preview: "Merged to main",
            time: "yest",
            badge: nil
        ),
    ]

    static var all: [SessionItem] { today + yesterday }

    static var liveCount: Int { all.filter { $0.state == .running }.count }
    static var needsYouCount: Int { all.filter { $0.badge != nil }.count }
    static var waitingCount: Int { all.filter { $0.state == .waiting || $0.state == .warn }.count }
    static var doneCount: Int { all.filter { $0.state == .done || $0.state == .ok }.count }
}
