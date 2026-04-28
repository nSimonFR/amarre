import SwiftUI

enum Route: Hashable {
    case connect
    case empty
    case chat(UUID)
    case pr(UUID)
    case errorState
    case streamingDemo
}

struct AppRoot: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            SessionsScreen(
                onTapSession: { _ in
                    path.append(Route.chat(UUID()))
                },
                onTapNew: {
                    path.append(Route.connect)
                },
                onDebug: { debugRoute in
                    switch debugRoute {
                    case .connect: path.append(Route.connect)
                    case .empty: path.append(Route.empty)
                    case .error: path.append(Route.errorState)
                    case .streaming: path.append(Route.streamingDemo)
                    }
                }
            )
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { route in
                destination(for: route)
                    .toolbar(.hidden, for: .navigationBar)
                    .navigationBarBackButtonHidden(true)
            }
        }
    }

    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case .connect:
            ConnectScreen(
                onContinue: { popToRoot() },
                onBack: { pop() }
            )

        case .empty:
            EmptyScreen(
                onNewSession: { path.append(Route.connect) },
                onConnect: { path.append(Route.connect) }
            )

        case .chat:
            ChatScreen(
                onBack: { pop() },
                onPermissionAllow: { path.append(Route.pr(UUID())) }
            )

        case .pr:
            PRScreen(onBack: { pop() })

        case .errorState:
            ErrorScreen(onBack: { pop() }, onRetry: { pop() })

        case .streamingDemo:
            StreamingDemoScreen(onBack: { pop() })
        }
    }

    private func pop() {
        if !path.isEmpty {
            path.removeLast()
        }
    }

    private func popToRoot() {
        if !path.isEmpty {
            path.removeLast(path.count)
        }
    }
}

#Preview {
    AppRoot()
}
