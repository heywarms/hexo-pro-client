import Security
import Testing
import UIKit
import WebKit

@MainActor
struct CredentialsBridgeTests {
    private enum BridgeError: Error {
        case pageNotReady
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        for child in view.subviews {
            if let webView = findWebView(in: child) { return webView }
        }
        return nil
    }

    private func readyWebView(afterReload: Bool = false) async throws -> WKWebView {
        for _ in 0..<100 {
            let window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)
            if let root = window?.rootViewController,
               let webView = findWebView(in: root.view), !webView.isLoading {
                let ready = try? await webView.evaluateJavaScript("""
                    !!(document.readyState === 'complete' && window.Capacitor?.Plugins?.SecureCredentials
                        && (\(afterReload ? "!window.__hexoproCredentialsProbe" : "true")))
                    """)
                if ready as? Bool == true { return webView }
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw BridgeError.pageNotReady
    }

    private func call(_ method: String, options: [String: String], in webView: WKWebView) async throws -> [String: Any] {
        let result: Any = try await withCheckedThrowingContinuation { continuation in
            webView.callAsyncJavaScript("""
                const result = await window.Capacitor.Plugins.SecureCredentials[method](options);
                return result ?? {};
                """, arguments: ["method": method, "options": options], in: nil, in: .page) { result in
                continuation.resume(with: result)
            }
        }
        return try #require(result as? [String: Any])
    }

    // Use the app's real scene and JS proxy, so launching an unregistered bridge fails this test.
    @Test(.timeLimit(.minutes(1)))
    func credentialsSurviveWebViewReloadAndCanBeRemoved() async throws {
        let key = "native-bridge-test-\(UUID().uuidString)"
        let value = "test-only-凭据-\(UUID().uuidString)"
        defer {
            SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                           kSecAttrService as String: "app.hexopro.mobile.credentials",
                           kSecAttrAccount as String: key] as CFDictionary)
        }

        let webView = try await readyWebView()
        let missing = try await call("get", options: ["key": key], in: webView)
        #expect(missing["value"] is NSNull)

        _ = try await call("set", options: ["key": key, "value": value], in: webView)
        let saved = try await call("get", options: ["key": key], in: webView)
        #expect(saved["value"] as? String == value)

        let updatedValue = value + "-updated"
        _ = try await call("set", options: ["key": key, "value": updatedValue], in: webView)
        _ = try await webView.evaluateJavaScript("window.__hexoproCredentialsProbe = true")
        webView.reload()
        let reloadedWebView = try await readyWebView(afterReload: true)
        let persisted = try await call("get", options: ["key": key], in: reloadedWebView)
        #expect(persisted["value"] as? String == updatedValue)

        _ = try await call("remove", options: ["key": key], in: reloadedWebView)
        let removed = try await call("get", options: ["key": key], in: reloadedWebView)
        #expect(removed["value"] is NSNull)
        _ = try await call("remove", options: ["key": key], in: reloadedWebView)
    }
}
