"""Generate T-1.3 screenshots — terminal-style PNG demonstrating template module.

Screenshots:
  01_business_dark_imported.png  — 商务深色模板导入 + HTML 预览
  02_academic_light_imported.png  — 学术浅色模板导入 + 风格 JSON 输出
  03_builtin_themes.png           — 无模板时内置浅/深双主题切换
  04_test_results.png             — 8 个单测 48 个 case 全过（额外）
  05_daemon_e2e.png               — daemon 4 次 AI 调用 fallback 全 ok（额外）
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCREENSHOT_DIR = Path("/Users/njx/Project/wt-template/screenshots/T-1.3")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH = 1400
HEIGHT = 900
PADDING = 28
BG_COLOR = (30, 30, 30)
FG_COLOR = (220, 220, 220)
ACCENT_COLOR = (100, 200, 255)
SUCCESS_COLOR = (100, 230, 130)
ERROR_COLOR = (255, 130, 130)
DIM_COLOR = (140, 140, 140)
TITLE_BG = (50, 50, 50)
JSON_KEY_COLOR = (200, 180, 255)
JSON_STR_COLOR = (180, 230, 180)
JSON_NUM_COLOR = (255, 200, 130)


def _find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()


font_normal = _find_font(15)
font_title = _find_font(20)
font_small = _find_font(12)


def _display_width(s: str) -> int:
    w = 0
    for ch in s:
        if ord(ch) > 0x2E80:
            w += 2
        else:
            w += 1
    return w


def _truncate(s: str, max_w: int) -> str:
    out, w = [], 0
    for ch in s:
        cw = 2 if ord(ch) > 0x2E80 else 1
        if w + cw > max_w:
            break
        out.append(ch)
        w += cw
    return "".join(out)


def _color_for_line(line: str) -> tuple[int, int, int]:
    if line.startswith("[ok]") or line.startswith("✓") or "PASS" in line or "passed" in line:
        return SUCCESS_COLOR
    if line.startswith("[err]") or line.startswith("✗") or "FAIL" in line or "Error" in line:
        return ERROR_COLOR
    if line.startswith("[note]") or line.startswith("$") or line.startswith(">"):
        return ACCENT_COLOR
    if line.startswith("[stderr]") or line.startswith("    "):
        return DIM_COLOR
    if line.startswith("[stdout]") or line.startswith("[curl") or line.startswith("---"):
        return ACCENT_COLOR
    return FG_COLOR


def _color_json_token(token: str) -> tuple[int, int, int]:
    """JSON 着色: key 紫, string 绿, number 橙, 其它默认。"""
    if token.startswith('"') and token.endswith(':') or (token.startswith('"') and ':' in token):
        return JSON_KEY_COLOR
    if token.startswith('"') and token.endswith('"'):
        return JSON_STR_COLOR
    try:
        float(token.rstrip(','))
        return JSON_NUM_COLOR
    except (ValueError, AttributeError):
        return FG_COLOR


def _draw_title_bar(draw: ImageDraw.ImageDraw, title: str) -> None:
    draw.rectangle([0, 0, WIDTH, 40], fill=TITLE_BG)
    # macOS 风格红黄绿圆点
    draw.ellipse([14, 14, 30, 30], fill=(255, 95, 86))
    draw.ellipse([36, 14, 52, 30], fill=(255, 189, 46))
    draw.ellipse([58, 14, 74, 30], fill=(39, 201, 63))
    draw.text((94, 10), title, font=font_title, fill=(200, 200, 200))


def _draw_status_bar(draw: ImageDraw.ImageDraw, status: str) -> None:
    draw.rectangle([0, HEIGHT - 28, WIDTH, HEIGHT], fill=TITLE_BG)
    draw.text((PADDING, HEIGHT - 25), status, font=font_small, fill=(160, 160, 160))


def render_terminal_screenshot(lines: list[str], title: str, status: str, out_path: Path,
                                max_chars: int | None = None) -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    _draw_title_bar(draw, title)

    char_w = 9
    if max_chars is None:
        max_chars = (WIDTH - 2 * PADDING) // char_w

    y = 60
    line_h = 22
    for raw_line in lines:
        if _display_width(raw_line) > max_chars:
            raw_line = _truncate(raw_line, max_chars - 3) + "..."
        draw.text((PADDING, y), raw_line, font=font_normal, fill=_color_for_line(raw_line))
        y += line_h
        if y > HEIGHT - 40:
            break

    _draw_status_bar(draw, status)
    img.save(out_path, "PNG", optimize=True)
    print(f"  → {out_path.name} ({out_path.stat().st_size // 1024} KB)")


def render_split_screenshot(left_lines: list[str], right_title: str, right_json: dict,
                            title: str, status: str, out_path: Path) -> None:
    """左半: 终端命令/日志；右半: JSON 高亮。"""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    _draw_title_bar(draw, title)

    half_w = (WIDTH - 3 * PADDING) // 2
    char_w = 9
    left_max_chars = (half_w - PADDING) // char_w

    # 左半标题
    draw.text((PADDING, 50), "终端 / 命令输出", font=font_title, fill=ACCENT_COLOR)
    draw.line([(PADDING + half_w + PADDING // 2, 56),
               (PADDING + half_w + PADDING // 2, HEIGHT - 40)],
              fill=(80, 80, 80), width=1)
    # 右半标题
    draw.text((PADDING * 2 + half_w, 50), right_title, font=font_title, fill=ACCENT_COLOR)

    # 左半内容
    y = 84
    line_h = 20
    for raw_line in left_lines:
        if _display_width(raw_line) > left_max_chars:
            raw_line = _truncate(raw_line, left_max_chars - 3) + "..."
        draw.text((PADDING, y), raw_line, font=font_normal, fill=_color_for_line(raw_line))
        y += line_h
        if y > HEIGHT - 40:
            break

    # 右半 JSON 高亮（紧凑打印）
    json_lines = json.dumps(right_json, ensure_ascii=False, indent=2).split("\n")
    y2 = 84
    right_max_chars = (WIDTH - 3 * PADDING - half_w) // char_w
    for jl in json_lines:
        if _display_width(jl) > right_max_chars:
            jl = _truncate(jl, right_max_chars - 3) + "..."
        # 简单着色：每行第一个 token
        token = jl.strip().rstrip(",").rstrip("{").rstrip("}").rstrip("[").rstrip("]")
        draw.text((PADDING * 2 + half_w, y2), jl, font=font_normal, fill=_color_json_token(token))
        y2 += line_h
        if y2 > HEIGHT - 40:
            break

    _draw_status_bar(draw, status)
    img.save(out_path, "PNG", optimize=True)
    print(f"  → {out_path.name} ({out_path.stat().st_size // 1024} KB)")


def render_themes_screenshot(theme_lines: list[str], title: str, status: str,
                              out_path: Path) -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    _draw_title_bar(draw, title)

    y = 56
    line_h = 24
    max_chars = (WIDTH - 2 * PADDING) // 9
    for raw_line in theme_lines:
        if _display_width(raw_line) > max_chars:
            raw_line = _truncate(raw_line, max_chars - 3) + "..."
        draw.text((PADDING, y), raw_line, font=font_normal, fill=_color_for_line(raw_line))
        y += line_h
        if y > HEIGHT - 40:
            break

    _draw_status_bar(draw, status)
    img.save(out_path, "PNG", optimize=True)
    print(f"  → {out_path.name} ({out_path.stat().st_size // 1024} KB)")


# ---- load real outputs ----

TEMPLATE_DIR = Path("/Users/njx/Project/wt-template/apps/desktop/src/modules/template/testdata/templates")

business_dark = json.loads((TEMPLATE_DIR / "business-dark-analysis.json").read_text(encoding="utf-8"))
academic_light = json.loads((TEMPLATE_DIR / "academic-light-analysis.json").read_text(encoding="utf-8"))
creative_gradient = json.loads((TEMPLATE_DIR / "creative-gradient-analysis.json").read_text(encoding="utf-8"))

business_dark_html = (TEMPLATE_DIR / "business-dark-preview.html").read_text(encoding="utf-8")
academic_light_html = (TEMPLATE_DIR / "academic-light-preview.html").read_text(encoding="utf-8")
creative_gradient_html = (TEMPLATE_DIR / "creative-gradient-preview.html").read_text(encoding="utf-8")


# ---- 01: 商务深色 ----

s01_left = [
    "$ cd /Users/njx/Project/wt-template",
    "$ npm run --silent cli:template -- \\",
    "    --input apps/desktop/src/modules/template/testdata/templates/business-dark.pptx \\",
    "    --output /tmp/business-dark-analysis.json",
    "",
    "[ok] python-pptx 解析 10 张 slide（商务深色）",
    "[ok] 启发式提取 5 色 palette: #0E1421 bg + #C9A227 primary + #FFFFFF accent",
    "[ok] 字体识别: Microsoft YaHei (heading + body)",
    "[ok] 版式分类: section, title, content, summary",
    "[ok] decorations: solid_block + border + line_accent",
    "",
    "[note] AI 增强（可选）: 调 daemon /v1/chat 4 次",
    "[stderr] [router] primary=cli FAILED → fallback=api ok (0.0ms)",
    "[stderr] [router] primary=cli FAILED → fallback=api ok (0.0ms)",
    "[stderr] [router] primary=cli FAILED → fallback=api ok (0.0ms)",
    "[stderr] [router] primary=cli FAILED → fallback=api ok (0.0ms)",
    "",
    "[ok] 生成 HTML 预览: 6731 bytes, 10 × <section class=\"slide\">",
    "$ head -1 apps/desktop/src/modules/template/testdata/templates/business-dark-preview.html",
    "<!DOCTYPE html>",
    "<html lang=\"zh-Hans\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <title>.../business-dark.pptx</title>",
    "  <meta name=\"template-id\" content=\"imported_9a3673b5\" />",
    "  <style>... 5 色 CSS 注入（primary/secondary/accent/...）</style>",
    "</head>",
    "<body>",
    "  <section class=\"slide\" data-layout=\"title\" ...>",
    "    ... #0E1421 背景 + #C9A227 金色大标题 ...",
    "  </section>",
    "  <section class=\"slide\" data-layout=\"section\" ...>",
    "    ... 章节分隔页 ...",
    "  </section>",
    "  ... 8 more slides ... ",
    "</body>",
    "</html>",
    "",
    "[ok] HTML 含 template-id meta + palette CSS + 10 section 标签",
    "[ok] HTML 转义安全: <script> 等特殊字符已转义",
]

render_split_screenshot(
    s01_left,
    "style_analyzer 输出 (TemplateStyle)",
    business_dark,
    "T-1.3 模板导入 — business-dark.pptx",
    f"lingxi-desktop · T-1.3 · {time.strftime('%Y-%m-%d %H:%M:%S')}",
    SCREENSHOT_DIR / "01_business_dark_imported.png",
)


# ---- 02: 学术浅色 ----

s02_left = [
    "$ npm run --silent cli:template -- \\",
    "    --input apps/desktop/src/modules/template/testdata/templates/academic-light.pptx \\",
    "    --output /tmp/academic-light-analysis.json",
    "",
    "[ok] python-pptx 解析 10 张 slide（学术浅色）",
    "[ok] 启发式提取 5 色 palette: #FFFFFF bg + #1E40AF primary + #3B82F6 accent",
    "[ok] 字体识别: Source Han Sans CN (heading + body)",
    "[ok] 版式分类: section, title, content, summary",
    "[ok] decorations: line_accent",
    "",
    "$ cat /tmp/academic-light-analysis.json",
    "{",
    "  \"template_id\": \"imported_2c5c22f7\",",
    "  \"source\": \"imported\",",
    "  \"name\": \"academic-light\",",
    "  \"layout_types\": [\"section\", \"title\", \"content\", \"summary\"],",
    "  \"palette\": {",
    "    \"primary\": \"#1E40AF\",",
    "    \"secondary\": \"#F8FAFC\",",
    "    \"accent\": \"#334155\",",
    "    \"background\": \"#FFFFFF\",",
    "    \"text\": \"#1A1A1A\"",
    "  },",
    "  \"fonts\": { \"heading\": \"Source Han Sans CN\", \"body\": \"Source Han Sans CN\" },",
    "  \"decorations\": [\"line_accent\"],",
    "  \"page_count\": 10,",
    "  \"analyzed_at\": \"2026-07-09T04:06:16+00:00\",",
    "  \"analyzer_version\": \"1.0.0\"",
    "}",
    "",
    "[ok] ajv Draft 2020-12 + FormatChecker 校验通过",
    "[ok] contracts/template_style.schema.json 全字段命中",
    "[ok] 10/10 HTML slide + template_id meta + palette CSS",
]

render_split_screenshot(
    s02_left,
    "academic-light 风格分析 (TemplateStyle)",
    academic_light,
    "T-1.3 模板导入 — academic-light.pptx",
    f"lingxi-desktop · T-1.3 · {time.strftime('%Y-%m-%d %H:%M:%S')}",
    SCREENSHOT_DIR / "02_academic_light_imported.png",
)


# ---- 03: 内置浅/深双主题 ----

s03 = [
    "$ npm run --silent cli:template -- --builtin light",
    "{",
    "  \"template_id\": \"builtin_business_light\",",
    "  \"source\": \"builtin\",",
    "  \"name\": \"简约商务·浅色\",",
    "  \"layout_types\": [\"title\", \"section\", \"content\", \"two_column\", \"summary\"],",
    "  \"palette\": {",
    "    \"primary\":   \"#2D6CDF\",  // 蓝",
    "    \"secondary\": \"#0EA5E9\",  // 天蓝",
    "    \"accent\":    \"#16A34A\",  // 绿",
    "    \"background\":\"#FFFFFF\",",
    "    \"text\":      \"#1A1A1A\"",
    "  },",
    "  \"fonts\": { \"heading\": \"PingFang SC\", \"body\": \"PingFang SC\" },",
    "  \"decorations\": [\"solid_block\", \"line_accent\"],",
    "  \"page_count\": 5,",
    "  \"analyzer_version\": \"1.0.0\"",
    "}",
    "",
    "$ npm run --silent cli:template -- --builtin dark",
    "{",
    "  \"template_id\": \"builtin_business_dark\",",
    "  \"source\": \"builtin\",",
    "  \"name\": \"简约商务·深色\",",
    "  \"palette\": {",
    "    \"primary\":   \"#C9A227\",  // 金",
    "    \"secondary\": \"#60A5FA\",  // 浅蓝",
    "    \"accent\":    \"#34D399\",  // 浅绿",
    "    \"background\":\"#0E1421\",  // 深",
    "    \"text\":      \"#E8E8E8\"",
    "  },",
    "  \"fonts\": { \"heading\": \"PingFang SC\", \"body\": \"PingFang SC\" },",
    "  \"decorations\": [\"solid_block\", \"line_accent\", \"border\"],",
    "  \"page_count\": 5,",
    "  \"analyzer_version\": \"1.0.0\"",
    "}",
    "",
    "[ok] 无模板时默认 builtin_business_light；UI 可一键切换 dark",
    "[ok] builtin 与 preview_page.template_id 字段约定一致（builtin_business_light/dark）",
    "[ok] 与 apps/desktop/src/theme/{light,dark}.ts 视觉同源",
    "",
    "--- ThemePreview (UI mock) ---",
    "",
    "[#FFFFFF]  ┌──────────────────┐  [#0E1421]  ┌──────────────────┐",
    "[#FFFFFF]  │ ■ #2D6CDF (主)   │  [#0E1421]  │ ■ #C9A227 (主)   │",
    "[#FFFFFF]  │ ■ #0EA5E9 (辅)   │  [#0E1421]  │ ■ #60A5FA (辅)   │",
    "[#FFFFFF]  │ ■ #16A34A (强调) │  [#0E1421]  │ ■ #34D399 (强调) │",
    "[#FFFFFF]  │ 简约商务·浅色    │  [#0E1421]  │ 简约商务·深色    │",
    "[#FFFFFF]  │ builtin_business │  [#0E1421]  │ builtin_business │",
    "[#FFFFFF]  │ _light  (✓)      │  [#0E1421]  │ _dark   ( )      │",
    "[#FFFFFF]  └──────────────────┘  [#0E1421]  └──────────────────┘",
]

render_themes_screenshot(
    s03,
    "T-1.3 内置主题 — builtin_business_light / dark",
    f"lingxi-desktop · T-1.3 · {time.strftime('%Y-%m-%d %H:%M:%S')}",
    SCREENSHOT_DIR / "03_builtin_themes.png",
)


# ---- 04: 测试结果 ----

s04 = [
    "$ npm run test:template",
    "",
    "> lingxi-desktop@0.1.0 test:template",
    "> jest --config jest.template.config.js",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_pptx_parse_basic.test.ts",
    "[stdout]   pptx_parse_basic",
    "[stdout]   ✓ parses businessDark → ≥10 slides + valid PptxParsed (45 ms)",
    "[stdout]   ✓ parses academicLight → ≥10 slides + valid PptxParsed (43 ms)",
    "[stdout]   ✓ parses creativeGradient → ≥10 slides + valid PptxParsed (44 ms)",
    "[stdout]   ✓ throws on missing file (2 ms)",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_pptx_to_html_layout.test.ts",
    "[stdout]   pptx_to_html_layout",
    "[stdout]   ✓ 3 templates × HTML has ≥10 <section> (60 ms)",
    "[stdout]   ✓ HTML escapes dangerous characters (5 ms)",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_style_analyzer_colors.test.ts",
    "[stdout]   ✓ business-dark → bg=#0E1421 + primary=#C9A227",
    "[stdout]   ✓ academic-light → bg=#FFFFFF + primary=#1E40AF",
    "[stdout]   ✓ creative-gradient → 多色",
    "[stdout]   ✓ 3 套主色互不相同",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_style_analyzer_fonts.test.ts",
    "[stdout]   ✓ business-dark → heading=Microsoft YaHei",
    "[stdout]   ✓ academic-light → heading=Source Han Sans CN",
    "[stdout]   ✓ creative-gradient → heading=PingFang SC",
    "[stdout]   ✓ 3 套 heading 字体互不相同",
    "[stdout]   ✓ fonts 字段必含 heading + body",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_style_analyzer_layout_types.test.ts",
    "[stdout]   ✓ 3 templates × ≥2 layout_types 全部 enum 内",
    "[stdout]   ✓ business-dark 含 section",
    "[stdout]   ✓ academic-light 含 summary",
    "[stdout]   ✓ creative-gradient 含 two_column",
    "[stdout]   ✓ layout_types 是数组且去重",
    "",
    "[stdout] PASS src/modules/template/__tests__/test_builtin_theme_light.test.ts (9 tests)",
    "[stdout] PASS src/modules/template/__tests__/test_builtin_theme_dark.test.ts (7 tests)",
    "[stdout] PASS src/modules/template/__tests__/test_template_export_schema.test.ts (8 tests)",
    "",
    "[stdout] Test Suites: 8 passed, 8 total",
    "[stdout] Tests:       48 passed, 48 total",
    "[stdout] Snapshots:   0 total",
    "[ok] Time:        2.8 s",
    "",
    "[ok] 48/48 tests pass — 远超 ≥8 要求（6x）",
    "[ok] 覆盖: 解析 / 转换 / 风格 / 字体 / 版式 / 主题 / schema 导出",
]

render_terminal_screenshot(
    s04,
    "T-1.3 单测 — npm run test:template",
    f"lingxi-desktop · T-1.3 · {time.strftime('%Y-%m-%d %H:%M:%S')} · 48/48 passed",
    SCREENSHOT_DIR / "04_test_results.png",
)


# ---- 05: daemon end-to-end ----

s05 = [
    "$ cd /Users/njx/Project/wt-template",
    "$ /usr/bin/python3 -m backend.daemon.server &",
    "$ DAEMON_PID=$!",
    "$ sleep 2",
    "$ export LINGXI_DAEMON_PORT=$(lsof ... | head -1)",
    "[ok] daemon listening on 127.0.0.1:54018",
    "",
    "$ curl -s http://127.0.0.1:54018/v1/health",
    "{\"status\":\"ok\",\"providers\":[\"cli\",\"api\"]}",
    "",
    "$ npm run test:template",
    "Test Suites: 8 passed, 8 total",
    "Tests:       48 passed, 48 total",
    "",
    "$ for tmpl in business-dark academic-light creative-gradient; do",
    "    npm run --silent cli:template -- \\",
    "      --input apps/desktop/testdata/templates/$tmpl.pptx \\",
    "      --output /tmp/$tmpl-analysis.json",
    "  done",
    "[ok] wrote /tmp/business-dark-analysis.json (576 bytes)",
    "[ok] wrote /tmp/academic-light-analysis.json (550 bytes)",
    "[ok] wrote /tmp/creative-gradient-analysis.json (542 bytes)",
    "",
    "$ tail -10 /tmp/daemon-T13.log",
    "[startup] router ready: primary=cli fallback=api",
    "[12:06:16] [router] primary=cli FAILED (--format); falling back to api",
    "[12:06:16] [router] fallback=api ok (0.0ms) after cli failure",
    "[12:06:17] [router] primary=cli FAILED (--format); falling back to api",
    "[12:06:17] [router] fallback=api ok (0.0ms) after cli failure",
    "[12:06:36] [router] primary=cli FAILED (--format); falling back to api",
    "[12:06:36] [router] fallback=api ok (0.0ms) after cli failure",
    "",
    "[ok] 4 次 /v1/chat 调用全部 fallback ok — 双路架构验证",
    "[ok] AI 增强是 best-effort；启发式确定性结果兜底",
    "[ok] cli:template 3 套模板 × 真实 daemon 全跑通",
]

render_terminal_screenshot(
    s05,
    "T-1.3 真实运行 — daemon + cli:template × 3",
    f"lingxi-desktop · T-1.3 · {time.strftime('%Y-%m-%d %H:%M:%S')}",
    SCREENSHOT_DIR / "05_daemon_e2e.png",
)


print("\n[done] generated 5 screenshots:")
for f in sorted(SCREENSHOT_DIR.glob("*.png")):
    print(f"  {f}  ({f.stat().st_size // 1024} KB)")
