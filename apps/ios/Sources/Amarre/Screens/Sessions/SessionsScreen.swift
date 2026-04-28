import SwiftUI

struct SessionsScreen: View {
    @State private var filter: SessionFilter = .all
    @State private var showDebug = false

    var onTapSession: (SessionItem) -> Void = { _ in }
    var onTapNew: () -> Void = {}
    var onDebug: (DebugRoute) -> Void = { _ in }

    private var filteredToday: [SessionItem] { apply(filter, to: MockSession.today) }
    private var filteredYesterday: [SessionItem] { apply(filter, to: MockSession.yesterday) }

    private func apply(_ f: SessionFilter, to items: [SessionItem]) -> [SessionItem] {
        switch f {
        case .all:
            items
        case .live:
            items.filter { $0.state == .running || $0.state == .run }
        case .waiting:
            items.filter { $0.state == .waiting || $0.state == .warn }
        case .done:
            items.filter { $0.state == .done || $0.state == .ok }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            AmLargeHeader(
                title: "Sessions",
                subtitle: "\(MockSession.liveCount) live · \(MockSession.needsYouCount) needs you"
            ) {
                HStack(spacing: 10) {
                    AmAvatar(size: 32)
                    AmWordmark(size: 22)
                        .onLongPressGesture { showDebug = true }
                }
            } trailing: {
                Button(action: onTapNew) {
                    AmIcon(name: .plus, size: 18, color: .white)
                }
                .buttonStyle(.amCircle())
            }

            SessionFilterBar(selected: $filter)

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: []) {
                    if !filteredToday.isEmpty {
                        SectionLabel(label: "TODAY")
                        ForEach(filteredToday) { item in
                            SessionCard(item: item) {
                                onTapSession(item)
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                        }
                    }

                    if !filteredYesterday.isEmpty {
                        SectionLabel(label: "YESTERDAY")
                        ForEach(filteredYesterday) { item in
                            SessionCard(item: item) {
                                onTapSession(item)
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                        }
                    }

                    if filteredToday.isEmpty && filteredYesterday.isEmpty {
                        Text("no sessions match this filter")
                            .font(.amSans(Tokens.FontSize.body))
                            .foregroundStyle(Color.amInk3)
                            .padding(.top, 60)
                            .frame(maxWidth: .infinity)
                    }

                    Color.clear.frame(height: 100)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
        .confirmationDialog("debug — pick a screen", isPresented: $showDebug, titleVisibility: .visible) {
            Button("Connect") { onDebug(.connect) }
            Button("Empty") { onDebug(.empty) }
            Button("Error") { onDebug(.error) }
            Button("Streaming demo") { onDebug(.streaming) }
            Button("Cancel", role: .cancel) {}
        }
    }
}

enum DebugRoute: Hashable {
    case connect, empty, error, streaming
}

#Preview("light") {
    SessionsScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    SessionsScreen().preferredColorScheme(.dark)
}
