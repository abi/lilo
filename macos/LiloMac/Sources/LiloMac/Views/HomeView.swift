import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: AppSection

    var body: some View {
        Group {
            if let path = model.selectedViewerPath, path.starts(with: "/workspace/") {
                ViewerScreen(path: path)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Home")
                            .font(.largeTitle.weight(.bold))

                        SectionHeader("Apps")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 14)], spacing: 14) {
                            ForEach(model.workspaceApps.filter { $0.archived != true }) { app in
                                Button {
                                    selection = .home
                                    model.openViewer(app.viewerPath)
                                } label: {
                                    VStack(spacing: 10) {
                                        AppIcon(app: app, size: 54)
                                        Text(app.label)
                                            .font(.callout.weight(.medium))
                                            .lineLimit(1)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(12)
                                }
                                .buttonStyle(.plain)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                        }

                        SectionHeader("Recent chats")
                        VStack(spacing: 8) {
                            ForEach(model.chats.prefix(6)) { chat in
                                Button {
                                    Task { await model.selectChat(chat.id) }
                                } label: {
                                    ChatHistoryRow(chat: chat)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .navigationTitle("Home")
    }
}

struct SectionHeader: View {
    var title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .foregroundStyle(.secondary)
    }
}

struct AppIcon: View {
    var app: WorkspaceAppLink
    var size: CGFloat = 44

    var body: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(.thinMaterial)
            .frame(width: size, height: size)
            .overlay {
                if let iconHref = app.iconHref, let url = APIClient.shared.absoluteURL(for: iconHref) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Image(systemName: "app")
                    }
                    .padding(6)
                } else {
                    Image(systemName: "app")
                }
            }
    }
}
