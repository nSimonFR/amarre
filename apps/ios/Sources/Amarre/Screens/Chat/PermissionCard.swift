import SwiftUI

struct PermissionCard: View {
    let request: PermissionRequest
    @State private var alwaysAllow = false
    var resolution: Resolution = .pending
    var onAllow: () -> Void = {}
    var onDeny: () -> Void = {}

    enum Resolution { case pending, allowed, denied }

    var body: some View {
        VStack(spacing: 0) {
            head
            diffSlab
            actions
            alwaysAllowToggle
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.amBgElev)
        )
        .overlay(
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Color.amAccent)
                    .frame(width: 3)
                Spacer(minLength: 0)
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .allowsHitTesting(false)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.amLineStrong, lineWidth: 0.5)
        )
        .amShadowLift()
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var head: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(request.kind)
                    .font(.amMono(Tokens.FontSize.xs, weight: .semibold))
                    .tracking(Tokens.Track.monoCaps)
                    .foregroundStyle(.amInk3)
                    .textCase(.uppercase)

                (Text(request.titleStatic)
                    .font(.amSans(Tokens.FontSize.cardTitle, weight: .semibold))
                    +
                    Text(request.titleMono)
                        .font(.amMono(Tokens.FontSize.cardTitle, weight: .medium)))
                    .foregroundStyle(.amInk)
            }
            Spacer()
            Text(request.timeoutLabel)
                .font(.amMono(Tokens.FontSize.xs))
                .foregroundStyle(.amInk3)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(Color.amBgSunk))
        }
        .padding(.leading, 16)
        .padding(.trailing, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var diffSlab: some View {
        VStack(spacing: 0) {
            ForEach(Array(request.lines.enumerated()), id: \.offset) { _, line in
                HStack(spacing: 10) {
                    Text(line.sigil.rawValue)
                        .font(.amMono(Tokens.FontSize.xs, weight: .semibold))
                        .foregroundStyle(.amOk)
                        .frame(width: 8, alignment: .leading)
                    Text(line.text)
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(.amInk)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.amDiffAddBg)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.amBgSunk)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.amLine, lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button("Deny", action: onDeny)
                .buttonStyle(.amGhost(radius: 12))
                .disabled(resolution != .pending)
                .opacity(resolution == .denied ? 0.5 : 1)

            Button("Allow", action: onAllow)
                .buttonStyle(.amPrimary(radius: 12, glow: false))
                .disabled(resolution != .pending)
                .opacity(resolution == .allowed ? 0.85 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
    }

    private var alwaysAllowToggle: some View {
        Button {
            alwaysAllow.toggle()
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(Color.amLineStrong, lineWidth: 1)
                        .frame(width: 14, height: 14)
                    if alwaysAllow {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.amAccent)
                            .frame(width: 14, height: 14)
                        AmIcon(name: .check, size: 10, color: .white)
                    }
                }
                (Text("Always allow on ")
                    .font(.amSans(Tokens.FontSize.sm))
                    +
                    Text(request.host)
                        .font(.amMono(11.5))
                        .foregroundColor(.amInk))
                    .foregroundStyle(.amInk2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .overlay(Rectangle().fill(Color.amLine).frame(height: 0.5), alignment: .top)
    }
}

#Preview("light") {
    PermissionCard(request: MockChat.permission)
        .padding(20)
        .background(Color.amBg)
        .preferredColorScheme(.light)
}

#Preview("dark") {
    PermissionCard(request: MockChat.permission)
        .padding(20)
        .background(Color.amBg)
        .preferredColorScheme(.dark)
}
