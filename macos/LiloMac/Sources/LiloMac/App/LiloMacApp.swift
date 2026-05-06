import SwiftUI

@main
struct LiloMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup("Lilo", id: "main") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 1040, minHeight: 680)
                .task { await model.bootstrap() }
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("New Chat") {
                    Task { await model.createChat() }
                }
                .keyboardShortcut("n", modifiers: [.command])

                Button("Refresh") {
                    Task { await model.refreshAll() }
                }
                .keyboardShortcut("r", modifiers: [.command])

                Button("Open Command Palette") {
                    NotificationCenter.default.post(name: .openCommandPalette, object: nil)
                }
                .keyboardShortcut("k", modifiers: [.command])

                if model.isStreaming {
                    Button("Stop Streaming") {
                        Task { await model.stopChat() }
                    }
                    .keyboardShortcut(".", modifiers: [.command])
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(model)
                .frame(width: 640, height: 560)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
