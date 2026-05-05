import SwiftUI
import WebKit

struct FilesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var expandedPaths: Set<String> = []

    var body: some View {
        List(selection: Binding(
            get: { model.selectedViewerPath },
            set: { if let path = $0 { model.openViewer(path) } }
        )) {
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

            Section("Workspace") {
                WorkspaceTreeList(expandedPaths: $expandedPaths)
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
}

struct WorkspaceTreeList: View {
    @EnvironmentObject private var model: AppModel
    @Binding var expandedPaths: Set<String>

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

    private var visibleEntries: [WorkspaceEntry] {
        model.workspaceEntries.filter { $0.archived != true }
    }

    var body: some View {
        ForEach(childrenByParent[""] ?? []) { entry in
            WorkspaceTreeRow(
                entry: entry,
                depth: 0,
                childrenByParent: childrenByParent,
                expandedPaths: $expandedPaths
            )
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

    private var expanded: Bool {
        expandedPaths.contains(entry.relativePath)
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                if isContainer(entry) {
                    if expanded {
                        expandedPaths.remove(entry.relativePath)
                    } else {
                        expandedPaths.insert(entry.relativePath)
                    }
                    if entry.kind == "app", let viewerPath = entry.viewerPath {
                        model.openViewer(viewerPath)
                    }
                } else if let viewerPath = entry.viewerPath {
                    model.openViewer(viewerPath)
                }
            } label: {
                HStack(spacing: 8) {
                    Color.clear.frame(width: CGFloat(depth) * 14)
                    if isContainer(entry) {
                        Image(systemName: expanded ? "chevron.down" : "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                            .frame(width: 12)
                    } else {
                        Color.clear.frame(width: 12)
                    }
                    Image(systemName: symbol(for: entry.kind))
                        .foregroundStyle(entry.kind == "directory" || entry.kind == "app" ? .blue : .secondary)
                    Text(entry.name)
                        .lineLimit(1)
                    Spacer()
                    if let badge = entryBadge(for: entry.kind) {
                        Text(badge)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color(.secondarySystemBackground), in: Capsule())
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, 5)

            if expanded {
                ForEach(children) { child in
                    WorkspaceTreeRow(
                        entry: child,
                        depth: depth + 1,
                        childrenByParent: childrenByParent,
                        expandedPaths: $expandedPaths
                    )
                }
            }
        }
    }
}

private func isContainer(_ entry: WorkspaceEntry) -> Bool {
    entry.kind == "directory" || entry.kind == "app"
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

private func entryBadge(for kind: String) -> String? {
    switch kind {
    case "markdown": "MD"
    case "json": "JSON"
    case "image": "IMG"
    case "code": "CODE"
    case "text": "TXT"
    default: nil
    }
}

struct ViewerRoute: Identifiable, Hashable {
    var path: String
    var id: String { path }
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
                ContentUnavailableView("Cannot open file", systemImage: "exclamationmark.triangle")
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(isWorkspaceAppViewerPath(targetPath) ? .hidden : .automatic, for: .navigationBar)
    }

    private var title: String {
        viewerTargetPath(path).split(separator: "/").last.map(String.init) ?? "Viewer"
    }
}

private func isWorkspaceAppViewerPath(_ path: String) -> Bool {
    path.starts(with: "/workspace/") && !path.starts(with: "/workspace-file/")
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
            } else if isMarkdown {
                MarkdownPreview(text: text)
            } else if isHTML {
                HTMLPreview(html: text, baseURL: APIClient.shared.absoluteURL(for: path))
            } else if isJSON {
                JSONPreview(text: text)
            } else if isEditableTextLike {
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
                ZoomableImageView(image: image)
            } else if mimeType.contains("pdf") {
                PDFPreview(data: data)
            } else {
                ContentUnavailableView("Preview unavailable", systemImage: "doc", description: Text("\(data.count) bytes"))
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if isEditableTextLike && !isMarkdown && !isHTML && !isJSON {
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

    private var isMarkdown: Bool {
        path.localizedCaseInsensitiveContains(".md") || mimeType.contains("markdown")
    }

    private var isHTML: Bool {
        path.localizedCaseInsensitiveContains(".html") || mimeType.contains("html")
    }

    private var isJSON: Bool {
        path.localizedCaseInsensitiveContains(".json") || mimeType.contains("json")
    }

    private var isEditableTextLike: Bool {
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

struct MarkdownPreview: View {
    var text: String

    var body: some View {
        ScrollView {
            Text(rendered)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
    }

    private var rendered: AttributedString {
        (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }
}

struct HTMLPreview: UIViewRepresentable {
    var html: String
    var baseURL: URL?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        return WKWebView(frame: .zero, configuration: configuration)
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: baseURL)
    }
}

struct JSONPreview: View {
    var text: String

    var body: some View {
        JSONHighlightedText(text: prettyJSON(text))
    }
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

struct JSONHighlightedText: UIViewRepresentable {
    var text: String

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false
        view.backgroundColor = .systemBackground
        view.font = .monospacedSystemFont(ofSize: 14, weight: .regular)
        view.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
        return view
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        textView.attributedText = highlightedJSON(text)
    }

    private func highlightedJSON(_ value: String) -> NSAttributedString {
        let attributed = NSMutableAttributedString(
            string: value,
            attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: 14, weight: .regular),
                .foregroundColor: UIColor.label,
            ]
        )
        let fullRange = NSRange(location: 0, length: attributed.length)
        let patterns: [(String, UIColor)] = [
            ("-?\\b\\d+(?:\\.\\d+)?\\b", .systemOrange),
            ("\\b(?:true|false|null)\\b", .systemPurple),
            ("\"(?:[^\"\\\\]|\\\\.)*\"", .systemGreen),
            ("\"(?:[^\"\\\\]|\\\\.)*\"\\s*:", .systemBlue),
        ]
        for (pattern, color) in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            regex.enumerateMatches(in: value, range: fullRange) { match, _, _ in
                if let range = match?.range {
                    attributed.addAttribute(.foregroundColor, value: color, range: range)
                }
            }
        }
        return attributed
    }
}

struct ZoomableImageView: UIViewRepresentable {
    var image: UIImage

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = UIScrollView()
        scrollView.delegate = context.coordinator
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 6
        scrollView.backgroundColor = .systemBackground
        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(imageView)
        context.coordinator.imageView = imageView
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            imageView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
            imageView.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
        ])
        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.imageView?.image = image
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        weak var imageView: UIImageView?

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            imageView
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
