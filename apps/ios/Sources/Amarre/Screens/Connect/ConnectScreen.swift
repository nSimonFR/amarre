import SwiftUI

struct ConnectScreen: View {
    @State private var host: String = MockHost.sample.host
    @State private var port: String = MockHost.sample.port

    var onContinue: () -> Void = {}
    var onBack: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                AmAvatar(size: 56, halo: true)

                HStack(spacing: 0) {
                    Text("where does ")
                        .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                        .tracking(Tokens.Track.h1)
                        .foregroundStyle(Color.amInk)
                    Text("amarre")
                        .font(.amSerif(Tokens.FontSize.h1).italic())
                        .foregroundStyle(Color.amAccent)
                    Text(" live?")
                        .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                        .tracking(Tokens.Track.h1)
                        .foregroundStyle(Color.amInk)
                }
                .padding(.top, 24)

                Text("point this app at the machine running amarre. you can scan a QR or type the host directly.")
                    .font(.amSans(Tokens.FontSize.cardTitle))
                    .foregroundStyle(Color.amInk2)
                    .lineSpacing(2)
                    .padding(.top, 8)

                VStack(spacing: 10) {
                    ConnectField(label: "HOST", value: $host, big: true, keyboard: .URL)
                    ConnectField(label: "PORT", value: $port, big: false, keyboard: .numberPad)
                }
                .padding(.top, 28)
            }
            .padding(.horizontal, 24)
            .padding(.top, 40)

            Spacer(minLength: 16)

            VStack(spacing: 10) {
                Button("continue", action: onContinue)
                    .buttonStyle(.amPrimary(radius: 18, glow: true))

                Button {
                } label: {
                    HStack(spacing: 6) {
                        AmIcon(name: .qr, size: 16, color: .amInk2)
                        Text("or scan QR from ")
                            .font(.amSans(Tokens.FontSize.base))
                            .foregroundStyle(Color.amInk2)
                            +
                        Text("amarre setup")
                            .font(.amMono(Tokens.FontSize.sm))
                            .foregroundStyle(Color.amInk2)
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
    @Binding var value: String
    let big: Bool
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.amMono(Tokens.FontSize.micro, weight: .semibold))
                .tracking(Tokens.Track.monoLabel)
                .foregroundStyle(Color.amInk3)
            TextField("", text: $value)
                .font(.amMono(big ? Tokens.FontSize.field : 16, weight: .medium))
                .foregroundStyle(Color.amInk)
                .tint(Color.amAccent)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.done)
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
