/**
 * KB 关联补全 — 从 T-1.1 wiki_kb 中检索最相关的条目，用于 advisor 选项 AI 推荐
 * 灵犀演示 · Phase 1 · T-1.2
 *
 * 当前实现：基于关键词 + 标签匹配的本地启发式
 *
 * TODO(T-1.1-merge): 当 T-1.1 file_kb 完成并 merge 后：
 *   - 替换本文件 mock 数据为 `import { loadWikiKb } from '../file_kb/storage'`
 *   - 替换 suggest() 中的本地关键词匹配为 T-1.1 wiki.ts 的 search 接口
 *   - 保留本文件的 kb_linker 接口签名（autocomplete + linkOptions）
 *
 * PRD §3.2 验收：
 *   - 用户答"主题=季度汇报"时，自动补全"受众=部门同事"等关联选项
 *   - 实现方式：同 scenario 模板下、相同 tag 的其它选项视为关联
 */

import type {
  KBEntryLite,
  AdvisorOption,
  AdvisorQuestion,
  ScenarioId,
} from './types';
import { SCENARIO_TEMPLATES } from './questions';

const MOCK_KB: KBEntryLite[] = [
  {
    entry_id: '00000000-0000-4000-8000-000000000001',
    title: '季度汇报 PPT 最佳实践 — 部门同事受众',
    summary: '季度汇报应当围绕 KPI 趋势展开，辅以下季度 OKR 展望。受众为部门同事 dept_peers 时，建议弱化财务细节，多用同比环比 yoy_qoq。',
    tags: ['quarterly_review', 'ppt', 'kpi', 'audience:dept_peers', 'dept_peers', 'yoy_qoq', 'kpi_trend', 'business_growth'],
    confidence: 0.95,
  },
  {
    entry_id: '00000000-0000-4000-8000-000000000002',
    title: '管理层季度汇报要点',
    summary: '面向管理层的季度汇报应当突出战略对齐、风险预警、资源请求三个维度。强烈建议加上同比环比 yoy_qoq 数据支撑结论。',
    tags: ['quarterly_review', 'ppt', 'audience:management', 'management', 'yoy_qoq', 'forecast_okr', 'product_iteration'],
    confidence: 0.92,
  },
  {
    entry_id: '00000000-0000-4000-8000-000000000003',
    title: '周报模板与节奏',
    summary: '周报建议使用 "完成/进行中/阻塞/下周计划" 四段式。控制在 5 分钟可读完。重点突出 delivery / incident 类工作。',
    tags: ['weekly_report', 'template', 'delivery', 'incident'],
    confidence: 0.88,
  },
  {
    entry_id: '00000000-0000-4000-8000-000000000004',
    title: '月度运营报告常用指标',
    summary: '营收、用户增长、留存、成本是月报四大核心指标，建议每指标配趋势图与同比/环比 yoy_qoq 数据。投资方 audience 最关心这些。',
    tags: ['monthly_report', 'kpi', 'metrics', 'yoy_qoq', 'revenue', 'investor'],
    confidence: 0.90,
  },
  {
    entry_id: '00000000-0000-4000-8000-000000000005',
    title: '答辩 PPT 节奏控制',
    summary: '答辩 PPT 前 30 秒决定第一印象。建议用 1 页封面 + 1 页背景 + 1 页方法 + 5-8 页结果 + 1 页致谢。突出 contribution 创新点。',
    tags: ['thesis_ppt', 'structure', 'contribution'],
    confidence: 0.85,
  },
  {
    entry_id: '00000000-0000-4000-8000-000000000006',
    title: '产品发布三段式叙事',
    summary: '产品发布推荐 "为什么做 → 做了什么 → 带来什么价值" 三段式 narrative 叙事，突出 3 个核心 features。',
    tags: ['product_launch', 'narrative', 'three'],
    confidence: 0.91,
  },
];

export interface KBSearchResult {
  entries: KBEntryLite[];
  score: number;
}

export function searchKB(query: string, scenario?: ScenarioId, limit = 5): KBSearchResult {
  const tokens = query.toLowerCase().split(/[\s,，。、]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return { entries: [], score: 0 };

  const scored = MOCK_KB.map(entry => {
    let score = 0;
    let matchedAny = false;
    const tagSet = new Set(entry.tags.map(t => t.toLowerCase()));
    const titleLc = entry.title.toLowerCase();
    const summaryLc = entry.summary.toLowerCase();

    // 必须至少命中 1 个 token 才算匹配（否则 score 视为 0）
    if (tokens.some(t => titleLc.includes(t) || summaryLc.includes(t) || tagSet.has(t))) {
      matchedAny = true;
    }
    if (!matchedAny) return { entry, score: 0 };

    if (scenario && tagSet.has(scenario)) score += 0.3;
    if (tokens.some(t => titleLc.includes(t))) score += 0.4;
    for (const tok of tokens) {
      if (tagSet.has(tok)) score += 0.2;
    }
    if (tokens.some(t => summaryLc.includes(t))) score += 0.1;
    // confidence 作为微调（不影响排序太多）
    score = score * 0.95 + entry.confidence * 0.05;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).filter(s => s.score > 0);
  return {
    entries: top.map(s => s.entry),
    score: top.length > 0 ? top[0].score : 0,
  };
}

export function autocompleteForAnswers(
  scenario: ScenarioId,
  answeredQuestionIdToValue: Record<string, string | string[]>
): Set<string> {
  const answeredValues: string[] = [];
  for (const v of Object.values(answeredQuestionIdToValue)) {
    if (Array.isArray(v)) answeredValues.push(...v);
    else answeredValues.push(v);
  }
  if (answeredValues.length === 0) return new Set();

  // 用 answered 值 + scenario 一起搜索（fallback：scenario 本身也作为 query token）
  const queryParts = [...answeredValues, scenario];
  const query = queryParts.join(' ');
  const search = searchKB(query, scenario, 3);
  const linkedTags = new Set<string>();
  for (const entry of search.entries) {
    for (const tag of entry.tags) linkedTags.add(tag.toLowerCase());
  }

  const scenTmpl = SCENARIO_TEMPLATES.find(s => s.scenario_id === scenario);
  if (!scenTmpl) return new Set();

  const linkedValues = new Set<string>();
  for (const q of scenTmpl.questions) {
    for (const opt of q.option_templates ?? []) {
      if (opt.tag === 'kb_default') {
        if (linkedTags.has(scenario)) {
          linkedValues.add(opt.value);
          continue;
        }
      }
      if (linkedTags.has(opt.value)) {
        linkedValues.add(opt.value);
      }
    }
  }
  return linkedValues;
}

export function annotateOptionsWithKB(
  options: AdvisorOption[],
  linkedValues: Set<string>
): AdvisorOption[] {
  return options.map(opt => ({
    ...opt,
    kb_linked: opt.kb_linked || linkedValues.has(opt.value),
  }));
}

export function annotateQuestionsWithKB(
  questions: AdvisorQuestion[],
  linkedValues: Set<string>
): AdvisorQuestion[] {
  return questions.map(q => ({
    ...q,
    options: annotateOptionsWithKB(q.options, linkedValues),
  }));
}

export function peekMockKB(limit = 10): KBEntryLite[] {
  return MOCK_KB.slice(0, limit);
}
