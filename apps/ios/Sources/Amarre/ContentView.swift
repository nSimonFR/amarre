import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("amarre")
                .font(.system(size: 56, weight: .regular, design: .serif))
                .italic()
            Text("hello, world")
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
