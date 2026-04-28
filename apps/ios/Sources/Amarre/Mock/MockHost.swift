import Foundation

enum NetworkMode: String, CaseIterable, Hashable {
    case tailnet
    case lan
    case tunnel

    var label: String {
        switch self {
        case .tailnet: "tailnet"
        case .lan: "LAN"
        case .tunnel: "tunnel"
        }
    }
}

struct ConnectProfile: Hashable {
    let host: String
    let port: String
    let mode: NetworkMode
}

enum MockHost {
    static let sample = ConnectProfile(
        host: "rpi5.tail-abcd.ts.net",
        port: "8443",
        mode: .tailnet
    )
}
