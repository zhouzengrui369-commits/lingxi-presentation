# KB 关联补全 Prompt

## 场景

当用户在 advisor 中回答某个问题时，根据已有答案 + KB 条目推断其它问题的"AI 推荐"选项。

## 触发流程

1. 用户答完一道题（如"主题=业务增长"）
2. 系统从已答选项提取 value 列表
3. 用 value 关键词去 wiki_kb 中 search（按 tags + title 匹配）
4. 取 top-N 高 confidence 条目，把它们的 tags 作为"关联信号"
5. 在同 scenario 模板的所有 question 中，扫描选项：
   - 如果选项 tag 含 scenario → 标 kb_linked=true
   - 如果选项 value 命中 KB tag → 标 kb_linked=true
6. UI 渲染时给 kb_linked=true 的选项加 "AI 推荐" 角标

## 示例

**输入**：用户答 `qr_theme = business_growth`（季度汇报场景）
**KB 命中**：entry "管理层季度汇报要点" (tag: audience:management, confidence 0.92)
**关联输出**：
- `qr_audience` 的 `management` 选项 → kb_linked=true
- `qr_data_depth` 的 `yoy_qoq` → kb_linked=true（投资方场景常用）

## 验收信号

PRD §3.2 第 5 条："用户答'主题=季度汇报'时，自动补全'受众=部门同事'等关联选项"
