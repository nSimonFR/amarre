import CoreGraphics
import Foundation

enum Tokens {
    enum Radius {
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 22
        static let xl: CGFloat = 28
    }

    enum Duration {
        static let fast: TimeInterval = 0.16
        static let med: TimeInterval = 0.28
    }

    enum FontSize {
        static let micro: CGFloat = 9
        static let xxs: CGFloat = 10
        static let xs: CGFloat = 11
        static let sm: CGFloat = 12
        static let base: CGFloat = 13
        static let body: CGFloat = 14
        static let cardTitle: CGFloat = 15
        static let field: CGFloat = 17
        static let h2: CGFloat = 26
        static let h1: CGFloat = 32
        static let large: CGFloat = 34
    }

    enum Track {
        static let h1: CGFloat = -0.8
        static let h2: CGFloat = -0.6
        static let monoCaps: CGFloat = 0.6
        static let monoLabel: CGFloat = 1.2
    }
}
