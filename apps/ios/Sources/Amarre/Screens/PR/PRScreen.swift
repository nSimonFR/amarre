import SwiftUI

struct PRScreen: View {
    @State private var pr: PRSummary = MockPR.unopened
    @State private var mode: AgentMode = .code
    var onBack: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            AmSubHeader(
                title: "Permission gate UX",
                subtitle: "rpi5:nic-os · feat/perm"
            ) {
                HeaderPill(action: onBack) {
                    AmIcon(name: .back, size: 20)
                }
            } trailing: {
                HeaderPill { } content: {
                    AmIcon(name: .more, size: 18)
                }
            }

            StatusStrip(state: .ok, label: "ready to ship", mode: mode)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    AgentSummaryMessage()
                    PRCard(pr: pr) {
                        pr = MockPR.opened
                    }
                    .onLongPressGesture {
                        pr = pr.opened ? MockPR.unopened : MockPR.opened
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }

            Composer(mode: $mode, working: false)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.amBg.ignoresSafeArea())
    }
}

private struct AgentSummaryMessage: View {
    var body: some View {
        (Text("All set — bottom-sheet gate is wired up, tests pass. I've pushed ")
            + codePart(" feat/perm")
            + Text(" to ")
            + codePart("origin")
            + Text(". Want me to open the PR?"))
            .font(.amSans(Tokens.FontSize.body))
            .foregroundStyle(.amInk)
            .lineSpacing(3)
    }

    private func codePart(_ s: String) -> Text {
        Text(s)
            .font(.amMono(Tokens.FontSize.sm))
            .foregroundStyle(.amInk)
    }
}

private struct PRCard: View {
    let pr: PRSummary
    var onOpen: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            head
            fileSummary
            titleSection
            actions
        }
        .amCard(radius: Tokens.Radius.md, lift: false)
    }

    private var head: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                AmIcon(name: .git, size: 12, color: .amInk3)
                Text(pr.repo)
                    .font(.amMono(Tokens.FontSize.xs, weight: .semibold))
                    .tracking(Tokens.Track.monoCaps)
                    .foregroundStyle(.amInk3)
            }
            HStack(spacing: 8) {
                Text(pr.sourceBranch)
                    .font(.amMono(Tokens.FontSize.sm, weight: .semibold))
                    .foregroundStyle(.amAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.amAccentSoft))

                AmIcon(name: .arrowRight, size: 12, color: .amInk3)

                Text(pr.targetBranch)
                    .font(.amMono(Tokens.FontSize.sm))
                    .foregroundStyle(.amInk2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.amBgSunk))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var fileSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline) {
                Text("\(pr.fileCount) files · \(pr.commitCount) commits")
                    .font(.amMono(Tokens.FontSize.xs))
                    .tracking(Tokens.Track.monoCaps)
                    .foregroundStyle(.amInk3)
                Spacer()
                HStack(spacing: 4) {
                    Text("+\(pr.totalAdded)")
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(.amOk)
                    Text("·")
                        .foregroundStyle(.amInk3)
                    Text("−\(pr.totalRemoved)")
                        .font(.amMono(Tokens.FontSize.xs))
                        .foregroundStyle(.amErr)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(pr.files.enumerated()), id: \.offset) { _, f in
                    HStack(spacing: 10) {
                        AmIcon(name: .file, size: 12, color: .amInk3)
                        Text(f.path)
                            .font(.amMono(Tokens.FontSize.sm))
                            .foregroundStyle(.amInk2)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("+\(f.added)")
                            .font(.amMono(10))
                            .foregroundStyle(.amOk)
                        if f.removed > 0 {
                            Text("−\(f.removed)")
                                .font(.amMono(10))
                                .foregroundStyle(.amErr)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(Color.amBgSunk)
        .overlay(Rectangle().fill(Color.amLine).frame(height: 0.5), alignment: .top)
        .overlay(Rectangle().fill(Color.amLine).frame(height: 0.5), alignment: .bottom)
    }

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TITLE")
                .font(.amMono(Tokens.FontSize.xs))
                .tracking(Tokens.Track.monoCaps)
                .foregroundStyle(.amInk3)
            Text(pr.title)
                .font(.amSans(Tokens.FontSize.body, weight: .medium))
                .foregroundStyle(.amInk)
                .lineSpacing(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private var actions: some View {
        if !pr.opened {
            HStack(spacing: 8) {
                Button("edit") { }
                    .buttonStyle(.amGhost(radius: 12))

                Button(action: onOpen) {
                    HStack(spacing: 8) {
                        AmIcon(name: .git, size: 14, color: .white)
                        Text("open pull request")
                    }
                }
                .buttonStyle(.amPrimary(radius: 12))
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        } else if let prNumber = pr.prNumber {
            Button { } label: {
                HStack(spacing: 10) {
                    Circle()
                        .fill(Color.amAccent)
                        .frame(width: 26, height: 26)
                        .overlay(AmIcon(name: .git, size: 13, color: .white))
                    VStack(alignment: .leading, spacing: 0) {
                        Text("PR #\(prNumber) opened")
                            .font(.amSans(Tokens.FontSize.base, weight: .semibold))
                            .foregroundStyle(.amInk)
                        if let url = pr.prURL {
                            Text(url)
                                .font(.amMono(Tokens.FontSize.xs))
                                .foregroundStyle(.amInk3)
                        }
                    }
                    Spacer()
                    AmIcon(name: .arrowUp, size: 14, color: .amInk3)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 12).fill(Color.amBgSunk)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.amLine, lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
    }
}

#Preview("light · unopened") {
    PRScreen().preferredColorScheme(.light)
}

#Preview("dark · opened") {
    StateFulPreview()
        .preferredColorScheme(.dark)
}

private struct StateFulPreview: View {
    @State private var pr = MockPR.opened
    @State private var mode: AgentMode = .code

    var body: some View {
        VStack(spacing: 0) {
            AmSubHeader(title: "Permission gate UX", subtitle: "rpi5:nic-os · feat/perm") {
                HeaderPill { } content: { AmIcon(name: .back, size: 20) }
            } trailing: {
                HeaderPill { } content: { AmIcon(name: .more, size: 18) }
            }

            StatusStrip(state: .ok, label: "ready to ship", mode: mode)

            ScrollView {
                VStack(spacing: 16) {
                    PRCard(pr: pr) { }
                }
                .padding(20)
            }

            Composer(mode: $mode, working: false)
        }
        .background(Color.amBg.ignoresSafeArea())
    }
}
