import SwiftUI

struct AmCard: ViewModifier {
    var radius: CGFloat
    var lift: Bool

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color.amBgElev)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(lift ? Color.amLineStrong : Color.amLine, lineWidth: 0.5)
            )
            .modifier(AmShadow(lift: lift))
    }
}

extension View {
    func amCard(radius: CGFloat = Tokens.Radius.md, lift: Bool = false) -> some View {
        modifier(AmCard(radius: radius, lift: lift))
    }
}
