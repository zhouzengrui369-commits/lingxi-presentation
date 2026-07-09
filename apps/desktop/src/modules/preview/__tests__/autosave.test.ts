/**
 * autosave 单测（T-1.4）
 * - test_autosave_5s_interval
 * - test_autosave_persistence
 * - test_preview_state_recovery
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Autosave, getStatusText, SAVE_INTERVAL_MS } from '../autosave';
import type { PreviewStore } from '../autosave';
import { createFsStore, resolvePreviewsDir } from '../fs_store';
import { buildPreviewPage } from '../renderer';
import type { PreviewPage } from '../types';

function makePage(id?: string): PreviewPage {
  return buildPreviewPage(
    [{ heading: '季度汇报', content_html: '<p>内容</p>', image_urls: [] }],
    { latencyMs: 100, previewId: id },
  );
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lx-preview-'));
}

test('test_autosave_5s_interval', () => {
  jest.useFakeTimers();
  let saveCount = 0;
  const memStore: PreviewStore = {
    save: () => {
      saveCount += 1;
    },
    load: () => null,
    list: () => [],
    latest: () => null,
  };
  const page = makePage();
  const auto = new Autosave({ store: memStore });
  auto.start(() => page);

  // 未 dirty：tick 不落盘
  jest.advanceTimersByTime(SAVE_INTERVAL_MS);
  expect(saveCount).toBe(0);

  // dirty 后：5s tick 落盘一次
  auto.markDirty();
  jest.advanceTimersByTime(SAVE_INTERVAL_MS);
  expect(saveCount).toBe(1);
  expect(auto.getState().dirty).toBe(false);

  // 落盘后不再 dirty：下一 tick 不重复落盘
  jest.advanceTimersByTime(SAVE_INTERVAL_MS);
  expect(saveCount).toBe(1);

  // 再次编辑 → 再落盘
  auto.markDirty();
  jest.advanceTimersByTime(SAVE_INTERVAL_MS);
  expect(saveCount).toBe(2);

  auto.stop();
  jest.useRealTimers();
});

test('test_autosave_persistence', () => {
  const dir = tmpDir();
  const store = createFsStore(dir);
  const page = makePage('11111111-1111-4111-8111-111111111111');

  const auto = new Autosave({ store });
  auto.start(() => page);
  auto.markDirty();
  const ok = auto.saveNow();
  expect(ok).toBe(true);
  auto.stop();

  // 文件真实落盘
  const file = path.join(dir, `${page.preview_id}.json`);
  expect(fs.existsSync(file)).toBe(true);

  // 读回内容一致
  const reloaded = store.load(page.preview_id);
  expect(reloaded).not.toBeNull();
  expect(reloaded!.preview_id).toBe(page.preview_id);
  expect(reloaded!.sections[0].heading).toBe('季度汇报');
  expect(reloaded!.html).toContain('<!DOCTYPE html>');

  // 状态更新
  expect(auto.getState().lastSavedAt).not.toBeNull();
  expect(auto.getState().dirty).toBe(false);
});

test('test_preview_state_recovery', () => {
  const dir = tmpDir();
  // 会话 1：保存两个预览页（模拟用户编辑后关 app）
  const store1 = createFsStore(dir);
  const older = makePage('aaaaaaaa-1111-4111-8111-111111111111');
  store1.save(older);
  // 确保 mtime 有先后差
  const newer = makePage('bbbbbbbb-2222-4222-8222-222222222222');
  const bump = Date.now() + 10;
  while (Date.now() < bump) {
    /* spin 10ms 让 newer mtime 晚于 older */
  }
  store1.save(newer);

  // 会话 2：重开 app → recover 拿回最近的预览页
  const store2 = createFsStore(dir);
  const auto = new Autosave({ store: store2 });
  const recovered = auto.recover();
  expect(recovered).not.toBeNull();
  expect(recovered!.preview_id).toBe(newer.preview_id); // 最近修改的那个
  expect(store2.list().sort()).toEqual([older.preview_id, newer.preview_id].sort());

  // 恢复后 lastSavedAt 有值（UI 显示"已保存"）
  expect(auto.getState().lastSavedAt).not.toBeNull();
});

test('getStatusText 指示器文案', () => {
  expect(getStatusText({ lastSavedAt: null, dirty: false })).toContain('尚未保存');
  expect(getStatusText({ lastSavedAt: null, dirty: true })).toContain('未保存');
  const now = 1_000_000;
  expect(getStatusText({ lastSavedAt: now, dirty: false }, now)).toContain('刚刚');
  expect(getStatusText({ lastSavedAt: now - 3000, dirty: false }, now)).toContain('3s 前');
  expect(getStatusText({ lastSavedAt: now - 3000, dirty: true }, now)).toContain('有改动');
});

test('resolvePreviewsDir 按平台 + 环境变量覆盖', () => {
  const prev = process.env.LINGXI_PREVIEWS_DIR;
  process.env.LINGXI_PREVIEWS_DIR = '/tmp/custom-previews';
  expect(resolvePreviewsDir()).toBe('/tmp/custom-previews');
  delete process.env.LINGXI_PREVIEWS_DIR;
  const resolved = resolvePreviewsDir();
  expect(resolved).toContain('previews');
  expect(resolved).toContain('灵犀演示');
  if (prev !== undefined) process.env.LINGXI_PREVIEWS_DIR = prev;
});
