import Foundation

enum ProseInline: Hashable {
    case text(String)
    case code(String)
}

enum ProseBlock: Hashable {
    case paragraph([ProseInline])
    case bulletList([[ProseInline]])
}

struct DiffLine: Hashable {
    enum Sigil: String, Hashable {
        case add = "+"
        case remove = "-"
        case context = " "
    }
    let sigil: Sigil
    let text: String
}

struct ToolRowData: Hashable {
    let icon: AmIconName
    let label: String
    let path: String
    let state: SessionState
    let meta: String?
}

struct ToolCardLiveData: Hashable {
    let icon: AmIconName
    let label: String
    let path: String
    let state: SessionState
    let stat: String
    let diff: [DiffLine]
}

struct PermissionRequest: Hashable {
    let kind: String
    let titleStatic: String
    let titleMono: String
    let lines: [DiffLine]
    let host: String
    let timeoutLabel: String
}

enum ChatTurn: Identifiable, Hashable {
    case user(id: UUID = UUID(), text: String)
    case agent(id: UUID = UUID(), blocks: [ProseBlock])
    case toolRow(id: UUID = UUID(), data: ToolRowData)
    case toolCardLive(id: UUID = UUID(), data: ToolCardLiveData)
    case permission(id: UUID = UUID(), request: PermissionRequest)
    case stream(id: UUID = UUID(), label: String)

    var id: UUID {
        switch self {
        case .user(let id, _),
             .agent(let id, _),
             .toolRow(let id, _),
             .toolCardLive(let id, _),
             .permission(let id, _),
             .stream(let id, _):
            id
        }
    }
}

struct ChatSessionData: Hashable {
    let title: String
    let subtitle: String
    let status: SessionState
    let statusLabel: String
    let mode: AgentMode
    let composerPlaceholder: String
    let working: Bool
    let turns: [ChatTurn]
}

enum MockChat {
    static let permission = PermissionRequest(
        kind: "permission · edit",
        titleStatic: "Append to ",
        titleMono: "~/.zshrc",
        lines: [
            DiffLine(sigil: .add, text: "export AMARRE_HOME=~/.amarre"),
            DiffLine(sigil: .add, text: "export PATH=$AMARRE_HOME/bin:$PATH"),
        ],
        host: "rpi5",
        timeoutLabel: "30s"
    )

    static let permissionGate = ChatSessionData(
        title: "Permission gate UX",
        subtitle: "rpi5:nic-os · feat/perm",
        status: .run,
        statusLabel: "amarre is working…",
        mode: .code,
        composerPlaceholder: "steer amarre…",
        working: true,
        turns: [
            .user(text: "add a bottom-sheet permission gate. allow / deny / always."),
            .agent(blocks: [
                .paragraph([
                    .text("Reading the extension API and the existing "),
                    .code("ui.alert"),
                    .text(" path. I'll replace it with a bottom-sheet UI and persist the \"always\" choice in the session config."),
                ]),
            ]),
            .toolRow(data: ToolRowData(
                icon: .file,
                label: "Read",
                path: "src/extensions/perm.ts",
                state: .ok,
                meta: "148 lines"
            )),
            .toolRow(data: ToolRowData(
                icon: .folder,
                label: "Grep",
                path: "ui.alert",
                state: .ok,
                meta: "3 hits"
            )),
            .agent(blocks: [
                .paragraph([.text("Plan:")]),
                .bulletList([
                    [.text("Replace "), .code("gate()"), .text(" with a bottom-sheet")],
                    [.text("Add "), .code("always"), .text(" persistence per-host")],
                    [.text("Wire up tests for deny, allow, allow-always")],
                ]),
            ]),
            .toolCardLive(data: ToolCardLiveData(
                icon: .edit,
                label: "Edit",
                path: "src/extensions/perm.ts",
                state: .run,
                stat: "+12 −3",
                diff: [
                    DiffLine(sigil: .remove, text: "  return ui.alert(req.title);"),
                    DiffLine(sigil: .add, text: "  const choice = await ui.bottomSheet({"),
                    DiffLine(sigil: .add, text: "    title: req.title,"),
                    DiffLine(sigil: .add, text: "    body:  req.summary,"),
                    DiffLine(sigil: .add, text: "    actions: ['Allow', 'Deny', 'Always'],"),
                    DiffLine(sigil: .add, text: "  });"),
                ]
            )),
            .permission(request: permission),
            .stream(label: "writing"),
        ]
    )
}
