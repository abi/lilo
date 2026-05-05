import Foundation

struct ChatSocketMessage: Decodable {
    var type: String
    var snapshot: ChatRunSnapshot?
    var payload: ChatEventEnvelope?
    var chatId: String?
    var runId: String?
    var message: String?
}

struct ChatRunSnapshot: Decodable {
    var activeRunId: String?
    var runId: String?
    var status: String
    var lastSeq: Int
}

struct ChatEventEnvelope: Decodable {
    var chatId: String
    var runId: String
    var seq: Int
    var status: String
    var replay: Bool?
    var event: ChatStreamEvent
}

struct ChatStreamEvent: Decodable {
    var event: String
    var data: JSONValue
}

enum JSONValue: Decodable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    var stringValue: String? {
        if case .string(let value) = self { value } else { nil }
    }

    func value(for key: String) -> JSONValue? {
        if case .object(let object) = self { object[key] } else { nil }
    }
}

actor ChatSocket {
    private let task: URLSessionWebSocketTask
    private let decoder = JSONDecoder()

    init(chatId: String) throws {
        task = URLSession.shared.webSocketTask(with: try APIClient.shared.webSocketURL(chatId: chatId))
    }

    func connect() {
        task.resume()
    }

    func subscribe(runId: String? = nil, afterSeq: Int = 0) async throws {
        var payload: [String: Any] = ["type": "subscribe", "afterSeq": afterSeq]
        if let runId { payload["runId"] = runId }
        try await send(payload)
    }

    func prompt(_ message: String, uploadIds: [String] = []) async throws {
        try await send(["type": "prompt", "message": message, "uploadIds": uploadIds])
    }

    func stop(runId: String?) async throws {
        var payload: [String: Any] = ["type": "stop"]
        if let runId { payload["runId"] = runId }
        try await send(payload)
    }

    func receive() async throws -> ChatSocketMessage {
        let message = try await task.receive()
        switch message {
        case .data(let data):
            return try decoder.decode(ChatSocketMessage.self, from: data)
        case .string(let text):
            return try decoder.decode(ChatSocketMessage.self, from: Data(text.utf8))
        @unknown default:
            throw LiloAPIError.invalidResponse
        }
    }

    func close() {
        task.cancel(with: .goingAway, reason: nil)
    }

    private func send(_ object: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8) else {
            throw LiloAPIError.invalidResponse
        }
        try await task.send(.string(text))
    }
}
