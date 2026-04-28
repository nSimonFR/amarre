import SwiftUI

struct ErrorScreen: View {
    var onBack: () -> Void = {}
    var onRetry: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                HeaderPill(action: onBack) {
                    AmIcon(name: .back, size: 20)
                }
                Spacer()
                Text("● disconnected")
                    .font(.amMono(Tokens.FontSize.xs))
                    .foregroundStyle(Color.amErr)
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer()

            VStack(spacing: 0) {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(Color.amErrBg)
                        .frame(width: 84, height: 84)
                    Text("!")
                        .font(.amSans(38, weight: .light))
                        .foregroundStyle(Color.amErr)
                }

                Text("can't reach rpi5")
                    .font(.amSans(Tokens.FontSize.h2, weight: .bold))
                    .tracking(Tokens.Track.h2)
                    .foregroundStyle(Color.amInk)
                    .padding(.top, 22)

                Text("websocket closed (1006). amarre may be offline or your tailnet is asleep.")
                    .font(.amSans(Tokens.FontSize.body))
                    .foregroundStyle(Color.amInk2)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .padding(.top, 8)

                ErrorDetailsCard()
                    .padding(.top, 22)

                HStack(spacing: 8) {
                    Button("view logs") { }
                        .buttonStyle(.amGhost(radius: 12, sunk: false))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Color.amLine, lineWidth: 0.5)
                        )

                    Button("retry", action: onRetry)
                        .buttonStyle(.amPrimary(radius: 12, glow: true))
                }
                .padding(.top, 22)
            }
            .padding(.horizontal, 28)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
    }
}

private struct ErrorDetailsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("LAST ERROR")
                .font(.amMono(Tokens.FontSize.micro, weight: .semibold))
                .tracking(Tokens.Track.monoLabel)
                .foregroundStyle(Color.amInk3)
            Text("ws://rpi5:8443")
                .font(.amMono(Tokens.FontSize.sm))
                .foregroundStyle(Color.amInk)
                .padding(.top, 4)
            Text("ECONNREFUSED · 14:21:08 · 3 retries")
                .font(.amMono(Tokens.FontSize.xs))
                .foregroundStyle(Color.amErr)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .amCard(radius: 14)
    }
}

#Preview("light") {
    ErrorScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    ErrorScreen().preferredColorScheme(.dark)
}
