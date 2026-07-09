/**
 * 路由 — 5 模块（自研极简路由，5 个 tab + 单一内容区）
 * 不引 react-navigation 这种重依赖，scaffold 阶段避免拖慢构建。
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';
import FileKBScreen from './screens/FileKBScreen';
import AdvisorScreen from './screens/AdvisorScreen';
import TemplateScreen from './screens/TemplateScreen';
import PreviewScreen from './screens/PreviewScreen';
import OutputScreen from './screens/OutputScreen';

export type RouteKey = 'file-kb' | 'advisor' | 'template' | 'preview' | 'output';

export const ROUTES: { key: RouteKey; label: string; tag: string; component: React.FC }[] = [
  { key: 'file-kb', label: '文件管理', tag: 'T-1.1', component: FileKBScreen },
  { key: 'advisor', label: '顾问交互', tag: 'T-1.2', component: AdvisorScreen },
  { key: 'template', label: '模板', tag: 'T-1.3', component: TemplateScreen },
  { key: 'preview', label: '预览', tag: 'T-1.4', component: PreviewScreen },
  { key: 'output', label: '输出', tag: 'T-1.5', component: OutputScreen },
];

export const Router: React.FC = () => {
  const { theme } = useTheme();
  const [active, setActive] = useState<RouteKey>('file-kb');
  const Active = ROUTES.find(r => r.key === active)?.component ?? FileKBScreen;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Top tab bar */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {ROUTES.map(route => {
            const isActive = route.key === active;
            return (
              <Pressable
                key={route.key}
                onPress={() => setActive(route.key)}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    borderBottomColor: isActive ? theme.colors.primary : 'transparent',
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isActive ? theme.colors.text : theme.colors.textMuted,
                    },
                  ]}
                >
                  {route.label}
                </Text>
                <Text style={[styles.tabTag, { color: theme.colors.textSubtle }]}>
                  {route.tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content area */}
      <View style={styles.content}>
        <Active />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabScroll: {
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 2,
    alignItems: 'flex-start',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTag: {
    fontSize: 11,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
});
