/**
 * 进度条 helper（pure，方便单测）
 * 灵犀演示 · Phase 1 · T-1.2
 */
export interface ProgressInfo {
  current: number;
  total: number;
  percent: number;
  completed: boolean;
}

export function computeProgress(answered: number, total: number): ProgressInfo {
  // 边界：total=0 时视为初始态，completed=false（避免 0/0 报 100%）
  if (total === 0) {
    return { current: 0, total: 0, percent: 0, completed: false };
  }
  const safeAnswered = Math.max(0, Math.min(answered, total));
  const current = Math.min(answered + 1, total);
  const percent = Math.round((safeAnswered / total) * 100);
  const completed = safeAnswered >= total;
  return { current, total, percent, completed };
}
