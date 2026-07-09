/**
 * test_multi_turn_flow — 多轮交互流程（用 pure reducer 测试）
 */
import {
  advisorReducer,
  initialAdvisorState,
} from '../controller';
import { computeProgress } from '../progress';
import type { AdvisorControllerState } from '../controller';

describe('test_multi_turn_flow', () => {
  test('完整 4 轮 季度汇报交互（选场景 → 4 题 → 完成）', () => {
    let s: AdvisorControllerState = { ...initialAdvisorState };

    expect(s.scenario).toBeUndefined();
    expect(s.currentQ).toBeUndefined();

    s = advisorReducer(s, { type: 'pickScenario', id: 'quarterly_review' });
    expect(s.scenario).toBe('quarterly_review');
    expect(s.currentQ).toBeDefined();
    expect(s.currentQ!.text).toBe('本季度汇报的核心主题是什么？');
    expect(s.progress.total).toBe(4);

    s = advisorReducer(s, { type: 'answer', value: 'business_growth' });
    expect(s.history.length).toBe(1);
    expect(s.currentQ).toBeDefined();
    expect(s.currentQ!.text).toBe('受众是谁？');
    expect(s.kbHint).toBeDefined();
    expect(s.kbHint!.length).toBeGreaterThan(0);

    s = advisorReducer(s, { type: 'answer', value: 'dept_peers' });
    expect(s.history.length).toBe(2);
    expect(s.currentQ!.text).toBe('PPT 页数偏好？');

    s = advisorReducer(s, { type: 'answer', value: 'standard' });
    expect(s.currentQ!.text).toBe('数据展示深度？');

    s = advisorReducer(s, { type: 'answer', value: ['kpi_trend', 'yoy_qoq'] });
    expect(s.history.length).toBe(4);
    expect(s.currentQ).toBeUndefined();
    expect(s.progress.completed).toBe(true);
    expect(s.progress.percent).toBe(100);
  });

  test('startOver 重置', () => {
    let s: AdvisorControllerState = { ...initialAdvisorState };
    s = advisorReducer(s, { type: 'pickScenario', id: 'weekly_report' });
    s = advisorReducer(s, { type: 'answer', value: 'personal' });
    expect(s.scenario).toBe('weekly_report');
    expect(s.history.length).toBe(1);

    s = advisorReducer(s, { type: 'startOver' });
    expect(s.history.length).toBe(0);
    expect(s.scenario).toBeUndefined();
  });

  test('不存在的 scenario id 不抛错', () => {
    const s = advisorReducer(initialAdvisorState, {
      type: 'pickScenario',
      id: 'nonexistent' as any,
    });
    expect(s.scenario).toBeUndefined();
  });

  test('answer 在没选场景时是 no-op', () => {
    const s = advisorReducer(initialAdvisorState, { type: 'answer', value: 'x' });
    expect(s.history.length).toBe(0);
    expect(s.currentQ).toBeUndefined();
  });

  test('annual_summary（2 题）完整流程', () => {
    let s: AdvisorControllerState = { ...initialAdvisorState };
    s = advisorReducer(s, { type: 'pickScenario', id: 'annual_summary' });
    expect(s.progress.total).toBe(2);
    s = advisorReducer(s, { type: 'answer', value: 'team' });
    expect(s.currentQ).toBeDefined();
    s = advisorReducer(s, { type: 'answer', value: ['biz', 'tech'] });
    expect(s.currentQ).toBeUndefined();
    expect(s.progress.completed).toBe(true);
  });

  test('setLoading / setError 辅助 action', () => {
    let s = advisorReducer(initialAdvisorState, { type: 'setLoading', loading: true });
    expect(s.loading).toBe(true);
    s = advisorReducer(s, { type: 'setError', error: '网络异常' });
    expect(s.error).toBe('网络异常');
    s = advisorReducer(s, { type: 'setError', error: undefined });
    expect(s.error).toBeUndefined();
  });

  test('computeProgress 是 reducer 内部一致的纯函数', () => {
    expect(computeProgress(2, 4).percent).toBe(50);
    expect(computeProgress(4, 4).completed).toBe(true);
  });
});
