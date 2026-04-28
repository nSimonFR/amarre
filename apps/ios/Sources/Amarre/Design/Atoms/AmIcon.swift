import SwiftUI

enum AmIconName: String, CaseIterable {
    case plus, search, menu, back, more
    case arrowUp, arrowRight
    case mic, send, attach
    case check, x, chevron, down
    case cloud, edit, terminal, web
    case file, folder, shield, qr
    case settings, sparkle
    case branch, git

    var sfSymbol: String {
        switch self {
        case .plus: "plus"
        case .search: "magnifyingglass"
        case .menu: "line.3.horizontal"
        case .back: "chevron.left"
        case .more: "ellipsis"
        case .arrowUp: "arrow.up"
        case .arrowRight: "arrow.right"
        case .mic: "mic"
        case .send: "paperplane.fill"
        case .attach: "paperclip"
        case .check: "checkmark"
        case .x: "xmark"
        case .chevron: "chevron.right"
        case .down: "chevron.down"
        case .cloud: "cloud"
        case .edit: "pencil"
        case .terminal: "terminal"
        case .web: "globe"
        case .file: "doc"
        case .folder: "folder"
        case .shield: "shield"
        case .qr: "qrcode"
        case .settings: "gearshape"
        case .sparkle: "sparkles"
        case .branch, .git: "arrow.triangle.branch"
        }
    }
}

struct AmIcon: View {
    let name: AmIconName
    var size: CGFloat = 18
    var color: Color = .amInk2

    var body: some View {
        Image(systemName: name.sfSymbol)
            .font(.system(size: size * 0.92, weight: .regular))
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(color)
            .frame(width: size, height: size)
    }
}

#Preview("light") {
    LazyVGrid(columns: Array(repeating: GridItem(.fixed(40)), count: 6), spacing: 12) {
        ForEach(AmIconName.allCases, id: \.self) { name in
            AmIcon(name: name, size: 22)
        }
    }
    .padding()
    .background(Color.amBg)
    .preferredColorScheme(.light)
}

#Preview("dark") {
    LazyVGrid(columns: Array(repeating: GridItem(.fixed(40)), count: 6), spacing: 12) {
        ForEach(AmIconName.allCases, id: \.self) { name in
            AmIcon(name: name, size: 22)
        }
    }
    .padding()
    .background(Color.amBg)
    .preferredColorScheme(.dark)
}
