import SwiftUI

struct Composer: View {
    @Binding var mode: AgentMode
    var working: Bool
    var placeholderOverride: String?
    var onSend: () -> Void = {}
    var onStop: () -> Void = {}
    var onAttach: () -> Void = {}

    private var placeholder: String {
        if let placeholderOverride { return placeholderOverride }
        return working ? "steer amarre…" : "message amarre…"
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text(placeholder)
                    .font(.amSans(Tokens.FontSize.body))
                    .foregroundStyle(Color.amInk3)
                    .padding(.top, 4)
                    .padding(.horizontal, 4)

                HStack(spacing: 10) {
                    HStack(spacing: 0) {
                        ForEach([AgentMode.code, .plan], id: \.self) { m in
                            ModeSegment(mode: m, active: mode == m)
                                .onTapGesture { mode = m }
                        }
                    }
                    .padding(2)
                    .background(Capsule().fill(Color.amBgSunk))

                    Spacer()

                    Button(action: onAttach) {
                        AmIcon(name: .attach, size: 18, color: .amInk2)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)

                    if working {
                        Button(action: onStop) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.amBg)
                                .frame(width: 10, height: 10)
                        }
                        .buttonStyle(.amCircle(size: 36, fill: .amInk, fg: .amBg))
                    } else {
                        Button(action: onSend) {
                            AmIcon(name: .arrowUp, size: 18, color: .white)
                        }
                        .buttonStyle(.amCircle(size: 36, fill: .amAccent, fg: .white))
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .amGlass(radius: 22)
            .amShadowLift()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(
            LinearGradient(
                colors: [Color.amBg, Color.amBg.opacity(0.6)],
                startPoint: .bottom,
                endPoint: .top
            )
        )
    }
}

private struct ModeSegment: View {
    let mode: AgentMode
    let active: Bool

    private var label: String {
        switch mode {
        case .code: "</> CODE"
        case .plan: "◇ PLAN"
        }
    }

    var body: some View {
        Text(label)
            .font(.amMono(11, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(active ? Color.amInk : Color.amInk3)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(active ? Color.amBgElev : Color.clear)
            )
            .shadow(
                color: active ? Color.black.opacity(0.08) : .clear,
                radius: 1,
                x: 0,
                y: 1
            )
    }
}

#Preview("light · working") {
    StatePreview(working: true)
        .preferredColorScheme(.light)
}

#Preview("light · idle") {
    StatePreview(working: false)
        .preferredColorScheme(.light)
}

#Preview("dark · working") {
    StatePreview(working: true)
        .preferredColorScheme(.dark)
}

private struct StatePreview: View {
    @State var mode: AgentMode = .code
    let working: Bool

    var body: some View {
        VStack {
            Spacer()
            Composer(mode: $mode, working: working)
        }
        .background(Color.amBg.ignoresSafeArea())
    }
}
