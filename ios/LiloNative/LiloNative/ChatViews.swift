import SwiftUI

struct ChatListView: View {
    @EnvironmentObject private var model: AppModel

    private var groups: [ChatDateGroup] {
        groupChatsByDate(model.chats)
    }

    var body: some View {
        List {
            if model.chats.isEmpty {
                ContentUnavailableView("No chats yet", systemImage: "bubble.left", description: Text("Start a new chat with Lilo."))
            } else {
                ForEach(groups) { group in
                    Section {
                        ForEach(group.chats) { chat in
                            NavigationLink {
                                ChatDetailView(chatId: chat.id)
                            } label: {
                                ChatRow(chat: chat)
                            }
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                        }
                    } header: {
                        Text(group.label)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                            .tracking(1.2)
                    }
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
    @State private var showCamera = false

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
                        Color.clear
                            .frame(height: 1)
                            .id(ChatBottomAnchor.id)
                    }
                    .padding()
                }
                .task(id: model.selectedChat?.id) {
                    try? await Task.sleep(nanoseconds: 120_000_000)
                    proxy.scrollTo(ChatBottomAnchor.id, anchor: .bottom)
                }
                .onChange(of: model.selectedChat?.messages.last?.content) { _, _ in
                    if model.selectedChat?.id == chatId {
                        withAnimation { proxy.scrollTo(ChatBottomAnchor.id, anchor: .bottom) }
                    }
                }
            }

            ComposerView(showFiles: $showFiles, showCamera: $showCamera)
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
        .sheet(isPresented: $showCamera) {
            CameraPicker { file in
                model.attachments.append(file)
            }
        }
        .task {
            if model.selectedChat?.id != chatId {
                await model.selectChat(chatId)
            }
        }
    }
}

private enum ChatBottomAnchor {
    static let id = "chat-bottom-anchor"
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
            } else if message.role == .assistant || message.role == .system {
                MarkdownContentView(markdown: displayContent)
                    .textSelection(.enabled)
                    .padding(12)
                    .foregroundStyle(.primary)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
    @Binding var showCamera: Bool
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

                Button {
                    showCamera = true
                } label: {
                    Image(systemName: "camera.fill")
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

struct MarkdownContentView: View {
    @EnvironmentObject private var model: AppModel
    var markdown: String

    private var blocks: [MarkdownBlock] {
        parseMarkdownBlocks(markdown)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .heading(let level, let text):
                    Text(inlineMarkdown(text))
                        .font(headingFont(level))
                        .frame(maxWidth: .infinity, alignment: .leading)
                case .paragraph(let text):
                    Text(inlineMarkdown(text))
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                case .bullet(let level, let text):
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•")
                            .font(.body.weight(.semibold))
                            .frame(width: 12 + CGFloat(level) * 14, alignment: .trailing)
                        Text(inlineMarkdown(text))
                            .font(.body)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                case .quote(let text):
                    HStack(alignment: .top, spacing: 10) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.secondary.opacity(0.35))
                            .frame(width: 3)
                        Text(inlineMarkdown(text))
                            .font(.body.italic())
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                case .code(let text):
                    ScrollView(.horizontal, showsIndicators: true) {
                        Text(text)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .padding(10)
                    }
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color(.separator), lineWidth: 0.5)
                    }
                case .rule:
                    Rectangle()
                        .fill(Color(.separator))
                        .frame(height: 1)
                }
            }
        }
        .environment(\.openURL, OpenURLAction { url in
            if let viewerPath = workspaceViewerPath(from: url) {
                model.openViewer(viewerPath)
                return .handled
            }
            return .systemAction
        })
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: .title2.weight(.bold)
        case 2: .title3.weight(.bold)
        case 3: .headline.weight(.bold)
        default: .subheadline.weight(.bold)
        }
    }
}

private enum MarkdownBlock {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bullet(level: Int, text: String)
    case quote(String)
    case code(String)
    case rule
}

private func parseMarkdownBlocks(_ markdown: String) -> [MarkdownBlock] {
    let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    var blocks: [MarkdownBlock] = []
    var paragraph: [String] = []
    var codeLines: [String] = []
    var inCodeFence = false

    func flushParagraph() {
        let text = paragraph.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            blocks.append(.paragraph(text))
        }
        paragraph.removeAll()
    }

    for line in lines {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("```") {
            if inCodeFence {
                blocks.append(.code(codeLines.joined(separator: "\n")))
                codeLines.removeAll()
                inCodeFence = false
            } else {
                flushParagraph()
                inCodeFence = true
            }
            continue
        }

        if inCodeFence {
            codeLines.append(line)
            continue
        }

        if trimmed.isEmpty {
            flushParagraph()
            continue
        }

        if trimmed == "---" || trimmed == "***" || trimmed == "___" {
            flushParagraph()
            blocks.append(.rule)
            continue
        }

        if let heading = parseHeading(trimmed) {
            flushParagraph()
            blocks.append(.heading(level: heading.level, text: heading.text))
            continue
        }

        if let bullet = parseBullet(line) {
            flushParagraph()
            blocks.append(.bullet(level: bullet.level, text: bullet.text))
            continue
        }

        if trimmed.hasPrefix(">") {
            flushParagraph()
            blocks.append(.quote(String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces)))
            continue
        }

        paragraph.append(trimmed)
    }

    if inCodeFence {
        blocks.append(.code(codeLines.joined(separator: "\n")))
    }
    flushParagraph()
    return blocks.isEmpty ? [.paragraph(markdown)] : blocks
}

private func parseHeading(_ line: String) -> (level: Int, text: String)? {
    let hashes = line.prefix { $0 == "#" }.count
    guard hashes > 0, hashes <= 6, line.dropFirst(hashes).first == " " else {
        return nil
    }
    return (hashes, String(line.dropFirst(hashes)).trimmingCharacters(in: .whitespaces))
}

private func parseBullet(_ line: String) -> (level: Int, text: String)? {
    let leadingSpaces = line.prefix { $0 == " " }.count
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    for marker in ["- ", "* ", "+ "] {
        if trimmed.hasPrefix(marker) {
            return (leadingSpaces / 2, String(trimmed.dropFirst(marker.count)))
        }
    }
    if let match = trimmed.firstMatch(of: /^\d+\.\s+(.+)$/) {
        return (leadingSpaces / 2, String(match.1))
    }
    return nil
}

private func inlineMarkdown(_ text: String) -> AttributedString {
    var options = AttributedString.MarkdownParsingOptions()
    options.interpretedSyntax = .inlineOnlyPreservingWhitespace
    return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
}

private func workspaceViewerPath(from url: URL) -> String? {
    let raw = url.absoluteString.removingPercentEncoding ?? url.absoluteString
    let path = url.path.removingPercentEncoding ?? url.path

    for value in [path, raw] {
        if value.starts(with: "/workspace-file/") || value.starts(with: "/workspace/") {
            return value
        }
    }

    if url.scheme == nil {
        return raw.starts(with: "/") ? raw : "/workspace-file/\(raw)"
    }

    return nil
}

struct ChatDateGroup: Identifiable {
    var label: String
    var chats: [ChatSummary]

    var id: String { label }
}

func groupChatsByDate(_ chats: [ChatSummary]) -> [ChatDateGroup] {
    let calendar = Calendar.current
    let now = Date()
    let todayStart = calendar.startOfDay(for: now)
    let yesterdayStart = calendar.date(byAdding: .day, value: -1, to: todayStart) ?? todayStart
    let weekStart = calendar.date(byAdding: .day, value: -6, to: todayStart) ?? todayStart
    var groups: [String: [ChatSummary]] = [:]
    var order: [String] = []

    for chat in chats {
        let date = parseISODate(chat.updatedAt) ?? now
        let label: String
        if date >= todayStart {
            label = "Today"
        } else if date >= yesterdayStart {
            label = "Yesterday"
        } else if date >= weekStart {
            label = "This Week"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = date.year == now.year ? "MMMM" : "MMMM yyyy"
            label = formatter.string(from: date)
        }

        if groups[label] == nil {
            groups[label] = []
            order.append(label)
        }
        groups[label]?.append(chat)
    }

    return order.map { ChatDateGroup(label: $0, chats: groups[$0] ?? []) }
}

private func parseISODate(_ isoString: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: isoString) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: isoString)
}

private extension Date {
    var year: Int {
        Calendar.current.component(.year, from: self)
    }
}
