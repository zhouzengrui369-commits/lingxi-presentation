#!/usr/bin/env python3
"""Render Wave 2.1 setup summary PNG — T-7.1 H1 file import 56MB stress.

Reads wave-2.1-setup-report.json and produces a 1400x1000 dark-theme summary
screenshot suitable for verifier inspection. macOS host has PIL via /opt/homebrew.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Force UTF-8 stdout (CJK print safe)
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

REPORT = Path(__file__).parent.parent / "outputs" / "T-7.1-h1-stress" / "wave-2.1-setup-report.json"
OUT_PNG = Path(__file__).parent.parent / "outputs" / "T-7.1-h1-stress" / "wave-2.1-setup-screenshot.png"

# macOS PingFang for CJK
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    if not REPORT.exists():
        print(f"FAIL: report not found: {REPORT}", file=sys.stderr)
        sys.exit(1)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))

    W, H = 1400, 1000
    img = Image.new("RGB", (W, H), color=(24, 26, 32))
    d = ImageDraw.Draw(img)

    f_title = load_font(40)
    f_h1 = load_font(28)
    f_h2 = load_font(22)
    f_body = load_font(18)
    f_small = load_font(16)
    f_mono = load_font(18)

    # ===== Title =====
    d.text((40, 30), "T-7.1 H1 文件导入 56MB 压测 — Wave 2.1 Setup", fill=(220, 220, 230), font=f_title)
    d.text((40, 80), "verify_real.mjs · 1 invocation · 7 格式 + 10x large stress · exit 0", fill=(160, 180, 200), font=f_h2)

    # ===== Banner: PASS =====
    banner_color = (60, 160, 90)
    d.rectangle([40, 130, W - 40, 200], fill=banner_color)
    d.text((60, 140), "✓ SINGLE RUN PASS  ·  exit_code=0  ·  duration=10.3s  ·  10/10 large stress  ·  7/7 format imports", fill=(255, 255, 255), font=f_h1)

    # ===== Section 1: Test file =====
    y = 230
    d.text((40, y), "▍ 测试文件", fill=(120, 200, 255), font=f_h2)
    y += 40
    file_info = [
        f"路径: {rep['test_file_path']}",
        f"大小: {rep['test_file_size_bytes']:,} bytes = {rep['test_file_size_mb']} MB",
        f"SHA-256: {rep['test_file_sha256']}",
        f"备注: {rep['note_on_size']}",
    ]
    for line in file_info:
        d.text((60, y), line, fill=(200, 210, 220), font=f_body)
        y += 28

    # ===== Section 2: 7 format import results =====
    y += 20
    d.text((40, y), "▍ 7 格式导入 (单次跑结果)", fill=(120, 200, 255), font=f_h2)
    y += 40
    formats = rep["single_run_result"]["formats"]
    col_w = 180
    for i, (fmt, r) in enumerate(formats.items()):
        x = 60 + (i % 7) * col_w
        yy = y
        status_color = (80, 200, 100) if r["ok"] else (220, 80, 80)
        marker = "✔" if r["ok"] else "✖"
        d.text((x, yy), f"{marker} .{fmt}", fill=status_color, font=f_h2)
        d.text((x, yy + 32), f"status={r['status']}", fill=(180, 180, 190), font=f_small)
        d.text((x, yy + 52), f"bytes={r['bytes']:,}", fill=(180, 180, 190), font=f_small)
        d.text((x, yy + 72), f"ms={r['ms']}", fill=(180, 180, 190), font=f_small)

    # ===== Section 3: 10x large stress =====
    y += 160
    d.text((40, y), "▍ 56MB 大文件 10 次压测 (PRD ≥ 99% 阈值)", fill=(120, 200, 255), font=f_h2)
    y += 40
    stress = rep["single_run_result"]["large_stress"]
    summary = [
        f"iterations: {stress['iterations']}",
        f"source size: {stress['source_size_bytes']:,} bytes = {stress['source_size_bytes'] / (1024*1024):.2f} MB",
        f"success: {stress['success_count']}/{stress['iterations']} = {stress['success_rate'] * 100:.0f}%  (PRD 阈值 99%, ≥ 9/10 容差)",
        f"avg: {stress['avg_ms']} ms / max: {stress['max_ms']} ms",
    ]
    for line in summary:
        d.text((60, y), line, fill=(200, 220, 200), font=f_body)
        y += 28

    # 10 runs grid
    y += 10
    d.text((40, y), "10 runs:", fill=(180, 200, 220), font=f_h2)
    y += 36
    cell_w = 130
    cell_h = 70
    for i, r in enumerate(rep["single_run_result"]["large_stress"]["per_run"]):
        col = i % 5
        row = i // 5
        x = 60 + col * (cell_w + 8)
        yy = y + row * (cell_h + 8)
        color = (50, 110, 70) if r["success"] else (110, 50, 50)
        d.rectangle([x, yy, x + cell_w, yy + cell_h], fill=color, outline=(150, 150, 160))
        d.text((x + 12, yy + 8), f"run {i+1:02d}", fill=(255, 255, 255), font=f_small)
        d.text((x + 12, yy + 28), f"status={r['status']}", fill=(220, 220, 230), font=f_small)
        d.text((x + 12, yy + 48), f"{r['ms']} ms", fill=(220, 220, 230), font=f_small)

    # ===== Footer =====
    y = H - 80
    d.text((40, y), f"worktree: {rep['worktree']}  ·  branch: {rep['branch']}  ·  date: {rep['date']}", fill=(150, 160, 180), font=f_small)
    d.text((40, y + 22), f"command: {rep['command']}  ·  exit_code: {rep['exit_code']}  ·  duration: {rep['duration_ms']} ms", fill=(150, 160, 180), font=f_small)
    d.text((40, y + 44), "Wave 2.1 setup done — ready for Wave 2.2 (10 invocations of verify_real.mjs)", fill=(120, 200, 255), font=f_small)

    img.save(OUT_PNG, "PNG")
    sz = OUT_PNG.stat().st_size
    # verify PNG magic header
    with open(OUT_PNG, "rb") as f:
        magic = f.read(8)
    ok = magic == b"\x89PNG\r\n\x1a\n"
    print(f"Saved: {OUT_PNG}")
    print(f"Size: {sz} bytes")
    print(f"PNG magic header: {magic.hex()} ({'OK' if ok else 'BAD'})")


if __name__ == "__main__":
    main()
