/**
 * test_question_template_render
 * 灵犀演示 · Phase 1 · T-1.2
 */
import {
  SCENARIO_TEMPLATES,
  renderQuestionFromTemplate,
  uuidV4,
} from '../questions';

describe('test_question_template_render', () => {
  test('uuidV4 生成符合 RFC 4122 v4', () => {
    const id = uuidV4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('uuidV4 每次生成都不同', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(uuidV4());
    expect(ids.size).toBe(100);
  });

  test('每个 scenario 的每个模板都能渲染成有效 question', () => {
    expect(SCENARIO_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const scen of SCENARIO_TEMPLATES) {
      expect(scen.scenario_id).toBeTruthy();
      expect(scen.label).toBeTruthy();
      expect(scen.questions.length).toBeGreaterThanOrEqual(2);
      for (const tmpl of scen.questions) {
        const q = renderQuestionFromTemplate(tmpl);
        expect(q.question_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(q.text.length).toBeGreaterThan(0);
        expect(q.text.length).toBeLessThanOrEqual(500);
        expect(['select', 'select_multi', 'text', 'voice']).toContain(q.input_mode);
        expect(typeof q.required).toBe('boolean');
        if (q.input_mode === 'select' || q.input_mode === 'select_multi') {
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          for (const opt of q.options) {
            expect(opt.label.length).toBeGreaterThan(0);
            expect(opt.value.length).toBeGreaterThan(0);
            expect(typeof opt.kb_linked).toBe('boolean');
          }
        }
      }
    }
  });

  test('kb_linked 标注：传入的 linked 值会反映到 options', () => {
    const tmpl = SCENARIO_TEMPLATES[0].questions[0];
    const q = renderQuestionFromTemplate(tmpl, new Set(['business_growth']));
    const bizOpt = q.options.find(o => o.value === 'business_growth');
    expect(bizOpt?.kb_linked).toBe(true);
    const otherOpt = q.options.find(o => o.value !== 'business_growth');
    expect(otherOpt?.kb_linked).toBe(false);
  });

  test('8 个场景 ID 唯一', () => {
    const ids = SCENARIO_TEMPLATES.map(s => s.scenario_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
