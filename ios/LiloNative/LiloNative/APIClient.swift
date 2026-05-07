import Foundation
import Security

final class APIClient: @unchecked Sendable {
    static let shared = APIClient()
    private static let defaultBackendURL = "http://127.0.0.1:8787"

    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let session: URLSession

    private init() {
        decoder = JSONDecoder()
        encoder = JSONEncoder()
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = .shared
        session = URLSession(configuration: configuration)
    }

    var baseURLString: String {
        get {
            WorkspaceProfileStore.shared.activeCredentials()?.backendURL ?? normalizeBackendURL(UserDefaults.standard.string(forKey: "lilo.backendURL") ?? Self.defaultBackendURL)
        }
        set {
            let normalized = normalizeBackendURL(newValue)
            if var credentials = WorkspaceProfileStore.shared.activeCredentials() {
                credentials.backendURL = normalized
                _ = try? WorkspaceProfileStore.shared.save(credentials)
            } else {
                UserDefaults.standard.set(normalized, forKey: "lilo.backendURL")
            }
        }
    }

    var baseURL: URL? {
        URL(string: baseURLString.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func url(path: String) throws -> URL {
        guard let baseURL else { throw LiloAPIError.invalidBaseURL }
        return baseURL.appending(path: path)
    }

    func webSocketURL(chatId: String) throws -> URL {
        guard var components = URLComponents(url: try url(path: "/ws/chats/\(chatId)"), resolvingAgainstBaseURL: false) else {
            throw LiloAPIError.invalidBaseURL
        }
        if components.scheme == "https" {
            components.scheme = "wss"
        } else {
            components.scheme = "ws"
        }
        guard let url = components.url else { throw LiloAPIError.invalidBaseURL }
        return url
    }

    func absoluteURL(for pathOrURL: String) -> URL? {
        if let url = URL(string: pathOrURL), url.scheme != nil {
            return url
        }
        guard let baseURL else { return nil }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = pathOrURL.hasPrefix("/") ? pathOrURL : "/\(pathOrURL)"
        components?.query = nil
        components?.fragment = nil
        return components?.url
    }

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil
    ) async throws -> T {
        var request = URLRequest(url: try url(path: path))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        return try await decode(request)
    }

    func requestNoBody(
        _ path: String,
        method: String = "POST"
    ) async throws {
        var request = URLRequest(url: try url(path: path))
        request.httpMethod = method
        let (_, response) = try await session.data(for: request)
        try validate(response: response, data: Data())
    }

    func rawData(_ path: String) async throws -> (Data, String?) {
        var request = URLRequest(url: try url(path: path))
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        let mimeType = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")
        return (data, mimeType)
    }

    func writeWorkspaceFile(_ path: String, text: String) async throws {
        struct Body: Encodable { var text: String }
        var request = URLRequest(url: try url(path: path))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(Body(text: text))
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
    }

    func login(password: String) async throws {
        struct Body: Encodable { var password: String }
        var request = URLRequest(url: try url(path: "/auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(Body(password: password))
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
    }

    func clearCookies() {
        session.configuration.httpCookieStorage?.removeCookies(since: .distantPast)
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
    }

    func upload(chatId: String, files: [PickedFile]) async throws -> [String] {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: try url(path: "/chats/\(chatId)/uploads"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = MultipartFormData(boundary: boundary, files: files).data
        let response: UploadIdsResponse = try await decode(request)
        return response.uploadIds
    }

    func configureTelegramWebhook() async throws -> TelegramWebhookSetupResponse {
        try await request("/api/channels/telegram/webhook", method: "POST")
    }

    func createResendWebhook() async throws -> ResendWebhookSetupResponse {
        try await request("/api/channels/email/resend-webhook", method: "POST")
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw LiloAPIError.invalidResponse
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw LiloAPIError.invalidResponse }
        if http.statusCode == 401 {
            throw LiloAPIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            if let payload = try? decoder.decode(BackendErrorResponse.self, from: data),
               let error = payload.error {
                let message = payload.details.map { "\(error): \($0)" } ?? error
                throw LiloAPIError.backend(message)
            }
            throw LiloAPIError.backend("Request failed with status \(http.statusCode)")
        }
    }
}

struct WorkspaceProfile: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var createdAt: Double
}

struct WorkspaceCredentials: Hashable {
    var id: String
    var name: String
    var backendURL: String
    var password: String
}

final class WorkspaceProfileStore: @unchecked Sendable {
    static let shared = WorkspaceProfileStore()

    private let defaults = UserDefaults.standard
    private let profilesKey = "lilo.workspaces.profiles"
    private let activeIDKey = "lilo.workspaces.activeID"
    private let keychainService = "chat.os.lilo.native.workspaces"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        migrateLegacyWorkspaceIfNeeded()
    }

    var profiles: [WorkspaceProfile] {
        get {
            guard let data = defaults.data(forKey: profilesKey),
                  let profiles = try? decoder.decode([WorkspaceProfile].self, from: data) else {
                return []
            }
            return profiles
        }
        set {
            defaults.set(try? encoder.encode(newValue), forKey: profilesKey)
        }
    }

    var activeProfileID: String? {
        get { defaults.string(forKey: activeIDKey) }
        set { defaults.set(newValue, forKey: activeIDKey) }
    }

    func activeCredentials() -> WorkspaceCredentials? {
        guard let activeProfileID else { return nil }
        return credentials(for: activeProfileID)
    }

    func credentials(for id: String) -> WorkspaceCredentials? {
        guard let profile = profiles.first(where: { $0.id == id }),
              let backendURL = readSecret(account: "\(id).url") else {
            return nil
        }
        return WorkspaceCredentials(
            id: profile.id,
            name: profile.name,
            backendURL: backendURL,
            password: readSecret(account: "\(id).password") ?? ""
        )
    }

    @discardableResult
    func save(_ credentials: WorkspaceCredentials, makeActive: Bool = true) throws -> WorkspaceProfile {
        let trimmedName = credentials.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let profile = WorkspaceProfile(
            id: credentials.id.isEmpty ? UUID().uuidString : credentials.id,
            name: trimmedName.isEmpty ? workspaceName(from: credentials.backendURL) : trimmedName,
            createdAt: profiles.first(where: { $0.id == credentials.id })?.createdAt ?? Date().timeIntervalSince1970
        )

        var nextProfiles = profiles.filter { $0.id != profile.id }
        nextProfiles.append(profile)
        profiles = nextProfiles.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        try writeSecret(normalizeBackendURL(credentials.backendURL), account: "\(profile.id).url")
        try writeSecret(credentials.password, account: "\(profile.id).password")
        if makeActive {
            activeProfileID = profile.id
        }
        return profile
    }

    func delete(id: String) {
        profiles = profiles.filter { $0.id != id }
        deleteSecret(account: "\(id).url")
        deleteSecret(account: "\(id).password")
        if activeProfileID == id {
            activeProfileID = profiles.first?.id
        }
    }

    func setActive(id: String) {
        activeProfileID = id
    }

    private func migrateLegacyWorkspaceIfNeeded() {
        guard profiles.isEmpty else { return }
        let legacyURL = defaults.string(forKey: "lilo.backendURL") ?? Self.defaultBackendURL
        let credentials = WorkspaceCredentials(
            id: UUID().uuidString,
            name: workspaceName(from: legacyURL),
            backendURL: legacyURL,
            password: ""
        )
        _ = try? save(credentials)
    }

    private static var defaultBackendURL: String { "http://127.0.0.1:8787" }

    private func workspaceName(from urlString: String) -> String {
        URL(string: normalizeBackendURL(urlString))?.host ?? "Lilo Workspace"
    }

    private func readSecret(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func writeSecret(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            attributes.forEach { addQuery[$0.key] = $0.value }
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw LiloAPIError.backend("Could not save workspace credentials.") }
        } else if status != errSecSuccess {
            throw LiloAPIError.backend("Could not update workspace credentials.")
        }
    }

    private func deleteSecret(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private func normalizeBackendURL(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard var components = URLComponents(string: trimmed),
          components.host == "localhost" else {
        return trimmed
    }
    components.host = "127.0.0.1"
    return components.string ?? trimmed.replacingOccurrences(of: "localhost", with: "127.0.0.1")
}

private struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        encode = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}

struct PickedFile: Identifiable, Hashable {
    var id = UUID()
    var name: String
    var mimeType: String
    var data: Data
}

private struct MultipartFormData {
    var boundary: String
    var files: [PickedFile]

    var data: Data {
        var body = Data()
        for file in files {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(file.name)\"\r\n")
            body.append("Content-Type: \(file.mimeType)\r\n\r\n")
            body.append(file.data)
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
