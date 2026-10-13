import Capacitor
import Security

@objc(SecureCredentialsPlugin)
public final class SecureCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureCredentialsPlugin"
    public let jsName = "SecureCredentials"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "app.hexopro.mobile.credentials",
         kSecAttrAccount as String: key]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else { call.reject("缺少凭据账户"); return }
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &value)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = value as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("系统安全凭据无法读取，请在设置中重新填写凭据"); return
        }
        call.resolve(["value": token])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let value = call.getString("value"), !value.isEmpty else { call.reject("缺少访问凭据"); return }
        let fields: [String: Any] = [kSecValueData as String: Data(value.utf8),
                                   kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query(key) as CFDictionary, fields as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query(key).merging(fields) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { call.reject("无法保存系统安全凭据，请检查设备存储空间"); return }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else { call.reject("缺少凭据账户"); return }
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("无法移除系统安全凭据，请重试"); return }
        call.resolve()
    }
}

final class HexoProViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureCredentialsPlugin())
    }
}
