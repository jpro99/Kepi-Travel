// swift-tools-version: 5.9
import PackageDescription

// CapApp-SPM — REMOTE-ONLY Capacitor core (no local node_modules path deps).
// Local plugin paths/symlinks were causing Xcode 26 "Missing or empty JSON
// output from manifest compilation for capapp-spm". Native haptics/push/status-bar
// plugins stay JS-optional until SPM is stable; the WKWebView still loads
// https://kepitravel.com.
//
// `npx cap sync ios` may rewrite this file — re-run `npm run ios:fix` afterward.
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
