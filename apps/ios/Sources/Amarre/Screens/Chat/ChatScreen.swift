import SwiftUI

struct ChatScreen: View {
    var session: ChatSessionData = MockChat.permissionGate
    var onBack: () -> Void = {}
    var onPermissionAllow: () -> Void = {}

    @State private var mode: AgentMode = .code
    @State private var permissionResolution: PermissionCard.Resolution = .pending

    var body: some View {
        VStack(spacing: 0) {
            AmSubHeader(
                title: session.title,
                subtitle: session.subtitle
            ) {
                HeaderPill(action: onBack) {
                    AmIcon(name: .back, size: 20)
                }
            } trailing: {
                HeaderPill { } content: {
                    AmIcon(name: .more, size: 18)
                }
            }

            StatusStrip(state: session.status, label: session.statusLabel, mode: mode)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(session.turns) { turn in
                        renderTurn(turn)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .defaultScrollAnchor(.bottom)

            Composer(
                mode: $mode,
                working: session.working,
                placeholderOverride: session.composerPlaceholder
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
        .onAppear {
            mode = session.mode
            permissionResolution = .pending
        }
    }

    @ViewBuilder
    private func renderTurn(_ turn: ChatTurn) -> some View {
        switch turn {
        case .user(_, let text):
            UserBubble(text: text)

        case .agent(_, let blocks):
            AgentMessage(blocks: blocks)

        case .toolRow(_, let data):
            ToolRow(data: data)

        case .toolCardLive(_, let data):
            ToolCardLive(data: data)

        case .permission(_, let request):
            PermissionCard(
                request: request,
                resolution: permissionResolution,
                onAllow: handleAllow,
                onDeny: handleDeny
            )

        case .stream(_, let label):
            HStack(spacing: 8) {
                Text(label)
                    .font(.amSans(Tokens.FontSize.sm))
                    .foregroundStyle(Color.amInk3)
                StreamShimmer(width: 80, height: 14)
            }
        }
    }

    private func handleAllow() {
        permissionResolution = .allowed
        Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            await MainActor.run { onPermissionAllow() }
        }
    }

    private func handleDeny() {
        permissionResolution = .denied
    }
}

#Preview("light") {
    ChatScreen().preferredColorScheme(.light)
}

#Preview("dark") {
    ChatScreen().preferredColorScheme(.dark)
}
