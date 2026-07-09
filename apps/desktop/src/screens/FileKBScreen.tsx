/**
 * 占位屏 — T-1.1 文件管理与 LLM Wiki 知识库
 * 灵犀演示 · Phase 1 · T-1.0.b（仅占位，不实现业务逻辑）
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const FileKBScreen: React.FC = () => {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>文件管理 · LLM Wiki</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        T-1.1 等待实现
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.placeholder, { color: theme.colors.textSubtle }]}>
          本模块负责：本地单文件/文件夹导入（Word/PDF/Excel/PPTX/MD/JPG/PNG），
          {'\n'}LLM Wiki 整理，仅本地存储。
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14 },
  card: {
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  placeholder: { fontSize: 14, lineHeight: 22 },
});

export default FileKBScreen;
