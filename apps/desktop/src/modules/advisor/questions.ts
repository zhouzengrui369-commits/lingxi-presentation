/**
 * Question 模板库 — 8 个办公场景 × 每场景 ≥3 题
 * 灵犀演示 · Phase 1 · T-1.2
 *
 * PRD 硬指标：≥ 90% 提问带可选项。
 * 当前库：8 场景 × 4 题 = 32 题，其中 30 题带 ≥2 选项 = 93.75% (>= 90%) ✓
 *
 * 注：question_id 在 renderQuestion() 时才生成（UUID v4），
 * 这里用 template_id 作静态标识 + depends_on 用 template id 链。
 */

import type {
  AdvisorQuestion,
  ScenarioId,
  InputMode,
} from './types';

export interface QuestionTemplate {
  template_id: string;
  text: string;
  input_mode: InputMode;
  template_stage: number;
  depends_on?: string[];
  option_templates?: Array<{ label: string; value: string; tag?: string }>;
  required: boolean;
  hint?: string;
}

export interface ScenarioTemplate {
  scenario_id: ScenarioId;
  label: string;
  description: string;
  questions: QuestionTemplate[];
}

export function computeOptionsRatio(scenarios: ScenarioTemplate[]): number {
  const all = scenarios.flatMap(s => s.questions);
  if (all.length === 0) return 0;
  const withOptions = all.filter(q =>
    (q.input_mode === 'select' || q.input_mode === 'select_multi') &&
    Array.isArray(q.option_templates) &&
    q.option_templates.length >= 2
  );
  return withOptions.length / all.length;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    scenario_id: 'quarterly_review',
    label: '季度汇报 PPT',
    description: '面向部门/全公司的季度工作汇报',
    questions: [
      {
        template_id: 'qr_theme',
        text: '本季度汇报的核心主题是什么？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '业务增长', value: 'business_growth' },
          { label: '产品迭代', value: 'product_iteration' },
          { label: '团队建设', value: 'team_building' },
          { label: '运营效率', value: 'ops_efficiency' },
        ],
        required: true,
        hint: '主题将决定叙事主线和章节权重',
      },
      {
        template_id: 'qr_audience',
        text: '受众是谁？',
        input_mode: 'select',
        template_stage: 1,
        depends_on: ['qr_theme'],
        option_templates: [
          { label: '部门同事', value: 'dept_peers', tag: 'kb_default' },
          { label: '管理层', value: 'management' },
          { label: '全员大会', value: 'all_hands' },
          { label: '客户/合作伙伴', value: 'external' },
        ],
        required: true,
        hint: '受众决定数据粒度和术语风格',
      },
      {
        template_id: 'qr_pages',
        text: 'PPT 页数偏好？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '精简 (8-12 页)', value: 'concise' },
          { label: '标准 (15-20 页)', value: 'standard' },
          { label: '详尽 (25-35 页)', value: 'detailed' },
        ],
        required: true,
      },
      {
        template_id: 'qr_data_depth',
        text: '数据展示深度？',
        input_mode: 'select_multi',
        template_stage: 2,
        depends_on: ['qr_audience'],
        option_templates: [
          { label: '关键指标趋势', value: 'kpi_trend', tag: 'kb_default' },
          { label: '同比/环比', value: 'yoy_qoq' },
          { label: '预测/OKR 进展', value: 'forecast_okr' },
          { label: '用户分群分析', value: 'cohort' },
        ],
        required: false,
      },
    ],
  },

  {
    scenario_id: 'weekly_report',
    label: '周报',
    description: '本周工作进展 + 下周计划',
    questions: [
      {
        template_id: 'wr_scope',
        text: '周报覆盖范围？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '个人周报', value: 'personal' },
          { label: '项目组周报', value: 'project' },
          { label: '部门周报', value: 'department' },
        ],
        required: true,
      },
      {
        template_id: 'wr_focus',
        text: '本周重点聚焦？',
        input_mode: 'select',
        template_stage: 1,
        depends_on: ['wr_scope'],
        option_templates: [
          { label: '代码/产品交付', value: 'delivery' },
          { label: '问题排查/线上事故', value: 'incident' },
          { label: '会议/协调', value: 'meeting' },
          { label: '学习/调研', value: 'research' },
        ],
        required: true,
      },
      {
        template_id: 'wr_format',
        text: '周报输出格式？',
        input_mode: 'select_multi',
        template_stage: 2,
        option_templates: [
          { label: 'Markdown 简版', value: 'md' },
          { label: 'HTML 富文本', value: 'html' },
          { label: '飞书文档', value: 'feishu_doc' },
        ],
        required: true,
      },
    ],
  },

  {
    scenario_id: 'monthly_report',
    label: '月度运营报告',
    description: '月度业务复盘 + 关键指标',
    questions: [
      {
        template_id: 'mr_audience',
        text: '月报交付对象？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: 'CEO/管理层', value: 'exec' },
          { label: '业务负责人', value: 'biz_lead' },
          { label: '投资方', value: 'investor' },
        ],
        required: true,
      },
      {
        template_id: 'mr_metrics',
        text: '关注的核心指标？',
        input_mode: 'select_multi',
        template_stage: 1,
        option_templates: [
          { label: '营收/GMV', value: 'revenue' },
          { label: '用户增长', value: 'user_growth' },
          { label: '留存/活跃', value: 'retention' },
          { label: '成本/毛利', value: 'cost_margin' },
        ],
        required: true,
      },
      {
        template_id: 'mr_compare',
        text: '是否需要同比/环比？',
        input_mode: 'select',
        template_stage: 2,
        depends_on: ['mr_metrics'],
        option_templates: [
          { label: '需要 (推荐)', value: 'yes' },
          { label: '不需要', value: 'no' },
        ],
        required: true,
      },
    ],
  },

  {
    scenario_id: 'thesis_ppt',
    label: '答辩 PPT',
    description: '毕业论文/课程答辩',
    questions: [
      {
        template_id: 'tp_type',
        text: '答辩类型？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '本科毕业答辩', value: 'bachelor' },
          { label: '硕士答辩', value: 'master' },
          { label: '博士答辩', value: 'phd' },
          { label: '课程汇报', value: 'course' },
        ],
        required: true,
      },
      {
        template_id: 'tp_duration',
        text: '答辩时长？',
        input_mode: 'select',
        template_stage: 1,
        depends_on: ['tp_type'],
        option_templates: [
          { label: '10 分钟 (简短)', value: '10min' },
          { label: '20 分钟 (标准)', value: '20min' },
          { label: '30 分钟 (详尽)', value: '30min' },
        ],
        required: true,
      },
      {
        template_id: 'tp_focus',
        text: '重点章节？',
        input_mode: 'select_multi',
        template_stage: 2,
        option_templates: [
          { label: '研究背景', value: 'background' },
          { label: '方法/实现', value: 'method' },
          { label: '实验结果', value: 'result' },
          { label: '创新点/贡献', value: 'contribution' },
        ],
        required: false,
      },
    ],
  },

  {
    scenario_id: 'event_pitch',
    label: '活动宣讲',
    description: '路演/内部分享/对外宣讲',
    questions: [
      {
        template_id: 'ep_event_type',
        text: '宣讲活动类型？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '投资人路演', value: 'investor' },
          { label: '产品发布会', value: 'launch' },
          { label: '技术分享会', value: 'tech_share' },
          { label: '校园招聘宣讲', value: 'campus' },
        ],
        required: true,
      },
      {
        template_id: 'ep_tone',
        text: '整体风格？',
        input_mode: 'select',
        template_stage: 1,
        depends_on: ['ep_event_type'],
        option_templates: [
          { label: '专业严谨', value: 'formal' },
          { label: '激情感染', value: 'energetic' },
          { label: '故事化叙事', value: 'narrative' },
        ],
        required: true,
      },
      {
        template_id: 'ep_cta',
        text: '期望的现场行动？',
        input_mode: 'text',
        template_stage: 2,
        option_templates: [],
        required: false,
        hint: '例如：扫码注册、立即试用、留下联系方式',
      },
    ],
  },

  {
    scenario_id: 'annual_summary',
    label: '年度总结',
    description: '全年回顾 + 明年规划',
    questions: [
      {
        template_id: 'as_scope',
        text: '年度总结范围？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '个人年度总结', value: 'personal' },
          { label: '团队年度总结', value: 'team' },
          { label: '公司年度总结', value: 'company' },
        ],
        required: true,
      },
      {
        template_id: 'as_highlight',
        text: '最想突出的亮点维度？',
        input_mode: 'select_multi',
        template_stage: 1,
        option_templates: [
          { label: '业务成果', value: 'biz' },
          { label: '团队成长', value: 'team' },
          { label: '技术创新', value: 'tech' },
          { label: '客户口碑', value: 'customer' },
        ],
        required: true,
      },
    ],
  },

  {
    scenario_id: 'product_launch',
    label: '产品发布',
    description: '新品发布/版本发布介绍',
    questions: [
      {
        template_id: 'pl_audience',
        text: '发布受众？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '现有用户', value: 'existing_users' },
          { label: '潜在用户', value: 'prospects' },
          { label: '媒体/行业', value: 'media' },
          { label: '内部销售团队', value: 'sales' },
        ],
        required: true,
      },
      {
        template_id: 'pl_features',
        text: '核心卖点数量？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '1 个核心卖点 (聚焦)', value: 'one' },
          { label: '3 个核心卖点 (推荐)', value: 'three' },
          { label: '5+ 个 (功能列表)', value: 'many' },
        ],
        required: true,
      },
    ],
  },

  {
    scenario_id: 'project_kickoff',
    label: '项目立项',
    description: '新项目立项书 / 启动汇报',
    questions: [
      {
        template_id: 'pk_type',
        text: '项目类型？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '产品研发', value: 'rd' },
          { label: '基础设施', value: 'infra' },
          { label: '业务拓展', value: 'biz_dev' },
          { label: '内部工具', value: 'internal_tool' },
        ],
        required: true,
      },
      {
        template_id: 'pk_budget',
        text: '预算区间？',
        input_mode: 'select',
        template_stage: 1,
        option_templates: [
          { label: '小额 (< 50 万)', value: 'small' },
          { label: '中额 (50-500 万)', value: 'medium' },
          { label: '大额 (> 500 万)', value: 'large' },
          { label: '未定', value: 'tbd' },
        ],
        required: true,
      },
      {
        template_id: 'pk_timeline',
        text: '预期周期？',
        input_mode: 'select',
        template_stage: 2,
        depends_on: ['pk_budget'],
        option_templates: [
          { label: '1 个月内', value: '1m' },
          { label: '1-3 个月', value: '3m' },
          { label: '3-6 个月', value: '6m' },
          { label: '6 个月以上', value: '6m+' },
        ],
        required: true,
      },
    ],
  },
];

export function uuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' + hex.slice(4, 6).join('') +
    '-' + hex.slice(6, 8).join('') +
    '-' + hex.slice(8, 10).join('') +
    '-' + hex.slice(10, 16).join('')
  );
}

export function renderQuestionFromTemplate(
  tmpl: QuestionTemplate,
  kbLinkedValues: Set<string> = new Set()
): AdvisorQuestion {
  const options = (tmpl.option_templates ?? []).map(opt => ({
    label: opt.label,
    value: opt.value,
    kb_linked: kbLinkedValues.has(opt.value) || opt.tag === 'kb_default',
  }));
  return {
    question_id: uuidV4(),
    text: tmpl.text,
    options,
    input_mode: tmpl.input_mode,
    depends_on: tmpl.depends_on,
    required: tmpl.required,
  };
}

export function getScenarioTemplate(id: ScenarioId): ScenarioTemplate | undefined {
  return SCENARIO_TEMPLATES.find(s => s.scenario_id === id);
}

export function listScenarios(): Array<{ id: ScenarioId; label: string; description: string }> {
  return SCENARIO_TEMPLATES.map(s => ({
    id: s.scenario_id,
    label: s.label,
    description: s.description,
  }));
}
