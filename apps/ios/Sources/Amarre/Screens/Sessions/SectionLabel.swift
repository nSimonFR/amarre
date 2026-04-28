import SwiftUI

struct SectionLabel: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.amMono(10, weight: .semibold))
            .tracking(Tokens.Track.monoLabel)
            .foregroundStyle(Color.amInk3)
            .padding(.top, 14)
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
