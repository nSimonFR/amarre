import SwiftUI

struct AmLargeHeader<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                leading()
                Spacer(minLength: 0)
                trailing()
            }
            .frame(minHeight: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.amSans(Tokens.FontSize.h1, weight: .bold))
                    .tracking(Tokens.Track.h1)
                    .foregroundStyle(Color.amInk)
                if let subtitle {
                    Text(subtitle)
                        .font(.amSans(Tokens.FontSize.body))
                        .foregroundStyle(Color.amInk3)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}

struct AmSubHeader<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            leading()
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.amSans(Tokens.FontSize.cardTitle, weight: .semibold))
                    .foregroundStyle(Color.amInk)
                if let subtitle {
                    Text(subtitle)
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(Color.amInk3)
                }
            }
            Spacer(minLength: 0)
            trailing()
        }
        .frame(minHeight: 56)
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}

struct StatusStrip: View {
    let state: SessionState
    let label: String
    let mode: AgentMode

    var body: some View {
        HStack(spacing: 8) {
            StatusDot(state: state)
            Text(label)
                .font(.amSans(Tokens.FontSize.sm))
                .foregroundStyle(Color.amInk2)
            Spacer(minLength: 0)
            ModePill(mode: mode)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
    }
}
