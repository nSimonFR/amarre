import SwiftUI

enum SessionState: String, Hashable {
    case idle, running, ok, done, warn, waiting, err
    case run

    var color: Color {
        switch self {
        case .idle: .amInk3
        case .running, .run: .amRun
        case .ok, .done: .amOk
        case .warn, .waiting: .amWarn
        case .err: .amErr
        }
    }

    var pulses: Bool {
        switch self {
        case .running, .run: true
        default: false
        }
    }
}

struct StatusDot: View {
    let state: SessionState
    var size: CGFloat = 8

    var body: some View {
        ZStack {
            if state.pulses {
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
                    let phase = ctx.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 1.6) / 1.6
                    let scale = 1.0 + 1.5 * phase
                    let opacity = 0.45 * (1.0 - phase)
                    Circle()
                        .fill(state.color)
                        .frame(width: size, height: size)
                        .scaleEffect(scale)
                        .opacity(opacity)
                }
            }
            Circle()
                .fill(state.color)
                .frame(width: size, height: size)
        }
        .frame(width: size, height: size)
    }
}

#Preview("light") {
    HStack(spacing: 14) {
        ForEach([SessionState.idle, .run, .ok, .warn, .err], id: \.self) { s in
            VStack(spacing: 6) {
                StatusDot(state: s)
                Text(s.rawValue).font(.amMono(9))
            }
        }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 14) {
        ForEach([SessionState.idle, .run, .ok, .warn, .err], id: \.self) { s in
            VStack(spacing: 6) {
                StatusDot(state: s)
                Text(s.rawValue).font(.amMono(9))
            }
        }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
