import SwiftUI

struct ConnectScreen: View {
    @State private var profile: ConnectProfile = MockHost.sample
    var onContinue: () -> Void = {}
    var onBack: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            // Top bar: back · progress · spacer
            HStack {
                HeaderPill(action: onBack) {
                    AmIcon(name: .back, size: 20)
                }
                Spacer()
                HStack(spacing: 6) {
                    ForEach(0 ..< 3, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(i == 0 ? Color.amAccent : Color.amLineStrong)
                            .frame(width: i == 0 ? 22 : 6, height: 6)
                    }
                }
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            // Body
            VStack(alignment: .leading, spacing: 0) {
                AmAvatar(size: 56, halo: true)

                HStack(spacing: 0) {
                    Text("where does ")
                        .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                        .tracking(Tokens.Track.h1)
                        .foregroundStyle(.amInk)
                    Text("amarre")
                        .font(.amSerif(Tokens.FontSize.h1).italic())
                        .foregroundStyle(.amAccent)
                    Text(" live?")
                        .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                        .tracking(Tokens.Track.h1)
                        .foregroundStyle(.amInk)
                }
                .padding(.top, 24)

                Text("point this app at the machine running amarre. you can scan a QR or type the host directly.")
                    .font(.amSans(Tokens.FontSize.cardTitle))
                    .foregroundStyle(.amInk2)
                    .lineSpacing(2)
                    .padding(.top, 8)

                VStack(spacing: 10) {
                    ConnectField(label: "HOST", value: profile.host, mono: true, big: true)
                    ConnectField(label: "PORT", value: profile.port, mono: true, big: false)

                    HStack(spacing: 6) {
                        ForEach(NetworkMode.allCases, id: \.self) { mode in
                            AmChip(mode.label, active: mode == profile.mode, paddingH: 12, paddingV: 6)
                                .onTapGesture {
                                    profile = ConnectProfile(host: profile.host, port: profile.port, mode: mode)
                                }
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.top, 28)
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)

            Spacer(minLength: 16)

            // Footer
            VStack(spacing: 10) {
                Button("continue", action: onContinue)
                    .buttonStyle(.amPrimary(radius: 18, glow: true))

                Button {
                } label: {
                    HStack(spacing: 6) {
                        AmIcon(name: .qr, size: 16, color: .amInk2)
                        Text("or scan QR from ")
                            .font(.amSans(Tokens.FontSize.base))
                            .foregroundStyle(.amInk2)
                            +
                        Text("amarre setup")
                            .font(.amMono(Tokens.FontSize.sm))
                            .foregroundStyle(.amInk2)
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.amBg.ignoresSafeArea())
    }
}

private struct ConnectField: View {
    let label: String
    let value: String
    let mono: Bool
    let big: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.amMono(Tokens.FontSize.micro, weight: .semibold))
                .tracking(Tokens.Track.monoLabel)
                .foregroundStyle(.amInk3)
            Text(value)
                .font(mono
                    ? .amMono(big ? Tokens.FontSize.field : 16, weight: .medium)
                    : .amSans(big ? Tokens.FontSize.field : 16, weight: .medium))
                .foregroundStyle(.amInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .amCard(radius: 14)
    }
}

#Preview("light") {
    ConnectScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    ConnectScreen().preferredColorScheme(.dark)
}
