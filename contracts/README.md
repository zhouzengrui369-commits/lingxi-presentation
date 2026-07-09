# 灵犀演示 — 跨模块 API Schema 契约

> **T-1.0.c** 产出物。Phase 1 五大模块的通讯"宪法"——后续所有 sub-agent 都必须用这套 schema，再也不会出现模块间字段漂移。
>
> 详见 [delivery.md §3 T-1.0.c](../../delivery.md) 与 [plan.md §2 T-1.0.c](../../plan.md)。

---

## 1. 为什么需要这套契约

Phase 1 有 5 个模块 sub-agent（file_kb / advisor / template / preview / output）**全并行**。如果不锁 schema，每个模块会按自己的"理解"设计输入输出字段，等 Phase 2 集成时才发现 A 模块产出的 `wiki_entry.title` 是字符串，B 模块期待的 `wiki_entry.title` 是 `{zh, en}` 对象——全部返工。

`goal.md §8 R-6` 风险登记明确点出：

> 5 模块并行开发的接口契约漂移 — **plan.md 必须先定跨模块 API schema**（文件导入结果、预览 JSON 格式、输出格式参数），所有 sub-agent 用同一份契约

`T-1.0.c` 就是这条风险的解药：**先把契约冻结，再让模块按契约实现**。

---

## 2. 6 个 Schema 索引

| # | 文件 | 用途 | 产出者 | 消费者 |
|---|---|---|---|---|
| 1 | [`file_import.schema.json`](./file_import.schema.json) | 单文件导入结果（状态 / 错误 / 大小 / 格式识别） | T-1.1 `importer.ts` | T-1.1 `storage.ts`、T-1.2 `kb_linker` |
| 2 | [`wiki_kb.schema.json`](./wiki_kb.schema.json) | LLM Wiki 知识条目（标题 / 摘要 / 标签 / 关联文件 / 置信度） | T-1.1 `wiki.ts` | T-1.2 `kb_linker`、T-1.4 `renderer` |
| 3 | [`advisor_question.schema.json`](./advisor_question.schema.json) | 顾问提问卡片（问题 / 选项 / 输入模式 / 依赖 / 必答） | T-1.2 `questions.ts` | T-1.2 UI、T-1.4 后续题目调度 |
| 4 | [`preview_page.schema.json`](./preview_page.schema.json) | HTML 预览页（HTML 全文 / 模板 / 引用 KB / 结构化 sections / 延迟） | T-1.4 `renderer.ts` | T-1.4 `editor`、T-1.5 全部 writer |
| 5 | [`output_request.schema.json`](./output_request.schema.json) | 多格式输出请求（预览 ID / 格式 / 输出路径 / 格式选项） | T-1.5 UI | T-1.5 全部 writer |
| 6 | [`output_result.schema.json`](./output_result.schema.json) | 多格式输出结果（状态 / 路径 / 大小 / 错误 / 完成时间） | T-1.5 全部 writer | T-1.5 UI 通知 / 历史归档 |
| 7 | [`template_style.schema.json`](./template_style.schema.json) | PPTX 模板风格分析结果（版式类型 + 主辅色 + 字体 + 装饰） | T-1.3 `style_analyzer.ts` | T-1.4 `renderer.ts`（按 template_id 套主题） |

---

## 3. 模块间通讯流程（端到端）

```
┌──────────────────────────────────────────────────────────────────┐
│ T-1.1 文件管理 + LLM Wiki                                          │
│  importer.ts  ── file_import.positive.json ──>  storage.ts         │
│  wiki.ts      ── wiki_kb.positive.json   ──>  storage.ts          │
│       │ (related_files: [file_id, file_id])                       │
└───────┼──────────────────────────────────────────────────────────┘
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ T-1.2 顾问交互                                                     │
│  kb_linker.ts ── 读 wiki_kb.entry_id/title/tags ── 补全选项         │
│  questions.ts ── advisor_question.positive.json ──>  UI 卡片渲染    │
│       │ (depends_on: [上一题 question_id])                          │
└───────┼──────────────────────────────────────────────────────────┘
        ▼ (用户回答完所有 required 问题 → 触发 AI 生成预览)
┌──────────────────────────────────────────────────────────────────┐
│ T-1.3 模板 (仅提供 template_id)  +  T-1.4 预览渲染                 │
│  renderer.ts  ── preview_page.positive.json ──>  UI 预览           │
│       │ (kb_entry_ids: [引用了哪些 wiki_kb.entry_id])              │
│       │ (template_id: 来自 T-1.3 模板解析 / 内置主题)              │
└───────┼──────────────────────────────────────────────────────────┘
        ▼ (用户确认预览 → 选 4 种格式之一)
┌──────────────────────────────────────────────────────────────────┐
│ T-1.5 多格式输出                                                    │
│  UI            ── output_request.positive.json ──> writer         │
│  pptx/pdf/    ── 写文件 ──> output_result.positive.json ──> UI     │
│  docx/html                                                            │
│       │ (request_id ↔ preview_id 形成完整溯源链)                    │
└──────────────────────────────────────────────────────────────────┘
```

**关键约束**：
- 所有 ID 字段（`file_id` / `entry_id` / `question_id` / `preview_id` / `request_id`）都是 UUID v4，由生成方生成、跨模块引用时**严禁改写**。
- `output_request.preview_id` 必对应存在的 `preview_page.preview_id`（T-1.5 实现时需做存在性校验）。
- `output_result.request_id` 必对应存在的 `output_request.request_id`（用于异步通知 / 重试）。
- 所有时间戳（`*_at` 字段）用 ISO 8601 格式字符串，UTC 或带时区偏移都可。

---

## 4. 怎么用

### 4.1 验证脚本

```bash
cd /Users/njx/Project/灵犀演示
python contracts/validate.py
```

期望输出（exit code 0）：

```
[OK]   fixtures/file_import.positive.json
[OK]   fixtures/file_import.negative.json correctly rejected (...)
[OK]   fixtures/wiki_kb.positive.json
[OK]   fixtures/wiki_kb.negative.json correctly rejected (...)
...
[PASS] All 7 schemas + 14 fixtures validated.
```

### 4.2 模块实现里怎么引用

**TypeScript / Node.js（推荐 `ajv`）**：

```bash
yarn add ajv ajv-formats
```

```ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fileImportSchema from "../../contracts/file_import.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(fileImportSchema);
if (!validate(record)) {
  throw new Error(`file_import 字段非法: ${ajv.errorsText(validate.errors)}`);
}
```

**Python（已用 `jsonschema`）**：

```python
import json
from jsonschema import Draft202012Validator, FormatChecker

schema = json.loads(open("contracts/file_import.schema.json").read())
validator = Draft202012Validator(schema, format_checker=FormatChecker())
validator.validate(record)  # raise on invalid
```

### 4.3 CI / Git Hook

`T-1.0.c` 是 Phase 1 第一个完成的任务。建议在主分支加 pre-commit：

```yaml
# .pre-commit-config.yaml
- repo: local
  hooks:
    - id: contracts
      name: Validate contracts schemas + fixtures
      entry: python contracts/validate.py
      language: system
      files: '^contracts/'
```

任何 sub-agent 改动 schema 或 fixture 必须本地跑通 `validate.py` 才能 push。

---

## 5. 怎么 extend（加新 schema）

**场景**：Phase 2 / Phase 3 出现新模块通讯（如「模板风格分析结果」「多语言翻译请求」），需要新 schema。

**步骤**：

1. 在 `contracts/` 下新建 `<name>.schema.json`：
   - 顶层 `$schema: "https://json-schema.org/draft/2020-12/schema"`
   - 顶层 `$id` 用 `https://lingxi.local/contracts/<name>.schema.json`
   - 所有 UUID 字段用 `"type": "string", "format": "uuid"`
   - 所有时间字段用 `"type": "string", "format": "date-time"`
   - 所有可枚举字段用 `"enum": [...]`
   - 必填字段列在 `required` 数组

2. 在 `contracts/fixtures/` 下加 2 个 fixture：
   - `<name>.positive.json`：满足所有约束的最小可工作样例
   - `<name>.negative.json`：故意违反 ≥1 条约束（enum / required / minLength / minimum）

3. 在 `validate.py` 的 `SCHEMAS` 列表里加上 `<name>`。

4. 跑 `python contracts/validate.py`，期望 6 变 7，全绿。

5. 更新本 README 的 §2 表格 + §3 流程图。

6. 在 `delivery.md §3` 对应任务段的「产出物」勾选新 schema 文件。

---

## 6. 设计决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| Schema 标准 | **JSON Schema Draft 2020-12** | 最新稳定版；jsonschema / ajv 2020 都原生支持 |
| 通讯方式 | **落盘 JSON 文件** | 本期不需要 RPC 性能；落盘易调试、易人工 review；Phase 2 可选加 message queue |
| ID 格式 | **UUID v4**（string） | 与后端数据库 PK 习惯对齐；跨进程不撞；jsonschema 内置 format checker |
| 时间格式 | **ISO 8601 string** | `date-time` format 自带校验；序列化直接 `datetime.isoformat()` |
| enum 兜底 | **fail-closed** | 不在 enum 里的值直接拒；防止"扩展字段悄悄兼容"导致的契约漂移 |
| `additionalProperties: false` | **默认开启** | 防止 sub-agent 偷偷加字段；如需扩展必须改 schema 走 review |
| format 校验 | **validate.py 启用 FormatChecker** | UUID / date-time 格式错误必须被拒 |
| 没有用 OpenAPI / GraphQL / Protobuf | **本期不用** | PRD 没要求；JSON Schema 足够，且零额外依赖（仅 `jsonschema` 一个 PyPI 包） |

---

## 7. 文件清单

```
contracts/
├── README.md                                  # 本文档
├── validate.py                                # 验证脚本
├── file_import.schema.json                    # T-1.1 文件导入结果
├── wiki_kb.schema.json                        # T-1.1 LLM Wiki 条目
├── advisor_question.schema.json               # T-1.2 顾问提问
├── preview_page.schema.json                   # T-1.4 HTML 预览页
├── output_request.schema.json                 # T-1.5 输出请求
├── output_result.schema.json                  # T-1.5 输出结果
└── fixtures/
    ├── file_import.positive.json
    ├── file_import.negative.json
    ├── wiki_kb.positive.json
    ├── wiki_kb.negative.json
    ├── advisor_question.positive.json
    ├── advisor_question.negative.json
    ├── preview_page.positive.json
    ├── preview_page.negative.json
    ├── output_request.positive.json
    ├── output_request.negative.json
    ├── output_result.positive.json
    └── output_result.negative.json
```

共 **19 个文件**：6 schema + 12 fixtures + 1 README + 1 validate.py。

---

## 8. 相关文档

- `goal.md §3.1-3.5` — 5 大模块 PRD（每个模块的输入/输出语义来源）
- `goal.md §8 R-6` — 接口契约漂移风险与本任务的关系
- `plan.md §2 T-1.0.c` — 本任务的产出物 / 验收信号
- `plan.md §3` — 依赖图（T-1.0.c 是 Phase 1 的第一个 checkpoint）
- `delivery.md §3 T-1.0.c` — 验收项的 single source of truth
- `rules.md §2.2` — Sub-agent 共享契约用 T-1.0.c 产出（不得自创 schema）