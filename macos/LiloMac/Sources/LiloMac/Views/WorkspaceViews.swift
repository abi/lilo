import SwiftUI
import WebKit
import PDFKit

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
        .transaction { transaction in
            transaction.animation = nil
        }
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    @State private var loadedPath: String?
    @State private var loadingPath: String?
    @State private var activeLoadID: UUID?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let loadedPath {
                preview(for: loadedPath)
                    .allowsHitTesting(loadedPath == path)
                    .overlay(alignment: .topTrailing) {
                        if loadedPath != path && isLoading {
                            ProgressView()
                                .controlSize(.small)
                                .padding(10)
                                .background(.regularMaterial, in: Capsule())
                                .padding()
                        }
                    }
            } else if isLoading {
                ProgressView()
                    .controlSize(.small)
            } else if let errorMessage {
                ContentUnavailableView("Could not open file", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
            } else {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .toolbar {
            ToolbarItemGroup {
                if canSaveCurrentFile {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!isDirty)
                }
                Button {
                    Task { await load(force: true) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .task(id: path) { await loadIfNeeded() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func preview(for previewPath: String) -> some View {
        if isMarkdown(previewPath) {
            MarkdownPreview(text: text)
        } else if isHTML(previewPath) {
            HTMLPreview(html: text, baseURL: APIClient.shared.absoluteURL(for: previewPath))
        } else if isJSON(previewPath) {
            JSONPreview(text: text)
        } else if isEditableTextLike(previewPath) {
            TextEditor(text: Binding(
                get: { text },
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
        } else if mimeType.contains("pdf") {
            PDFPreview(data: data)
        } else {
            ContentUnavailableView("Preview unavailable", systemImage: "doc", description: Text("\(data.count) bytes"))
        }
    }

    private func isJSON(_ previewPath: String) -> Bool {
        previewPath.localizedCaseInsensitiveContains(".json") || mimeType.contains("json")
    }

    private func isMarkdown(_ previewPath: String) -> Bool {
        previewPath.localizedCaseInsensitiveContains(".md") || mimeType.contains("markdown")
    }

    private func isHTML(_ previewPath: String) -> Bool {
        previewPath.localizedCaseInsensitiveContains(".html") || mimeType.contains("html")
    }

    private func isEditableTextLike(_ previewPath: String) -> Bool {
        mimeType.starts(with: "text/")
            || mimeType.contains("json")
            || [".md", ".json", ".txt", ".html", ".css", ".js", ".ts", ".tsx"].contains { previewPath.hasSuffix($0) }
    }

    private var canSaveCurrentFile: Bool {
        guard loadedPath == path else { return false }
        return isEditableTextLike(path) && !isMarkdown(path) && !isHTML(path) && !isJSON(path)
    }

    private func loadIfNeeded() async {
        guard loadedPath != path, loadingPath != path else { return }
        await load(force: false)
    }

    private func load(force: Bool) async {
        guard force || (loadedPath != path && loadingPath != path) else { return }
        let requestedPath = path
        let loadID = UUID()
        activeLoadID = loadID
        loadingPath = requestedPath
        if loadedPath != requestedPath {
            isLoading = true
        }
        errorMessage = nil
        do {
            let result = try await APIClient.shared.rawData(requestedPath)
            guard activeLoadID == loadID && path == requestedPath else { return }
            data = result.0
            mimeType = result.1 ?? "application/octet-stream"
            text = String(data: result.0, encoding: .utf8) ?? ""
            loadedPath = requestedPath
            isDirty = false
        } catch {
            guard activeLoadID == loadID && path == requestedPath else { return }
            if loadedPath == nil {
                errorMessage = error.localizedDescription
            }
        }
        if activeLoadID == loadID && loadingPath == requestedPath {
            loadingPath = nil
            activeLoadID = nil
            isLoading = false
        }
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

struct MarkdownPreview: View {
    var text: String

    var body: some View {
        ScrollView {
            MarkdownContentView(markdown: text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
    }
}

struct HTMLPreview: NSViewRepresentable {
    var html: String
    var baseURL: URL?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        return WKWebView(frame: .zero, configuration: configuration)
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let fingerprint = "\(html.hashValue):\(baseURL?.absoluteString ?? "")"
        if context.coordinator.lastFingerprint != fingerprint {
            context.coordinator.lastFingerprint = fingerprint
            webView.loadHTMLString(html, baseURL: baseURL)
        }
    }

    final class Coordinator {
        var lastFingerprint: String?
    }
}

struct JSONPreview: View {
    var text: String

    var body: some View {
        ScrollView([.vertical, .horizontal]) {
            Text(prettyJSON(text))
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct PDFPreview: NSViewRepresentable {
    var data: Data

    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        if view.document?.dataRepresentation() != data {
            view.document = PDFDocument(data: data)
        }
    }
}

struct WebView: NSViewRepresentable {
    var url: URL?
    @Binding var isReady: Bool

    init(url: URL?, isReady: Binding<Bool> = .constant(true)) {
        self.url = url
        _isReady = isReady
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.customUserAgent = "LiloNativeMac"
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard let url else {
            context.coordinator.lastRequestedURL = nil
            return
        }
        if context.coordinator.lastRequestedURL != url {
            context.coordinator.lastRequestedURL = url
            let requestedURL = url
            Task { @MainActor in
                await APIClient.shared.syncCookiesToWebKit(for: requestedURL)
                guard context.coordinator.lastRequestedURL == requestedURL else { return }

                var request = URLRequest(url: requestedURL, cachePolicy: .reloadIgnoringLocalCacheData)
                request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
                request.setValue("no-cache", forHTTPHeaderField: "Pragma")
                request.setValue("1", forHTTPHeaderField: "X-Lilo-Native-Viewer")
                request.setValue("LiloNativeMac", forHTTPHeaderField: "User-Agent")
                if let cookieHeader = APIClient.shared.cookieHeader(for: requestedURL) {
                    request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
                }
                webView.load(request)
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: WebView
        var lastRequestedURL: URL?

        init(_ parent: WebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 120_000_000)
                self?.parent.isReady = true
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isReady = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.isReady = true
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

func viewerTargetPath(_ rawPath: String) -> String {
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
