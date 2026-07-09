/**
 * Advisor 模块共享类型
 * 灵犀演示 · Phase 1 · T-1.2
 *
 * 设计要点：
 * - 类型与 contracts/advisor_question.schema.json (Draft 2020-12) 严格对齐
 * - 不重复 schema 字段；调用方在边界做一次 ajv validate
 * - 模块内部状态/数据用本地扩展类型（如 AnswerRecord）
 */

export type InputMode = 'select' | 'select_multi' | 'text' | 'voice';

export interface AdvisorOption {
  label: string;
  value: string;
  /** true=该选项由 advisor.kb_linker 从 KB 关联补全，UI 可标记为 AI 推荐 */
  kb_linked: boolean;
}

export interface AdvisorQuestion {
  question_id: string;
  text: string;
  options: AdvisorOption[];
  input_mode: InputMode;
  depends_on?: string[];
  required: boolean;
}

export type ScenarioId =
  | 'quarterly_review'
  | 'weekly_report'
  | 'monthly_report'
  | 'thesis_ppt'
  | 'event_pitch'
  | 'annual_summary'
  | 'product_launch'
  | 'project_kickoff'
  | 'custom';

export interface AnswerRecord {
  question_id: string;
  value: string | string[];
  mode: InputMode;
  at_iso: string;
}

export interface AdvisorSession {
  scenario: ScenarioId;
  answers: AnswerRecord[];
  started_at_iso: string;
  current_question_id?: string;
}

export interface ProgressState {
  current: number;
  total: number;
  percent: number;
  completed: boolean;
}

export interface AIResponse {
  content: string;
  provider: 'cli' | 'api' | 'mock' | 'unknown';
  elapsed_ms: number;
}

export interface KBEntryLite {
  entry_id: string;
  title: string;
  summary: string;
  tags: string[];
  confidence: number;
}

export interface VoiceInputOptions {
  preferWhisper?: boolean;
  whisperPath?: string;
  transcriptOverride?: string;
  simulatedLatencyMs?: number;
}

export interface VoiceInputResult {
  transcript: string;
  confidence: number;
  source: 'whisper' | 'web-speech' | 'mock';
  duration_ms: number;
}
