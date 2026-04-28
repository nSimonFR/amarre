import SwiftUI

struct StreamingDemoScreen: View {
    var onBack: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            AmSubHeader(
                title: "Streaming demo",
                subtitle: "TODO — WS-driven, see PLAN.md"
            ) {
                HeaderPill(action: onBack) {
                    AmIcon(name: .back, size: 20)
                }
            } trailing: {
                Color.clear.frame(width: 36, height: 36)
            }

            Spacer()

            VStack(spacing: 16) {
                AmAvatar(size: 64, halo: true)

                Text("streaming demo")
                    .font(.amSans(Tokens.FontSize.cardTitle, weight: .semibold))
                    .foregroundStyle(Color.amInk)

                Text("real animations are driven by Layer-4 message_update events from the WS bridge. this view is a placeholder until the networking layer lands — see apps/ios/PLAN.md phase P5.")
                    .font(.amSans(Tokens.FontSize.body))
                    .foregroundStyle(Color.amInk2)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .padding(.horizontal, 32)

                HStack(spacing: 12) {
                    StatusDot(state: .run)
                    Text("idle animations are live, though")
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(Color.amInk3)
                    StreamShimmer(width: 60, height: 12)
                }
                .padding(.top, 8)
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
    }
}

#Preview("light") {
    StreamingDemoScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    StreamingDemoScreen().preferredColorScheme(.dark)
}
