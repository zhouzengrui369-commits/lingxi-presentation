/**
 * App 主组件 — Header(欢迎 + 主题切换) + Router
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './theme';
import { Router } from './router';
import { ThemeSwitch } from './components/ThemeSwitch';

const Shell: React.FC = () => {
  const { mode, theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={mode === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView
        style={[styles.safe, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.background,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.brand}>
            <Text style={[styles.brandTitle, { color: theme.colors.text }]}>灵犀演示</Text>
            <Text style={[styles.brandSubtitle, { color: theme.colors.textMuted }]}>
              AI 驱动的办公内容生成桌面 App · Phase 1
            </Text>
          </View>
          <ThemeSwitch />
        </View>

        {/* Router */}
        <Router />
      </SafeAreaView>
    </View>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider initialMode="light">
      <Shell />
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  brand: { gap: 2 },
  brandTitle: { fontSize: 18, fontWeight: '700' },
  brandSubtitle: { fontSize: 12 },
});

export default App;
