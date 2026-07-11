/**
 * cli/paths.ts — 共享路径解析（T-6.10 修复）
 *
 * 修 full-demo.ts line 163 `const desktopDir = process.cwd();` 的 root cause：
 *   - 当 full-demo 从 repo root 跑时（`npx tsx apps/desktop/cli/full-demo.ts`），
 *     process.cwd() = repo root，导致 spawn 找不到 apps/desktop/node_modules/tsx
 *   - 与 real-runtime-validate.ts:57 resolveDesktopDir() 同款逻辑（钉子 #69 修复版）
 *
 * 用法：
 *   import { desktopDir, tsxBin } from './paths.ts';
 *   spawn(tsxBin, [...], { cwd: desktopDir })
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';

/** 解析当前脚本所在目录 — 不论从哪跑都返回 apps/desktop/cli 或 apps/desktop */
function getScriptDir(): string {
  // 1. cwd 优先：从 apps/desktop 跑直接返回（最准，钉子 #69 修复）
  const cwd = process.cwd();
  if (cwd.endsWith('/apps/desktop')) return cwd;
  if (cwd.endsWith('/apps/desktop/cli')) return cwd;
  // 2. __dirname（CJS 隐式全局，ts-jest + tsx 大多正常）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (global as any).__dirname;
  if (typeof d === 'string' && d.length > 0 && d.endsWith('/apps/desktop/cli')) return d;
  // 3. 兜底：process.cwd()
  return cwd;
}

/** 解析 desktopDir (apps/desktop/) — 不论从哪跑都返回正确的 apps/desktop/ 路径 */
export function resolveDesktopDir(): string {
  const sd = getScriptDir();
  if (sd.endsWith('/apps/desktop/cli')) return path.resolve(sd, '..');
  if (sd.endsWith('/apps/desktop')) return sd;
  // 兜底：从 cwd 找 apps/desktop（覆盖 repo root + 任意子目录）
  const cwd = process.cwd();
  const candidate1 = path.join(cwd, 'apps', 'desktop');
  if (existsSync(path.join(candidate1, 'cli', 'full-demo.ts'))) return candidate1;
  const candidate2 = path.join(cwd, '..', 'apps', 'desktop');
  if (existsSync(path.join(candidate2, 'cli', 'full-demo.ts'))) return candidate2;
  return cwd;
}

/** 共享 desktopDir（所有相对路径都以它为基准） */
export const desktopDir = resolveDesktopDir();

/** tsx 入口（用于 spawn 子 CLI 跑 .ts） */
export const tsxBin = path.join(desktopDir, 'node_modules', '.bin', 'tsx');

/**
 * template/cli.ts 输出 JSON 的 schema → TemplateStyle 适配
 * template 子 CLI 输出 (style_analyzer v1) 字段: { primary, secondary, accent, background, text }
 * renderer.ts 的 TemplateStyle 字段: { primary, secondary, surface, background, text, muted }
 * 适配规则: accent → muted；surface 从 background 派生 (light: +5%, dark: 略提亮)
 */
export function mapTemplateToStyle(raw: {
  template_id: string;
  palette: { primary: string; secondary: string; accent?: string; background: string; text: string };
  fonts: { heading: string; body: string };
  layout_types?: string[];
}): import('../src/modules/preview/types.ts').TemplateStyle {
  const isDark = isDarkColor(raw.palette.background);
  return {
    template_id: raw.template_id,
    theme: isDark ? 'dark' : 'light',
    palette: {
      primary: raw.palette.primary,
      secondary: raw.palette.secondary,
      background: raw.palette.background,
      surface: deriveSurface(raw.palette.background, isDark),
      text: raw.palette.text,
      muted: raw.palette.accent ?? (isDark ? '#94a3b8' : '#64748b'),
    },
    fonts: {
      heading: raw.fonts.heading,
      body: raw.fonts.body,
    },
    layout: raw.layout_types?.[0] ?? 'simple-business',
  };
}

function isDarkColor(hex: string): boolean {
  // #RRGGBB → 取 R*0.299 + G*0.587 + B*0.114, <128 算 dark
  const m = /^#?([A-F0-9]{2})([A-F0-9]{2})([A-F0-9]{2})$/i.exec(hex);
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

function deriveSurface(bg: string, isDark: boolean): string {
  // dark: 提亮 8% (近 black → dark slate); light: 加白 4% (近 white → light gray)
  if (isDark) return mixHex(bg, '#ffffff', 0.08);
  return mixHex(bg, '#ffffff', 0.96);
}

function mixHex(a: string, b: string, ratio: number): string {
  const pa = /^#?([A-F0-9]{2})([A-F0-9]{2})([A-F0-9]{2})$/i.exec(a);
  const pb = /^#?([A-F0-9]{2})([A-F0-9]{2})([A-F0-9]{2})$/i.exec(b);
  if (!pa || !pb) return a;
  const mix = (x: string, y: string) =>
    Math.round(parseInt(x, 16) * (1 - ratio) + parseInt(y, 16) * ratio)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${mix(pa[1], pb[1])}${mix(pa[2], pb[2])}${mix(pa[3], pb[3])}`;
}
