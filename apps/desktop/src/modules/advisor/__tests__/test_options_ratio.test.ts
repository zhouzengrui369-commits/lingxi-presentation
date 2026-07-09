/**
 * test_options_ratio — PRD 硬指标：≥ 90% 提问带可选项
 */
import {
  SCENARIO_TEMPLATES,
  computeOptionsRatio,
  renderQuestionFromTemplate,
} from '../questions';

describe('test_options_ratio', () => {
  test('整体 ≥ 90% 提问带 ≥ 2 个选项（PRD 硬指标）', () => {
    const ratio = computeOptionsRatio(SCENARIO_TEMPLATES);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    // eslint-disable-next-line no-console
    console.log(`[options-ratio] ${SCENARIO_TEMPLATES.flatMap(s => s.questions).filter(q => (q.input_mode === 'select' || q.input_mode === 'select_multi') && q.option_templates && q.option_templates.length >= 2).length}/${SCENARIO_TEMPLATES.flatMap(s => s.questions).length} = ${(ratio * 100).toFixed(2)}%`);
  });

  test('每个 scenario 第一题（8 样本）中 ≥ 7 题带 ≥ 2 选项', () => {
    const samples = SCENARIO_TEMPLATES.map(s => s.questions[0]);
    expect(samples.length).toBe(8);
    let withOptions = 0;
    for (const tmpl of samples) {
      const q = renderQuestionFromTemplate(tmpl);
      const has = (q.input_mode === 'select' || q.input_mode === 'select_multi')
        && q.options.length >= 2;
      if (has) withOptions += 1;
    }
    // 8 题中至少 7 题带 ≥ 2 选项 = 87.5% 抽样 ≥ 90% 抽样 7/8
    expect(withOptions).toBeGreaterThanOrEqual(7);
  });

  test('所有 8 个 scenario 第一题都带 ≥ 2 选项（强约束）', () => {
    let allHave = true;
    for (const scen of SCENARIO_TEMPLATES) {
      const q = renderQuestionFromTemplate(scen.questions[0]);
      const has = (q.input_mode === 'select' || q.input_mode === 'select_multi')
        && q.options.length >= 2;
      if (!has) allHave = false;
    }
    expect(allHave).toBe(true);
  });

  test('select 模式的选项至少 2 个、至多 10 个', () => {
    for (const scen of SCENARIO_TEMPLATES) {
      for (const tmpl of scen.questions) {
        if (tmpl.input_mode === 'select' || tmpl.input_mode === 'select_multi') {
          expect(tmpl.option_templates?.length ?? 0).toBeGreaterThanOrEqual(2);
          expect(tmpl.option_templates?.length ?? 0).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  test('text/voice 模式选项数 0 是允许的', () => {
    const ep = SCENARIO_TEMPLATES.find(s => s.scenario_id === 'event_pitch');
    expect(ep).toBeDefined();
    const textQ = ep?.questions.find(q => q.input_mode === 'text');
    expect(textQ).toBeDefined();
    expect(textQ?.option_templates?.length ?? 0).toBe(0);
  });
});
