import SwiftUI

enum SessionFilter: Hashable, CaseIterable {
    case all, live, waiting, done
}

struct SessionFilterBar: View {
    @Binding var selected: SessionFilter

    var body: some View {
        HStack(spacing: 6) {
            AmChip("All", count: MockSession.all.count, active: selected == .all)
                .onTapGesture { selected = .all }

            AmChip(label: "Live", count: MockSession.liveCount, active: selected == .live) {
                StatusDot(state: .run, size: 6)
            }
            .onTapGesture { selected = .live }

            AmChip(label: "Waiting", count: MockSession.waitingCount, active: selected == .waiting) {
                StatusDot(state: .warn, size: 6)
            }
            .onTapGesture { selected = .waiting }

            AmChip("Done", active: selected == .done)
                .onTapGesture { selected = .done }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .padding(.top, 4)
    }
}
