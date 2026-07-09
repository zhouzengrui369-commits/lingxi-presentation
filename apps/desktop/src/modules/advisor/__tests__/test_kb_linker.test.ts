/**
 * test_kb_linker_autocomplete — PRD §3.2 第 5 条：
 *   "用户答'主题=季度汇报'时，自动补全'受众=部门同事'等关联选项"
 */
import {
  searchKB,
  autocompleteForAnswers,
  annotateOptionsWithKB,
  annotateQuestionsWithKB,
  peekMockKB,
} from '../kb_linker';

describe('test_kb_linker_autocomplete', () => {
  test('peekMockKB 返回 ≥ 5 个 KB 条目', () => {
    const kb = peekMockKB();
    expect(kb.length).toBeGreaterThanOrEqual(5);
    for (const entry of kb) {
      expect(entry.entry_id).toBeTruthy();
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThanOrEqual(50);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.confidence).toBeGreaterThan(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('searchKB：关键词命中 KB title/tags', () => {
    const r = searchKB('季度汇报');
    expect(r.entries.length).toBeGreaterThanOrEqual(1);
    expect(r.entries[0].title).toContain('季度汇报');
  });

  test('searchKB：scenario 过滤生效', () => {
    const r = searchKB('汇报', 'quarterly_review');
    expect(r.entries.length).toBeGreaterThanOrEqual(1);
    for (const e of r.entries) {
      expect(e.tags).toContain('quarterly_review');
    }
  });

  test('searchKB：无关 query 返回空', () => {
    const r = searchKB('xyznever123');
    expect(r.entries.length).toBe(0);
  });

  test('autocompleteForAnswers：答"主题=季度汇报" → 触发"部门同事"关联', () => {
    const fakeQuestionId = 'fake-q-id-1';
    const linked = autocompleteForAnswers(
      'quarterly_review',
      { [fakeQuestionId]: 'quarterly_review' }
    );
    expect(linked.size).toBeGreaterThan(0);
    expect(linked.has('dept_peers')).toBe(true);
  });

  test('autocompleteForAnswers：答"受众=管理层" → 数据深度推荐 yoy_qoq', () => {
    const linked = autocompleteForAnswers(
      'quarterly_review',
      { 'q1': 'management' }
    );
    expect(linked.has('yoy_qoq')).toBe(true);
  });

  test('annotateOptionsWithKB 不可变 + kb_linked 标记', () => {
    const opts = [
      { label: 'A', value: 'a', kb_linked: false },
      { label: 'B', value: 'b', kb_linked: false },
    ];
    const linked = new Set(['b']);
    const annotated = annotateOptionsWithKB(opts, linked);
    expect(annotated[0].kb_linked).toBe(false);
    expect(annotated[1].kb_linked).toBe(true);
    expect(opts[0].kb_linked).toBe(false);
    expect(opts[1].kb_linked).toBe(false);
  });

  test('annotateQuestionsWithKB：批量标注多题', () => {
    const qs = [
      { question_id: '1', text: 'q1', options: [{ label: 'A', value: 'a', kb_linked: false }], input_mode: 'select' as const, required: true },
      { question_id: '2', text: 'q2', options: [{ label: 'B', value: 'b', kb_linked: false }], input_mode: 'select' as const, required: true },
    ];
    const linked = new Set(['a']);
    const out = annotateQuestionsWithKB(qs, linked);
    expect(out[0].options[0].kb_linked).toBe(true);
    expect(out[1].options[0].kb_linked).toBe(false);
  });
});
