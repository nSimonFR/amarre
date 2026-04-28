import SwiftUI

struct PRBar: View {
    let pr: PRSummary
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                AmIcon(name: .git, size: 14, color: .amAccent)
                Text(pr.opened && pr.prNumber != nil ? "PR #\(pr.prNumber!) open" : "open pull request")
                    .font(.amSans(Tokens.FontSize.base, weight: .semibold))
                    .foregroundStyle(Color.amInk)
                Text("·")
                    .foregroundStyle(Color.amInk3)
                Text(pr.sourceBranch)
                    .font(.amMono(Tokens.FontSize.sm))
                    .foregroundStyle(Color.amAccent)
                AmIcon(name: .arrowRight, size: 11, color: .amInk3)
                Text(pr.targetBranch)
                    .font(.amMono(Tokens.FontSize.sm))
                    .foregroundStyle(Color.amInk2)
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Text("+\(pr.totalAdded)")
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(Color.amOk)
                    Text("·")
                        .foregroundStyle(Color.amInk3)
                    Text("−\(pr.totalRemoved)")
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(Color.amErr)
                }
                AmIcon(name: .chevron, size: 12, color: .amInk3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .amCard(radius: 12, lift: false)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 4)
    }
}
