import SwiftUI

struct ToolRow: View {
    let data: ToolRowData

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(state: data.state, size: 8)
            AmIcon(name: data.icon, size: 14, color: .amInk2)
            Text(data.label)
                .font(.amSans(Tokens.FontSize.sm, weight: .semibold))
                .foregroundStyle(Color.amInk)
            Text(data.path)
                .font(.amMono(Tokens.FontSize.sm))
                .foregroundStyle(Color.amInk3)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let meta = data.meta {
                Text(meta)
                    .font(.amSans(Tokens.FontSize.sm))
                    .foregroundStyle(Color.amInk3)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.amBgElev)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.amLine, lineWidth: 0.5)
        )
    }
}

#Preview("light") {
    VStack(spacing: 8) {
        ToolRow(data: ToolRowData(icon: .file, label: "Read", path: "src/extensions/perm.ts", state: .ok, meta: "148 lines"))
        ToolRow(data: ToolRowData(icon: .folder, label: "Grep", path: "ui.alert", state: .ok, meta: "3 hits"))
        ToolRow(data: ToolRowData(icon: .terminal, label: "Run", path: "npm test", state: .run, meta: nil))
    }
    .padding(20)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}
