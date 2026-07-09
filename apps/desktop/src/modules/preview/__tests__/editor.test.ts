/**
 * editor 单测（T-1.4）
 * - test_editor_text_change
 * - test_editor_paragraph_reorder
 */
import {
  applyTextChange,
  reorderSection,
  moveSectionUp,
  moveSectionDown,
  removeSection,
  createDebouncer,
  parseEditableChange,
} from '../editor';
import { buildPreviewPage } from '../renderer';
import type { PreviewPage } from '../types';

function makePage(): PreviewPage {
  return buildPreviewPage(
    [
      { heading: 'A', content_html: '<p>a</p>', image_urls: [] },
      { heading: 'B', content_html: '<p>b</p>', image_urls: [] },
      { heading: 'C', content_html: '<p>c</p>', image_urls: [] },
    ],
    { latencyMs: 0 },
  );
}

test('test_editor_text_change', () => {
  const page = makePage();
  const next = applyTextChange(page, 1, {
    heading: 'B-新',
    content_html: '<p>改了</p>',
  });
  // 不可变：原对象不动
  expect(page.sections[1].heading).toBe('B');
  // 新对象生效
  expect(next.sections[1].heading).toBe('B-新');
  expect(next.sections[1].content_html).toBe('<p>改了</p>');
  // 其他章节不受影响
  expect(next.sections[0].heading).toBe('A');
  expect(next.sections[2].heading).toBe('C');

  // 只改标题
  const onlyHeading = applyTextChange(page, 0, { heading: 'A2' });
  expect(onlyHeading.sections[0].heading).toBe('A2');
  expect(onlyHeading.sections[0].content_html).toBe('<p>a</p>');

  // 越界 + 空 patch 抛错
  expect(() => applyTextChange(page, 9, { heading: 'x' })).toThrow(RangeError);
  expect(() => applyTextChange(page, 0, {})).toThrow();

  // parseEditableChange 解析 DOM 变更
  const parsed = parseEditableChange({ sectionIndex: 2, field: 'heading', value: 'C2' });
  expect(parsed).toEqual({ sectionIndex: 2, patch: { heading: 'C2' } });
  const parsedContent = parseEditableChange({
    sectionIndex: 0,
    field: 'content',
    value: '<p>x</p>',
  });
  expect(parsedContent.patch).toEqual({ content_html: '<p>x</p>' });
});

test('test_editor_paragraph_reorder', () => {
  const page = makePage();
  // A B C → 把 index0 移到 index2 → B C A
  const reordered = reorderSection(page, 0, 2);
  expect(reordered.sections.map(s => s.heading)).toEqual(['B', 'C', 'A']);
  // 原对象不变
  expect(page.sections.map(s => s.heading)).toEqual(['A', 'B', 'C']);

  // 上移：C(2) → B(1) 位置 → A C B
  const up = moveSectionUp(page, 2);
  expect(up.sections.map(s => s.heading)).toEqual(['A', 'C', 'B']);
  // 顶部上移无效果
  expect(moveSectionUp(page, 0).sections.map(s => s.heading)).toEqual(['A', 'B', 'C']);

  // 下移：A(0) → B(1) 位置 → B A C
  const down = moveSectionDown(page, 0);
  expect(down.sections.map(s => s.heading)).toEqual(['B', 'A', 'C']);
  // 底部下移无效果
  expect(moveSectionDown(page, 2).sections.map(s => s.heading)).toEqual(['A', 'B', 'C']);

  // 越界抛错
  expect(() => reorderSection(page, -1, 0)).toThrow(RangeError);
  expect(() => reorderSection(page, 0, 9)).toThrow(RangeError);

  // 删除：至少保留 1 个
  const removed = removeSection(page, 1);
  expect(removed.sections.map(s => s.heading)).toEqual(['A', 'C']);
  const one = buildPreviewPage([{ heading: 'only', content_html: '<p>x</p>', image_urls: [] }], {});
  expect(() => removeSection(one, 0)).toThrow();
});

test('createDebouncer 合并高频调用', () => {
  jest.useFakeTimers();
  let calls = 0;
  let lastArg = '';
  const d = createDebouncer((v: string) => {
    calls += 1;
    lastArg = v;
  }, 300);
  d.call('a');
  d.call('b');
  d.call('c');
  expect(calls).toBe(0); // 未到 delay 不触发
  jest.advanceTimersByTime(300);
  expect(calls).toBe(1); // 只触发一次
  expect(lastArg).toBe('c'); // 取最后一次参数
  jest.useRealTimers();
});
