import Foundation
import WebKit

#if canImport(ActivityKit)
import ActivityKit
#endif

/// ActivityKit Live Activity bridge — provenance-gated updates from the WKWebView.
/// Web posts { action, primary, secondary, tertiary, progress, showCountdown, rightsShell }.
/// Red provenance countdown is blocked in JS before postMessage; native mirrors showCountdown.
@available(iOS 16.2, *)
struct KepiFlightActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var primary: String
        var secondary: String
        var tertiary: String
        var progress: Double?
        var showCountdown: Bool
        var rightsHeadline: String?
    }

    var flightLabel: String
}

final class KepiLiveActivityBridge: NSObject, WKScriptMessageHandler {
    static let shared = KepiLiveActivityBridge()

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private var currentActivity: Activity<KepiFlightActivityAttributes>?
    #endif

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "kepiLiveActivity" else { return }
        guard let body = message.body as? [String: Any] else { return }
        let action = (body["action"] as? String) ?? ""

        if action == "end" {
            endActivity()
            return
        }

        guard action == "update" || action == "start" else { return }

        let primary = (body["primary"] as? String) ?? "Kepi Travel"
        let secondary = (body["secondary"] as? String) ?? ""
        let tertiary = (body["tertiary"] as? String) ?? ""
        let progress = body["progress"] as? Double
        let showCountdown = (body["showCountdown"] as? Bool) ?? false
        let rightsShell = body["rightsShell"] as? [String: Any]
        let rightsHeadline = rightsShell?["headline"] as? String

        updateActivity(
            primary: primary,
            secondary: secondary,
            tertiary: tertiary,
            progress: progress,
            showCountdown: showCountdown,
            rightsHeadline: rightsHeadline
        )
    }

    private func updateActivity(
        primary: String,
        secondary: String,
        tertiary: String,
        progress: Double?,
        showCountdown: Bool,
        rightsHeadline: String?
    ) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let state = KepiFlightActivityAttributes.ContentState(
                primary: primary,
                secondary: secondary,
                tertiary: tertiary,
                progress: progress,
                showCountdown: showCountdown,
                rightsHeadline: rightsHeadline
            )
            if let activity = currentActivity {
                Task {
                    await activity.update(ActivityContent(state: state, staleDate: nil))
                }
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            let attributes = KepiFlightActivityAttributes(flightLabel: primary)
            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                currentActivity = activity
            } catch {
                // ActivityKit unavailable or denied — web fallback handles honesty.
            }
        }
        #endif
    }

    private func endActivity() {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let activity = currentActivity else { return }
            Task {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            currentActivity = nil
        }
        #endif
    }
}
