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

enum JSONValue: Codable, Hashable {
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

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var prettyString: String {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
        case .bool(let value):
            return value ? "true" : "false"
        case .object, .array:
            if let data = try? JSONEncoder.prettyPrinted.encode(self),
               let text = String(data: data, encoding: .utf8) {
                return text
            }
            return String(describing: self)
        case .null:
            return "null"
        }
    }
}

private extension JSONEncoder {
    static var prettyPrinted: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}

actor ChatSocket {
    private let delegate: ChatSocketDelegate
    private let session: URLSession
    private let task: URLSessionWebSocketTask
    private let decoder = JSONDecoder()

    init(chatId: String) throws {
        let delegate = ChatSocketDelegate()
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        self.delegate = delegate
        self.session = session
        task = session.webSocketTask(with: try APIClient.shared.webSocketURL(chatId: chatId))
    }

    func connect() async throws {
        task.resume()
        try await delegate.waitUntilOpen()
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
        session.invalidateAndCancel()
    }

    private func send(_ object: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8) else {
            throw LiloAPIError.invalidResponse
        }
        try await task.send(.string(text))
    }
}

private final class ChatSocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var openContinuation: CheckedContinuation<Void, Error>?

    func waitUntilOpen() async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                if isOpen {
                    lock.unlock()
                    continuation.resume()
                    return
                }
                openContinuation = continuation
                lock.unlock()
            }
        } onCancel: {
            resumeOpen(throwing: CancellationError())
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        lock.lock()
        isOpen = true
        let continuation = openContinuation
        openContinuation = nil
        lock.unlock()
        continuation?.resume()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        resumeOpen(throwing: LiloAPIError.backend("Socket closed before connecting"))
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error {
            resumeOpen(throwing: error)
        }
    }

    private func resumeOpen(throwing error: Error) {
        lock.lock()
        let continuation = openContinuation
        openContinuation = nil
        lock.unlock()
        continuation?.resume(throwing: error)
    }
}
