import SwiftUI

struct AmAvatar: View {
    var size: CGFloat = 32
    var halo: Bool = false

    private let gradient = LinearGradient(
        colors: [
            Color(red: 138 / 255, green: 109 / 255, blue: 1.0),
            Color(red: 91 / 255, green: 63 / 255, blue: 238 / 255),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    var body: some View {
        ZStack {
            if halo {
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
                    let phase = ctx.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 2.4) / 2.4
                    let s = sin(phase * .pi * 2)
                    let scale = 1.0 + 0.04 * (s + 1)
                    let opacity = 0.45 + 0.4 * ((s + 1) / 2)

                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color.amAccent.opacity(0.55), .clear],
                                center: UnitPoint(x: 0.3, y: 0.3),
                                startRadius: 0,
                                endRadius: size * 0.9
                            )
                        )
                        .frame(width: size * 1.7, height: size * 1.7)
                        .scaleEffect(scale)
                        .opacity(opacity)
                        .blur(radius: 4)
                }
            }

            RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
                .fill(gradient)
                .overlay(
                    AmMark(size: size * 0.66, color: .white.opacity(0.95))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color.white.opacity(0.18), .clear, Color.black.opacity(0.10)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .allowsHitTesting(false)
                )
                .frame(width: size, height: size)
                .shadow(color: Color.amAccent.opacity(0.35), radius: 6, x: 0, y: 4)
        }
        .frame(width: size, height: size)
    }
}

#Preview("light") {
    HStack(spacing: 24) {
        AmAvatar(size: 32)
        AmAvatar(size: 56, halo: true)
        AmAvatar(size: 84, halo: true)
    }
    .padding(60)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 24) {
        AmAvatar(size: 32)
        AmAvatar(size: 56, halo: true)
        AmAvatar(size: 84, halo: true)
    }
    .padding(60)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
