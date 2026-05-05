import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.authEnabled && !model.isAuthenticated {
                LoginView()
            } else {
                TabView(selection: $model.selectedTab) {
                    NavigationStack {
                        ChatListView()
                    }
                    .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right") }
                    .tag(MainTab.chats)

                    NavigationStack {
                        NativeHomeView()
                    }
                    .tabItem { Label("Home", systemImage: "house") }
                    .tag(MainTab.home)

                    NavigationStack {
                        FilesView()
                    }
                    .tabItem { Label("Files", systemImage: "folder") }
                    .tag(MainTab.files)

                    NavigationStack {
                        AutomationsView()
                    }
                    .tabItem { Label("Automations", systemImage: "calendar.badge.clock") }
                    .tag(MainTab.automations)

                    NavigationStack {
                        SettingsView()
                    }
                    .tabItem { Label("Settings", systemImage: "gearshape") }
                    .tag(MainTab.settings)
                }
            }
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

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @State private var backendURL = APIClient.shared.baseURLString
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Deployment") {
                    TextField("Backend URL", text: $backendURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button("Use this URL") {
                        Task { await model.saveBackendURL(backendURL) }
                    }
                }
                Section("Password") {
                    SecureField("Lilo password", text: $password)
                    Button("Sign in") {
                        Task { await model.login(password: password) }
                    }
                    .disabled(password.isEmpty)
                }
            }
            .navigationTitle("Lilo")
        }
    }
}

struct NativeHomeView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 12) {
                        LiloLogo(size: 48)
                        Text("Lilo")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                    }
                    Text("Your workspace, chats, automations, and apps in one native shell.")
                        .foregroundStyle(.secondary)
                }

                SectionHeader("Apps")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 14)], spacing: 14) {
                    ForEach(model.workspaceApps.filter { $0.archived != true }) { app in
                        Button {
                            model.openViewer(app.viewerPath)
                        } label: {
                            AppTile(app: app)
                        }
                        .buttonStyle(.plain)
                    }
                }

                SectionHeader("Recent chats")
                VStack(spacing: 10) {
                    ForEach(model.chats.prefix(4)) { chat in
                        Button {
                            Task {
                                await model.selectChat(chat.id)
                                model.selectedTab = .chats
                            }
                        } label: {
                            ChatRow(chat: chat)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Home")
        .refreshable { await model.refreshAll() }
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
                .rotationEffect(.degrees(-1.5))
            Circle()
                .fill(Color(.systemBackground))
                .frame(width: size * 0.28, height: size * 0.28)
                .offset(x: size * 0.05, y: -size * 0.03)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Lilo")
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
            .tracking(1.2)
    }
}

struct AppTile: View {
    var app: WorkspaceAppLink

    var body: some View {
        VStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.thinMaterial)
                .frame(width: 76, height: 76)
                .overlay {
                    if let iconHref = app.iconHref, let url = APIClient.shared.absoluteURL(for: iconHref) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Image(systemName: "app.dashed")
                        }
                        .padding(10)
                    } else {
                        Image(systemName: "app.dashed")
                            .font(.title)
                    }
                }
            Text(app.label)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}
