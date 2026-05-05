import SwiftUI

struct FilesView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            if let path = model.selectedViewerPath {
                Section("Viewer") {
                    NavigationLink {
                        ViewerScreen(path: path)
                    } label: {
                        Label(path, systemImage: "rectangle.on.rectangle")
                            .lineLimit(1)
                    }
                }
            }

            Section("Apps") {
                ForEach(model.workspaceApps.filter { $0.archived != true }) { app in
                    Button {
                        model.openViewer(app.viewerPath)
                    } label: {
                        HStack {
                            AppIcon(app: app)
                            VStack(alignment: .leading) {
                                Text(app.label)
                                    .font(.headline)
                                if let description = app.description {
                                    Text(description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                }
            }

            Section("Files") {
                ForEach(model.workspaceEntries.filter { $0.viewerPath != nil && $0.archived != true }) { entry in
                    Button {
                        if let viewerPath = entry.viewerPath {
                            model.openViewer(viewerPath)
                        }
                    } label: {
                        HStack {
                            Image(systemName: symbol(for: entry.kind))
                            VStack(alignment: .leading) {
                                Text(entry.name)
                                Text(entry.parentRelativePath ?? "workspace")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Files")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshWorkspace() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .navigationDestination(item: Binding(
            get: { model.selectedViewerPath.map(ViewerRoute.init(path:)) },
            set: { model.selectedViewerPath = $0?.path }
        )) { route in
            ViewerScreen(path: route.path)
        }
        .refreshable { await model.refreshWorkspace() }
    }

    private func symbol(for kind: String) -> String {
        switch kind {
        case "markdown": "doc.richtext"
        case "image": "photo"
        case "json", "code": "chevron.left.forwardslash.chevron.right"
        case "directory": "folder"
        case "app": "app"
        default: "doc"
        }
    }
}

struct ViewerRoute: Identifiable, Hashable {
    var path: String
    var id: String { path }
}

struct ViewerScreen: View {
    var path: String

    var body: some View {
        Group {
            if path.starts(with: "/workspace-file/") {
                NativeFileViewer(path: path)
            } else if let url = APIClient.shared.absoluteURL(for: path) {
                WebView(url: url)
            } else {
                ContentUnavailableView("Cannot open file", systemImage: "exclamationmark.triangle")
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var title: String {
        path.split(separator: "/").last.map(String.init) ?? "Viewer"
    }
}

struct NativeFileViewer: View {
    var path: String
    @State private var data = Data()
    @State private var mimeType = ""
    @State private var text = ""
    @State private var isDirty = false
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading...")
            } else if let errorMessage {
                ContentUnavailableView("Could not open file", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
            } else if isTextLike {
                TextEditor(text: Binding(
                    get: { text },
                    set: {
                        text = $0
                        isDirty = true
                    }
                ))
                .font(.system(.body, design: .monospaced))
                .padding(.horizontal)
            } else if mimeType.starts(with: "image/"), let image = UIImage(data: data) {
                ScrollView([.horizontal, .vertical]) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .padding()
                }
            } else if mimeType.contains("pdf") {
                PDFPreview(data: data)
            } else {
                ContentUnavailableView("Preview unavailable", systemImage: "doc", description: Text("\(data.count) bytes"))
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if isTextLike {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!isDirty)
                }
                Button {
                    Task { await load() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .task {
            await load()
        }
    }

    private var isTextLike: Bool {
        mimeType.starts(with: "text/")
            || mimeType.contains("json")
            || path.hasSuffix(".md")
            || path.hasSuffix(".json")
            || path.hasSuffix(".txt")
            || path.hasSuffix(".html")
            || path.hasSuffix(".css")
            || path.hasSuffix(".js")
            || path.hasSuffix(".ts")
            || path.hasSuffix(".tsx")
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let result = try await APIClient.shared.rawData(path)
            data = result.0
            mimeType = result.1 ?? "application/octet-stream"
            text = String(data: result.0, encoding: .utf8) ?? ""
            isDirty = false
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func save() async {
        do {
            try await APIClient.shared.writeWorkspaceFile(path, text: text)
            isDirty = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct AppIcon: View {
    var app: WorkspaceAppLink

    var body: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(.thinMaterial)
            .frame(width: 44, height: 44)
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
