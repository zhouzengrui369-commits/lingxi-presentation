/**
 * T-1.3 模板模块 — 类型定义
 *
 * 数据契约：
 * - PPTXExtractedJson: python-pptx 提取出来的原始 JSON（subprocess 输出）
 * - TemplateStyle: 对齐 contracts/template_style.schema.json (Draft 2020-12)
 * - Palette / Fonts / Decorations: TemplateStyle 的子结构
 *
 * 灵犀演示 · Phase 1 · T-1.3
 */

export type LayoutType =
  | 'title'
  | 'section'
  | 'content'
  | 'two_column'
  | 'quote'
  | 'summary'
  | 'blank'
  | 'image_focus'
  | 'chart'
  | 'table';

export type Decoration =
  | 'gradient'
  | 'solid_block'
  | 'border'
  | 'shadow'
  | 'rounded'
  | 'line_accent'
  | 'watermark'
  | 'icon';

export type Source = 'builtin' | 'imported';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface Fonts {
  heading: string;
  body: string;
}

export interface TemplateStyle {
  template_id: string;
  source: Source;
  name: string;
  layout_types: LayoutType[];
  palette: Palette;
  fonts: Fonts;
  decorations: Decoration[];
  page_count: number;
  analyzed_at: string;
  analyzer_version: string;
}

/** python-pptx 通过 extract_pptx.py 输出的结构化 JSON */

export interface RunJson {
  text: string;
  font_name: string | null;
  font_size_pt: number | null;
  bold: boolean | null;
  italic: boolean | null;
  color_rgb: string | null;
}

export interface TextBoxJson {
  type: 'textbox';
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  runs: RunJson[];
}

export interface RectJson {
  type: 'rect';
  left: number;
  top: number;
  width: number;
  height: number;
  fill_rgb: string | null;
  line_rgb: string | null;
  shape_name?: string;
}

export interface PictureJson {
  type: 'picture';
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OtherJson {
  type: 'other' | 'error';
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  shape_type?: string;
  error?: string;
  shape_name?: string;
}

export type ShapeJson = TextBoxJson | RectJson | PictureJson | OtherJson;

export interface SlideJson {
  index: number;
  layout_type_guess: string;
  shapes: ShapeJson[];
}

export interface PPTXExtractedJson {
  file: string;
  file_path: string;
  slide_width_emu: number;
  slide_height_emu: number;
  slide_count: number;
  slides: SlideJson[];
  extracted_at: string;
  extractor_version: string;
}

export interface ColorFrequency {
  color: string;
  count: number;
  area: number;
}

export interface FontFrequency {
  font: string;
  count: number;
}