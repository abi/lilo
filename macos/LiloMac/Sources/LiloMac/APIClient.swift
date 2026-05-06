import Foundation

final class APIClient: @unchecked Sendable {
    static let shared = APIClient()
    private static let defaultBackendURL = "http://127.0.0.1:8787"

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = .shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        session = URLSession(configuration: configuration)
    }

    var baseURLString: String {
        get {
            normalizeBackendURL(UserDefaults.standard.string(forKey: "lilo.backendURL") ?? Self.defaultBackendURL)
        }
        set {
            UserDefaults.standard.set(normalizeBackendURL(newValue), forKey: "lilo.backendURL")
        }
    }

    var baseURL: URL? {
        URL(string: baseURLString.trimmingCharacters(in: .whitespacesAndNewlines))
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

    func url(path: String) throws -> URL {
        guard let baseURL else { throw LiloAPIError.invalidBaseURL }
        return baseURL.appending(path: path)
    }

    func webSocketURL(chatId: String) throws -> URL {
        guard var components = URLComponents(url: try url(path: "/ws/chats/\(chatId)"), resolvingAgainstBaseURL: false) else {
            throw LiloAPIError.invalidBaseURL
        }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        guard let url = components.url else { throw LiloAPIError.invalidBaseURL }
        return url
    }

    func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
        var request = URLRequest(url: try url(path: path))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        return try await decode(request)
    }

    func requestNoBody(_ path: String, method: String = "POST") async throws {
        var request = URLRequest(url: try url(path: path))
        request.httpMethod = method
        let (_, response) = try await session.data(for: request)
        try validate(response: response, data: Data())
    }

    func rawData(_ path: String) async throws -> (Data, String?) {
        var resourceURL = try url(path: path)
        if var components = URLComponents(url: resourceURL, resolvingAgainstBaseURL: false) {
            var queryItems = components.queryItems ?? []
            queryItems.append(URLQueryItem(name: "_liloNativeCacheBust", value: String(Int(Date().timeIntervalSince1970 * 1000))))
            components.queryItems = queryItems
            resourceURL = components.url ?? resourceURL
        }
        var request = URLRequest(url: resourceURL, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue("1", forHTTPHeaderField: "X-Lilo-Native-Viewer")
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

    func upload(chatId: String, files: [PickedFile]) async throws -> [String] {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: try url(path: "/chats/\(chatId)/uploads"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = MultipartFormData(boundary: boundary, files: files).data
        let response: UploadIdsResponse = try await decode(request)
        return response.uploadIds
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
