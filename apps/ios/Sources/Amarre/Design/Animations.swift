import SwiftUI

extension Animation {
    static let amFast: Animation = .timingCurve(0.32, 0.72, 0, 1, duration: 0.16)
    static let amMed: Animation = .timingCurve(0.32, 0.72, 0, 1, duration: 0.28)
    static let amSpring: Animation = .timingCurve(0.34, 1.56, 0.64, 1, duration: 0.34)
}
