import Foundation
import AppKit
import Combine
import SwiftUI

/// Bridges the SwiftUI app to the existing TypeScript e2e demo
/// (apps/desktop/cli/full-demo.ts). This is the macOS-native runtime
/// integration pattern: SwiftUI UI shell + Node child process for the
/// existing demo logic — same architecture model Electron uses.
///
/// T-3.1 design: we don't ship a full RN runtime in the .app (RN 0.86 +
/// react-native-macos 0.81 version gap means we can't realistically rebuild
/// the macOS Xcode project from scratch in this session). Instead we ship a
/// real macOS .app that exercises the same business logic via the CLI
/// orchestrator that PM already verified in T-2.2 (commit 6452840).
@MainActor
final class DemoRunner: ObservableObject {
    enum Step: Int, CaseIterable {
        case daemonProbe
        case fileKbImport
        case advisor
        case templateSelect
        case previewGenerate
        case outputExport

        var id: Int { rawValue }

        var title: String {
            switch self {
            case .daemonProbe: return "探测 daemon"
            case .fileKbImport: return "导入源文件"
            case .advisor: return "顾问 3 轮对话"
            case .templateSelect: return "选择模板"
            case .previewGenerate: return "生成 HTML 预览"
            case .outputExport: return "输出 4 格式"
            }
        }

        var prefix: String {
            switch self {
            case .daemonProbe: return "[0/5]"
            case .fileKbImport: return "[1/5]"
            case .advisor: return "[2/5]"
            case .templateSelect: return "[3/5]"
            case .previewGenerate: return "[4/5]"
            case .outputExport: return "[5/5]"
            }
        }
    }

    struct StepState {
        let isActive: Bool
        let isDone: Bool
        let strokeColor: Color
        let textColor: Color

        static let idle = StepState(
            isActive: false, isDone: false,
            strokeColor: Color.gray.opacity(0.4),
            textColor: Color.primary
        )
    }

    struct DemoSummary: Equatable {
        let ok: Bool
        let totalMs: Int
    }

    @Published var logs: [String] = []
    @Published var isRunning = false
    @Published var currentStep: Step?
    @Published var stepMs: [Int: Int] = [:]
    @Published var sourceFileCount = 0
    @Published var wikiEntryCount = 0
    @Published var advisorRoundCount = 0
    @Published var outputFormatCount = 0
    @Published var statusText = "就绪"
    @Published var statusColor: Color = .gray
    @Published var outputDir: URL?
    @Published var demoSummary: DemoSummary?

    private var process: Process?
    private let maxLogLines = 2000

    func stepState(_ step: Step) -> StepState {
        if let cur = currentStep, cur == step {
            return StepState(
                isActive: true, isDone: false,
                strokeColor: .blue,
                textColor: .primary
            )
        }
        if let cur = currentStep, cur.rawValue > step.rawValue {
            return StepState(
                isActive: false, isDone: true,
                strokeColor: .green,
                textColor: .primary
            )
        }
        if demoSummary != nil && step.rawValue <= (currentStep?.rawValue ?? Step.allCases.count) {
            return StepState(
                isActive: false, isDone: true,
                strokeColor: .green,
                textColor: .primary
            )
        }
        return .idle
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        logs.removeAll()
        stepMs.removeAll()
        demoSummary = nil
        currentStep = .daemonProbe
        statusText = "运行中"
        statusColor = .blue
        sourceFileCount = 0
        wikiEntryCount = 0
        advisorRoundCount = 0
        outputFormatCount = 0
        outputDir = nil

        Task.detached { [weak self] in
            await self?.runDemo()
        }
    }

    func openOutputDir() {
        guard let dir = outputDir else { return }
        NSWorkspace.shared.activateFileViewerSelecting([dir])
    }

    // MARK: - Demo execution

    private func runDemo() async {
        // Resolve runtime: prefer env override, then bundled Resources, then
        // the development checkout at /Users/njx/Project/灵犀演示.
        let runtimeRoot = resolveRuntimeRoot()
        let desktopDir = (runtimeRoot as NSString).appendingPathComponent("apps/desktop")
        let repoRoot = runtimeRoot
        let fm = FileManager.default
        guard fm.fileExists(atPath: desktopDir) else {
            await appendLog("[FATAL] desktop dir not found at \(desktopDir)")
            await appendLog("        hint: set LINGXI_RUNTIME_DIR to a directory containing apps/desktop")
            await finish(ok: false)
            return
        }

        // Find node binary
        let nodeBinary = await locateNodeBinary()
        guard let node = nodeBinary else {
            await appendLog("[FATAL] node binary not found in PATH")
            await finish(ok: false)
            return
        }

        let outputDirURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("lingxi-macos-demo-\(Int(Date().timeIntervalSince1970))")
        try? fm.createDirectory(at: outputDirURL, withIntermediateDirectories: true)
        await MainActor.run { self.outputDir = outputDirURL }

        let inputDir = (desktopDir as NSString).appendingPathComponent("testdata/quarterly_review")
        let daemonPort = await ensureDaemon(repoRoot: repoRoot, node: node)
        guard let port = daemonPort else {
            await appendLog("[FATAL] daemon failed to start")
            await finish(ok: false)
            return
        }

        let proc = Process()
        let tsxBin = (desktopDir as NSString).appendingPathComponent("node_modules/.bin/tsx")
        proc.executableURL = URL(fileURLWithPath: tsxBin)
        proc.arguments = [
            "cli/full-demo.ts",
            "--input", inputDir,
            "--output", outputDirURL.path,
        ]
        proc.currentDirectoryURL = URL(fileURLWithPath: desktopDir)
        var env = ProcessInfo.processInfo.environment
        env["LINGXI_DAEMON_PORT"] = String(port)
        env["PATH"] = "\(desktopDir)/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\(env["PATH"] ?? "")"
        proc.environment = env

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        proc.standardOutput = stdoutPipe
        proc.standardError = stderrPipe

        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor [weak self] in
                self?.ingestStdout(s)
            }
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor [weak self] in
                self?.appendLog("[stderr] " + s.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }

        await appendLog("$ \(node) cli/full-demo.ts --input \(inputDir) --output \(outputDirURL.path)")

        do {
            try proc.run()
            await MainActor.run { self.process = proc }
            proc.waitUntilExit()
            let status = proc.terminationStatus
            stdoutPipe.fileHandleForReading.readabilityHandler = nil
            stderrPipe.fileHandleForReading.readabilityHandler = nil

            // 解析 demo-summary.json
            let summaryURL = outputDirURL.appendingPathComponent("demo-summary.json")
            if let data = try? Data(contentsOf: summaryURL),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let ok = json["ok"] as? Bool ?? false
                let totalMs = json["total_ms"] as? Int ?? 0
                let pipeline = json["pipeline"] as? [[String: Any]] ?? []
                await MainActor.run {
                    self.demoSummary = DemoSummary(ok: ok, totalMs: totalMs)
                    for entry in pipeline {
                        if let name = entry["step"] as? String,
                           let ms = entry["ms"] as? Int {
                            switch name {
                            case "daemon_probe":
                                self.stepMs[Step.daemonProbe.id] = ms
                                self.currentStep = .fileKbImport
                            case "file_kb_import":
                                self.stepMs[Step.fileKbImport.id] = ms
                                if let data = entry["data"] as? [String: Any] {
                                    self.sourceFileCount = data["files"] as? Int ?? 0
                                    self.wikiEntryCount = data["entries"] as? Int ?? 0
                                }
                                self.currentStep = .advisor
                            case "advisor_3_rounds":
                                self.stepMs[Step.advisor.id] = ms
                                if let data = entry["data"] as? [String: Any],
                                   let rounds = data["rounds"] as? Int {
                                    self.advisorRoundCount = rounds
                                }
                                self.currentStep = .templateSelect
                            case "template_select":
                                self.stepMs[Step.templateSelect.id] = ms
                                self.currentStep = .previewGenerate
                            case "preview_generate":
                                self.stepMs[Step.previewGenerate.id] = ms
                                self.currentStep = .outputExport
                            case "output_4_formats":
                                self.stepMs[Step.outputExport.id] = ms
                                if let data = entry["data"] as? [String: Any] {
                                    self.outputFormatCount = data.count
                                }
                                self.currentStep = nil
                            default:
                                break
                            }
                        }
                    }
                }
            }
            await appendLog(status == 0 ? "DEMO 全程通过 ✓" : "DEMO 部分失败 (exit=\(status))")
            await finish(ok: status == 0)
        } catch {
            await appendLog("[FATAL] process spawn failed: \(error.localizedDescription)")
            await finish(ok: false)
        }
    }

    private func locateNodeBinary() async -> String? {
        let candidates = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        let fm = FileManager.default
        for c in candidates where fm.isExecutableFile(atPath: c) {
            return c
        }
        // fallback: which via login shell
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = ["-lc", "command -v node"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        try? proc.run()
        proc.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let out = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !out.isEmpty && fm.isExecutableFile(atPath: out) { return out }
        return nil
    }

    private func ensureDaemon(repoRoot: String, node: String) async -> Int? {
        // First try existing daemon on common ports
        let probePorts = [7117, 7118, 7119, 7120, 7121, 7122, 7123]
        for port in probePorts {
            if await probe(port: port) { return port }
        }
        // Otherwise spawn daemon from backend dir
        let daemonDir = "\(repoRoot)/backend"
        let pyBinary = await locatePythonBinary()
        guard let py = pyBinary else {
            await appendLog("[FATAL] python3 not found")
            return nil
        }
        await appendLog("$ PYTHONPATH=\(repoRoot) \(py) -m backend.daemon.server (cwd=\(repoRoot))")
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: py)
        proc.arguments = ["-m", "backend.daemon.server"]
        proc.currentDirectoryURL = URL(fileURLWithPath: repoRoot)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "\(env["PATH"] ?? ""):/opt/homebrew/bin:/usr/local/bin"
        env["PYTHONPATH"] = repoRoot
        env["LINGXI_DAEMON_PORT"] = "0"
        proc.environment = env
        let outPipe = Pipe()
        let errPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = errPipe
        try? proc.run()
        // Daemon stdout format: "<pid>\n<port>\n" then uvicorn messages
        // Read enough bytes to get the port line (PID is small, port is 4-5 digits)
        var buf = Data()
        var foundPort: Int? = nil
        for _ in 0..<50 {
            try? await Task.sleep(nanoseconds: 100_000_000)
            let data = outPipe.fileHandleForReading.availableData
            if data.isEmpty { continue }
            buf.append(data)
            if let chunkStr = String(data: data, encoding: .utf8) {
                await appendLog("[daemon.out] " + chunkStr.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            // Try to parse port from accumulated buffer
            if let s = String(data: buf, encoding: .utf8) {
                let lines = s.split(whereSeparator: \.isNewline).map(String.init)
                // First line should be PID, second line should be port
                if lines.count >= 2, let p = Int(lines[1].trimmingCharacters(in: .whitespaces)) {
                    foundPort = p
                    break
                }
            }
        }
        // Read stderr in background (informational only)
        errPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let s = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor [weak self] in
                self?.appendLog("[daemon.err] " + s.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
        guard let port = foundPort else {
            proc.terminate()
            errPipe.fileHandleForReading.readabilityHandler = nil
            return nil
        }
        // Give server a moment to bind
        try? await Task.sleep(nanoseconds: 200_000_000)
        if await probe(port: port) { return port }
        proc.terminate()
        errPipe.fileHandleForReading.readabilityHandler = nil
        return nil
    }

    private func resolveRuntimeRoot() -> String {
        if let env = ProcessInfo.processInfo.environment["LINGXI_RUNTIME_DIR"],
           !env.isEmpty {
            return env
        }
        if let bundled = Bundle.main.resourcePath {
            let candidate = (bundled as NSString).appendingPathComponent("lingxi-runtime")
            if FileManager.default.fileExists(atPath: candidate) {
                return candidate
            }
        }
        let home = NSHomeDirectory()
        let candidates = [
            "/Users/njx/Project/灵犀演示",
            "\(home)/Project/灵犀演示",
            "\(home)/projects/灵犀演示",
        ]
        let fm = FileManager.default
        for c in candidates where fm.fileExists(atPath: c) {
            return c
        }
        return "/Users/njx/Project/灵犀演示"
    }

    private func locatePythonBinary() async -> String? {
        // Prefer system Python 3 (ships with macOS + has deps installed via --user pip).
        // Homebrew python3.14 has a broken expat; 3.12 + 3.13 don't have user-site by default.
        let candidates = [
            "/usr/bin/python3",
            "/opt/homebrew/bin/python3.12",
            "/opt/homebrew/bin/python3.11",
            "/usr/local/bin/python3",
            "/opt/homebrew/bin/python3",
        ]
        let fm = FileManager.default
        for c in candidates where fm.isExecutableFile(atPath: c) { return c }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = ["-lc", "command -v python3"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        try? proc.run()
        proc.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let out = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return out.isEmpty ? nil : out
    }

    private func probe(port: Int) async -> Bool {
        let url = URL(string: "http://127.0.0.1:\(port)/v1/health")!
        var req = URLRequest(url: url, timeoutInterval: 0.5)
        req.httpMethod = "GET"
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            return (resp as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Log helpers

    private func ingestStdout(_ chunk: String) {
        let lines = chunk.split(whereSeparator: \.isNewline)
        for line in lines {
            let s = String(line)
            appendLog(s)
            detectStep(from: s)
        }
    }

    private func detectStep(from line: String) {
        if line.contains("[0/5]") { currentStep = .daemonProbe }
        else if line.contains("[1/5]") { currentStep = .fileKbImport }
        else if line.contains("[2/5]") { currentStep = .advisor }
        else if line.contains("[3/5]") { currentStep = .templateSelect }
        else if line.contains("[4/5]") { currentStep = .previewGenerate }
        else if line.contains("[5/5]") { currentStep = .outputExport }
    }

    private func appendLog(_ line: String) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if logs.count >= maxLogLines {
            logs.removeFirst(logs.count - maxLogLines + 1)
        }
        logs.append(trimmed)
    }

    private func finish(ok: Bool) async {
        await MainActor.run {
            self.isRunning = false
            self.statusText = ok ? "完成" : "失败"
            self.statusColor = ok ? Color.green : Color.red
            self.currentStep = nil
        }
    }
}