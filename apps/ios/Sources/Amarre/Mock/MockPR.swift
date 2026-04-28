import Foundation

struct PRFile: Hashable {
    let path: String
    let added: Int
    let removed: Int
}

struct PRSummary: Hashable {
    let repo: String
    let sourceBranch: String
    let targetBranch: String
    let totalAdded: Int
    let totalRemoved: Int
    let fileCount: Int
    let commitCount: Int
    let files: [PRFile]
    let title: String
    var opened: Bool
    var prNumber: Int?
    var prURL: String?
}

enum MockPR {
    static let unopened = PRSummary(
        repo: "nicholas/repo",
        sourceBranch: "feat/perm",
        targetBranch: "main",
        totalAdded: 76,
        totalRemoved: 3,
        fileCount: 4,
        commitCount: 2,
        files: [
            PRFile(path: "src/extensions/perm.ts", added: 12, removed: 3),
            PRFile(path: "src/ui/sheet.ts", added: 38, removed: 0),
            PRFile(path: "tests/perm.test.ts", added: 24, removed: 0),
            PRFile(path: "README.md", added: 2, removed: 0),
        ],
        title: "feat(perm): bottom-sheet permission gate with always-allow",
        opened: false,
        prNumber: nil,
        prURL: nil
    )

    static var opened: PRSummary {
        var pr = unopened
        pr.opened = true
        pr.prNumber = 482
        pr.prURL = "github.com/…/pull/482"
        return pr
    }
}
