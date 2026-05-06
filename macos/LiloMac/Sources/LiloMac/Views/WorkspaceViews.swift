import SwiftUI
import WebKit

struct FilesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var searchText = ""
    @State private var expandedPaths: Set<String> = []

    private var visibleEntries: [WorkspaceEntry] {
        model.workspaceEntries.filter { $0.archived != true }
    }

    private var childrenByParent: [String: [WorkspaceEntry]] {
        Dictionary(grouping: visibleEntries) { $0.parentRelativePath ?? "" }
            .mapValues { entries in
                entries.sorted { left, right in
                    if isContainer(left) != isContainer(right) {
                        return isContainer(left)
                    }
                    return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
                }
            }
    }

    private var searchResults: [WorkspaceEntry] {
        guard !searchText.isEmpty else { return [] }
        return visibleEntries.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) || $0.relativePath.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        List(selection: Binding(
            get: { model.selectedViewerPath },
            set: { path in if let path { model.openViewer(path) } }
        )) {
            if searchText.isEmpty {
                ForEach(childrenByParent[""] ?? []) { entry in
                    WorkspaceTreeRow(
                        entry: entry,
                        depth: 0,
                        childrenByParent: childrenByParent,
                        expandedPaths: $expandedPaths
                    )
                }
            } else {
                ForEach(searchResults) { entry in
                    SearchFileRow(entry: entry)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search workspace")
        .navigationTitle("Files")
    }
}

struct WorkspaceTreeRow: View {
    @EnvironmentObject private var model: AppModel
    var entry: WorkspaceEntry
    var depth: Int
    var childrenByParent: [String: [WorkspaceEntry]]
    @Binding var expandedPaths: Set<String>

    private var children: [WorkspaceEntry] {
        childrenByParent[entry.relativePath] ?? []
    }

    private var isExpanded: Bool {
        expandedPaths.contains(entry.relativePath)
    }

    var body: some View {
        if isContainer(entry) {
            DisclosureGroup(isExpanded: Binding(
                get: { isExpanded },
                set: { expanded in
                    if expanded {
                        expandedPaths.insert(entry.relativePath)
                    } else {
                        expandedPaths.remove(entry.relativePath)
                    }
                }
            )) {
                ForEach(children) { child in
                    WorkspaceTreeRow(
                        entry: child,
                        depth: depth + 1,
                        childrenByParent: childrenByParent,
                        expandedPaths: $expandedPaths
                    )
                }
            } label: {
                Label(entry.name, systemImage: symbol(for: entry.kind))
                    .foregroundStyle(entry.kind == "app" ? .primary : .secondary)
            }
        } else if let viewerPath = entry.viewerPath {
            Label(entry.name, systemImage: symbol(for: entry.kind))
                .tag(viewerPath)
                .padding(.leading, CGFloat(depth) * 10)
        } else {
            Label(entry.name, systemImage: symbol(for: entry.kind))
                .foregroundStyle(.secondary)
                .padding(.leading, CGFloat(depth) * 10)
        }
    }
}

struct SearchFileRow: View {
    @EnvironmentObject private var model: AppModel
    var entry: WorkspaceEntry

    var body: some View {
        Button {
            if let viewerPath = entry.viewerPath {
                model.openViewer(viewerPath)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Label(entry.name, systemImage: symbol(for: entry.kind))
                Text(entry.parentRelativePath ?? "workspace")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(entry.viewerPath == nil)
    }
}

struct ViewerPane: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let path = model.selectedViewerPath {
            ViewerScreen(path: path)
        } else {
            HomeView(selection: .constant(.home))
        }
    }
}

struct ViewerScreen: View {
    var path: String

    var body: some View {
        let targetPath = viewerTargetPath(path)
        Group {
            if targetPath.starts(with: "/workspace-file/") {
                NativeFileViewer(path: targetPath)
            } else if let url = APIClient.shared.absoluteURL(for: targetPath) {
                WebView(url: url)
            } else {
                ContentUnavailableView("Cannot open item", systemImage: "exclamationmark.triangle")
            }
        }
        .navigationTitle(targetPath.split(separator: "/").last.map(String.init) ?? "Viewer")
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
            } else if isEditableTextLike {
                TextEditor(text: Binding(
                    get: { isJSON ? prettyJSON(text) : text },
                    set: {
                        text = $0
                        isDirty = true
                    }
                ))
                .font(.system(.body, design: .monospaced))
                .scrollContentBackground(.hidden)
                .padding()
            } else if mimeType.starts(with: "image/"), let image = NSImage(data: data) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding()
            } else {
                ContentUnavailableView("Preview unavailable", systemImage: "doc", description: Text("\(data.count) bytes"))
            }
        }
        .toolbar {
            ToolbarItemGroup {
                if isEditableTextLike {
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
        .task(id: path) { await load() }
    }

    private var isJSON: Bool {
        path.hasSuffix(".json") || mimeType.contains("json")
    }

    private var isEditableTextLike: Bool {
        mimeType.starts(with: "text/")
            || mimeType.contains("json")
            || [".md", ".json", ".txt", ".html", ".css", ".js", ".ts", ".tsx"].contains { path.hasSuffix($0) }
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

struct WebView: NSViewRepresentable {
    var url: URL

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        return WKWebView(frame: .zero, configuration: configuration)
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }
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

private func isContainer(_ entry: WorkspaceEntry) -> Bool {
    entry.kind == "directory" || entry.kind == "app"
}

private func viewerTargetPath(_ rawPath: String) -> String {
    guard rawPath.starts(with: "/?") || rawPath.starts(with: "?"),
          let components = URLComponents(string: rawPath),
          let encodedViewer = components.queryItems?.first(where: { $0.name == "viewer" })?.value,
          !encodedViewer.isEmpty else {
        return rawPath
    }
    return encodedViewer
}

private func prettyJSON(_ text: String) -> String {
    guard let data = text.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data),
          JSONSerialization.isValidJSONObject(object),
          let prettyData = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]),
          let pretty = String(data: prettyData, encoding: .utf8) else {
        return text
    }
    return pretty
}
