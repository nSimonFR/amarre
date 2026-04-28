import SwiftUI

struct AmMarkShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let s = min(rect.width, rect.height)
        let scale = s / 24.0
        let r = 4.0 * scale

        let leftCenter = CGPoint(x: rect.midX - 3 * scale, y: rect.midY - 0.0)
        let rightCenter = CGPoint(x: rect.midX + 3 * scale, y: rect.midY - 0.0)

        p.addEllipse(in: CGRect(
            x: leftCenter.x - r, y: leftCenter.y - r,
            width: r * 2, height: r * 2
        ))
        p.addEllipse(in: CGRect(
            x: rightCenter.x - r, y: rightCenter.y - r,
            width: r * 2, height: r * 2
        ))

        let notchLen = 2.5 * scale
        p.move(to: CGPoint(x: leftCenter.x + r - notchLen / 2, y: leftCenter.y - notchLen / 2))
        p.addLine(to: CGPoint(x: leftCenter.x + r + notchLen / 2, y: leftCenter.y + notchLen / 2))
        p.move(to: CGPoint(x: rightCenter.x - r - notchLen / 2, y: rightCenter.y - notchLen / 2))
        p.addLine(to: CGPoint(x: rightCenter.x - r + notchLen / 2, y: rightCenter.y + notchLen / 2))

        return p
    }
}

struct AmMark: View {
    var size: CGFloat = 24
    var color: Color = .white

    var body: some View {
        AmMarkShape()
            .stroke(color, style: StrokeStyle(lineWidth: 1.8 * (size / 24), lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
    }
}

#Preview("light") {
    HStack(spacing: 16) {
        AmMark(size: 24, color: .amInk)
        AmMark(size: 32, color: .amInk)
        AmMark(size: 48, color: .amInk)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 16) {
        AmMark(size: 24, color: .amInk)
        AmMark(size: 32, color: .amInk)
        AmMark(size: 48, color: .amInk)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
