import SwiftUI

enum AgentMode: String, Hashable {
    case code, plan
}

struct ModePill: View {
    let mode: AgentMode

    private var label: String {
        switch mode {
        case .code: "</> CODE"
        case .plan: "◇ PLAN"
        }
    }

    private var fg: Color {
        switch mode {
        case .code: .amAccent
        case .plan: .amOk
        }
    }

    private var bg: Color {
        switch mode {
        case .code: .amAccentSoft
        case .plan: .amOk.opacity(0.12)
        }
    }

    var body: some View {
        Text(label)
            .font(.amMono(11, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(bg))
    }
}

#Preview("light") {
    HStack(spacing: 12) {
        ModePill(mode: .code)
        ModePill(mode: .plan)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 12) {
        ModePill(mode: .code)
        ModePill(mode: .plan)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
