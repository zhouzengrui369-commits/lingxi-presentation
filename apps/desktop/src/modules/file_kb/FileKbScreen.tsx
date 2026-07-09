/**
 * File KB RN 屏幕组件 — T-1.1
 *
 * 集成 FileKbManager：
 *   - 选文件 / 选文件夹按钮（web 走 input[type=file] + webkitdirectory；RN 端走文档选择器 stub）
 *   - 7 格式导入状态展示（listFiles 实时）
 *   - LLM Wiki 整理结果展示（listEntries 实时）
 *   - 本地 KB 路径展示 + manifest 统计
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../../theme';
import { FileKbManager } from './manager';
import { FileImportRecord, WikiKbEntry } from './storage';

interface ImportProgressEvent {
  stage: string;
  path?: string;
  file_id?: string;
  entry_id?: string;
  title?: string;
  reason?: string;
  error?: string;
  skipped?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  ok: '#22c55e',
  partial: '#f59e0b',
  failed: '#ef4444',
};

const FileKbScreen: React.FC = () => {
  const { theme } = useTheme();
  const [manager] = useState(() => new FileKbManager());
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<FileImportRecord[]>([]);
  const [entries, setEntries] = useState<WikiKbEntry[]>([]);
  const [progress, setProgress] = useState<ImportProgressEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化 + 拉一次文件/条目列表
  const refresh = useCallback(async () => {
    try {
      const fl = await manager.getStorage().listFiles();
      const en = await manager.getStorage().listEntries();
      setFiles(fl);
      setEntries(en);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [manager]);

  useEffect(() => {
    manager.init().then(() => {
      setReady(true);
      refresh();
    });
  }, [manager, refresh]);

  // 模拟导入：实际项目里这里接 RN 文档选择器或 web input
  // 这里给一个「导入测试样本」按钮，把 apps/desktop/testdata 全部 import 进来
  const importTestData = useCallback(async () => {
    setBusy(true);
    setError(null);
    setProgress([]);
    try {
      const path = require('path');
      const testdataDir = path.resolve(__dirname, '../../../../testdata');
      await manager.importPaths([testdataDir], {
        forceLocalWiki: true,
        onProgress: (stage, payload) => {
          setProgress(prev => [...prev.slice(-19), { stage, ...(payload as Record<string, unknown>) } as ImportProgressEvent]);
        },
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [manager, refresh]);

  const manifest = ready ? manager.getStorage().getManifest() : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: theme.colors.text }]}>文件管理 · LLM Wiki</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          T-1.1 · 7 格式本地导入 + LLM Wiki 自动整理（无 RAG）
        </Text>

        {/* 操作区 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.actionRow}>
            <Pressable
              disabled={!ready || busy}
              onPress={importTestData}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: !ready || busy ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnLabel}>{ready ? '导入测试样本' : '初始化中...'}</Text>
              )}
            </Pressable>
            <Pressable
              disabled={!ready}
              onPress={refresh}
              style={({ pressed }) => [
                styles.btnSecondary,
                {
                  borderColor: theme.colors.border,
                  opacity: !ready || pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.btnSecondaryLabel, { color: theme.colors.text }]}>
                刷新列表
              </Text>
            </Pressable>
          </View>
          {error && <Text style={styles.errorText}>错误：{error}</Text>}
        </View>

        {/* 库统计 */}
        {manifest && (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>库统计</Text>
            <Text style={[styles.statLine, { color: theme.colors.textMuted }]}>
              路径：{manager.kbRoot}
            </Text>
            <Text style={[styles.statLine, { color: theme.colors.textMuted }]}>
              文件数：{manifest.file_count} · 条目数：{manifest.entry_count} · 总大小：
              {(manifest.total_size_bytes / 1024 / 1024).toFixed(2)} MB
            </Text>
          </View>
        )}

        {/* 已导入文件（7 格式） */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            已导入文件（{files.length}）
          </Text>
          {files.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textSubtle }]}>暂无文件</Text>
          ) : (
            files.map(f => (
              <View key={f.file_id} style={styles.row}>
                <View
                  style={[styles.statusDot, { backgroundColor: STATUS_COLOR[f.status] ?? '#999' }]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{f.name}</Text>
                  <Text style={[styles.rowMeta, { color: theme.colors.textSubtle }]}>
                    {f.format.toUpperCase()} · {(f.size_bytes / 1024).toFixed(1)} KB · {f.status}
                    {f.error ? ` · ${f.error.slice(0, 40)}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Wiki 条目 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Wiki 知识条目（{entries.length}）
          </Text>
          {entries.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textSubtle }]}>暂无条目</Text>
          ) : (
            entries.map(e => (
              <View key={e.entry_id} style={[styles.entry, { borderBottomColor: theme.colors.border }]}>
                <Text style={[styles.entryTitle, { color: theme.colors.text }]}>{e.title}</Text>
                <Text style={[styles.entrySummary, { color: theme.colors.textMuted }]}>
                  {e.summary.slice(0, 120)}
                  {e.summary.length > 120 ? '…' : ''}
                </Text>
                <View style={styles.tagRow}>
                  {e.tags.slice(0, 5).map(t => (
                    <View
                      key={t}
                      style={[styles.tag, { backgroundColor: theme.colors.primary + '20' }]}
                    >
                      <Text style={[styles.tagLabel, { color: theme.colors.primary }]}>{t}</Text>
                    </View>
                  ))}
                  <Text style={[styles.confText, { color: theme.colors.textSubtle }]}>
                    conf {e.confidence.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 实时进度 */}
        {progress.length > 0 && (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>进度</Text>
            {progress.slice(-10).map((p, i) => (
              <Text key={i} style={[styles.progressLine, { color: theme.colors.textSubtle }]}>
                [{p.stage}] {(p.path ?? p.title ?? '').toString().split('/').pop()}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  actionRow: { flexDirection: 'row', gap: 10 },
  btn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 140 },
  btnLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnSecondary: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryLabel: { fontSize: 14, fontWeight: '500' },
  errorText: { color: '#ef4444', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  statLine: { fontSize: 12, fontFamily: 'Menlo' },
  empty: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 13, fontWeight: '500' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  entry: { paddingVertical: 10, borderBottomWidth: 1 },
  entryTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  entrySummary: { fontSize: 12, lineHeight: 18, marginBottom: 6 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagLabel: { fontSize: 11, fontWeight: '500' },
  confText: { fontSize: 10, marginLeft: 6 },
  progressLine: { fontSize: 11, fontFamily: 'Menlo' },
});

export default FileKbScreen;