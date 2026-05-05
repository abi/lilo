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
        .refreshable { await model.refreshChats() }
    }
}

struct ChatRow: View {
    var chat: ChatSummary

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(chat.title.isEmpty ? "New chat" : chat.title)
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
        .navigationTitle(model.selectedChat?.title ?? "Chat")
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

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
            if message.role == .toolCall || message.role == .toolResult {
                Label(message.content, systemImage: message.role == .toolCall ? "hammer" : "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.thinMaterial, in: Capsule())
            } else {
                Text(message.content.isEmpty ? " " : message.content)
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

struct ComposerView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showFiles: Bool

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
