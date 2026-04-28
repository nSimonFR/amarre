import ProjectDescription

let project = Project(
    name: "Amarre",
    organizationName: "amarre",
    options: .options(
        defaultKnownRegions: ["en"],
        developmentRegion: "en"
    ),
    settings: .settings(
        base: [
            "SWIFT_VERSION": "5.9",
            "CODE_SIGN_STYLE": "Automatic",
            "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
            "GENERATE_INFOPLIST_FILE": "YES",
        ],
        configurations: [
            .debug(name: "Debug"),
            .release(name: "Release"),
        ]
    ),
    targets: [
        .target(
            name: "Amarre",
            destinations: .iOS,
            product: .app,
            bundleId: "dev.amarre.ios",
            deploymentTargets: .iOS("17.0"),
            infoPlist: .extendingDefault(with: [
                "CFBundleDisplayName": "amarre",
                "UILaunchScreen": [
                    "UIColorName": "AccentColor",
                ],
                "UISupportedInterfaceOrientations": [
                    "UIInterfaceOrientationPortrait",
                ],
                "UIApplicationSceneManifest": [
                    "UIApplicationSupportsMultipleScenes": false,
                ],
            ]),
            sources: ["Sources/Amarre/**"],
            resources: ["Resources/**"]
        ),
    ]
)
