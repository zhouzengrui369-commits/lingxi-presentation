/**
 * TemplateScreen — 模板导入屏 (T-1.3)
 *
 * 包装 TemplateModule 提供:
 * - 当前选中 template_id 的本地状态（无模板时默认 builtin_business_light）
 * - mock 的 PPTX 导入流程（点击后跑 cli 分析 testdata 第一个模板）
 * - 把 TemplateModule 嵌入 RN 路由
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */
import React, { useCallback, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { useTheme } from '../theme';
import {
  TemplateModule,
  type TemplateModuleProps,
} from '../modules/template';
import type { TemplateStyle } from '../modules/template/style_analyzer';

const TemplateScreen: React.FC = () => {
  const { theme } = useTheme();
  const [templateId, setTemplateId] = useState<
    'builtin_business_light' | 'builtin_business_dark'
  >('builtin_business_light');
  const [analysis, setAnalysis] = useState<TemplateStyle | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);

  const handleSelectBuiltin = useCallback<TemplateModuleProps['onSelectBuiltin']>((id) => {
    setTemplateId(id);
    setStatus(`已切换到 ${id}`);
  }, []);

  // 真接入 T-1.1 file_import 后，这里改成调 file_import API 拿 PPTX 字节 → 走 pptx_to_html + style_analyzer。
  // 当前 MVP: 弹一个静态"导入示例"提示，并把 testdata 第一个分析结果模拟为导入。
  const handleImport = useCallback(async () => {
    setStatus('正在调用 daemon 分析 testdata 第一个模板…');
    try {
      // 通过 dynamic import 拿 cli（避免 RN bundle 把 node-only 代码拖进去）
      const { analyzeHeuristic } = await import('../modules/template/style_analyzer');
      const result = analyzeHeuristic(
        'apps/desktop/testdata/templates/business-dark.pptx',
      );
      setAnalysis(result);
      setStatus(`✓ 已分析: ${result.name} (${result.page_count} 页, ${result.layout_types.length} 种版式)`);
    } catch (err) {
      const e = err as Error;
      setStatus(`✗ 导入失败: ${e.message}`);
    }
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <TemplateModule
        activeTemplateId={templateId}
        onSelectBuiltin={handleSelectBuiltin}
        onImportPptx={handleImport}
        lastAnalysis={analysis}
        status={status}
      />
      <View style={styles.tag}>
        <Text style={styles.tagText}>T-1.3 · 模板导入与适配</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  tag: {
    position: 'absolute',
    right: 12,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(45,108,223,0.12)',
  },
  tagText: { fontSize: 11, color: '#2D6CDF', fontWeight: '600' },
});

export default TemplateScreen;
