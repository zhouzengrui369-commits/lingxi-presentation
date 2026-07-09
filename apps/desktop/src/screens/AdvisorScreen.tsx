/**
 * 占位屏 — T-1.2 顾问式需求交互
 * 灵犀演示 · Phase 1 · T-1.0.b（仅占位，不实现业务逻辑）
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const AdvisorScreen: React.FC = () => {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>顾问式交互</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        T-1.2 等待实现
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
          本模块负责：AI 主动选项提问（90% 提问带选项），
          {'\n'}选项点击 + 语音 + 文字三模输入，实时关联知识库补全。
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

export default AdvisorScreen;
