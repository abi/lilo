import SwiftUI
import UIKit

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showSystemPrompt = false
    @State private var showAddWorkspace = false

    var body: some View {
        Form {
            Section("Workspaces") {
                if let activeProfile {
                    WorkspaceSummaryCard(profile: activeProfile, isActive: true)
                } else {
                    Text("No saved workspaces.")
                        .foregroundStyle(.secondary)
                }

                NavigationLink {
                    WorkspaceSwitcherView()
                } label: {
                    Label("Switch workspace", systemImage: "arrow.triangle.2.circlepath")
                }

                if let activeProfile {
                    NavigationLink {
                        EditWorkspaceView(profile: activeProfile)
                    } label: {
                        Label("Edit current workspace", systemImage: "slider.horizontal.3")
                    }
                }

                Button {
                    showAddWorkspace = true
                } label: {
                    Label("Add workspace", systemImage: "plus")
                }
            }

            Section("Current workspace") {
                if let credentials = WorkspaceProfileStore.shared.activeCredentials() {
                    LabeledContent("Name", value: credentials.name)
                    LabeledContent("Backend", value: credentials.backendURL)
                }
                if let gitURL = model.workspacePreferences.gitBrowserUrl ?? model.workspacePreferences.gitRemoteUrl,
                   let url = URL(string: gitURL) {
                    Link("Open workspace Git remote", destination: url)
                }
            }

            Section("Authentication") {
                if model.authEnabled {
                    Button("Sign in again") {
                        Task { await model.login(password: activePassword) }
                    }
                    .disabled(activePassword.isEmpty)
                } else {
                    Label("Auth disabled", systemImage: "lock.open")
                }
            }

            Section("Default model") {
                if let selection = model.workspacePreferences.defaultChatModelSelection {
                    LabeledContent("Current", value: selection.modelId)
                } else {
                    Text("Server default")
                        .foregroundStyle(.secondary)
                }
                if !model.models.isEmpty {
                    ForEach(model.models) { option in
                        LabeledContent(option.modelId, value: option.routingProvider ?? option.provider)
                    }
                }
            }

            Section("Messaging channels") {
                if model.channels.isEmpty {
                    Text("No channel status loaded.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(model.channels) { channel in
                        ChannelStatusRow(channel: channel)
                    }
                }
                Button("Refresh channels") {
                    Task { await model.refreshChannels() }
                }
            }

            Section("Workspace") {
                LabeledContent("Time zone", value: model.workspacePreferences.timeZone)
                if let outputChannel = model.workspacePreferences.automationOutputChannel {
                    LabeledContent("Automation channel", value: outputChannel)
                }
            }

            Section("Prompt") {
                Button("Show full system prompt") {
                    showSystemPrompt = true
                    Task { await model.loadSystemPrompt() }
                }
            }
        }
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshAll() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .sheet(isPresented: $showSystemPrompt) {
            NavigationStack {
                ScrollView {
                    Text(model.systemPrompt.isEmpty ? "Loading..." : model.systemPrompt)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                .navigationTitle("System Prompt")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { showSystemPrompt = false }
                    }
                }
            }
        }
        .sheet(isPresented: $showAddWorkspace) {
            AddWorkspaceView()
        }
    }

    private var activeProfile: WorkspaceProfile? {
        model.workspaceProfiles.first { $0.id == model.activeWorkspaceID }
    }

    private var activePassword: String {
        WorkspaceProfileStore.shared.activeCredentials()?.password ?? ""
    }
}

struct WorkspaceSwitcherView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showAddWorkspace = false

    var body: some View {
        Form {
            if let activeProfile {
                Section("Active") {
                    WorkspaceSummaryCard(profile: activeProfile, isActive: true)
                }
            }

            Section("Saved Workspaces") {
                if model.workspaceProfiles.isEmpty {
                    Text("No saved workspaces.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(model.workspaceProfiles) { profile in
                        Button {
                            guard profile.id != model.activeWorkspaceID else { return }
                            Task { await model.switchWorkspace(profile.id) }
                        } label: {
                            WorkspaceSwitchRow(profile: profile, isActive: profile.id == model.activeWorkspaceID)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Section {
                Button {
                    showAddWorkspace = true
                } label: {
                    Label("Add workspace", systemImage: "plus")
                }
            }
        }
        .navigationTitle("Switch Workspace")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddWorkspace = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddWorkspace) {
            AddWorkspaceView()
        }
    }

    private var activeProfile: WorkspaceProfile? {
        model.workspaceProfiles.first { $0.id == model.activeWorkspaceID }
    }
}

struct WorkspaceSwitchRow: View {
    var profile: WorkspaceProfile
    var isActive: Bool

    var body: some View {
        HStack(spacing: 12) {
            WorkspaceIcon(isActive: isActive)
            WorkspaceText(profile: profile)
            Spacer()
            if isActive {
                Text("Active")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
            } else {
                Image(systemName: "arrow.right.circle")
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
    }
}

struct WorkspaceSummaryCard: View {
    var profile: WorkspaceProfile
    var isActive: Bool

    var body: some View {
        HStack(spacing: 12) {
            WorkspaceIcon(isActive: isActive)
            WorkspaceText(profile: profile)
            Spacer()
            if isActive {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.blue)
            }
        }
        .padding(.vertical, 6)
    }
}

struct WorkspaceText: View {
    var profile: WorkspaceProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(profile.name)
                .font(.headline)
                .foregroundStyle(.primary)
            Text(backendURL)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var backendURL: String {
        WorkspaceProfileStore.shared.credentials(for: profile.id)?.backendURL ?? "Missing URL"
    }
}

struct WorkspaceIcon: View {
    var isActive: Bool

    var body: some View {
        Image(systemName: isActive ? "building.2.crop.circle.fill" : "building.2.crop.circle")
            .font(.title3)
            .foregroundStyle(isActive ? .blue : .secondary)
            .frame(width: 30, height: 30)
    }
}

struct EditWorkspaceView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let profile: WorkspaceProfile
    @State private var workspaceName: String
    @State private var backendURL: String
    @State private var password: String

    init(profile: WorkspaceProfile) {
        self.profile = profile
        let credentials = WorkspaceProfileStore.shared.credentials(for: profile.id)
        _workspaceName = State(initialValue: credentials?.name ?? profile.name)
        _backendURL = State(initialValue: credentials?.backendURL ?? "")
        _password = State(initialValue: credentials?.password ?? "")
    }

    var body: some View {
        Form {
            Section("Workspace") {
                TextField("Workspace name", text: $workspaceName)
                TextField("Backend URL", text: $backendURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                SecureField("Password", text: $password)
            }

            Section {
                Button("Delete workspace", role: .destructive) {
                    Task {
                        await model.deleteWorkspace(profile)
                        dismiss()
                    }
                }
            }
        }
        .navigationTitle("Edit Workspace")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task {
                        await model.updateWorkspace(
                            id: profile.id,
                            name: workspaceName,
                            backendURL: backendURL,
                            password: password
                        )
                        dismiss()
                    }
                }
                .disabled(!canSave)
            }
        }
    }

    private var canSave: Bool {
        !backendURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct AddWorkspaceView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var workspaceName = ""
    @State private var backendURL = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Workspace") {
                    TextField("Workspace name", text: $workspaceName)
                    TextField("Backend URL", text: $backendURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("Password", text: $password)
                }
            }
            .navigationTitle("Add Workspace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await model.signIntoWorkspace(
                                id: nil,
                                name: workspaceName,
                                backendURL: backendURL,
                                password: password
                            )
                            dismiss()
                        }
                    }
                    .disabled(!canAdd)
                }
            }
        }
    }

    private var canAdd: Bool {
        !backendURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !password.isEmpty
    }
}

struct ChannelStatusRow: View {
    var channel: ChannelStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label(channel.label, systemImage: icon)
                    .font(.headline)
                Spacer()
                Text(channel.configured ? "Configured" : "Missing")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(channel.configured ? .green : .orange)
            }
            if let provider = channel.provider {
                Text(provider)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let missing = channel.missing, !missing.isEmpty {
                Text("Missing: \(missing.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if let details = channel.details, !details.isEmpty {
                DisclosureGroup("Details") {
                    ForEach(details) { detail in
                        LabeledContent(detail.label, value: formatted(detail))
                    }
                }
                .font(.subheadline)
            }
            DisclosureGroup("Setup") {
                ChannelSetupGuide(channel: channel)
            }
            .font(.subheadline)
        }
        .padding(.vertical, 4)
    }

    private var icon: String {
        switch channel.id {
        case "telegram": "paperplane"
        case "whatsapp": "phone.bubble"
        case "email": "envelope"
        default: "antenna.radiowaves.left.and.right"
        }
    }

    private func formatted(_ detail: ChannelConfigValue) -> String {
        if detail.label == "Agent number" || detail.label == "Allowed senders" {
            return formatPhoneList(detail.value)
        }
        return detail.value
    }
}

struct ChannelSetupGuide: View {
    var channel: ChannelStatus
    @State private var generatedTelegramSecret: String?
    @State private var setupMessage: String?
    @State private var isWorking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(setupSteps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(index + 1)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                        .background(.quaternary, in: Circle())
                    Text(step)
                        .font(.caption)
                }
            }

            if channel.id == "telegram" {
                HStack {
                    Button("Generate webhook secret") {
                        let secret = randomHexSecret()
                        generatedTelegramSecret = secret
                        UIPasteboard.general.string = secret
                        setupMessage = "Copied TELEGRAM_WEBHOOK_SECRET. Add it to env vars and redeploy."
                    }
                    Button(isWorking ? "Configuring..." : "Configure webhook") {
                        Task { await configureTelegramWebhook() }
                    }
                    .disabled(isWorking || !hasDetail("Bot token") || !hasDetail("Webhook secret"))
                }
                .buttonStyle(.bordered)
            }

            if channel.id == "email" {
                Button(isWorking ? "Creating..." : "Create Resend webhook") {
                    Task { await createResendWebhook() }
                }
                .buttonStyle(.bordered)
                .disabled(isWorking || !hasDetail("API key"))
            }

            if let generatedTelegramSecret {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TELEGRAM_WEBHOOK_SECRET")
                        .font(.caption.weight(.semibold))
                    Text(generatedTelegramSecret)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                }
                .padding(8)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            }

            if let setupMessage {
                Text(setupMessage)
                    .font(.caption)
                    .foregroundStyle(setupMessage.lowercased().contains("failed") ? .red : .green)
            }
        }
    }

    private var setupSteps: [String] {
        switch channel.id {
        case "email":
            [
                "Create a Resend API key that can send email and manage webhooks. Set RESEND_API_KEY and redeploy.",
                "Choose the inbound address people email. Use a Resend receiving address or your own receiving domain.",
                "Set LILO_EMAIL_AGENT_ADDRESS, LILO_EMAIL_REPLY_FROM, and LILO_EMAIL_ALLOWED_SENDERS.",
                "Tap Create Resend webhook. Lilo creates the email.received webhook and returns RESEND_WEBHOOK_SECRET.",
                "Copy RESEND_WEBHOOK_SECRET into env vars, redeploy, then send a test email from an allowed sender."
            ]
        case "telegram":
            [
                "Create a bot with BotFather and set TELEGRAM_BOT_TOKEN.",
                "Generate a webhook secret here, set TELEGRAM_WEBHOOK_SECRET, and redeploy.",
                "Set LILO_TELEGRAM_ALLOWED_USER_IDS to numeric Telegram user IDs, separated by commas.",
                "Tap Configure webhook. Lilo calls Telegram setWebhook for /api/inbound-telegram using the deployed secret.",
                "Message the bot from an allowed user ID."
            ]
        default:
            [
                "In Twilio, copy Account SID and Auth Token into TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
                "Use the WhatsApp sandbox for testing or create an approved WhatsApp sender for production.",
                "Set LILO_WHATSAPP_AGENT_NUMBER and LILO_WHATSAPP_ALLOWED_SENDERS in whatsapp:+15555550123 format.",
                "In Twilio, set the inbound message webhook to your deployment's /api/inbound-whatsapp using HTTP POST.",
                "Redeploy, then send WhatsApp from an allowed sender."
            ]
        }
    }

    private func hasDetail(_ label: String) -> Bool {
        channel.details?.first(where: { $0.label == label })?.value == "Set"
    }

    private func configureTelegramWebhook() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let response = try await APIClient.shared.configureTelegramWebhook()
            setupMessage = "Webhook configured: \(response.webhookUrl)"
        } catch {
            setupMessage = "Failed: \(error.localizedDescription)"
        }
    }

    private func createResendWebhook() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let response = try await APIClient.shared.createResendWebhook()
            UIPasteboard.general.string = response.signingSecret
            setupMessage = "Created webhook \(response.webhookId). Copied RESEND_WEBHOOK_SECRET for \(response.webhookUrl)."
        } catch {
            setupMessage = "Failed: \(error.localizedDescription)"
        }
    }
}

private func randomHexSecret() -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return bytes.map { String(format: "%02x", $0) }.joined()
}

private func formatPhoneList(_ value: String) -> String {
    value
        .split(separator: ",")
        .map { formatPhone(String($0)) }
        .joined(separator: ", ")
}

private func formatPhone(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: #"^whatsapp:"#, with: "", options: .regularExpression)
    let digits = trimmed.filter(\.isNumber)
    if digits.count == 11, digits.first == "1" {
        let area = digits.dropFirst().prefix(3)
        let prefix = digits.dropFirst(4).prefix(3)
        let suffix = digits.suffix(4)
        return "+1 (\(area)) \(prefix)-\(suffix)"
    }
    if trimmed.hasPrefix("+"), !digits.isEmpty {
        return "+\(digits)"
    }
    return trimmed
}
