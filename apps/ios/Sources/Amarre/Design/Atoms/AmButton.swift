import SwiftUI

struct AmPrimaryButtonStyle: ButtonStyle {
    var radius: CGFloat = Tokens.Radius.sm
    var glow: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.amSans(15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color.amAccent)
            )
            .shadow(
                color: Color.amAccent.opacity(glow ? 0.35 : 0.28),
                radius: glow ? 11 : 6,
                x: 0,
                y: glow ? 8 : 4
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.amFast, value: configuration.isPressed)
    }
}

struct AmGhostButtonStyle: ButtonStyle {
    var radius: CGFloat = Tokens.Radius.sm
    var sunk: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.amSans(15, weight: .semibold))
            .foregroundStyle(Color.amInk2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(sunk ? Color.amBgSunk : Color.clear)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.amFast, value: configuration.isPressed)
    }
}

struct AmCircleButtonStyle: ButtonStyle {
    var size: CGFloat = 36
    var fill: Color = .amAccent
    var fg: Color = .white

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(fg)
            .frame(width: size, height: size)
            .background(Circle().fill(fill))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.amFast, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == AmPrimaryButtonStyle {
    static var amPrimary: AmPrimaryButtonStyle { AmPrimaryButtonStyle() }
    static func amPrimary(radius: CGFloat = Tokens.Radius.sm, glow: Bool = false) -> AmPrimaryButtonStyle {
        AmPrimaryButtonStyle(radius: radius, glow: glow)
    }
}

extension ButtonStyle where Self == AmGhostButtonStyle {
    static var amGhost: AmGhostButtonStyle { AmGhostButtonStyle() }
    static func amGhost(radius: CGFloat = Tokens.Radius.sm, sunk: Bool = true) -> AmGhostButtonStyle {
        AmGhostButtonStyle(radius: radius, sunk: sunk)
    }
}

extension ButtonStyle where Self == AmCircleButtonStyle {
    static func amCircle(size: CGFloat = 36, fill: Color = .amAccent, fg: Color = .white) -> AmCircleButtonStyle {
        AmCircleButtonStyle(size: size, fill: fill, fg: fg)
    }
}

#Preview("light") {
    VStack(spacing: 12) {
        Button("continue") { }.buttonStyle(.amPrimary(radius: 18, glow: true))
        Button("edit") { }.buttonStyle(.amGhost(radius: 12))
        HStack {
            Button { } label: { AmIcon(name: .plus, size: 18, color: .white) }
                .buttonStyle(.amCircle())
            Button { } label: { AmIcon(name: .arrowUp, size: 18, color: .white) }
                .buttonStyle(.amCircle())
        }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    VStack(spacing: 12) {
        Button("continue") { }.buttonStyle(.amPrimary(radius: 18, glow: true))
        Button("edit") { }.buttonStyle(.amGhost(radius: 12))
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
