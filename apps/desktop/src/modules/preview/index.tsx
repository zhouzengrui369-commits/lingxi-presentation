/**
 * HTML 预览与编辑 UI（T-1.4 · PRD 3.4）
 * 灵犀演示 · Phase 1
 *
 * 集成 renderer / editor / ai_revise / autosave 四个逻辑模块，提供：
 *   - 预览区（WebView 渲染真实 HTML，缺省退化为结构化只读预览）
 *   - 轻量编辑工具栏（改标题 / 改正文 / 段落上移下移）
 *   - "重做(AI)" 按钮（复杂改动回 daemon 重新生成）
 *   - 实时保存状态指示器（"已保存 Ns 前"，每 5s 自动落盘）
 *
 * 并行说明：editor/renderer/autosave/ai_revise 逻辑均已完整实现（含单测）。
 * template_style 与 advisor requirement 在 T-1.3/T-1.2 merge 前用默认主题 + 手填需求兜底，
 * 由 PM 在 Phase 1 Gate 阶段串行集成。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import type { PreviewPage, TemplateStyle } from './types';
import { DEFAULT_TEMPLATE_STYLE, buildPreviewPage, renderPreviewHtml } from './renderer';
import { applyTextChange, moveSectionDown, moveSectionUp } from './editor';
import { Autosave, getStatusText, SAVE_INTERVAL_MS } from './autosave';
import type { PreviewStore } from './autosave';
import { reviseWithAI } from './ai_revise';

/** 可选依赖 WebView（未安装时退化为结构化预览） */
let WebViewComp: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComp = require('react-native-webview').WebView;
} catch {
  WebViewComp = null;
}

/** 内存兜底 store（RN 未注入真实 store 时用；不做持久化，仅驱动指示器） */
function createMemoryStore(): PreviewStore {
  let last: PreviewPage | null = null;
  const map = new Map<string, PreviewPage>();
  return {
    save(page: PreviewPage) {
      map.set(page.preview_id, page);
      last = page;
    },
    load(id: string) {
      return map.get(id) ?? null;
    },
    list() {
      return [...map.keys()];
    },
    latest() {
      return last;
    },
  };
}

const DEMO_PAGE = (): PreviewPage =>
  buildPreviewPage(
    [
      {
        heading: 'Q3 业绩概览',
        content_html:
          '<p>营收环比增长 <strong>18%</strong>，核心指标全面达标。</p>',
        image_urls: [],
      },
      {
        heading: '关键进展',
        content_html: '<p>新签约 3 家标杆客户，续约率 92%。</p>',
        image_urls: [],
      },
      {
        heading: '下季度计划',
        content_html: '<p>聚焦渠道拓展与产品化交付。</p>',
        image_urls: [],
      },
    ],
    { latencyMs: 0 },
  );

export interface PreviewModuleProps {
  initialPage?: PreviewPage;
  store?: PreviewStore;
  daemonBaseUrl?: string;
  templateStyle?: TemplateStyle;
}

const PreviewModule: React.FC<PreviewModuleProps> = ({
  initialPage,
  store,
  daemonBaseUrl = 'http://127.0.0.1:8000',
  templateStyle = DEFAULT_TEMPLATE_STYLE,
}) => {
  const { theme } = useTheme();
  const storeRef = useRef<PreviewStore>(store ?? createMemoryStore());
  const [page, setPage] = useState<PreviewPage>(() => {
    const recovered = storeRef.current.latest();
    return initialPage ?? recovered ?? DEMO_PAGE();
  });
  const [statusText, setStatusText] = useState('尚未保存');
  const [generating, setGenerating] = useState(false);
  const [revisePrompt, setRevisePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef(page);
  pageRef.current = page;

  const autosave = useMemo(
    () =>
      new Autosave({
        store: storeRef.current,
        intervalMs: SAVE_INTERVAL_MS,
        onSaved: state => setStatusText(getStatusText(state)),
      }),
    [],
  );

  // 启动 autosave + 每秒刷新指示器文案
  useEffect(() => {
    autosave.start(() => pageRef.current);
    const ticker = setInterval(
      () => setStatusText(getStatusText(autosave.getState())),
      1000,
    );
    return () => {
      autosave.saveNow(pageRef.current);
      autosave.stop();
      clearInterval(ticker);
    };
  }, [autosave]);

  const html = useMemo(
    () => renderPreviewHtml(page, templateStyle),
    [page, templateStyle],
  );

  const onEditHeading = useCallback(
    (index: number, value: string) => {
      setPage(prev => applyTextChange(prev, index, { heading: value }));
      autosave.markDirty();
    },
    [autosave],
  );

  const onEditContent = useCallback(
    (index: number, value: string) => {
      setPage(prev =>
        applyTextChange(prev, index, { content_html: `<p>${value}</p>` }),
      );
      autosave.markDirty();
    },
    [autosave],
  );

  const onMoveUp = useCallback(
    (index: number) => {
      setPage(prev => moveSectionUp(prev, index));
      autosave.markDirty();
    },
    [autosave],
  );

  const onMoveDown = useCallback(
    (index: number) => {
      setPage(prev => moveSectionDown(prev, index));
      autosave.markDirty();
    },
    [autosave],
  );

  const onRevise = useCallback(async () => {
    if (!revisePrompt.trim()) {
      setError('请先填写"重做需求"');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await reviseWithAI({
        requirement: revisePrompt,
        currentPage: pageRef.current,
        daemonBaseUrl,
        style: templateStyle,
      });
      setPage(result.page);
      autosave.markDirty();
      autosave.saveNow(result.page);
    } catch (e: any) {
      setError(`AI 重做失败：${e?.message ?? e}`);
    } finally {
      setGenerating(false);
    }
  }, [revisePrompt, daemonBaseUrl, templateStyle, autosave]);

  const C = theme.colors;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: C.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 顶部状态栏：延迟 + 保存指示器 */}
      <View style={styles.statusBar}>
        <Text style={[styles.latency, { color: C.textMuted }]}>
          生成延迟 {page.latency_ms}ms {page.latency_ms <= 10000 ? '✓' : '✗ 超标'}
        </Text>
        <Text
          testID="save-indicator"
          style={[styles.saveIndicator, { color: C.primary }]}>
          {statusText}
        </Text>
      </View>

      {/* 预览区 */}
      <View style={[styles.previewBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        {WebViewComp ? (
          <WebViewComp
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webview}
          />
        ) : (
          <View>
            <Text style={[styles.previewFallbackHint, { color: C.textSubtle }]}>
              结构化预览（未装 react-native-webview，HTML 已由 renderer 生成 {html.length} 字符）
            </Text>
            {page.sections.map((s, i) => (
              <View key={i} style={[styles.previewSection, { borderColor: C.border }]}>
                <Text style={[styles.previewHeading, { color: C.text }]}>{s.heading}</Text>
                <Text style={[styles.previewText, { color: C.textMuted }]}>
                  {s.content_html.replace(/<[^>]+>/g, '')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 轻量编辑工具栏 */}
      <Text style={[styles.sectionTitle, { color: C.text }]}>轻量编辑</Text>
      {page.sections.map((s, i) => (
        <View key={i} style={[styles.editRow, { borderColor: C.border, backgroundColor: C.surface }]}>
          <TextInput
            style={[styles.input, { color: C.text, borderColor: C.border }]}
            value={s.heading}
            onChangeText={v => onEditHeading(i, v)}
            placeholder="章节标题"
            placeholderTextColor={C.textSubtle}
          />
          <TextInput
            style={[styles.input, styles.inputMultiline, { color: C.text, borderColor: C.border }]}
            value={s.content_html.replace(/<[^>]+>/g, '')}
            onChangeText={v => onEditContent(i, v)}
            placeholder="章节正文"
            placeholderTextColor={C.textSubtle}
            multiline
          />
          <View style={styles.reorderRow}>
            <Pressable
              onPress={() => onMoveUp(i)}
              style={[styles.smallBtn, { borderColor: C.border }]}>
              <Text style={{ color: C.text }}>↑ 上移</Text>
            </Pressable>
            <Pressable
              onPress={() => onMoveDown(i)}
              style={[styles.smallBtn, { borderColor: C.border }]}>
              <Text style={{ color: C.text }}>↓ 下移</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {/* 复杂改动：回 AI 重做 */}
      <Text style={[styles.sectionTitle, { color: C.text }]}>复杂改动（回 AI 重做）</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline, { color: C.text, borderColor: C.border }]}
        value={revisePrompt}
        onChangeText={setRevisePrompt}
        placeholder="描述新需求，如：换成面向投资人的叙事，突出增长曲线"
        placeholderTextColor={C.textSubtle}
        multiline
      />
      <Pressable
        onPress={onRevise}
        disabled={generating}
        style={[styles.reviseBtn, { backgroundColor: C.primary, opacity: generating ? 0.6 : 1 }]}>
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.reviseBtnText}>重做（AI 重新生成）</Text>
        )}
      </Pressable>
      {error ? <Text style={[styles.error, { color: '#dc2626' }]}>{error}</Text> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  latency: { fontSize: 12 },
  saveIndicator: { fontSize: 13, fontWeight: '600' },
  previewBox: { height: 320, borderWidth: 1, borderRadius: 12, overflow: 'hidden', padding: 12 },
  webview: { flex: 1 },
  previewFallbackHint: { fontSize: 11, marginBottom: 8 },
  previewSection: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  previewHeading: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  previewText: { fontSize: 13, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  editRow: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  reorderRow: { flexDirection: 'row', gap: 8 },
  smallBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  reviseBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  reviseBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  error: { fontSize: 13 },
});

export default PreviewModule;
