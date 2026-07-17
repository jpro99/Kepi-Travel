// swift-tools-version: 5.9
import PackageDescription

// CapApp-SPM — REMOTE-ONLY Capacitor core (no local node_modules path deps).
// Local plugin paths/symlinks were causing Xcode 26 "Missing or empty JSON
// output from manifest compilation for capapp-spm" on Jeff's Mac (Documents/
// iCloud). Native haptics/push/status-bar plugins are deferred until SPM is
// stable; the WKWebView shell still loads https://kepitravel.com.
//
// `npx cap sync ios` will try to rewrite this file — re-run `npm run ios:fix`
// afterward if CapApp-SPM breaks again.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ]
        )
    ]
)
