import SwiftUI

struct SessionsScreen: View {
    @State private var filter: SessionFilter = .all
    @State private var showDebug = false

    var onTapSession: (SessionItem) -> Void = { _ in }
    var onTapNew: () -> Void = {}
    var onDebug: (DebugRoute) -> Void = { _ in }

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
                HStack(spacing: 8) {
                    HeaderPill { } content: {
                        AmIcon(name: .search, size: 18)
                    }
                    Button(action: onTapNew) {
                        AmIcon(name: .plus, size: 18, color: .white)
                    }
                    .buttonStyle(.amCircle())
                }
            }

            SessionFilterBar(selected: $filter)

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: []) {
                    SectionLabel(label: "TODAY")
                    ForEach(MockSession.today) { item in
                        SessionCard(item: item) {
                            onTapSession(item)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                    }

                    SectionLabel(label: "YESTERDAY")
                    ForEach(MockSession.yesterday) { item in
                        SessionCard(item: item) {
                            onTapSession(item)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
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
