/**
 * test_text_input_fallback — 文字输入兜底（任意时刻可用）
 */
import { computeProgress } from '../progress';
import {
  getScenarioTemplate,
  renderQuestionFromTemplate,
  SCENARIO_TEMPLATES,
} from '../questions';

describe('test_text_input_fallback', () => {
  test('computeProgress：答 0 题 → 0%', () => {
    const p = computeProgress(0, 5);
    expect(p.percent).toBe(0);
    expect(p.completed).toBe(false);
    expect(p.current).toBe(1);
    expect(p.total).toBe(5);
  });

  test('computeProgress：答一半 → 50%', () => {
    const p = computeProgress(3, 6);
    expect(p.percent).toBe(50);
    expect(p.completed).toBe(false);
  });

  test('computeProgress：全部答完 → 100% completed', () => {
    const p = computeProgress(5, 5);
    expect(p.percent).toBe(100);
    expect(p.completed).toBe(true);
  });

  test('computeProgress：超出总数 → percent clamp 到 100', () => {
    const p = computeProgress(10, 5);
    expect(p.percent).toBeLessThanOrEqual(100);
  });

  test('任意场景至少存在 1 个 text 模式题', () => {
    let totalText = 0;
    for (const scen of SCENARIO_TEMPLATES) {
      for (const q of scen.questions) {
        if (q.input_mode === 'text') totalText += 1;
      }
    }
    expect(totalText).toBeGreaterThanOrEqual(1);
  });

  test('text 模式题渲染后 options 为空数组', () => {
    const ep = getScenarioTemplate('event_pitch');
    const textTmpl = ep?.questions.find(q => q.input_mode === 'text');
    expect(textTmpl).toBeDefined();
    const q = renderQuestionFromTemplate(textTmpl!);
    expect(q.options).toEqual([]);
    expect(q.input_mode).toBe('text');
  });

  test('text 模式题仍然可以 required=true', () => {
    const ep = getScenarioTemplate('event_pitch');
    const textTmpl = ep?.questions.find(q => q.input_mode === 'text');
    expect(typeof textTmpl?.required).toBe('boolean');
  });
});
