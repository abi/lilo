import SwiftUI
import UniformTypeIdentifiers

struct ChatHistoryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List(model.chats, selection: Binding(
            get: { model.selectedChat?.id },
            set: { id in if let id { Task { await model.selectChat(id) } } }
        )) { chat in
            ChatHistoryRow(chat: chat)
                .tag(chat.id)
        }
        .listStyle(.inset)
        .navigationTitle("Chats")
        .overlay {
            if model.chats.isEmpty {
                ContentUnavailableView("No chats yet", systemImage: "bubble.left", description: Text("Start a new chat from the toolbar."))
            }
        }
    }
}

struct ChatHistoryRow: View {
    var chat: ChatSummary

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: chat.status == "streaming" ? "waveform" : "bubble.left")
                .foregroundStyle(chat.status == "streaming" ? .green : .secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(displayChatTitle(chat.title))
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                Text(chat.status == "streaming" ? "Streaming" : relativeDate(chat.updatedAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ChatColumn: View {
    @EnvironmentObject private var model: AppModel
    @State private var showFileImporter = false

    var body: some View {
        VStack(spacing: 0) {
            if let chat = model.selectedChat {
                MessageList(messages: chat.messages)
                ComposerView(showFileImporter: $showFileImporter)
            } else {
                ContentUnavailableView("Select or create a chat", systemImage: "bubble.left.and.bubble.right")
            }
        }
        .navigationTitle(displayChatTitle(model.selectedChat?.title))
        .toolbar {
            ToolbarItemGroup {
                if model.isStreaming {
                    Button {
                        Task { await model.stopChat() }
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .foregroundStyle(.red)
                    }
                    .help("Stop")
                }
                if !model.models.isEmpty {
                    Menu {
                        ForEach(model.models) { option in
                            Button(option.modelId) {
                                Task { await model.updateSelectedChatModel(option) }
                            }
                        }
                    } label: {
                        Image(systemName: "cpu")
                    }
                    .help("Model")
                }
            }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                model.attachments.append(contentsOf: urls.compactMap(PickedFile.init(url:)))
            }
        }
    }
}

struct MessageList: View {
    var messages: [ChatMessage]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(18)
            }
            .onChange(of: messages.last?.content) { _, _ in
                withAnimation(.easeOut(duration: 0.18)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
        }
    }
}

struct MessageBubble: View {
    var message: ChatMessage
    private var isUser: Bool { message.role == .user }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
            if message.role == .toolCall || message.role == .toolResult {
                ToolMessageCard(message: message)
            } else if message.role == .thinking {
                DisclosureGroup("Thinking") {
                    Text(message.content)
                        .textSelection(.enabled)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(10)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                MarkdownContentView(markdown: isUser ? stripAdditionalContext(from: message.content) : message.content)
                    .textSelection(.enabled)
                    .padding(12)
                    .foregroundStyle(isUser ? .white : .primary)
                    .background(isUser ? Color.accentColor : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .frame(maxWidth: 760, alignment: isUser ? .trailing : .leading)
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

struct ToolMessageCard: View {
    var message: ChatMessage

    var body: some View {
        DisclosureGroup(message.toolName ?? (message.role == .toolCall ? "Tool call" : "Tool result")) {
            VStack(alignment: .leading, spacing: 8) {
                if let input = message.toolInput {
                    ToolBlock(title: "Input", content: input)
                }
                if !message.content.isEmpty {
                    ToolBlock(title: "Output", content: message.content)
                }
                if let details = message.toolDetails {
                    ToolBlock(title: "Details", content: details.prettyString)
                }
            }
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct ToolBlock: View {
    var title: String
    var content: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(content)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }
}

struct ComposerView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showFileImporter: Bool
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 8) {
            if !model.attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(model.attachments) { file in
                            Label(file.name, systemImage: file.mimeType.hasPrefix("image/") ? "photo" : "doc")
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(.thinMaterial, in: Capsule())
                        }
                    }
                    .padding(.horizontal, 12)
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    showFileImporter = true
                } label: {
                    Image(systemName: "paperclip")
                }
                .help("Attach files")

                TextField("Chat with Lilo...", text: $model.composerText, axis: .vertical)
                    .focused($focused)
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)
                    .padding(10)
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .onSubmit {
                        Task { await model.sendMessage() }
                    }

                Button {
                    Task { await model.sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .buttonStyle(.plain)
                .disabled(model.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.attachments.isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .background(.bar)
        .onChange(of: model.focusComposerRequest) { _, _ in focused = true }
    }
}

extension PickedFile {
    init?(url: URL) {
        guard url.startAccessingSecurityScopedResource() else { return nil }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: url) else { return nil }
        self.name = url.lastPathComponent
        self.mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        self.data = data
    }
}
