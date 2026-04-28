import SwiftUI

struct AmChip<Leading: View>: View {
    let label: String
    var count: Int? = nil
    var active: Bool = false
    var paddingH: CGFloat = 10
    var paddingV: CGFloat = 4
    @ViewBuilder var leading: () -> Leading

    var body: some View {
        HStack(spacing: 5) {
            leading()
            Text(label)
                .font(.amSans(12, weight: .medium))
                .foregroundStyle(active ? Color.amInk : Color.amInk2)
            if let count {
                Text("\(count)")
                    .font(.amSans(12, weight: .medium))
                    .foregroundStyle(.amInk3)
            }
        }
        .padding(.horizontal, paddingH)
        .padding(.vertical, paddingV)
        .background(
            Capsule().fill(active ? Color.amBgElev : Color.amBgSunk)
        )
        .overlay(
            Capsule().strokeBorder(active ? Color.amLineStrong : Color.amLine, lineWidth: 0.5)
        )
    }
}

extension AmChip where Leading == EmptyView {
    init(_ label: String, count: Int? = nil, active: Bool = false, paddingH: CGFloat = 10, paddingV: CGFloat = 4) {
        self.label = label
        self.count = count
        self.active = active
        self.paddingH = paddingH
        self.paddingV = paddingV
        self.leading = { EmptyView() }
    }
}

#Preview("light") {
    HStack(spacing: 6) {
        AmChip("All", count: 5, active: true)
        AmChip(label: "Live", count: 1, active: false) {
            StatusDot(state: .run, size: 6)
        }
        AmChip(label: "Waiting", count: 1, active: false) {
            StatusDot(state: .warn, size: 6)
        }
        AmChip("Done")
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    HStack(spacing: 6) {
        AmChip("All", count: 5, active: true)
        AmChip(label: "Live", count: 1, active: false) {
            StatusDot(state: .run, size: 6)
        }
        AmChip(label: "Waiting", count: 1, active: false) {
            StatusDot(state: .warn, size: 6)
        }
        AmChip("Done")
    }
    .padding(40)
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
