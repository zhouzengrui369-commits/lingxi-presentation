import SwiftUI

struct ContentView: View {
    @EnvironmentObject var runner: DemoRunner
    @State private var showCopiedAlert = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            HStack(spacing: 0) {
                sidebar
                    .frame(width: 280)
                    .background(Color(NSColor.controlBackgroundColor))
                Divider()
                mainPanel
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 16) {
            Image(nsImage: NSImage(named: "AppIcon") ?? NSImage())
                .resizable()
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("灵犀演示")
                    .font(.system(size: 22, weight: .semibold))
                Text("AI 驱动的办公内容生成 · 季度汇报 demo")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            Spacer()
            statusBadge
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private var statusBadge: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(runner.statusColor)
                .frame(width: 10, height: 10)
            Text(runner.statusText)
                .font(.system(size: 12, weight: .medium))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("演示流程")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)

            ForEach(Array(DemoRunner.Step.allCases.enumerated()), id: \.element.id) { idx, step in
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .stroke(runner.stepState(step).strokeColor, lineWidth: 2)
                            .frame(width: 22, height: 22)
                        if runner.stepState(step).isDone {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(runner.stepState(step).strokeColor)
                        } else if runner.stepState(step).isActive {
                            Circle()
                                .fill(runner.stepState(step).strokeColor)
                                .frame(width: 8, height: 8)
                        }
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(step.title)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(runner.stepState(step).textColor)
                        if let ms = runner.stepMs[step.id] {
                            Text("\(ms) ms")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            Spacer()

            if let summary = runner.demoSummary {
                VStack(alignment: .leading, spacing: 6) {
                    Text("总耗时")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Text("\(summary.totalMs) ms")
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    HStack {
                        Image(systemName: summary.ok ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                            .foregroundColor(summary.ok ? .green : .orange)
                        Text(summary.ok ? "全程通过" : "部分失败")
                            .font(.system(size: 11, weight: .medium))
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color(NSColor.controlBackgroundColor))
                )
            }

            Button(action: { runner.start() }) {
                Label(runner.isRunning ? "运行中..." : "开始季度汇报", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .disabled(runner.isRunning)
        }
        .padding(20)
    }

    private var mainPanel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                metricCard("源文件", value: "\(runner.sourceFileCount)")
                metricCard("Wiki 条目", value: "\(runner.wikiEntryCount)")
                metricCard("顾问轮次", value: "\(runner.advisorRoundCount)")
                metricCard("输出格式", value: "\(runner.outputFormatCount)/4")
            }
            .padding(20)

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("实时日志")
                        .font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Button("打开输出目录") {
                        runner.openOutputDir()
                    }
                    .buttonStyle(.borderless)
                    .disabled(runner.outputDir == nil)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(runner.logs.enumerated()), id: \.offset) { idx, line in
                                Text(line)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(color(for: line))
                                    .id(idx)
                                    .textSelection(.enabled)
                            }
                        }
                        .padding(12)
                    }
                    .background(Color(NSColor.textBackgroundColor))
                    .frame(maxWidth: .infinity)
                    .onChange(of: runner.logs.count) { _, newCount in
                        if newCount > 0 {
                            withAnimation {
                                proxy.scrollTo(newCount - 1, anchor: .bottom)
                            }
                        }
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func metricCard(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .monospaced))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }

    private func color(for line: String) -> Color {
        if line.contains("FATAL") || line.contains("ERROR") {
            return .red
        }
        if line.contains("WARN") {
            return .orange
        }
        if line.contains("✓") || line.contains("ok") || line.contains("PASS") {
            return .green
        }
        return .primary
    }
}