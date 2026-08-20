import Capacitor
import UIKit
import WebKit

/// Loads kepitravel.com in the Capacitor shell with Always-location bridge hooks.
final class KepiBridgeViewController: CAPBridgeViewController {
    private static let productionSignInURL = URL(string: "https://kepitravel.com/sign-in")!
    private static let webChrome = UIColor(
        red: 0.9607843137254902,
        green: 0.9607843137254902,
        blue: 0.9686274509803922,
        alpha: 1,
    )

    private var loadingLabel: UILabel?
    private var loadAttempts = 0

    override func instanceDescriptor() -> InstanceDescriptor {
        // Drop any persisted live-reload folder from an old Xcode debug session.
        let store = KeyValueStore.standard
        store["serverBasePath"] = nil
        store["lastBinaryVersionCode"] = nil
        store["lastBinaryVersionName"] = nil
        let descriptor = InstanceDescriptor()
        descriptor.serverURL = Self.productionSignInURL.absoluteString
        return descriptor
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        attachLocationBridge()
        styleWebViewChrome()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        showLoadingChrome()
        attachLocationBridge()
        ensureProductionSiteLoaded()
        scheduleLoadRetries()
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

    private func showLoadingChrome() {
        guard loadingLabel == nil else { return }
        view.backgroundColor = Self.webChrome
        let label = UILabel()
        label.text = "Opening Kepi Travel…"
        label.textAlignment = .center
        label.numberOfLines = 0
        label.textColor = UIColor(red: 0.04, green: 0.12, blue: 0.23, alpha: 1)
        label.font = .systemFont(ofSize: 20, weight: .semibold)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
        loadingLabel = label
    }

    private func hideLoadingChromeIfReady() {
        guard let host = webView?.url?.host?.lowercased(), host.contains("kepitravel.com") else { return }
        loadingLabel?.removeFromSuperview()
        loadingLabel = nil
    }

    private func styleWebViewChrome() {
        webView?.isOpaque = true
        webView?.backgroundColor = Self.webChrome
        webView?.scrollView.backgroundColor = Self.webChrome
        view.backgroundColor = Self.webChrome
    }

    private func ensureProductionSiteLoaded() {
        guard let webView else { return }
        styleWebViewChrome()
        let host = webView.url?.host?.lowercased() ?? ""
        if host.contains("kepitravel.com") {
            hideLoadingChromeIfReady()
            return
        }
        loadAttempts += 1
        webView.load(URLRequest(url: Self.productionSignInURL))
    }

    private func scheduleLoadRetries() {
        for delay in [0.75, 2.0, 4.0, 8.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.ensureProductionSiteLoaded()
                self?.hideLoadingChromeIfReady()
            }
        }
    }
}
