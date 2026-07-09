/**
 * KB 关联补全 — T-1.1
 *
 * 给 T-1.2 advisor 调：用户回答「主题=季度汇报」时，自动从 KB 里
 * 找相关条目，补出「受众=部门同事 / 时长=15min」之类关联选项。
 *
 * 算法（不用 RAG，不用 embedding，仅本地启发式）：
 *   1. 给定 query（关键词数组或自由文本），对每个 wiki 条目算 score：
 *      - 标题命中：+3 / 次
 *      - 摘要命中：+1 / 次
 *      - 标签命中：+2 / 次
 *      - confidence 加权：score × confidence
 *   2. 返回 score ≥ threshold 的 Top N 条目
 *
 * 灵犀演示 · Phase 1 · T-1.1
 */

import { KbStorage } from './storage.ts';
import type { FileImportRecord, WikiKbEntry } from './storage.ts';

export interface KbLinkOptions {
  /** 取 Top N（默认 5） */
  topN?: number;
  /** 最低 score 阈值（默认 1.0；阈值越高越严格） */
  threshold?: number;
  /** 最大查询关键词数（默认 10，防止爆栈） */
  maxKeywords?: number;
}

/** 兼容旧名（manager.ts 里曾用 KbOptions 别名） */
export type KbOptions = KbLinkOptions;

export interface KbLinkResult {
  query_keywords: string[];
  entries: Array<{
    entry: WikiKbEntry;
    score: number;
    matched_keywords: string[];
    matched_in: ('title' | 'summary' | 'tags')[];
  }>;
  total_scanned: number;
}

/** 中文 + 英文混合分词（轻量；CJK 2-gram + 英文 word） */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const cnRe = /[\u4e00-\u9fa5]{2,12}/g;
  const enRe = /\b[A-Za-z][A-Za-z0-9]{1,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = cnRe.exec(text)) !== null) out.push(m[0]);
  while ((m = enRe.exec(text)) !== null) out.push(m[0].toLowerCase());
  return out;
}

const STOP_KEYWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are', 'was', 'were',
  '的', '了', '在', '是', '和', '与', '或', '等', '及', '把', '被', '由', '从',
  '这个', '那个', '可以', '应该', '需要', '我们', '以及', '相关', '包括', '其中',
]);

function isStop(k: string): boolean {
  return STOP_KEYWORDS.has(k.toLowerCase()) || STOP_KEYWORDS.has(k);
}

/**
 * KB 关联查询主入口。
 *
 * @param query 用户当前的关键词 / 自由文本（如 "季度汇报 营收"）
 * @param storage 已 init 的 KbStorage 实例
 */
export async function linkKb(
  query: string | string[],
  storage: KbStorage,
  opts: KbLinkOptions = {},
): Promise<KbLinkResult> {
  const topN = opts.topN ?? 5;
  const threshold = opts.threshold ?? 1.0;
  const maxKeywords = opts.maxKeywords ?? 10;

  // 1. 关键词抽取
  const raw = Array.isArray(query) ? query : [query];
  const keywordSet = new Set<string>();
  for (const q of raw) {
    for (const t of tokenize(q)) {
      if (!isStop(t) && t.length >= 2 && t.length <= 32) {
        keywordSet.add(t);
      }
      if (keywordSet.size >= maxKeywords) break;
    }
  }
  const keywords = Array.from(keywordSet);

  // 2. 扫 KB
  const entries = await storage.listEntries();
  const scored: KbLinkResult['entries'] = [];
  for (const entry of entries) {
    const { score, matched, matchedIn } = scoreEntry(entry, keywords);
    if (score >= threshold) {
      scored.push({ entry, score, matched_keywords: matched, matched_in: matchedIn });
    }
  }

  // 3. 按 score × confidence 排序
  scored.sort((a, b) => b.score * b.entry.confidence - a.score * a.entry.confidence);

  return {
    query_keywords: keywords,
    entries: scored.slice(0, topN),
    total_scanned: entries.length,
  };
}

/** 给 advisor 调用：把 KB 关联结果转成「建议选项」 */
export interface Suggestion {
  label: string;
  evidence_entry_id: string;
  evidence_title: string;
  score: number;
  source: 'kb' | 'fallback';
}

export function toSuggestions(
  link: KbLinkResult,
  fieldKey: string,
  fallbackPool: string[] = [],
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const e of link.entries) {
    // 取 entry.tags[0] 作为建议 label；无 tag 用 entry.title 前 12 字
    const label =
      e.entry.tags[0] ??
      e.entry.title.slice(0, 12) ??
      '(empty)';
    out.push({
      label,
      evidence_entry_id: e.entry.entry_id,
      evidence_title: e.entry.title,
      score: e.score,
      source: 'kb',
    });
  }
  // 兜底：KB 没结果时给 advisor 一些默认建议
  if (out.length === 0) {
    for (const fb of fallbackPool) {
      out.push({ label: fb, evidence_entry_id: '', evidence_title: '', score: 0, source: 'fallback' });
    }
  }
  void fieldKey;
  return out;
}

/**
 * 关联 KB 中「用户还没引用过的文件」作为下一步候选（advisor 引导用）。
 * 比如用户已 import 5 个文件并做了 wiki，给出第 6 个文件「建议引用」。
 */
export async function suggestRelatedFiles(
  importedFileIds: string[],
  storage: KbStorage,
  opts: KbLinkOptions = {},
): Promise<Array<{ file: FileImportRecord; matched_entries: WikiKbEntry[]; score: number }>> {
  const topN = opts.topN ?? 5;
  const knownSet = new Set(importedFileIds);
  const allFiles = await storage.listFiles();
  const candidates = allFiles.filter(f => !knownSet.has(f.file_id));

  const out: Array<{ file: FileImportRecord; matched_entries: WikiKbEntry[]; score: number }> = [];
  for (const file of candidates) {
    const matched: WikiKbEntry[] = [];
    let total = 0;
    const entries = await storage.listEntries();
    for (const e of entries) {
      if (e.related_files.includes(file.file_id)) {
        matched.push(e);
        total += e.confidence;
      }
    }
    if (total > 0) {
      out.push({ file, matched_entries: matched, score: total });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}

// ---- internal ----

function scoreEntry(
  entry: WikiKbEntry,
  keywords: string[],
): { score: number; matched: string[]; matchedIn: ('title' | 'summary' | 'tags')[] } {
  let score = 0;
  const matched = new Set<string>();
  const matchedInSet = new Set<'title' | 'summary' | 'tags'>();

  for (const k of keywords) {
    const kl = k.toLowerCase();
    // title: +3 per occurrence (cap 5)
    let n = countOccurrences(entry.title, k);
    if (n === 0) n = countOccurrences(entry.title.toLowerCase(), kl);
    if (n > 0) {
      score += Math.min(n, 5) * 3;
      matched.add(k);
      matchedInSet.add('title');
    }
    // summary: +1 per occurrence (cap 3)
    let s = countOccurrences(entry.summary, k);
    if (s === 0) s = countOccurrences(entry.summary.toLowerCase(), kl);
    if (s > 0) {
      score += Math.min(s, 3) * 1;
      matched.add(k);
      matchedInSet.add('summary');
    }
    // tags: +2 per match (exact, case-insensitive)
    for (const tag of entry.tags) {
      if (tag.toLowerCase() === kl) {
        score += 2;
        matched.add(k);
        matchedInSet.add('tags');
        break;
      }
    }
  }

  return { score, matched: Array.from(matched), matchedIn: Array.from(matchedInSet) };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}
