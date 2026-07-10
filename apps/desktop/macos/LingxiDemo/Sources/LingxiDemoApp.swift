import SwiftUI

@main
struct LingxiDemoApp: App {
    @StateObject private var runner = DemoRunner()

    var body: some Scene {
        WindowGroup("灵犀演示") {
            ContentView()
                .environmentObject(runner)
                .frame(minWidth: 900, minHeight: 640)
                .background(WindowAccessor { window in
                    window.titlebarAppearsTransparent = false
                    window.title = "灵犀演示"
                    window.center()
                })
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("演示") {
                Button("重新运行季度汇报") {
                    runner.start()
                }
                .keyboardShortcut("r", modifiers: .command)
                Divider()
                Button("打开输出目录") {
                    runner.openOutputDir()
                }
                .keyboardShortcut("o", modifiers: .command)
                .disabled(runner.outputDir == nil)
            }
        }
    }
}

struct WindowAccessor: NSViewRepresentable {
    let callback: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window {
                callback(window)
            }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        if let window = nsView.window {
            callback(window)
        }
    }
}