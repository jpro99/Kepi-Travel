import Capacitor
import UIKit

/// Loads kepitravel.com without Capacitor's `loadWebView()` fatal path.
/// `CAPBridgeViewController.viewDidLoad` calls `exit(1)` when `public/` is
/// missing from the bundle — that leaves the launch screen up forever.
final class KepiBridgeViewController: CAPBridgeViewController {
    private static let productionURL = URL(string: "https://kepitravel.com")!

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = InstanceDescriptor()
        descriptor.serverURL = Self.productionURL.absoluteString
        return descriptor
    }

    override func viewDidLoad() {
        // Do not call super — that runs loadWebView() → fatalLoadError() → exit(1).
        if let controller = webView?.configuration.userContentController {
            controller.removeScriptMessageHandler(forName: "kepiLocation")
            controller.add(KepiLocationBridge.shared, name: "kepiLocation")
        }
        loadProductionSite()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        loadProductionSite()
    }

    private func loadProductionSite() {
        webView?.load(URLRequest(url: Self.productionURL))
    }
}
