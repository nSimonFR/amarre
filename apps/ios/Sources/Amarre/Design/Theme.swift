import SwiftUI
import UIKit

extension UIColor {
    fileprivate convenience init(rgb: Int, alpha: CGFloat = 1.0) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension Color {
    fileprivate init(light: Int, dark: Int) {
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(rgb: dark)
                : UIColor(rgb: light)
        })
    }

    fileprivate init(light: Int, alphaLight: CGFloat, dark: Int, alphaDark: CGFloat) {
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(rgb: dark, alpha: alphaDark)
                : UIColor(rgb: light, alpha: alphaLight)
        })
    }
}

extension Color {
    static let amAccent = Color(light: 0x7C5CFF, dark: 0x7C5CFF)
    static let amAccentStrong = Color(light: 0x6845FF, dark: 0x6845FF)
    static let amAccentSoft = Color(
        light: 0x7C5CFF, alphaLight: 0.12,
        dark: 0x7C5CFF, alphaDark: 0.12
    )

    static let amOk = Color(light: 0x00B977, dark: 0x00B977)
    static let amWarn = Color(light: 0xF0A93A, dark: 0xF0A93A)
    static let amErr = Color(light: 0xEF5D5D, dark: 0xEF5D5D)
    static let amRun: Color = .amAccent

    static let amBg = Color(light: 0xF6F5F1, dark: 0x0C0C0E)
    static let amBgElev = Color(light: 0xFFFFFF, dark: 0x17171A)
    static let amBgSunk = Color(light: 0xECEBE6, dark: 0x08080A)

    static let amInk = Color(light: 0x1A1A1F, dark: 0xF4F3EE)
    static let amInk2 = Color(light: 0x4A4A52, dark: 0xB3B2AC)
    static let amInk3 = Color(light: 0x8A8A93, dark: 0x6F6E6A)

    static let amLine = Color(
        light: 0x141419, alphaLight: 0.08,
        dark: 0xFFFFFF, alphaDark: 0.07
    )
    static let amLineStrong = Color(
        light: 0x141419, alphaLight: 0.14,
        dark: 0xFFFFFF, alphaDark: 0.13
    )

    static let amCodeBg = Color(
        light: 0x141419, alphaLight: 0.04,
        dark: 0xFFFFFF, alphaDark: 0.05
    )

    static let amDiffAddBg = Color(
        light: 0x00B977, alphaLight: 0.08,
        dark: 0x00B977, alphaDark: 0.10
    )
    static let amWarnBg = Color(
        light: 0xF0A93A, alphaLight: 0.14,
        dark: 0xF0A93A, alphaDark: 0.18
    )
    static let amErrBg = Color(
        light: 0xEF5D5D, alphaLight: 0.12,
        dark: 0xEF5D5D, alphaDark: 0.14
    )
}
