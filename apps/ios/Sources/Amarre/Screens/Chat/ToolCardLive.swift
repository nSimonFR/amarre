import SwiftUI

struct ToolCardLive: View {
    let data: ToolCardLiveData

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                StatusDot(state: data.state, size: 8)
                AmIcon(name: data.icon, size: 14, color: .amInk2)
                Text(data.label)
                    .font(.amSans(Tokens.FontSize.sm, weight: .semibold))
                    .foregroundStyle(.amInk)
                Text(data.path)
                    .font(.amMono(Tokens.FontSize.xs))
                    .foregroundStyle(.amInk3)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(data.stat)
                    .font(.amMono(Tokens.FontSize.xs))
                    .foregroundStyle(.amOk)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Rectangle()
                .fill(Color.amLine)
                .frame(height: 0.5)

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(data.diff.enumerated()), id: \.offset) { _, line in
                    diffLineView(line)
                }
            }
            .padding(.vertical, 4)
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.amBgElev)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.amLine, lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder
    private func diffLineView(_ line: DiffLine) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(line.sigil.rawValue)
                .font(.amMono(Tokens.FontSize.xs, weight: .semibold))
                .foregroundStyle(sigilColor(line.sigil))
                .frame(width: 8, alignment: .leading)
            Text(line.text)
                .font(.amMono(Tokens.FontSize.xs))
                .foregroundStyle(.amInk)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 1)
    }

    private func sigilColor(_ sigil: DiffLine.Sigil) -> Color {
        switch sigil {
        case .add: .amOk
        case .remove: .amErr
        case .context: .amInk3
        }
    }
}

#Preview("light") {
    if case let .toolCardLive(_, data) = MockChat.permissionGate.turns.first(where: {
        if case .toolCardLive = $0 { return true }
        return false
    })! {
        ToolCardLive(data: data)
            .padding(20)
            .background(Color.amBg)
            .preferredColorScheme(.light)
    }
}

#Preview("dark") {
    if case let .toolCardLive(_, data) = MockChat.permissionGate.turns.first(where: {
        if case .toolCardLive = $0 { return true }
        return false
    })! {
        ToolCardLive(data: data)
            .padding(20)
            .background(Color.amBg)
            .preferredColorScheme(.dark)
    }
}
