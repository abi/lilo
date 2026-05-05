import SwiftUI
import UIKit

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var backendURL = APIClient.shared.baseURLString
    @State private var password = ""
    @State private var showSystemPrompt = false

    var body: some View {
        Form {
            Section("Deployment") {
                TextField("Backend URL", text: $backendURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                Button("Save and reconnect") {
                    Task { await model.saveBackendURL(backendURL) }
                }
                if let gitURL = model.workspacePreferences.gitBrowserUrl ?? model.workspacePreferences.gitRemoteUrl,
                   let url = URL(string: gitURL) {
                    Link("Open workspace Git remote", destination: url)
                }
            }

            Section("Authentication") {
                if model.authEnabled {
                    SecureField("Password", text: $password)
                    Button("Sign in again") {
                        Task { await model.login(password: password) }
                    }
                    .disabled(password.isEmpty)
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
