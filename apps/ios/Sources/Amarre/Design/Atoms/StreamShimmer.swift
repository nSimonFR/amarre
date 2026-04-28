import SwiftUI

struct StreamShimmer: View {
    var width: CGFloat = 80
    var height: CGFloat = 14

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
            let phase = ctx.date.timeIntervalSinceReferenceDate
                .truncatingRemainder(dividingBy: 1.4) / 1.4
            let x = -1.0 + 2.0 * phase

            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color.amBgSunk)
                .overlay(
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    .clear,
                                    Color.amInk3.opacity(0.35),
                                    .clear,
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .offset(x: width * x)
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                )
                .frame(width: width, height: height)
        }
    }
}

#Preview("light") {
    StreamShimmer().padding(40).background(Color.amBg).preferredColorScheme(.light)
}

#Preview("dark") {
    StreamShimmer().padding(40).background(Color.amBg).preferredColorScheme(.dark)
}
