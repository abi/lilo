import Foundation

enum LiloAPIError: Error, LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case unauthorized
    case backend(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            "Set a valid Lilo backend URL in Settings."
        case .invalidResponse:
            "Lilo returned an invalid response."
        case .unauthorized:
            "Sign in to this Lilo deployment."
        case .backend(let message):
            message
        }
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case home
    case chats
    case files
    case automations
    case settings

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: "Home"
        case .chats: "Chats"
        case .files: "Files"
        case .automations: "Automations"
        case .settings: "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .chats: "bubble.left.and.bubble.right"
        case .files: "folder"
        case .automations: "calendar.badge.clock"
        case .settings: "gearshape"
        }
    }
}

enum MainTab {
    case chats
    case files
}

enum ChatRole: String, Codable {
    case user
    case assistant
    case thinking
    case toolCall = "tool_call"
    case toolResult = "tool_result"
    case system
}

struct SessionStatusResponse: Codable {
    var enabled: Bool
    var authenticated: Bool
    var hasSessionCookie: Bool?
}

struct ChatAttachment: Codable, Identifiable, Hashable {
    var id: String { previewUrl + name }
    var name: String
    var type: String
    var previewUrl: String
    var kind: String?
}

struct ChatMessage: Codable, Identifiable, Hashable {
    var id: String
    var role: ChatRole
    var content: String
    var timestamp: Double
    var toolName: String?
    var toolInput: String?
    var toolDetails: JSONValue?
    var isError: Bool?
    var attachments: [ChatAttachment]?
    var viewerPath: String?
    var appName: String?
}

struct ChatSummary: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var createdAt: String
    var updatedAt: String
    var messageCount: Int
    var status: String
    var activeRunId: String?
    var activeRunLastSeq: Int?
    var modelProvider: String
    var modelId: String
}

struct ChatDetail: Codable {
    var chat: ChatPayload

    struct ChatPayload: Codable {
        var id: String
        var title: String
        var createdAt: String
        var updatedAt: String
        var messageCount: Int
        var status: String
        var activeRunId: String?
        var activeRunLastSeq: Int?
        var modelProvider: String
        var modelId: String
        var messages: [ChatMessage]

        var summary: ChatSummary {
            ChatSummary(
                id: id,
                title: title,
                createdAt: createdAt,
                updatedAt: updatedAt,
                messageCount: messageCount,
                status: status,
                activeRunId: activeRunId,
                activeRunLastSeq: activeRunLastSeq,
                modelProvider: modelProvider,
                modelId: modelId
            )
        }
    }
}

struct ChatListResponse: Codable {
    var chats: [ChatSummary]
}

struct ChatCreateResponse: Codable {
    var chat: ChatSummary
}

struct ChatModelOption: Codable, Identifiable, Hashable {
    var id: String { "\(provider):\(modelId)" }
    var provider: String
    var modelId: String
    var routingProvider: String?
}

struct ChatModelsResponse: Codable {
    var models: [ChatModelOption]
}

struct ChatModelSelection: Codable, Hashable {
    var provider: String
    var modelId: String
}

struct WorkspaceAppLink: Codable, Identifiable, Hashable {
    var id: String { name }
    var name: String
    var displayName: String?
    var description: String?
    var href: String
    var viewerPath: String
    var iconHref: String?
    var archived: Bool?

    var label: String { displayName ?? name }
}

struct WorkspaceEntry: Codable, Identifiable, Hashable {
    var id: String { relativePath }
    var name: String
    var relativePath: String
    var parentRelativePath: String?
    var kind: String
    var viewerPath: String?
    var appName: String?
    var iconHref: String?
    var archived: Bool?
}

struct WorkspacePreferences: Codable, Hashable {
    var timeZone: String
    var defaultChatModelSelection: ChatModelSelection?
    var automationOutputChannel: String?
    var gitRemoteUrl: String?
    var gitBrowserUrl: String?
}

struct WorkspaceResponse: Codable {
    var apps: [WorkspaceAppLink]
    var entries: [WorkspaceEntry]
    var preferences: WorkspacePreferences
}

struct AutomationSchedule: Codable, Hashable {
    var type: String
    var expression: String?
    var timezone: String?
    var at: String?
}

struct AutomationJob: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var enabled: Bool
    var prompt: String
    var schedule: AutomationSchedule
    var createdAt: String
    var updatedAt: String
    var lastRunAt: String?
    var nextRunAt: String?
    var lastStatus: String?
    var lastError: String?
    var lastChatId: String?
}

struct AutomationRunRecord: Codable, Identifiable, Hashable {
    var id: String
    var automationId: String
    var automationName: String
    var chatId: String
    var startedAt: String
    var finishedAt: String?
    var status: String
    var error: String?
}

struct AutomationResponse: Codable {
    var jobs: [AutomationJob]
    var runs: [AutomationRunRecord]
}

struct ChannelStatus: Codable, Identifiable, Hashable {
    var id: String
    var label: String
    var provider: String?
    var configured: Bool
    var state: String?
    var missing: [String]?
    var requiredConfig: [ChannelConfigValue]?
    var details: [ChannelConfigValue]?
}

struct ChannelConfigValue: Codable, Identifiable, Hashable {
    var id: String { label }
    var label: String
    var value: String
    var kind: String?
}

struct ChannelStatusResponse: Codable {
    var channels: [ChannelStatus]
}

struct SystemPromptResponse: Codable {
    var systemPrompt: String
}

struct UploadIdsResponse: Codable {
    var uploadIds: [String]
}

struct BackendErrorResponse: Codable {
    var error: String?
    var details: String?
}

struct PickedFile: Identifiable, Hashable {
    var id = UUID()
    var name: String
    var mimeType: String
    var data: Data
}

struct ViewerRoute: Identifiable, Hashable {
    var path: String
    var id: String { path }
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

    var stringValue: String? {
        if case .string(let value) = self { value } else { nil }
    }

    func value(for key: String) -> JSONValue? {
        if case .object(let object) = self { object[key] } else { nil }
    }

    var prettyString: String {
        switch self {
        case .string(let value):
            value
        case .number(let value):
            value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
        case .bool(let value):
            value ? "true" : "false"
        case .object, .array:
            if let data = try? JSONEncoder.prettyPrinted.encode(self),
               let text = String(data: data, encoding: .utf8) {
                text
            } else {
                String(describing: self)
            }
        case .null:
            "null"
        }
    }
}

extension JSONEncoder {
    static var prettyPrinted: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
