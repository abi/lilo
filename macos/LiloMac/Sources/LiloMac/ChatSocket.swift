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

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        lock.lock()
        isOpen = true
        let continuation = openContinuation
        openContinuation = nil
        lock.unlock()
        continuation?.resume()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        resumeOpen(throwing: LiloAPIError.backend("Socket closed before connecting"))
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
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
