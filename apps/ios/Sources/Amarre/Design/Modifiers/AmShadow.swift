import SwiftUI

struct AmShadow: ViewModifier {
    var lift: Bool

    func body(content: Content) -> some View {
        if lift {
            content
                .shadow(color: .amShadowLiftNear, radius: 2, x: 0, y: 2)
                .shadow(color: .amShadowLiftFar, radius: 20, x: 0, y: 18)
        } else {
            content
                .shadow(color: .amShadowNear, radius: 1, x: 0, y: 1)
                .shadow(color: .amShadowFar, radius: 12, x: 0, y: 8)
        }
    }
}

extension View {
    func amShadow() -> some View { modifier(AmShadow(lift: false)) }
    func amShadowLift() -> some View { modifier(AmShadow(lift: true)) }
}
