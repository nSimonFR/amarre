import SwiftUI

struct AmWordmark: View {
    var size: CGFloat = 22
    var color: Color = .amInk

    var body: some View {
        Text("amarre")
            .font(.amSerif(size).italic())
            .foregroundStyle(color)
            .tracking(-0.3)
            .lineLimit(1)
    }
}

#Preview("light") {
    VStack(alignment: .leading, spacing: 12) {
        AmWordmark(size: 18)
        AmWordmark(size: 22)
        AmWordmark(size: 32)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    VStack(alignment: .leading, spacing: 12) {
        AmWordmark(size: 18)
        AmWordmark(size: 22)
        AmWordmark(size: 32)
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
