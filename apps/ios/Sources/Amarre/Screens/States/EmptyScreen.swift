import SwiftUI

struct EmptyScreen: View {
    var onNewSession: () -> Void = {}
    var onConnect: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                HeaderPill { } content: {
                    AmIcon(name: .settings, size: 18)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer()

            VStack(spacing: 0) {
                AmAvatar(size: 84, halo: true)

                HStack(spacing: 0) {
                    Text("jeter ")
                        .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                        .tracking(Tokens.Track.h1)
                        .foregroundStyle(Color.amInk)
                    Text("l'amarre")
                        .font(.amSerif(Tokens.FontSize.h1).italic())
                        .foregroundStyle(Color.amAccent)
                }
                .padding(.top, 28)

                Text("start a coding session. amarre runs on your machine — you steer from here.")
                    .font(.amSans(Tokens.FontSize.cardTitle))
                    .foregroundStyle(Color.amInk2)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .frame(maxWidth: 280)
                    .padding(.top, 10)

                Button(action: onNewSession) {
                    HStack(spacing: 6) {
                        AmIcon(name: .plus, size: 16, color: .white)
                        Text("new session")
                    }
                }
                .buttonStyle(.amPrimary(radius: 16, glow: true))
                .fixedSize()
                .padding(.top, 28)

                Button("or connect a host", action: onConnect)
                    .font(.amSans(Tokens.FontSize.base))
                    .foregroundStyle(Color.amInk3)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 32)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
    }
}

#Preview("light") {
    EmptyScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    EmptyScreen().preferredColorScheme(.dark)
}
