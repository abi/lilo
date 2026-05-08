import Foundation
import CoreLocation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    private static let locationSharingEnabledKey = "lilo.locationSharing.enabled"
    private static let locationHistoryKey = "lilo.locationSharing.history"
    private static let maxLocationHistoryCount = 10

    @Published var selectedTab: MainTab = .chats
    @Published var isAuthenticated = false
    @Published var authEnabled = false
    @Published var hasBootstrapped = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var workspaceProfiles: [WorkspaceProfile] = []
    @Published var activeWorkspaceID: String?

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
    @Published var isLocationSharingEnabled: Bool
    @Published var latestLocation: UserLocationSnapshot?
    @Published var locationHistory: [UserLocationSnapshot]

    private var socket: ChatSocket?
    private var socketTask: Task<Void, Never>?
    private let locationProvider = LocationProvider()

    var api = APIClient.shared

    init() {
        isLocationSharingEnabled = UserDefaults.standard.bool(forKey: Self.locationSharingEnabledKey)
        locationHistory = Self.loadLocationHistory()
        latestLocation = locationHistory.first
    }

    func bootstrap() async {
        defer { hasBootstrapped = true }
        refreshWorkspaceProfiles()
        await refreshSession()
        if authEnabled && !isAuthenticated {
            await loginWithStoredPasswordIfAvailable()
        }
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
            savePasswordForActiveWorkspace(password)
            await refreshSession()
            await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIntoWorkspace(id: String?, name: String, backendURL: String, password: String) async {
        do {
            let credentials = WorkspaceCredentials(
                id: id ?? UUID().uuidString,
                name: name,
                backendURL: backendURL,
                password: password
            )
            let profile = try WorkspaceProfileStore.shared.save(credentials)
            WorkspaceProfileStore.shared.setActive(id: profile.id)
            refreshWorkspaceProfiles()
            await resetForWorkspaceChange()
            await refreshSession()
            if authEnabled {
                try await api.login(password: password)
                await refreshSession()
            }
            if isAuthenticated || !authEnabled {
                await refreshAll()
            }
        } catch {
            handle(error)
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
            let context = await chatPromptContext()
            try await socket.prompt(text, uploadIds: uploadIds, context: context)
        } catch {
            handle(error)
        }
    }

    func setLocationSharingEnabled(_ enabled: Bool) async {
        isLocationSharingEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.locationSharingEnabledKey)
        if enabled {
            await refreshCurrentLocation()
        }
    }

    func refreshCurrentLocation() async {
        do {
            let snapshot = try await locationProvider.requestLocation()
            recordLocation(snapshot)
        } catch {
            isLocationSharingEnabled = false
            UserDefaults.standard.set(false, forKey: Self.locationSharingEnabledKey)
            errorMessage = error.localizedDescription
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
        selectedViewerPath = path
        selectedTab = .files
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
        await saveWorkspace(
            id: activeWorkspaceID,
            name: WorkspaceProfileStore.shared.activeCredentials()?.name ?? "",
            backendURL: value,
            password: WorkspaceProfileStore.shared.activeCredentials()?.password ?? ""
        )
    }

    func refreshWorkspaceProfiles() {
        workspaceProfiles = WorkspaceProfileStore.shared.profiles
        activeWorkspaceID = WorkspaceProfileStore.shared.activeProfileID
    }

    func saveWorkspace(id: String?, name: String, backendURL: String, password: String) async {
        do {
            let credentials = WorkspaceCredentials(
                id: id ?? UUID().uuidString,
                name: name,
                backendURL: backendURL,
                password: password
            )
            let profile = try WorkspaceProfileStore.shared.save(credentials)
            await switchWorkspace(profile.id, attemptStoredLogin: true)
        } catch {
            handle(error)
        }
    }

    func updateWorkspace(id: String, name: String, backendURL: String, password: String) async {
        do {
            let credentials = WorkspaceCredentials(
                id: id,
                name: name,
                backendURL: backendURL,
                password: password
            )
            _ = try WorkspaceProfileStore.shared.save(credentials, makeActive: id == activeWorkspaceID)
            refreshWorkspaceProfiles()
            if id == activeWorkspaceID {
                await switchWorkspace(id, attemptStoredLogin: true)
            }
        } catch {
            handle(error)
        }
    }

    func switchWorkspace(_ id: String, attemptStoredLogin: Bool = true) async {
        WorkspaceProfileStore.shared.setActive(id: id)
        refreshWorkspaceProfiles()
        await resetForWorkspaceChange()
        await refreshSession()
        if attemptStoredLogin && authEnabled && !isAuthenticated {
            await loginWithStoredPasswordIfAvailable()
        }
        if isAuthenticated || !authEnabled {
            await refreshAll()
        }
    }

    func deleteWorkspace(_ profile: WorkspaceProfile) async {
        WorkspaceProfileStore.shared.delete(id: profile.id)
        refreshWorkspaceProfiles()
        await resetForWorkspaceChange()
        await bootstrap()
    }

    func openUniversalLink(_ url: URL) async {
        guard let viewerPath = viewerPath(fromUniversalLink: url) else { return }
        refreshWorkspaceProfiles()

        let workspaceURL = workspaceUrl(fromUniversalLink: url) ?? url
        let matchingWorkspaceID = workspaceID(matching: workspaceURL)
        if let matchingWorkspaceID, matchingWorkspaceID != activeWorkspaceID {
            await switchWorkspace(matchingWorkspaceID, attemptStoredLogin: true)
        } else if matchingWorkspaceID == nil, let host = workspaceURL.host {
            errorMessage = "Add https://\(host) as a workspace before opening this link."
            return
        }

        selectedViewerPath = viewerPath
        selectedTab = .files
    }

    private func resetForWorkspaceChange() async {
        selectedChat = nil
        chats = []
        workspaceApps = []
        workspaceEntries = []
        automationJobs = []
        automationRuns = []
        channels = []
        models = []
        systemPrompt = ""
        selectedViewerPath = nil
        composerText = ""
        attachments = []
        activeRunId = nil
        isStreaming = false
        isSocketReady = false
        isAuthenticated = false
        authEnabled = false
        api.clearCookies()
        if let socket {
            await socket.close()
        }
        socket = nil
        socketTask?.cancel()
        socketTask = nil
    }

    private func chatPromptContext() async -> ChatPromptContext? {
        var locationContext: UserLocationContext?
        if isLocationSharingEnabled {
            if let snapshot = try? await locationProvider.requestLocation() {
                recordLocation(snapshot)
            }
            if let latestLocation {
                locationContext = UserLocationContext(
                    current: latestLocation,
                    recent: Array(locationHistory.dropFirst())
                )
            }
        }

        if selectedViewerPath == nil && locationContext == nil {
            return nil
        }

        return ChatPromptContext(
            viewerPath: selectedViewerPath,
            location: locationContext
        )
    }

    private func recordLocation(_ snapshot: UserLocationSnapshot) {
        latestLocation = snapshot
        var nextHistory = [snapshot]
        nextHistory.append(contentsOf: locationHistory.filter { $0.capturedAt != snapshot.capturedAt })
        locationHistory = Array(nextHistory.prefix(Self.maxLocationHistoryCount))
        if let data = try? JSONEncoder().encode(locationHistory) {
            UserDefaults.standard.set(data, forKey: Self.locationHistoryKey)
        }
    }

    private static func loadLocationHistory() -> [UserLocationSnapshot] {
        guard let data = UserDefaults.standard.data(forKey: locationHistoryKey),
              let history = try? JSONDecoder().decode([UserLocationSnapshot].self, from: data) else {
            return []
        }
        return history
    }

    private func viewerPath(fromUniversalLink url: URL) -> String? {
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let viewer = components.queryItems?.first(where: { $0.name == "viewer" || $0.name == "v" })?.value,
           isWorkspaceViewerPath(viewer) {
            return viewer
        }

        let decodedPath = url.path.removingPercentEncoding ?? url.path
        if decodedPath.starts(with: "/open/") {
            let compactPath = "/" + decodedPath.dropFirst(6)
            return isWorkspaceViewerPath(compactPath) ? compactPath : nil
        }

        if decodedPath.starts(with: "/o/") {
            let compactPath = "/" + decodedPath.dropFirst(3)
            return isWorkspaceViewerPath(compactPath) ? compactPath : nil
        }

        return isWorkspaceViewerPath(decodedPath) ? decodedPath : nil
    }

    private func workspaceUrl(fromUniversalLink url: URL) -> URL? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let workspace = components.queryItems?.first(where: { $0.name == "workspace" || $0.name == "w" })?.value,
              let workspaceURL = URL(string: workspace),
              ["https", "http"].contains(workspaceURL.scheme?.lowercased()) else {
            return nil
        }

        return workspaceURL
    }

    private func isWorkspaceViewerPath(_ value: String) -> Bool {
        value.starts(with: "/workspace/") || value.starts(with: "/workspace-file/")
    }

    private func workspaceID(matching url: URL) -> String? {
        guard let linkOrigin = origin(from: url) else { return nil }
        return workspaceProfiles.first { profile in
            guard let credentials = WorkspaceProfileStore.shared.credentials(for: profile.id),
                  let workspaceURL = URL(string: credentials.backendURL),
                  let workspaceOrigin = origin(from: workspaceURL) else {
                return false
            }
            return workspaceOrigin == linkOrigin
        }?.id
    }

    private func origin(from url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else {
            return nil
        }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    private func loginWithStoredPasswordIfAvailable() async {
        guard let password = WorkspaceProfileStore.shared.activeCredentials()?.password,
              !password.isEmpty else {
            return
        }
        do {
            try await api.login(password: password)
            await refreshSession()
        } catch {
            isAuthenticated = false
        }
    }

    private func savePasswordForActiveWorkspace(_ password: String) {
        guard var credentials = WorkspaceProfileStore.shared.activeCredentials() else { return }
        credentials.password = password
        _ = try? WorkspaceProfileStore.shared.save(credentials)
        refreshWorkspaceProfiles()
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

private final class LocationProvider: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<UserLocationSnapshot, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestLocation() async throws -> UserLocationSnapshot {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.main.async {
                guard self.continuation == nil else {
                    continuation.resume(throwing: LiloAPIError.backend("Lilo is already requesting location."))
                    return
                }
                self.continuation = continuation
                self.requestLocationWhenAuthorized()
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        requestLocationWhenAuthorized()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finish(with: LiloAPIError.backend("Could not read your location."))
            return
        }
        finish(with: UserLocationSnapshot(location: location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(with: error)
    }

    private func requestLocationWhenAuthorized() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finish(with: LiloAPIError.backend("Location sharing is not enabled for Lilo in Settings."))
        @unknown default:
            finish(with: LiloAPIError.backend("Location sharing is unavailable."))
        }
    }

    private func finish(with snapshot: UserLocationSnapshot) {
        continuation?.resume(returning: snapshot)
        continuation = nil
    }

    private func finish(with error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

private extension UserLocationSnapshot {
    init(location: CLLocation) {
        latitude = location.coordinate.latitude
        longitude = location.coordinate.longitude
        horizontalAccuracyMeters = location.horizontalAccuracy
        altitudeMeters = location.verticalAccuracy >= 0 ? location.altitude : nil
        courseDegrees = location.course >= 0 ? location.course : nil
        speedMetersPerSecond = location.speed >= 0 ? location.speed : nil
        capturedAt = ISO8601DateFormatter().string(from: location.timestamp)
        source = "ios_device"
    }
}
