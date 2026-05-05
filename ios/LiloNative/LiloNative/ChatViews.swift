import SwiftUI

struct ChatListView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            if model.chats.isEmpty {
                ContentUnavailableView("No chats yet", systemImage: "bubble.left", description: Text("Start a new chat with Lilo."))
            } else {
                ForEach(model.chats) { chat in
                    NavigationLink {
                        ChatDetailView(chatId: chat.id)
                    } label: {
                        ChatRow(chat: chat)
                    }
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Chats")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.createChat() }
                } label: {
                    Label("New Chat", systemImage: "plus")
                }
            }
        }
        .navigationDestination(item: Binding(
            get: { model.pendingChatNavigationId.map(ChatRoute.init(id:)) },
            set: { model.pendingChatNavigationId = $0?.id }
        )) { route in
            ChatDetailView(chatId: route.id)
        }
        .refreshable { await model.refreshChats() }
    }
}

struct ChatRoute: Identifiable, Hashable {
    var id: String
}

struct ChatRow: View {
    var chat: ChatSummary

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(displayChatTitle(chat.title))
                    .font(.body.weight(.semibold))
                    .lineLimit(2)
                HStack {
                    if chat.status == "streaming" {
                        Label("Streaming", systemImage: "waveform")
                            .foregroundStyle(.green)
                    } else {
                        Text(relativeDate(chat.updatedAt))
                    }
                    Text(chat.modelId)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if chat.status == "streaming" {
                ProgressView()
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct ChatDetailView: View {
    @EnvironmentObject private var model: AppModel
    var chatId: String
    @State private var showFiles = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(model.selectedChat?.messages ?? []) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                        if model.isStreaming {
                            HStack {
                                ProgressView()
                                Text("Thinking")
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                        }
                    }
                    .padding()
                }
                .onChange(of: model.selectedChat?.messages.last?.content) { _, _ in
                    if let id = model.selectedChat?.messages.last?.id {
                        withAnimation { proxy.scrollTo(id, anchor: .bottom) }
                    }
                }
            }

            ComposerView(showFiles: $showFiles)
        }
        .navigationTitle(displayChatTitle(model.selectedChat?.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if model.isStreaming {
                    Button {
                        Task { await model.stopChat() }
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .foregroundStyle(.red)
                    }
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
                }
            }
        }
        .sheet(isPresented: $showFiles) {
            DocumentPicker { files in
                model.attachments.append(contentsOf: files)
            }
        }
        .task {
            if model.selectedChat?.id != chatId {
                await model.selectChat(chatId)
            }
        }
    }
}

struct MessageBubble: View {
    var message: ChatMessage

    var isUser: Bool { message.role == .user }
    var displayContent: String {
        if isUser {
            return stripAdditionalContext(from: message.content)
        }
        return message.content
    }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
            if message.role == .thinking {
                ThinkingBubble(content: message.content)
            } else if message.role == .toolCall || message.role == .toolResult {
                ToolMessageCard(message: message)
            } else {
                Text(displayContent.isEmpty ? " " : displayContent)
                    .textSelection(.enabled)
                    .padding(12)
                    .foregroundStyle(isUser ? .white : .primary)
                    .background(isUser ? Color.black : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }

            if let attachments = message.attachments, !attachments.isEmpty {
                ForEach(attachments) { attachment in
                    Label(attachment.name, systemImage: attachment.kind == "image" ? "photo" : "paperclip")
                        .font(.caption)
                        .padding(8)
                        .background(.thinMaterial, in: Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

struct ThinkingBubble: View {
    var content: String

    var body: some View {
        DisclosureGroup {
            Text(content)
                .font(.subheadline.italic())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        } label: {
            Label("Thinking", systemImage: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct ToolMessageCard: View {
    var message: ChatMessage

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 10) {
                if let input = message.toolInput, !input.isEmpty {
                    ToolBlock(title: "Input", content: input)
                }
                if !message.content.isEmpty {
                    ToolBlock(title: message.role == .toolResult ? "Output" : "Status", content: message.content)
                }
                if let details = message.toolDetails {
                    ToolBlock(title: "Details", content: details.prettyString)
                }
            }
            .padding(.top, 6)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                Text(summary)
                    .font(.system(.subheadline, design: .monospaced))
                    .lineLimit(1)
                Spacer()
                if message.isError == true {
                    Text("Error")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
            .foregroundStyle(message.isError == true ? .red : .secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var icon: String {
        if message.role == .toolCall { return "hammer" }
        return message.isError == true ? "exclamationmark.triangle" : "checkmark.circle"
    }

    private var summary: String {
        guard let toolName = message.toolName, !toolName.isEmpty else {
            return message.role == .toolCall ? "Tool call" : "Tool result"
        }
        switch toolName.lowercased() {
        case "bash":
            return message.role == .toolCall ? "Run command" : "Command result"
        case "read":
            return "Read file"
        case "write":
            return "Write file"
        case "edit":
            return "Edit file"
        case "open_app":
            return "Open app"
        default:
            return toolName
        }
    }
}

struct ToolBlock: View {
    var title: String
    var content: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.tertiary)
            ScrollView(.horizontal, showsIndicators: true) {
                Text(content)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}

struct ComposerView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showFiles: Bool
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            if !model.attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(model.attachments) { file in
                            Label(file.name, systemImage: file.mimeType.hasPrefix("image/") ? "photo" : "doc")
                                .font(.caption)
                                .padding(8)
                                .background(.thinMaterial, in: Capsule())
                        }
                    }
                    .padding(.horizontal)
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    showFiles = true
                } label: {
                    Image(systemName: "paperclip")
                        .font(.title3)
                }

                TextField("Chat with Lilo...", text: $model.composerText, axis: .vertical)
                    .focused($isComposerFocused)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .padding(10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                Button {
                    Task { await model.sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                }
                .disabled(model.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.attachments.isEmpty)
            }
            .padding([.horizontal, .bottom])
        }
        .background(.bar)
        .onChange(of: model.focusComposerRequest) { _, _ in
            isComposerFocused = true
        }
    }
}

func relativeDate(_ isoString: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: isoString) {
        return date.formatted(.relative(presentation: .named))
    }
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: isoString) else { return isoString }
    return date.formatted(.relative(presentation: .named))
}

func displayChatTitle(_ title: String?) -> String {
    let trimmed = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed.lowercased() == "(no messages)" {
        return "New chat"
    }
    return trimmed
}

func stripAdditionalContext(from content: String) -> String {
    content.replacing(
        /(?s)\n*<additional_context>.*?<\/additional_context>/,
        with: ""
    )
    .trimmingCharacters(in: .whitespacesAndNewlines)
}
