import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @SceneStorage("selectedSection") private var selectedSection = AppSection.home
    @State private var columnVisibility = NavigationSplitViewVisibility.all
    @State private var isCommandPalettePresented = false

    var body: some View {
        Group {
            if model.authEnabled && !model.isAuthenticated {
                LoginView()
            } else {
                NavigationSplitView(columnVisibility: $columnVisibility) {
                    SidebarView(selection: $selectedSection)
                } content: {
                    WorkspaceColumn(section: $selectedSection)
                } detail: {
                    ChatColumn()
                }
                .navigationSplitViewStyle(.balanced)
                .sheet(isPresented: $isCommandPalettePresented) {
                    CommandPaletteView(
                        selection: $selectedSection,
                        isPresented: $isCommandPalettePresented
                    )
                    .environmentObject(model)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openCommandPalette)) { _ in
            isCommandPalettePresented = true
        }
        .alert("Lilo", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}

struct SidebarView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: AppSection

    var body: some View {
        List(AppSection.allCases, selection: $selection) { section in
            Label(section.label, systemImage: section.symbol)
                .tag(section)
        }
        .listStyle(.sidebar)
        .navigationTitle("Lilo")
        .toolbar {
            ToolbarItem {
                Button {
                    Task { await model.refreshAll() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh")
            }
        }
    }
}

struct WorkspaceColumn: View {
    @EnvironmentObject private var model: AppModel
    @Binding var section: AppSection

    var body: some View {
        Group {
            switch section {
            case .home:
                HomeView(selection: $section)
            case .chats:
                ChatHistoryView()
            case .files:
                HSplitView {
                    FilesView()
                        .frame(minWidth: 220, idealWidth: 280)
                    ViewerPane()
                        .frame(minWidth: 420)
                }
            case .automations:
                AutomationsView()
            case .settings:
                SettingsView()
            }
        }
        .toolbar {
            ToolbarItemGroup {
                Button {
                    Task { await model.createChat() }
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .help("New Chat")
            }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @State private var backendURL = APIClient.shared.baseURLString
    @State private var password = ""

    var body: some View {
        VStack(spacing: 18) {
            LiloLogo(size: 56)
            Text("Connect to Lilo")
                .font(.largeTitle.weight(.bold))
            TextField("Backend URL", text: $backendURL)
                .textFieldStyle(.roundedBorder)
                .frame(width: 420)
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 420)
            HStack {
                Button("Use URL") {
                    Task { await model.saveBackendURL(backendURL) }
                }
                Button("Sign In") {
                    Task { await model.login(password: password) }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(password.isEmpty)
            }
        }
        .padding(40)
    }
}

struct LiloLogo: View {
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(LinearGradient(
                    colors: [Color(red: 0.16, green: 0, blue: 0.46), Color(red: 0, green: 0.22, blue: 0.91)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
            Circle()
                .fill(.background)
                .frame(width: size * 0.28, height: size * 0.28)
                .offset(x: size * 0.05, y: -size * 0.03)
        }
        .frame(width: size, height: size)
    }
}
