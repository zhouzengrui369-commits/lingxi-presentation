/**
 * TemplateModule — T-1.3 模板导入 UI（React Native）
 *
 * 功能：
 *   1. 拖拽 / 选择 .pptx → 调 cli.ts 抽 PPTX + 分析风格
 *   2. 显示 TemplateStyle JSON + HTML 预览
 *   3. 提供内置主题选择（浅/深）
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '../../theme';
import { BUILTIN_LIGHT, BUILTIN_DARK, listBuiltinThemes, decorationsToCssClasses } from './builtin_themes';
import type { TemplateStyle } from './types';

export interface ImportResult {
  source: 'imported' | 'builtin';
  template_style: TemplateStyle;
  html_preview: string;
  input_file: string;
  generated_at: string;
}

export interface TemplateModuleProps {
  /** 已注入的导入函数（默认 = 调 cli.ts 包装） */
  onImport?: (inputPath: string, builtinId?: 'builtin_business_light' | 'builtin_business_dark') => Promise<ImportResult>;
}

const DEFAULT_IMPORT_HINT = '在桌面端真机调试时通过 native module 触发 cli.ts；当前为占位提示。';

export const TemplateModule: React.FC<TemplateModuleProps> = ({ onImport }) => {
  const { theme } = useTheme();
  const [inputPath, setInputPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedBuiltin, setSelectedBuiltin] = useState<'builtin_business_light' | 'builtin_business_dark'>('builtin_business_light');

  const handleImport = useCallback(async () => {
    if (!inputPath.trim()) {
      setErrorMsg('请输入 .pptx 文件路径');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const fn = onImport ?? (async () => {
        // 占位实现：实际真机调试走 native bridge（macOS / Win 平台 sub-agent 处理）
        throw new Error(DEFAULT_IMPORT_HINT);
      });
      const out = await fn(inputPath.trim());
      setResult(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      Alert.alert('导入失败', msg);
    } finally {
      setLoading(false);
    }
  }, [inputPath, onImport]);

  const handlePickBuiltin = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const fn = onImport ?? (async () => {
        throw new Error(DEFAULT_IMPORT_HINT);
      });
      const out = await fn('', selectedBuiltin);
      setResult(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [onImport, selectedBuiltin]);

  const renderStyleCard = (s: TemplateStyle) => (
    <View
      key={s.template_id}
      style={[
        styles.styleCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.styleName, { color: theme.colors.text }]}>{s.name}</Text>
      <Text style={[styles.styleMeta, { color: theme.colors.textMuted }]}>
        ID: {s.template_id} · {s.page_count} 页 · {s.layout_types.length} 版式
      </Text>
      <View style={styles.paletteRow}>
        {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map(k => (
          <View key={k} style={styles.swatchWrap}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: s.palette[k], borderColor: theme.colors.border },
              ]}
            />
            <Text style={[styles.swatchLabel, { color: theme.colors.textSubtle }]}>
              {k}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.styleMeta, { color: theme.colors.textMuted }]}>
        字体: {s.fonts.heading} / {s.fonts.body}
      </Text>
      <Text style={[styles.styleMeta, { color: theme.colors.textMuted }]}>
        装饰: {s.decorations.join(', ') || '(none)'}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>模板导入与适配</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        T-1.3 · PPTX → HTML + AI 风格分析
      </Text>

      {/* 1. 导入区 */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>1. 导入 .pptx 模板</Text>
        <TextInput
          value={inputPath}
          onChangeText={setInputPath}
          placeholder="/path/to/your/template.pptx"
          placeholderTextColor={theme.colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        />
        <View style={styles.row}>
          <Pressable
            onPress={handleImport}
            disabled={loading}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              {
                backgroundColor: theme.colors.primary,
                opacity: pressed || loading ? 0.6 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnLabel}>导入并分析</Text>
            )}
          </Pressable>
        </View>
        {errorMsg && (
          <Text style={[styles.error, { color: theme.colors.danger }]}>{errorMsg}</Text>
        )}
      </View>

      {/* 2. 内置主题选择 */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>2. 无模板？使用内置主题</Text>
        <View style={styles.builtinRow}>
          {listBuiltinThemes().map(t => {
            const isActive = selectedBuiltin === t.template_id;
            return (
              <Pressable
                key={t.template_id}
                onPress={() => setSelectedBuiltin(t.template_id as typeof selectedBuiltin)}
                style={({ pressed }) => [
                  styles.builtinBtn,
                  {
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    backgroundColor: t.palette.background,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.builtinLabel,
                    { color: t.palette.text },
                  ]}
                >
                  {t.name}
                </Text>
                <View style={styles.builtinSwatches}>
                  <View style={[styles.swatchSm, { backgroundColor: t.palette.primary }]} />
                  <View style={[styles.swatchSm, { backgroundColor: t.palette.secondary }]} />
                  <View style={[styles.swatchSm, { backgroundColor: t.palette.accent }]} />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={handlePickBuiltin}
          disabled={loading}
          style={({ pressed }) => [
            styles.btn,
            styles.btnSecondary,
            {
              borderColor: theme.colors.primary,
              opacity: pressed || loading ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.btnLabelSecondary, { color: theme.colors.primary }]}>
            应用内置主题
          </Text>
        </Pressable>
      </View>

      {/* 3. 风格分析结果 */}
      {result && (
        <View>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            3. 风格分析结果 · {result.source === 'builtin' ? '内置' : '导入'}
          </Text>
          {renderStyleCard(result.template_style)}
          <View style={[styles.previewBox, { borderColor: theme.colors.border }]}>
            <Text style={[styles.previewLabel, { color: theme.colors.textMuted }]}>
              HTML 预览（前 320 字）
            </Text>
            <Text
              style={[styles.previewText, { color: theme.colors.text }]}
              numberOfLines={12}
            >
              {result.html_preview.slice(0, 320)}
              {result.html_preview.length > 320 ? '...' : ''}
            </Text>
            <Text style={[styles.previewMeta, { color: theme.colors.textSubtle }]}>
              decorations CSS class: {decorationsToCssClasses(result.template_style.decorations)}
            </Text>
          </View>
        </View>
      )}

      {/* 4. 当前选中主题持久显示 */}
      <View>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          4. 内置主题参考
        </Text>
        {renderStyleCard(BUILTIN_LIGHT)}
        {renderStyleCard(BUILTIN_DARK)}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnLabelSecondary: { fontWeight: '600', fontSize: 14 },
  error: { fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  styleCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 8, marginBottom: 12 },
  styleName: { fontSize: 16, fontWeight: '700' },
  styleMeta: { fontSize: 12 },
  paletteRow: { flexDirection: 'row', gap: 12, marginVertical: 4 },
  swatchWrap: { alignItems: 'center', gap: 4 },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 1 },
  swatchLabel: { fontSize: 10 },
  swatchSm: { width: 16, height: 16, borderRadius: 4 },
  builtinRow: { flexDirection: 'row', gap: 12 },
  builtinBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    gap: 8,
  },
  builtinLabel: { fontSize: 14, fontWeight: '600' },
  builtinSwatches: { flexDirection: 'row', gap: 6 },
  previewBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  previewLabel: { fontSize: 11, fontWeight: '600' },
  previewText: { fontSize: 11, fontFamily: 'Menlo' },
  previewMeta: { fontSize: 10, marginTop: 4 },
});

export default TemplateModule;