/**
 * test_progress_bar_state — 进度条状态机
 */
import { computeProgress } from '../progress';
import { getScenarioTemplate } from '../questions';

describe('test_progress_bar_state', () => {
  test('初始态（0 答 0 总） → percent=0, completed=false', () => {
    const p = computeProgress(0, 0);
    expect(p.percent).toBe(0);
    expect(p.completed).toBe(false);
  });

  test('第一题答完 → percent > 0', () => {
    const p = computeProgress(1, 4);
    expect(p.percent).toBe(25);
    expect(p.current).toBe(2);
  });

  test('每场景的问题总数 ≥ 2', () => {
    const ids = [
      'quarterly_review',
      'weekly_report',
      'monthly_report',
      'thesis_ppt',
      'event_pitch',
      'annual_summary',
      'product_launch',
      'project_kickoff',
    ] as const;
    for (const id of ids) {
      const tmpl = getScenarioTemplate(id);
      expect(tmpl).toBeDefined();
      expect(tmpl!.questions.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('进度 percent 始终在 [0, 100]', () => {
    for (let a = 0; a <= 10; a++) {
      for (let t = 1; t <= 10; t++) {
        const p = computeProgress(a, t);
        expect(p.percent).toBeGreaterThanOrEqual(0);
        expect(p.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  test('current 始终 ≤ total', () => {
    const p = computeProgress(5, 5);
    expect(p.current).toBeLessThanOrEqual(p.total);
  });

  test('completed = true 时 percent = 100', () => {
    const p = computeProgress(4, 4);
    expect(p.completed).toBe(true);
    expect(p.percent).toBe(100);
  });

  test('进度 over-answered → percent clamp 100', () => {
    const p = computeProgress(10, 5);
    expect(p.percent).toBe(100);
    expect(p.current).toBe(5);
  });
});
