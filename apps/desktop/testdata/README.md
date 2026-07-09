# T-1.1 测试数据

7 格式样本 + 1 个大 PDF（>50MB，用于 100M 内成功率压测）。

| 文件 | 大小 | 用途 |
| --- | --- | --- |
| sample.docx | ~38KB | Word 文档样本 |
| sample.pdf | ~8KB | PDF 文档样本（3 页） |
| sample.xlsx | ~6KB | Excel 表格样本 |
| sample.pptx | ~50KB | PowerPoint 样本（5 页） |
| sample.md | ~2KB | Markdown 笔记样本 |
| sample.jpg | ~80KB | JPG 图片样本（800x600） |
| sample.png | ~50KB | PNG 图片样本（800x600） |
| large_50mb.pdf | ~55MB | 100M 内压测样本（PRD ≥99% 成功率验证） |

生成：`python3 scripts/generate_testdata.py`

灵犀演示 · Phase 1 · T-1.1
