import SwiftUI

struct StatusOrb: View {
    let state: SessionState
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            switch state {
            case .idle:
                Circle()
                    .strokeBorder(
                        Color.amLineStrong,
                        style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])
                    )
                    .frame(width: size, height: size)

            case .running, .run:
                Circle()
                    .strokeBorder(Color.amLineStrong.opacity(0.4), lineWidth: 1.5)
                    .frame(width: size, height: size)

                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
                    let phase = ctx.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 2.0) / 2.0
                    let angle = Angle.degrees(360 * phase)

                    Circle()
                        .trim(from: 0, to: 0.7)
                        .stroke(
                            state.color,
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
                        )
                        .rotationEffect(angle)
                        .frame(width: size - 1.5, height: size - 1.5)
                }

            case .ok, .done:
                Circle()
                    .fill(state.color)
                    .frame(width: size, height: size)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(.white)

            case .warn, .waiting:
                Circle()
                    .strokeBorder(state.color, lineWidth: 1.5)
                    .frame(width: size, height: size)
                Circle()
                    .fill(state.color)
                    .frame(width: size * 0.32, height: size * 0.32)

            case .err:
                Circle()
                    .fill(state.color)
                    .frame(width: size, height: size)
                Text("!")
                    .font(.system(size: size * 0.55, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
    }
}

#Preview("light · all states") {
    HStack(spacing: 14) {
        ForEach([SessionState.idle, .running, .ok, .warn, .err], id: \.self) { s in
            VStack(spacing: 6) {
                StatusOrb(state: s)
                Text(s.rawValue).font(.amMono(9))
            }
        }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark · all states") {
    HStack(spacing: 14) {
        ForEach([SessionState.idle, .running, .ok, .warn, .err], id: \.self) { s in
            VStack(spacing: 6) {
                StatusOrb(state: s)
                Text(s.rawValue).font(.amMono(9))
            }
        }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
