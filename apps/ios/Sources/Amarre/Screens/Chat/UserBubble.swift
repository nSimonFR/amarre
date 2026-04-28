import SwiftUI

struct UserBubble: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 60)
            Text(text)
                .font(.amSans(Tokens.FontSize.body))
                .foregroundStyle(.amInk)
                .lineSpacing(2)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(
                            topLeading: 20,
                            bottomLeading: 20,
                            bottomTrailing: 6,
                            topTrailing: 20
                        ),
                        style: .continuous
                    )
                    .fill(Color.amBgElev)
                )
                .overlay(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(
                            topLeading: 20,
                            bottomLeading: 20,
                            bottomTrailing: 6,
                            topTrailing: 20
                        ),
                        style: .continuous
                    )
                    .strokeBorder(Color.amLine, lineWidth: 0.5)
                )
        }
    }
}

#Preview("light") {
    UserBubble(text: "add a bottom-sheet permission gate. allow / deny / always.")
        .padding(20)
        .background(Color.amBg)
        .preferredColorScheme(.light)
}

#Preview("dark") {
    UserBubble(text: "add a bottom-sheet permission gate. allow / deny / always.")
        .padding(20)
        .background(Color.amBg)
        .preferredColorScheme(.dark)
}
