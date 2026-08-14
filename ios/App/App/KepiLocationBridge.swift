import Foundation
import WebKit

/// Web page (signed-in Kepi) hands the Always tracker a token, then iOS
/// keeps posting location after the screen locks.
final class KepiLocationBridge: NSObject, WKScriptMessageHandler {
    static let shared = KepiLocationBridge()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "kepiLocation" else { return }
        guard let body = message.body as? [String: Any] else { return }
        let action = (body["action"] as? String) ?? ""
        if action == "stop" {
            KepiAlwaysLocation.shared.stop()
            return
        }
        if action == "start" {
            guard let token = body["token"] as? String, !token.isEmpty else { return }
            let url = (body["url"] as? String) ?? "https://kepitravel.com/api/family/native-location"
            KepiAlwaysLocation.shared.start(token: token, url: url)
        }
    }
}
