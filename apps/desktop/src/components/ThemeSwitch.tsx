/**
 * 主题切换按钮 — 顶部右上角，实时切换 light/dark
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export const ThemeSwitch: React.FC = () => {
  const { mode, toggle, theme } = useTheme();
  const isLight = mode === 'light';

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="切换主题"
    >
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: isLight ? '#FFD56B' : '#5A6478',
            },
          ]}
        />
        <Text style={[styles.label, { color: theme.colors.text }]}>
          {isLight ? 'Light' : 'Dark'}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
