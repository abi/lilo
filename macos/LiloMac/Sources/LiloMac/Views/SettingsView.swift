import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var backendURL = APIClient.shared.baseURLString
    @State private var password = ""
    @State private var showSystemPrompt = false

    var body: some View {
        Form {
            Section("Deployment") {
                TextField("Backend URL", text: $backendURL)
                Button("Save and Reconnect") {
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
                    Button("Sign In Again") {
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
                ForEach(model.models) { option in
                    LabeledContent(option.modelId, value: option.routingProvider ?? option.provider)
                }
            }

            Section("Messaging channels") {
                ForEach(model.channels) { channel in
                    HStack {
                        Label(channel.label, systemImage: channelIcon(channel.id))
                        Spacer()
                        Text(channel.configured ? "Configured" : "Missing")
                            .foregroundStyle(channel.configured ? .green : .orange)
                    }
                }
                Button("Refresh Channels") {
                    Task { await model.refreshChannels() }
                }
            }

            Section("Prompt") {
                Button("Show full system prompt") {
                    showSystemPrompt = true
                    Task { await model.loadSystemPrompt() }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .sheet(isPresented: $showSystemPrompt) {
            ScrollView {
                Text(model.systemPrompt.isEmpty ? "Loading..." : model.systemPrompt)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .frame(minWidth: 720, minHeight: 520)
        }
    }
}

private func channelIcon(_ id: String) -> String {
    switch id {
    case "telegram": "paperplane"
    case "whatsapp": "phone.bubble"
    case "email": "envelope"
    default: "antenna.radiowaves.left.and.right"
    }
}
