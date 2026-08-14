import Capacitor
import Foundation

/// Forces the WKWebView onto kepitravel.com.
/// Capacitor otherwise exits if `public/` is missing, or can keep a stale
/// live-reload path from a previous Xcode debug session (blank navy splash).
final class KepiBridgeViewController: CAPBridgeViewController {
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = InstanceDescriptor()
        descriptor.serverURL = "https://kepitravel.com"
        return descriptor
    }
}
