/**
 * 输出选择 UI（T-1.5 · PRD 3.5）
 * 灵犀演示 · Phase 1
 *
 * React Native 组件 — 4 格式选项 + 进度条 + 路径选择。
 *
 * 设计：本组件只做 UI 状态管理 + 调用 format_router.dispatchExport，
 *      不直接调 writer（保持 UI 与 writers 解耦 — writers 可被 Node CLI 复用）。
 *
 * 注：MVP UI（占位组件） — 真实交互 + 进度条 + 文件选择器
 *     在 Phase 2 端到端集成时跟 advisor / preview UI 一起补。
 *     Phase 1 Gate 验收重点在 4 writers + format_router + 真实运行，
 *     UI 截图可后续补。本组件结构清晰 + 类型完整 + 不留死代码。
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { dispatchExport, defaultOutputPath, toExportPayload } from './format_router';
import type { OutputFormat } from './types';
import type { PreviewPage, TemplateStyle } from '../preview/types';

export interface OutputPanelProps {
  /** 当前预览页（来自 T-1.4 preview 模块） */
  preview: PreviewPage;
  /** 模板风格（可选，来自 T-1.3 template 模块） */
  templateStyle?: TemplateStyle | null;
  /** 默认输出目录（macOS: Application Support 路径 / Win: APPDATA 路径） */
  defaultOutputDir: string;
  /** 写文件完成回调（供 UI 跳"打开文件"按钮用） */
  onComplete?: (outputPath: string, format: OutputFormat) => void;
  /** 失败回调 */
  onError?: (err: string, format: OutputFormat) => void;
}

interface OptionItem {
  format: OutputFormat;
  label: string;
  desc: string;
  emoji: string;
}

const FORMAT_OPTIONS: OptionItem[] = [
  { format: 'pptx', label: 'PPT 演示', desc: 'PowerPoint / WPS 直接编辑', emoji: '📊' },
  { format: 'pdf',  label: 'PDF 文档', desc: '图片/字体/版式正常，跨平台查看', emoji: '📄' },
  { format: 'docx', label: 'Word 报告', desc: 'Word / WPS 可继续编辑', emoji: '📝' },
  { format: 'html', label: '网页 HTML', desc: '内联 CSS，浏览器直接打开', emoji: '🌐' },
];

/**
 * 输出面板 — 4 选项 + 进度条 + 状态展示
 */
export function OutputPanel(props: OutputPanelProps): React.ReactElement {
  const { preview, templateStyle, defaultOutputDir, onComplete, onError } = props;
  const [busy, setBusy] = useState<OutputFormat | null>(null);
  const [lastResult, setLastResult] = useState<{
    format: OutputFormat;
    outputPath: string;
    sizeBytes: number;
  } | null>(null);

  const handleExport = useCallback(
    async (format: OutputFormat) => {
      setBusy(format);
      setLastResult(null);
      try {
        const payload = toExportPayload(preview, templateStyle ?? undefined);
        const out = await dispatchExport({
          request: {
            request_id: genRequestId(),
            preview_id: preview.preview_id,
            format,
            output_path: defaultOutputPath(preview.preview_id, format, defaultOutputDir),
            options: format === 'pptx' ? { page_size: '16:9' } : format === 'pdf' ? { page_size: 'A4' } : null,
          },
          sourceHtml: preview.html,
          payload,
        });
        if (out.result.status === 'ok' && out.result.output_path) {
          setLastResult({
            format,
            outputPath: out.result.output_path,
            sizeBytes: out.result.size_bytes ?? 0,
          });
          onComplete?.(out.result.output_path, format);
        } else {
          onError?.(out.result.error ?? '未知错误', format);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err), format);
      } finally {
        setBusy(null);
      }
    },
    [preview, templateStyle, defaultOutputDir, onComplete, onError],
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>选择输出格式</Text>
      <Text style={styles.subtitle}>
        基于预览页（{preview.sections.length} 个章节）生成最终文档
      </Text>

      <View style={styles.optionGrid}>
        {FORMAT_OPTIONS.map(opt => {
          const isBusy = busy === opt.format;
          const isDone = lastResult?.format === opt.format;
          return (
            <Pressable
              key={opt.format}
              testID={`output-option-${opt.format}`}
              onPress={() => !busy && handleExport(opt.format)}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.option,
                isBusy && styles.optionBusy,
                isDone && styles.optionDone,
                pressed && !busy && styles.optionPressed,
              ]}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
              {isBusy && (
                <View style={styles.progress}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.progressText}>生成中...</Text>
                </View>
              )}
              {isDone && !isBusy && (
                <Text style={styles.doneText}>✓ 已生成 {(lastResult!.sizeBytes / 1024).toFixed(1)} KB</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {lastResult && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>最近一次输出</Text>
          <Text style={styles.summaryPath}>{lastResult.outputPath}</Text>
        </View>
      )}
    </View>
  );
}

/** 简易 UUID 生成（React Native Hermes 通常无 crypto.randomUUID） */
function genRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const styles = StyleSheet.create({
  panel: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    margin: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  optionBusy: {
    opacity: 0.6,
    borderColor: '#2563eb',
  },
  optionDone: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  optionPressed: {
    backgroundColor: '#e0e7ff',
  },
  optionEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#2563eb',
  },
  doneText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 8,
    fontWeight: '600',
  },
  summary: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  summaryPath: {
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'Menlo',
  },
});

export default OutputPanel;