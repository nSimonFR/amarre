import SwiftUI

struct HeaderPill<Content: View>: View {
    var size: CGFloat = 36
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button(action: action) {
            content()
                .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .background(
            Circle().fill(Color.amBgElev.opacity(0.7))
        )
        .background(.ultraThinMaterial, in: Circle())
        .overlay(
            Circle().strokeBorder(Color.amLineStrong, lineWidth: 0.5)
        )
        .frame(width: size, height: size)
    }
}

#Preview("light") {
    HStack(spacing: 12) {
        HeaderPill { } content: { AmIcon(name: .search, size: 18) }
        HeaderPill { } content: { AmIcon(name: .more, size: 18) }
        HeaderPill { } content: { AmIcon(name: .back, size: 20) }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 12) {
        HeaderPill { } content: { AmIcon(name: .search, size: 18) }
        HeaderPill { } content: { AmIcon(name: .more, size: 18) }
        HeaderPill { } content: { AmIcon(name: .back, size: 20) }
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
