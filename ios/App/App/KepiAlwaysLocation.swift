import CoreLocation
import Foundation

/// Always + Precise family GPS. Runs with the screen locked (Life360-style).
/// Home Screen / Safari cannot do this — TestFlight native only.
final class KepiAlwaysLocation: NSObject, CLLocationManagerDelegate {
    static let shared = KepiAlwaysLocation()

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private var lastPostedAt: TimeInterval = 0
    private var lastPosted: CLLocation?

    private enum Keys {
        static let token = "kepi.alwaysLocation.token"
        static let url = "kepi.alwaysLocation.url"
        static let enabled = "kepi.alwaysLocation.enabled"
    }

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 20
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
        if #available(iOS 14.0, *) {
            manager.desiredAccuracy = kCLLocationAccuracyBest
        }
    }

    func prepareOnLaunch() {
        if defaults.bool(forKey: Keys.enabled), defaults.string(forKey: Keys.token) != nil {
            startUpdates()
        }
    }

    func start(token: String, url: String) {
        defaults.set(token, forKey: Keys.token)
        defaults.set(url, forKey: Keys.url)
        defaults.set(true, forKey: Keys.enabled)
        requestAlwaysThenStart()
    }

    func stop() {
        defaults.set(false, forKey: Keys.enabled)
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
    }

    private func requestAlwaysThenStart() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            startUpdates()
        case .authorizedAlways:
            startUpdates()
        default:
            break
        }
    }

    private func startUpdates() {
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
        if #available(iOS 14.0, *) {
            if manager.accuracyAuthorization != .fullAccuracy {
                manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "familyMap")
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if !defaults.bool(forKey: Keys.enabled) { return }
        requestAlwaysThenStart()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        guard location.horizontalAccuracy > 0, location.horizontalAccuracy <= 65 else { return }
        let now = Date().timeIntervalSince1970
        if let last = lastPosted {
            let moved = location.distance(from: last)
            if moved < 20, now - lastPostedAt < 15 { return }
        } else if now - lastPostedAt < 8 {
            return
        }
        lastPosted = location
        lastPostedAt = now
        post(location)
    }

    private func post(_ location: CLLocation) {
        guard defaults.bool(forKey: Keys.enabled),
              let token = defaults.string(forKey: Keys.token),
              let urlString = defaults.string(forKey: Keys.url),
              let url = URL(string: urlString) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "lat": location.coordinate.latitude,
            "lon": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
        ])
        URLSession.shared.dataTask(with: request).resume()
    }
}
