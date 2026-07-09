/**
 * 测试 fixture — 模拟 python-pptx 输出的 PPTXExtractedJson
 *
 * 让 style_analyzer / pptx_to_html 测试不依赖真实 PPTX 文件，
 * CI / sandbox 环境无法跑 python-pptx 也能验证纯函数逻辑。
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

import type { PPTXExtractedJson } from '../types';

const EMU_W = 12191695;
const EMU_H = 6858000;

function rect(leftIn: number, topIn: number, wIn: number, hIn: number, fillHex: string) {
  const inToEmu = (v: number) => Math.round(v * 914400);
  return {
    type: 'rect' as const,
    left: inToEmu(leftIn),
    top: inToEmu(topIn),
    width: inToEmu(wIn),
    height: inToEmu(hIn),
    fill_rgb: fillHex,
    line_rgb: null,
  };
}

function textbox(leftIn: number, topIn: number, wIn: number, hIn: number,
                 text: string, opts: { font?: string; size?: number; bold?: boolean; color?: string } = {}) {
  const inToEmu = (v: number) => Math.round(v * 914400);
  return {
    type: 'textbox' as const,
    left: inToEmu(leftIn),
    top: inToEmu(topIn),
    width: inToEmu(wIn),
    height: inToEmu(hIn),
    text,
    runs: [
      {
        text,
        font_name: opts.font ?? null,
        font_size_pt: opts.size ?? null,
        bold: opts.bold ?? null,
        italic: null,
        color_rgb: opts.color ?? null,
      },
    ],
  };
}

/** 商务深色：12 页，深蓝主调 + 金色强调 + 白色文字 */
export function makeBusinessDarkFixture(): PPTXExtractedJson {
  const slides = [];
  for (let i = 0; i < 12; i++) {
    let layout = 'content';
    if (i === 0) layout = 'title';
    else if (i === 1) layout = 'section';
    else if (i === 5) layout = 'quote';
    else if (i === 10) layout = 'summary';
    else if (i === 11) layout = 'blank';

    slides.push({
      index: i,
      layout_type_guess: layout,
      shapes: [
        rect(0, 0, 13.333, 7.5, '0B1F3A'),  // 深海军蓝全背景
        rect(0, 0, 13.333, 0.12, 'E0B34F'),  // 金色顶部装饰条
        rect(0, 7.38, 13.333, 0.12, 'E0B34F'),  // 金色底部装饰条
        textbox(0.5, 2.5, 12.3, 1.0, `第 ${i + 1} 页标题`, { font: 'Microsoft YaHei', size: 28, bold: true, color: 'FFFFFF' }),
        textbox(0.5, 4.0, 12.3, 2.0, `正文内容 — 第 ${i + 1} 页`, { font: 'Microsoft YaHei', size: 18, color: 'B0B8C9' }),
      ],
    });
  }
  return {
    file: 'business-dark.pptx',
    file_path: '/fake/business-dark.pptx',
    slide_width_emu: EMU_W,
    slide_height_emu: EMU_H,
    slide_count: 12,
    slides,
    extracted_at: '2026-07-09T00:00:00+00:00',
    extractor_version: '1.0.0',
  };
}

/** 学术浅色：10 页，白底 + 深灰文字 + 蓝色标题 */
export function makeAcademicLightFixture(): PPTXExtractedJson {
  const slides = [];
  for (let i = 0; i < 10; i++) {
    let layout = 'content';
    if (i === 0) layout = 'title';
    else if (i === 1) layout = 'section';
    else if (i === 9) layout = 'summary';
    slides.push({
      index: i,
      layout_type_guess: layout,
      shapes: [
        rect(0, 0, 13.333, 7.5, 'FAFAF7'),  // 米白背景
        rect(0, 0, 0.15, 7.5, '1F4E79'),     // 深学术蓝侧边条
        textbox(0.8, 0.5, 11.5, 0.8, `学术第 ${i + 1} 页`, { font: 'SimHei', size: 28, bold: true, color: '1F4E79' }),
        textbox(0.8, 2.0, 11.5, 4.5, `学术内容 ${i + 1}`, { font: 'SimSun', size: 20, color: '222222' }),
      ],
    });
  }
  return {
    file: 'academic-light.pptx',
    file_path: '/fake/academic-light.pptx',
    slide_width_emu: EMU_W,
    slide_height_emu: EMU_H,
    slide_count: 10,
    slides,
    extracted_at: '2026-07-09T00:00:00+00:00',
    extractor_version: '1.0.0',
  };
}

/** 创意渐变：8 页，多色填充（紫/粉/橙） */
export function makeCreativeGradientFixture(): PPTXExtractedJson {
  const slides = [];
  const colors = ['6A11CB', 'E91E63', 'FFC107'];
  for (let i = 0; i < 8; i++) {
    let layout = 'content';
    if (i === 0) layout = 'title';
    else if (i === 1) layout = 'section';
    else if (i === 7) layout = 'summary';
    slides.push({
      index: i,
      layout_type_guess: layout,
      shapes: [
        rect(0, 0, 13.333, 2.5, colors[0]),
        rect(0, 2.5, 13.333, 2.5, colors[1]),
        rect(0, 5.0, 13.333, 2.5, colors[2]),
        rect(10.5, 0.5, 2.3, 2.3, 'FFEB3B'),  // 装饰黄方块
        textbox(0.5, 3.0, 12.3, 1.0, `创意 ${i + 1}`, { font: 'STHeiti', size: 28, bold: true, color: 'FFFFFF' }),
      ],
    });
  }
  return {
    file: 'creative-gradient.pptx',
    file_path: '/fake/creative-gradient.pptx',
    slide_width_emu: EMU_W,
    slide_height_emu: EMU_H,
    slide_count: 8,
    slides,
    extracted_at: '2026-07-09T00:00:00+00:00',
    extractor_version: '1.0.0',
  };
}

/** 最小 fixture：1 页，便于边界测试 */
export function makeMinimalFixture(): PPTXExtractedJson {
  return {
    file: 'minimal.pptx',
    file_path: '/fake/minimal.pptx',
    slide_width_emu: EMU_W,
    slide_height_emu: EMU_H,
    slide_count: 1,
    slides: [
      {
        index: 0,
        layout_type_guess: 'content',
        shapes: [
          textbox(1, 1, 10, 1, 'Hello', { font: 'Arial', size: 24, color: '000000' }),
        ],
      },
    ],
    extracted_at: '2026-07-09T00:00:00+00:00',
    extractor_version: '1.0.0',
  };
}

/** 空 fixture（无形状）— 测 fallback */
export function makeEmptyFixture(): PPTXExtractedJson {
  return {
    file: 'empty.pptx',
    file_path: '/fake/empty.pptx',
    slide_width_emu: EMU_W,
    slide_height_emu: EMU_H,
    slide_count: 1,
    slides: [
      { index: 0, layout_type_guess: 'blank', shapes: [] },
    ],
    extracted_at: '2026-07-09T00:00:00+00:00',
    extractor_version: '1.0.0',
  };
}