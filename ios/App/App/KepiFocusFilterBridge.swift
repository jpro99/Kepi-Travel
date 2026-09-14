import Foundation
import WebKit

#if canImport(AppIntents)
import AppIntents
#endif

/// Persists green-provenance disruption IDs for SetFocusFilterIntent (Breakthrough B2).
final class KepiFocusFilterStore {
    static let shared = KepiFocusFilterStore()

    private let defaults = UserDefaults.standard
    private let greenIdsKey = "kepi.focusFilter.greenDisruptionIds"
    private let focusModesKey = "kepi.focusFilter.focusModes"

    var greenDisruptionIds: [String] {
        defaults.stringArray(forKey: greenIdsKey) ?? []
    }

    var focusModes: [String] {
        defaults.stringArray(forKey: focusModesKey) ?? ["travel", "sleep"]
    }

    func sync(greenDisruptionIds: [String], focusModes: [String]) {
        defaults.set(greenDisruptionIds, forKey: greenIdsKey)
        defaults.set(focusModes, forKey: focusModesKey)
    }

    func stageExperiment(disruptionId: String, filterCriteria: String, greenFilterCriteria: [String]) {
        let merged = Array(Set(greenFilterCriteria + (filterCriteria.isEmpty ? [] : [filterCriteria])))
        defaults.set(merged, forKey: greenIdsKey)
        if let disruptionIdData = disruptionId.data(using: .utf8) {
            defaults.set(disruptionIdData, forKey: "kepi.focusFilter.lastExperimentDisruptionId")
        }
    }
}

/// WKWebView bridge — web posts green disruption IDs for Travel/Sleep Focus filters.
final class KepiFocusFilterBridge: NSObject, WKScriptMessageHandler {
    static let shared = KepiFocusFilterBridge()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "kepiFocusFilter" else { return }
        guard let body = message.body as? [String: Any] else { return }
        let action = (body["action"] as? String) ?? ""

        switch action {
        case "sync":
            let ids = body["greenDisruptionIds"] as? [String] ?? []
            let modes = body["focusModes"] as? [String] ?? ["travel", "sleep"]
            KepiFocusFilterStore.shared.sync(greenDisruptionIds: ids, focusModes: modes)
            invalidateFocusFilterContext()
        case "stage-experiment":
            let disruptionId = (body["disruptionId"] as? String) ?? ""
            let filterCriteria = (body["filterCriteria"] as? String) ?? ""
            let green = body["greenFilterCriteria"] as? [String] ?? []
            KepiFocusFilterStore.shared.stageExperiment(
                disruptionId: disruptionId,
                filterCriteria: filterCriteria,
                greenFilterCriteria: green
            )
            invalidateFocusFilterContext()
        default:
            break
        }
    }

    private func invalidateFocusFilterContext() {
        #if canImport(AppIntents)
        if #available(iOS 16.0, *) {
            KepiTravelFocusFilterIntent.invalidateFocusFilterAppContext()
        }
        #endif
    }
}

#if canImport(AppIntents)
@available(iOS 16.0, *)
struct KepiTravelFocusFilterIntent: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Kepi Travel Alerts"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "Kepi Travel")
    }

    var appContext: FocusFilterAppContext {
        let greenIds = KepiFocusFilterStore.shared.greenDisruptionIds
        let predicate: NSPredicate
        if greenIds.isEmpty {
            predicate = NSPredicate(value: false)
        } else {
            predicate = NSPredicate(format: "SELF IN %@", greenIds)
        }
        return FocusFilterAppContext(notificationFilterPredicate: predicate)
    }
}

@available(iOS 16.0, *)
struct KepiSleepFocusFilterIntent: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Kepi Sleep Alerts"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "Kepi Sleep")
    }

    var appContext: FocusFilterAppContext {
        KepiTravelFocusFilterIntent().appContext
    }
}

@available(iOS 16.0, *)
struct KepiFocusFilterShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: KepiTravelFocusFilterIntent(),
            phrases: ["Filter \(.applicationName) travel alerts"],
            shortTitle: "Travel Focus",
            systemImageName: "airplane"
        )
    }
}
#endif
