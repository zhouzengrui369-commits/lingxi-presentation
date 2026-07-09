/**
 * 占位屏 — T-1.4 HTML 预览与编辑
 * 灵犀演示 · Phase 1 · T-1.0.b（仅占位，不实现业务逻辑）
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const PreviewScreen: React.FC = () => {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>HTML 预览</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        T-1.4 等待实现
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
          本模块负责：AI 优先出 HTML 预览（不直接成品），
          {'\n'}轻量改文字/段落直接在预览页改，复杂改动回 AI 重生成；实时保存。
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

export default PreviewScreen;
