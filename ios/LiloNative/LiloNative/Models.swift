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

struct SessionStatusResponse: Codable {
    var enabled: Bool
    var authenticated: Bool
    var hasSessionCookie: Bool?
}

enum ChatRole: String, Codable {
    case user
    case assistant
    case thinking
    case toolCall = "tool_call"
    case toolResult = "tool_result"
    case system
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

struct TelegramWebhookSetupResponse: Codable {
    var ok: Bool
    var webhookUrl: String
}

struct ResendWebhookSetupResponse: Codable {
    var ok: Bool
    var webhookUrl: String
    var webhookId: String
    var signingSecret: String
}

struct BackendErrorResponse: Codable {
    var error: String?
    var details: String?
}

enum MainTab: String, CaseIterable, Identifiable {
    case chats
    case home
    case files
    case automations
    case settings

    var id: String { rawValue }
}
