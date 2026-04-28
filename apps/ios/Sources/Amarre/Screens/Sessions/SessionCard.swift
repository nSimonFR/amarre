import SwiftUI

struct SessionCard: View {
    let item: SessionItem
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    StatusOrb(state: item.state)

                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .center, spacing: 8) {
                            Text(item.title)
                                .font(.amSans(Tokens.FontSize.cardTitle, weight: .semibold))
                                .foregroundStyle(.amInk)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if let badge = item.badge {
                                Text(badge)
                                    .font(.amSans(10, weight: .semibold))
                                    .foregroundStyle(.amWarn)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(Color.amWarnBg))
                                    .lineLimit(1)
                            } else {
                                Text(item.time)
                                    .font(.amSans(Tokens.FontSize.xs))
                                    .foregroundStyle(.amInk3)
                            }
                        }
                        HStack(spacing: 6) {
                            Text(item.host)
                                .font(.amMono(Tokens.FontSize.xs))
                                .foregroundStyle(.amInk3)
                            Text("·")
                                .foregroundStyle(.amInk3.opacity(0.4))
                            AmIcon(name: .branch, size: 11, color: .amInk3)
                            Text(item.branch)
                                .font(.amMono(Tokens.FontSize.xs))
                                .foregroundStyle(.amInk3)
                        }
                    }
                }

                Text(item.preview)
                    .font(.amSans(Tokens.FontSize.base))
                    .foregroundStyle(.amInk2)
                    .lineLimit(1)
                    .padding(.leading, 44)
                    .padding(.top, -2)
            }
            .padding(.top, 14)
            .padding(.horizontal, 14)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .amCard(radius: Tokens.Radius.md)
    }
}

#Preview("light") {
    VStack(spacing: 8) {
        ForEach(MockSession.all) { item in
            SessionCard(item: item)
        }
    }
    .padding(16)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    VStack(spacing: 8) {
        ForEach(MockSession.all) { item in
            SessionCard(item: item)
        }
    }
    .padding(16)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
