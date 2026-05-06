import SwiftUI

struct CommandPaletteView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: AppSection
    @Binding var isPresented: Bool
    @State private var query = ""

    private var results: [CommandPaletteResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let apps = model.workspaceApps
            .filter { $0.archived != true }
            .filter { trimmed.isEmpty || $0.label.localizedCaseInsensitiveContains(trimmed) || $0.name.localizedCaseInsensitiveContains(trimmed) }
            .map(CommandPaletteResult.app)

        let files = model.workspaceEntries
            .filter { $0.archived != true && $0.kind != "directory" && $0.kind != "app" && $0.viewerPath != nil }
            .filter { !trimmed.isEmpty && ($0.name.localizedCaseInsensitiveContains(trimmed) || $0.relativePath.localizedCaseInsensitiveContains(trimmed)) }
            .map(CommandPaletteResult.file)

        return apps + files
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search apps and files...", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .onSubmit { openFirstResult() }
            }
            .padding(14)

            Divider()

            List(results) { result in
                Button {
                    open(result)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: result.symbol)
                            .foregroundStyle(.secondary)
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.title)
                                .lineLimit(1)
                            Text(result.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .listStyle(.plain)
        }
        .frame(width: 620, height: 460)
        .onKeyPress(.escape) {
            isPresented = false
            return .handled
        }
    }

    private func openFirstResult() {
        if let first = results.first {
            open(first)
        }
    }

    private func open(_ result: CommandPaletteResult) {
        switch result {
        case .app(let app):
            selection = .home
            model.openViewer(app.viewerPath)
        case .file(let entry):
            selection = .files
            if let viewerPath = entry.viewerPath {
                model.openViewer(viewerPath)
            }
        }
        isPresented = false
    }
}

enum CommandPaletteResult: Identifiable {
    case app(WorkspaceAppLink)
    case file(WorkspaceEntry)

    var id: String {
        switch self {
        case .app(let app): "app:\(app.name)"
        case .file(let entry): "file:\(entry.relativePath)"
        }
    }

    var title: String {
        switch self {
        case .app(let app): app.label
        case .file(let entry): entry.name
        }
    }

    var subtitle: String {
        switch self {
        case .app(let app): app.description ?? app.name
        case .file(let entry): entry.parentRelativePath ?? "workspace"
        }
    }

    var symbol: String {
        switch self {
        case .app: "app"
        case .file(let entry):
            switch entry.kind {
            case "markdown": "doc.richtext"
            case "image": "photo"
            case "json", "code": "chevron.left.forwardslash.chevron.right"
            default: "doc"
            }
        }
    }
}
