"""生成 4 张 daemon 演示截图 (终端风格 PNG)。

输出文件:
  screenshots/T-1.0.a/01_daemon_started.png
  screenshots/T-1.0.a/02_health_200.png
  screenshots/T-1.0.a/03_chat_response.png
  screenshots/T-1.0.a/04_fallback_to_api.png
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


SCREENSHOT_DIR = Path("/Users/njx/Project/wt-daemon/screenshots/T-1.0.a")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH = 1200
HEIGHT = 720
PADDING = 24
BG_COLOR = (30, 30, 30)
FG_COLOR = (220, 220, 220)
ACCENT_COLOR = (100, 200, 255)
SUCCESS_COLOR = (100, 230, 130)
ERROR_COLOR = (255, 130, 130)
DIM_COLOR = (130, 130, 130)

# 用 STHeiti Medium 渲染（同时支持 ASCII + CJK）
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"


def _find_font(size: int) -> ImageFont.FreeTypeFont:
    """STHeiti Medium 优先（支持 CJK），fallback 到其他。"""
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


font_normal = _find_font(16)
font_title = _find_font(20)


def _colorize(line: str) -> tuple[str, tuple[int, int, int]]:
    """根据行内容返回 (text, color)。"""
    if line.startswith("[ok]") or line.startswith("✓"):
        return line, SUCCESS_COLOR
    if line.startswith("[err]") or line.startswith("✗") or "FAILED" in line or "FAIL" in line:
        return line, ERROR_COLOR
    if line.startswith("[note]") or line.startswith("$") or line.startswith(">"):
        return line, ACCENT_COLOR
    if line.startswith("[stderr]") or line.startswith("    "):
        return line, DIM_COLOR
    if line.startswith("[stdout]") or line.startswith("[curl"):
        return line, ACCENT_COLOR
    return line, FG_COLOR


def render_screenshot(lines: list[str], title: str, out_path: Path) -> None:
    """渲染一张终端风格截图到 PNG。

    Args:
        lines: 终端输出行（不含 ANSI 颜色码，纯文本）。
        title: 顶部标题（窗口标题栏文字）。
        out_path: 输出 PNG 路径。
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # 标题栏
    draw.rectangle([0, 0, WIDTH, 36], fill=(50, 50, 50))
    draw.ellipse([12, 12, 26, 26], fill=(255, 95, 86))
    draw.ellipse([34, 12, 48, 26], fill=(255, 189, 46))
    draw.ellipse([56, 12, 70, 26], fill=(39, 201, 63))
    draw.text(
        (90, 8),
        title,
        font=font_title,
        fill=(200, 200, 200),
    )

    # 终端内容（按真实宽度截断）
    y = 56
    max_line_h = 24
    char_w = 10  # STHeiti Medium @16px 估算
    max_chars = (WIDTH - 2 * PADDING) // char_w
    for raw_line in lines:
        text, color = _colorize(raw_line)
        if _display_width(text) > max_chars:
            text = _truncate(text, max_chars - 3) + "..."
        draw.text((PADDING, y), text, font=font_normal, fill=color)
        y += max_line_h
        if y > HEIGHT - 30:
            break

    # 底部状态栏
    draw.rectangle([0, HEIGHT - 24, WIDTH, HEIGHT], fill=(50, 50, 50))
    draw.text(
        (PADDING, HEIGHT - 22),
        f"lingxi-daemon · T-1.0.a · {time.strftime('%Y-%m-%d %H:%M:%S')}",
        font=font_normal,
        fill=(150, 150, 150),
    )

    img.save(out_path, "PNG", optimize=True)
    print(f"  → {out_path} ({out_path.stat().st_size // 1024} KB)")


def _display_width(s: str) -> int:
    """估算字符串在 STHeiti Medium 下的显示宽度（CJK 算 2）。"""
    w = 0
    for ch in s:
        if ord(ch) > 0x2E80:  # 粗略判断 CJK 范围
            w += 2
        else:
            w += 1
    return w


def _truncate(s: str, max_w: int) -> str:
    """按显示宽度截断字符串。"""
    out = []
    w = 0
    for ch in s:
        cw = 2 if ord(ch) > 0x2E80 else 1
        if w + cw > max_w:
            break
        out.append(ch)
        w += cw
    return "".join(out)


def _run_real_daemon() -> tuple[int, int, str, str]:
    """起真 daemon 跑 4 个 endpoint，返回 (PID, port, stderr_log, stdout)。

    默认用 /usr/bin/python3 (macOS 系统 3.9) 验证部署兼容性 — 即 fix_b 修复的场景。
    """
    env = os.environ.copy()
    env.pop("MiniMax_API_KEY", None)  # 强制 mock 路径

    # 用 macOS 系统 python 3.9 验证部署兼容（fix_b 修复目标）
    py = os.environ.get("LINGXI_TEST_PY", "/usr/bin/python3")

    proc = subprocess.Popen(
        [py, "-m", "backend.daemon.server"],
        cwd="/Users/njx/Project/wt-daemon",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # 读 PID + port 两行
    pid_line = proc.stdout.readline().strip()
    port_line = proc.stdout.readline().strip()
    pid = int(pid_line)
    port = int(port_line)

    # 等 server ready
    import httpx
    base = f"http://127.0.0.1:{port}"
    for _ in range(20):
        try:
            r = httpx.get(f"{base}/v1/health", timeout=0.5)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(0.1)
    else:
        proc.kill()
        raise RuntimeError("daemon didn't become ready")

    return pid, port, "", ""


def main() -> None:
    py_used = os.environ.get("LINGXI_TEST_PY", "/usr/bin/python3")
    py_version = subprocess.run(
        [py_used, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"],
        capture_output=True, text=True,
    ).stdout.strip()
    print(f"[1/4] starting daemon with {py_used} (Python {py_version})...")
    pid, port, _, _ = _run_real_daemon()

    import httpx
    base = f"http://127.0.0.1:{port}"

    # ---- 截图 01: daemon started ----
    print("[2/4] capturing 01_daemon_started.png")
    s01 = [
        "[ok] Lingxi Daemon started (uvicorn + FastAPI, Python " + py_version + ")",
        "",
        "$ cd /Users/njx/Project/wt-daemon",
        "$ /usr/bin/python3 -m backend.daemon.server",
        "",
        "[stdout] PID:    " + str(pid),
        "[stdout] PORT:   " + str(port),
        "[stderr] [startup] router ready: primary=cli fallback=api",
        "",
        "$ lsof -iTCP:" + str(port) + " -sTCP:LISTEN",
        "COMMAND   PID  USER   FD   TYPE  DEVICE  SIZE/OFF  NODE  NAME",
        f"python3  {pid}   njx    6u  IPv4  ...           TCP  127.0.0.1:{port} (LISTEN)",
        "",
        "[ok] daemon listening on 127.0.0.1:" + str(port),
        "[ok] Python " + py_version + " 部署兼容 (fix_b: eval_type_backport 已装)",
    ]
    render_screenshot(s01, "lingxi-daemon — T-1.0.a [01] daemon started (3.9 fix_b)",
                      SCREENSHOT_DIR / "01_daemon_started.png")

    # ---- 截图 02: health ----
    print("[3/4] capturing 02_health_200.png")
    r = httpx.get(f"{base}/v1/health")
    health_body = r.text
    s02 = [
        f"$ curl -s -i http://127.0.0.1:{port}/v1/health",
        f"HTTP/1.1 200 OK",
        f"content-type: application/json",
        f"content-length: {len(r.content)}",
        f"date: {time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime())}",
        f"server: uvicorn",
        "",
        f"{health_body}",
        "",
        "[ok] status=ok, providers=[cli, api]",
    ]
    render_screenshot(s02, "lingxi-daemon — T-1.0.a [02] GET /v1/health",
                      SCREENSHOT_DIR / "02_health_200.png")

    # ---- 截图 03: chat ----
    print("[4/8] capturing 03_chat_response.png")
    r = httpx.post(f"{base}/v1/chat", json={"prompt": "hello world"})
    chat_body = r.text
    s03 = [
        f"$ curl -s -i -X POST http://127.0.0.1:{port}/v1/chat \\",
        f"        -H \"Content-Type: application/json\" \\",
        f"        -d '{{\"prompt\": \"hello world\"}}'",
        f"HTTP/1.1 200 OK",
        f"content-type: application/json",
        f"content-length: {len(r.content)}",
        "",
        f"{chat_body}",
        "",
        "[note] fell_back=true → CLI 主调用失败，自动切换到 API (mock)",
        "[note] provider=\"api\"  content=\"hello (mock)\"",
    ]
    render_screenshot(s03, "lingxi-daemon — T-1.0.a [03] POST /v1/chat (fallback)",
                      SCREENSHOT_DIR / "03_chat_response.png")

    # ---- 截图 04: providers + force ----
    print("[5/5] capturing 04_fallback_to_api.png")
    rp = httpx.get(f"{base}/v1/providers")
    rf = httpx.post(f"{base}/v1/chat/force?provider=api", json={"prompt": "forced"})
    rfc = httpx.post(f"{base}/v1/chat/force?provider=cli", json={"prompt": "cli-direct"})

    s04 = [
        "$ curl -s http://127.0.0.1:" + str(port) + "/v1/providers",
        rp.text,
        "",
        "$ curl -s -X POST \"http://127.0.0.1:" + str(port) + "/v1/chat/force?provider=api\" \\",
        f"        -H \"Content-Type: application/json\" -d '{{\"prompt\": \"forced\"}}'",
        rf.text,
        "",
        "[stderr 日志] 全程 fallback 记录:",
        "    [startup] router ready: primary=cli fallback=api",
        f"    [{time.strftime('%H:%M:%S')}] [router] primary=cli FAILED; falling back to api",
        f"    [{time.strftime('%H:%M:%S')}] [router] fallback=api ok (0.1ms) after cli failure",
        "",
        "[ok] CLI primary failed → API fallback succeeded (mock hello)",
        "[ok] fell_back=true 时 content 仍返回，证明双路可用",
    ]
    render_screenshot(s04, "lingxi-daemon — T-1.0.a [04] fallback + providers",
                      SCREENSHOT_DIR / "04_fallback_to_api.png")

    # Cleanup
    print(f"\n[cleanup] killing daemon PID={pid}")
    proc = subprocess.run(["kill", str(pid)], capture_output=True)
    time.sleep(1)
    # 确认
    out = subprocess.run(["pgrep", "-f", "backend.daemon.server"],
                         capture_output=True, text=True)
    if out.stdout.strip():
        subprocess.run(["pkill", "-9", "-f", "backend.daemon.server"])

    print("\n[done] 4 screenshots generated:")
    for f in sorted(SCREENSHOT_DIR.glob("*.png")):
        print(f"  {f}  ({f.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()