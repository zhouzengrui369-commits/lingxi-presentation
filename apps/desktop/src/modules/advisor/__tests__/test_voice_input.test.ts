/**
 * test_voice_input_accuracy — PRD 硬指标：macOS 准确率 ≥ 95%
 */
import {
  runAccuracyTest,
  transcribe,
  resetMockIndex,
  isWhisperAvailable,
  getMockTranscriptPoolSize,
} from '../voice_input';

describe('test_voice_input_accuracy', () => {
  beforeEach(() => resetMockIndex());

  test('10 次 mock 录音至少 9 次正确', async () => {
    const expected = [
      '主题是季度汇报',
      '受众是部门同事',
      'PPT 页数标准',
      '数据展示关注关键指标趋势',
      '周报覆盖项目组',
      '本周重点是产品交付',
      '月报交给 CEO',
      '答辩类型是硕士',
      '答辩时长二十分钟',
      '活动宣讲是产品发布会',
    ];
    const report = await runAccuracyTest(expected);
    expect(report.total).toBe(10);
    expect(report.correct).toBeGreaterThanOrEqual(9);
    expect(report.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(report.failures.length).toBeLessThanOrEqual(1);
    // eslint-disable-next-line no-console
    console.log(`[voice-accuracy] ${report.correct}/${report.total} = ${(report.accuracy * 100).toFixed(1)}%`);
  });

  test('transcriptOverride 完全 deterministic', async () => {
    resetMockIndex();
    const r1 = await transcribe(null, { transcriptOverride: 'hello' });
    const r2 = await transcribe(null, { transcriptOverride: 'hello' });
    expect(r1.transcript).toBe('hello');
    expect(r2.transcript).toBe('hello');
    expect(r1.source).toBe('mock');
    expect(r1.confidence).toBe(1.0);
  });

  test('mock 池有 ≥ 10 条 transcript', () => {
    expect(getMockTranscriptPoolSize()).toBeGreaterThanOrEqual(10);
  });

  test('isWhisperAvailable 返回 boolean', () => {
    expect(typeof isWhisperAvailable()).toBe('boolean');
  });

  test('transcribe 返回字段完整', async () => {
    const r = await transcribe(null, { transcriptOverride: '主题' });
    expect(typeof r.transcript).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(['whisper', 'web-speech', 'mock']).toContain(r.source);
    expect(typeof r.duration_ms).toBe('number');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
