import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var selectedTab: MainTab = .chats
    @Published var isAuthenticated = false
    @Published var authEnabled = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    @Published var chats: [ChatSummary] = []
    @Published var selectedChat: ChatDetail.ChatPayload?
    @Published var activeRunId: String?
    @Published var isStreaming = false
    @Published var isSocketReady = false
    @Published var pendingChatNavigationId: String?
    @Published var composerText = ""
    @Published var attachments: [PickedFile] = []
    @Published var focusComposerRequest = 0

    @Published var workspaceApps: [WorkspaceAppLink] = []
    @Published var workspaceEntries: [WorkspaceEntry] = []
    @Published var workspacePreferences = WorkspacePreferences(timeZone: "America/New_York")
    @Published var selectedViewerPath: String?

    @Published var automationJobs: [AutomationJob] = []
    @Published var automationRuns: [AutomationRunRecord] = []
    @Published var channels: [ChannelStatus] = []
    @Published var models: [ChatModelOption] = []
    @Published var systemPrompt = ""

    private var socket: ChatSocket?
    private var socketTask: Task<Void, Never>?

    var api = APIClient.shared

    func bootstrap() async {
        await refreshSession()
        guard isAuthenticated || !authEnabled else { return }
        await refreshAll()
    }

    func refreshSession() async {
        do {
            let response: SessionStatusResponse = try await api.request("/auth/session")
            authEnabled = response.enabled
            isAuthenticated = response.authenticated || !response.enabled
        } catch {
            authEnabled = true
            isAuthenticated = false
            errorMessage = error.localizedDescription
        }
    }

    func login(password: String) async {
        do {
            try await api.login(password: password)
            await refreshSession()
            await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        await refreshChats()
        await refreshWorkspace()
        await refreshAutomations()
        await refreshChannels()
        await refreshModels()
    }

    func refreshChats() async {
        do {
            let response: ChatListResponse = try await api.request("/chats")
            chats = response.chats
            if selectedChat == nil, let first = response.chats.first {
                await selectChat(first.id)
            }
        } catch {
            handle(error)
        }
    }

    func createChat() async {
        do {
            let response: ChatCreateResponse = try await api.request("/chats", method: "POST")
            chats.insert(response.chat, at: 0)
            await selectChat(response.chat.id)
            selectedTab = .chats
            pendingChatNavigationId = response.chat.id
            focusComposerRequest += 1
        } catch {
            handle(error)
        }
    }

    func selectChat(_ chatId: String) async {
        do {
            let response: ChatDetail = try await api.request("/chats/\(chatId)")
            selectedChat = response.chat
            activeRunId = response.chat.activeRunId
            isStreaming = response.chat.status == "streaming"
            await startSocket(chatId: chatId, runId: response.chat.activeRunId, afterSeq: response.chat.activeRunLastSeq ?? 0)
        } catch {
            handle(error)
        }
    }

    func refreshSelectedChatDetail() async {
        guard let chatId = selectedChat?.id else { return }
        do {
            let response: ChatDetail = try await api.request("/chats/\(chatId)")
            selectedChat = response.chat
            activeRunId = response.chat.activeRunId
            isStreaming = response.chat.status == "streaming"
        } catch {
            handle(error)
        }
    }

    func sendMessage() async {
        guard let chatId = selectedChat?.id else { return }
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachments.isEmpty else { return }
        composerText = ""
        let files = attachments
        attachments = []

        do {
            if socket == nil {
                await startSocket(chatId: chatId, runId: nil, afterSeq: 0)
            }
            guard let socket, isSocketReady else {
                throw LiloAPIError.backend("Lilo is still connecting. Try sending again in a moment.")
            }
            var uploadIds: [String] = []
            if !files.isEmpty {
                uploadIds = try await api.upload(chatId: chatId, files: files)
            }
            appendLocalUserMessage(text, files: files)
            try await socket.prompt(text, uploadIds: uploadIds)
        } catch {
            handle(error)
        }
    }

    func stopChat() async {
        do {
            try await socket?.stop(runId: activeRunId)
        } catch {
            handle(error)
        }
    }

    func updateSelectedChatModel(_ option: ChatModelOption) async {
        guard let chatId = selectedChat?.id else { return }
        do {
            struct Body: Encodable { var provider: String; var modelId: String }
            let _: ChatCreateResponse = try await api.request(
                "/chats/\(chatId)/model",
                method: "PATCH",
                body: Body(provider: option.provider, modelId: option.modelId)
            )
            await selectChat(chatId)
        } catch {
            handle(error)
        }
    }

    func refreshWorkspace() async {
        do {
            let response: WorkspaceResponse = try await api.request("/workspace/apps")
            workspaceApps = response.apps
            workspaceEntries = response.entries
            workspacePreferences = response.preferences
        } catch {
            handle(error)
        }
    }

    func openViewer(_ path: String) {
        guard selectedViewerPath != path else { return }
        selectedViewerPath = path
        selectedTab = .files
    }

    func clearViewer() {
        selectedViewerPath = nil
    }

    func refreshAutomations() async {
        do {
            let response: AutomationResponse = try await api.request("/api/automations")
            automationJobs = response.jobs
            automationRuns = response.runs
        } catch {
            handle(error)
        }
    }

    func runAutomation(_ id: String) async {
        do {
            try await api.requestNoBody("/api/automations/\(id)/run")
            await refreshAutomations()
        } catch {
            handle(error)
        }
    }

    func setAutomation(_ job: AutomationJob, enabled: Bool) async {
        do {
            struct Body: Encodable { var enabled: Bool }
            let _: [String: AutomationJob] = try await api.request(
                "/api/automations/\(job.id)",
                method: "PATCH",
                body: Body(enabled: enabled)
            )
            await refreshAutomations()
        } catch {
            handle(error)
        }
    }

    func deleteAutomation(_ id: String) async {
        do {
            try await api.requestNoBody("/api/automations/\(id)", method: "DELETE")
            await refreshAutomations()
        } catch {
            handle(error)
        }
    }

    func refreshChannels() async {
        do {
            let response: ChannelStatusResponse = try await api.request("/api/channels/status")
            channels = response.channels
        } catch {
            handle(error)
        }
    }

    func refreshModels() async {
        do {
            let response: ChatModelsResponse = try await api.request("/chats/models")
            models = response.models
        } catch {
            handle(error)
        }
    }

    func loadSystemPrompt() async {
        do {
            let response: SystemPromptResponse = try await api.request("/chats/system-prompt")
            systemPrompt = response.systemPrompt
        } catch {
            handle(error)
        }
    }

    func saveBackendURL(_ value: String) async {
        api.baseURLString = value
        selectedChat = nil
        chats = []
        if let socket {
            await socket.close()
        }
        socket = nil
        isSocketReady = false
        await bootstrap()
    }

    private func startSocket(chatId: String, runId: String?, afterSeq: Int) async {
        if let socket {
            await socket.close()
        }
        socketTask?.cancel()
        isSocketReady = false
        do {
            let socket = try ChatSocket(chatId: chatId)
            try await socket.connect()
            try await socket.subscribe(runId: runId, afterSeq: afterSeq)
            self.socket = socket
            isSocketReady = true
            socketTask = Task { [weak self, socket] in
                do {
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        self?.handle(socketMessage: message)
                    }
                } catch {
                    if !Task.isCancelled {
                        self?.handle(error)
                    }
                }
            }
        } catch {
            socket = nil
            isSocketReady = false
            handle(error)
        }
    }

    private func handle(socketMessage: ChatSocketMessage) {
        switch socketMessage.type {
        case "run_started":
            activeRunId = socketMessage.runId
            isStreaming = true
        case "chat_event":
            guard let envelope = socketMessage.payload else { return }
            apply(streamEvent: envelope.event)
            isStreaming = envelope.status == "streaming"
        case "chat_updated":
            Task {
                await refreshChats()
                if socketMessage.chatId == selectedChat?.id {
                    await refreshSelectedChatDetail()
                }
            }
        case "socket_error":
            errorMessage = socketMessage.message
        default:
            break
        }
    }

    private func apply(streamEvent: ChatStreamEvent) {
        guard selectedChat != nil else { return }
        switch streamEvent.event {
        case "assistant_message_start":
            let id = streamEvent.data.value(for: "id")?.stringValue ?? UUID().uuidString
            selectedChat?.messages.append(ChatMessage(
                id: id,
                role: .assistant,
                content: "",
                timestamp: Date().timeIntervalSince1970 * 1000
            ))
        case "text_delta":
            let text =
                streamEvent.data.value(for: "delta")?.stringValue ??
                streamEvent.data.value(for: "text")?.stringValue ??
                ""
            appendAssistantText(text)
        case "thinking_delta":
            let text = streamEvent.data.value(for: "delta")?.stringValue ?? ""
            appendThinkingText(text)
        case "tool_call":
            let toolName = streamEvent.data.value(for: "toolName")?.stringValue
            let input = streamEvent.data.value(for: "input")?.prettyString
            let content = toolName.map { "Using \($0)" } ?? "Using a tool"
            selectedChat?.messages.append(ChatMessage(
                id: UUID().uuidString,
                role: .toolCall,
                content: content,
                timestamp: Date().timeIntervalSince1970 * 1000,
                toolName: toolName,
                toolInput: input
            ))
        case "tool_result":
            let toolName = streamEvent.data.value(for: "toolName")?.stringValue
            let output = streamEvent.data.value(for: "output")?.stringValue ?? toolName.map { "Completed \($0)" } ?? "Tool completed"
            selectedChat?.messages.append(ChatMessage(
                id: UUID().uuidString,
                role: .toolResult,
                content: output,
                timestamp: Date().timeIntervalSince1970 * 1000,
                toolName: toolName,
                toolDetails: streamEvent.data.value(for: "details"),
                isError: streamEvent.data.value(for: "isError") == .bool(true)
            ))
        case "error":
            errorMessage = streamEvent.data.value(for: "message")?.stringValue ?? "Streaming failed"
        case "done":
            isStreaming = false
            activeRunId = nil
            Task {
                await refreshChats()
                await refreshSelectedChatDetail()
            }
        default:
            break
        }
    }

    private func appendAssistantText(_ text: String) {
        if let index = selectedChat?.messages.lastIndex(where: { $0.role == .assistant }) {
            selectedChat?.messages[index].content += text
        } else {
            selectedChat?.messages.append(ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: text,
                timestamp: Date().timeIntervalSince1970 * 1000
            ))
        }
    }

    private func appendThinkingText(_ text: String) {
        if let index = selectedChat?.messages.lastIndex(where: { $0.role == .thinking }) {
            selectedChat?.messages[index].content += text
        } else {
            selectedChat?.messages.append(ChatMessage(
                id: UUID().uuidString,
                role: .thinking,
                content: text,
                timestamp: Date().timeIntervalSince1970 * 1000
            ))
        }
    }

    private func appendLocalUserMessage(_ text: String, files: [PickedFile]) {
        let attachments = files.map {
            ChatAttachment(name: $0.name, type: $0.mimeType, previewUrl: "", kind: $0.mimeType.hasPrefix("image/") ? "image" : "file")
        }
        selectedChat?.messages.append(ChatMessage(
            id: UUID().uuidString,
            role: .user,
            content: text,
            timestamp: Date().timeIntervalSince1970 * 1000,
            attachments: attachments
        ))
    }

    private func handle(_ error: Error) {
        if case LiloAPIError.unauthorized = error {
            isAuthenticated = false
            authEnabled = true
        }
        errorMessage = error.localizedDescription
    }
}
