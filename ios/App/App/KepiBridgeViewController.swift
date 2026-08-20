import Capacitor
import UIKit
import WebKit

/// Loads kepitravel.com in the Capacitor shell with Always-location bridge hooks.
final class KepiBridgeViewController: CAPBridgeViewController {
    private static let productionURL = URL(string: "https://kepitravel.com")!
    private static let webChrome = UIColor(
        red: 0.9607843137254902,
        green: 0.9607843137254902,
        blue: 0.9686274509803922,
        alpha: 1,
    )

    override func instanceDescriptor() -> InstanceDescriptor {
        // Never reuse a stale live-reload folder from an old Xcode debug session.
        KeyValueStore.standard["serverBasePath"] = nil
        let descriptor = InstanceDescriptor()
        descriptor.serverURL = Self.productionURL.absoluteString
        return descriptor
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        attachLocationBridge()
        styleWebViewChrome()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        attachLocationBridge()
        ensureProductionSiteLoaded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        ensureProductionSiteLoaded()
    }

    private func attachLocationBridge() {
        guard let controller = webView?.configuration.userContentController else { return }
        controller.removeScriptMessageHandler(forName: "kepiLocation")
        controller.add(KepiLocationBridge.shared, name: "kepiLocation")
    }

    private func styleWebViewChrome() {
        webView?.isOpaque = true
        webView?.backgroundColor = Self.webChrome
        view.backgroundColor = Self.webChrome
    }

    private func ensureProductionSiteLoaded() {
        guard let webView else { return }
        styleWebViewChrome()
        let host = webView.url?.host ?? ""
        if host.contains("kepitravel.com") { return }
        webView.load(URLRequest(url: Self.productionURL))
    }
}
