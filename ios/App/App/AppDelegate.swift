import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        KepiAlwaysLocation.shared.prepareOnLaunch()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            Self.loadKepiIfNeeded(from: self.window ?? application.windows.first)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        Self.loadKepiIfNeeded(from: self.window ?? application.windows.first)
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// If Capacitor never navigated to the live site, force the WKWebView there.
    static func loadKepiIfNeeded(from window: UIWindow?) {
        guard let webView = findWebView(in: window) else { return }
        let host = webView.url?.host ?? ""
        if host.contains("kepitravel.com") { return }
        guard let url = URL(string: "https://kepitravel.com") else { return }
        webView.load(URLRequest(url: url))
    }

    private static func findWebView(in window: UIWindow?) -> WKWebView? {
        guard let root = window?.rootViewController?.view else { return nil }
        return findWebView(in: root)
    }

    private static func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        for child in view.subviews {
            if let found = findWebView(in: child) { return found }
        }
        return nil
    }
}
