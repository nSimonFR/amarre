import SwiftUI

struct AgentMessage: View {
    let blocks: [ProseBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                renderBlock(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, 8)
    }

    @ViewBuilder
    private func renderBlock(_ block: ProseBlock) -> some View {
        switch block {
        case .paragraph(let inlines):
            renderInlines(inlines)
                .font(.amSans(Tokens.FontSize.body))
                .foregroundStyle(.amInk)
                .lineSpacing(3)
        case .bulletList(let items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, line in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .font(.amSans(Tokens.FontSize.body))
                            .foregroundStyle(.amInk2)
                        renderInlines(line)
                            .font(.amSans(Tokens.FontSize.body))
                            .foregroundStyle(.amInk)
                            .lineSpacing(3)
                    }
                }
            }
            .padding(.leading, 4)
        }
    }

    private func renderInlines(_ inlines: [ProseInline]) -> Text {
        inlines.reduce(Text("")) { acc, inline in
            switch inline {
            case .text(let s):
                acc + Text(s)
            case .code(let s):
                acc + Text(s)
                    .font(.amMono(Tokens.FontSize.sm))
                    .foregroundStyle(.amInk)
            }
        }
    }
}

#Preview("light") {
    AgentMessage(blocks: [
        .paragraph([
            .text("Reading the extension API and the existing "),
            .code("ui.alert"),
            .text(" path. I'll replace it with a bottom-sheet UI."),
        ]),
        .paragraph([.text("Plan:")]),
        .bulletList([
            [.text("Replace "), .code("gate()"), .text(" with a bottom-sheet")],
            [.text("Add "), .code("always"), .text(" persistence per-host")],
            [.text("Wire up tests for deny, allow, allow-always")],
        ]),
    ])
    .padding(20)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    AgentMessage(blocks: MockChat.permissionGate.turns.compactMap {
        if case let .agent(_, blocks) = $0 { return blocks }
        return nil
    }.first ?? [])
    .padding(20)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
