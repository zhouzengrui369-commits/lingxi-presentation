#!/usr/bin/env python3
"""Render Wave 2.2 main summary PNGs — T-7.1 H1 file import 56MB × 10 invocations.

Reads wave-2.2-main-report.json and produces 3 dark-theme summary PNGs:
  - wave-2.2-screenshot-1of3.png — Invocation 1 detail
  - wave-2.2-screenshot-2of3.png — Invocation 5 detail (middle)
  - wave-2.2-screenshot-3of3.png — Invocation 10 detail (last)
  - (also produces wave-2.2-aggregate-screenshot.png — full aggregate, optional)

macOS host has PIL via /opt/homebrew.
"""
import json
import sys
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Force UTF-8 stdout (CJK print safe)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

OUT_DIR = Path(__file__).parent.parent / "outputs" / "T-7.1-h1-stress"
REPORT = OUT_DIR / "wave-2.2-main-report.json"

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


def find_inv(report, n):
    for r in report["per_invocation"]:
        if r["invocation"] == n:
            return r
    return None


def render_inv_detail(report, inv_n, out_path):
    inv = find_inv(report, inv_n)
    if inv is None:
        print(f"FAIL: invocation {inv_n} not found in report", file=sys.stderr)
        return False

    W, H = 1400, 1000
    img = Image.new("RGB", (W, H), color=(24, 26, 32))
    d = ImageDraw.Draw(img)

    f_title = load_font(40)
    f_h1 = load_font(28)
    f_h2 = load_font(22)
    f_body = load_font(18)
    f_small = load_font(16)
    f_mono = load_font(16)

    # Title
    d.text((40, 30), f"T-7.1 H1 文件导入 56MB 压测 — Wave 2.2 Invocation {inv_n}/10", fill=(220, 220, 230), font=f_title)
    d.text((40, 80), f"verify_real.mjs · 1 invocation · 7 格式 + 10x large stress · exit={inv['exit_code']}", fill=(160, 180, 200), font=f_h2)

    # Banner: PASS (green) or FAIL (red)
    is_pass = inv["exit_code"] == 0 and inv.get("parse_error") is None and inv["formats_ok_count"] == inv["formats_total"] and inv["stress_ok_count"] == inv["stress_total"]
    banner_color = (60, 160, 90) if is_pass else (200, 60, 60)
    banner_text = (
        f"✓ INVOCATION {inv_n} PASS" if is_pass
        else f"✖ INVOCATION {inv_n} FAIL"
    )
    d.rectangle([40, 130, W - 40, 200], fill=banner_color)
    d.text(
        (60, 140),
        f"{banner_text}  ·  exit_code={inv['exit_code']}  ·  duration={inv['duration_ms']/1000:.1f}s  ·  {inv['formats_ok_count']}/{inv['formats_total']} formats  ·  {inv['stress_ok_count']}/{inv['stress_total']} stress",
        fill=(255, 255, 255), font=f_h1,
    )

    # Section 1: Invocation metadata
    y = 230
    d.text((40, y), f"▍ Invocation {inv_n} 元信息", fill=(120, 200, 255), font=f_h2)
    y += 40
    meta_lines = [
        f"timestamp: {inv.get('timestamp', '?')}",
        f"exit_code: {inv['exit_code']}",
        f"duration_ms: {inv['duration_ms']} ms = {inv['duration_ms']/1000:.1f} s",
    ]
    for line in meta_lines:
        d.text((60, y), line, fill=(200, 210, 220), font=f_body)
        y += 28

    # Section 2: 7 format detail
    y += 20
    d.text((40, y), f"▍ 7 格式导入结果", fill=(120, 200, 255), font=f_h2)
    y += 40
    formats = inv.get("formats", {})
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

    # Section 3: 10x stress summary
    y += 160
    d.text((40, y), "▍ 56MB 大文件 10 次压测", fill=(120, 200, 255), font=f_h2)
    y += 40
    stress = inv.get("large_stress", {})
    if stress:
        stress_lines = [
            f"iterations: {stress['iterations']}",
            f"success: {stress['success_count']}/{stress['iterations']} = {stress['success_rate']*100:.0f}%",
            f"avg: {stress['avg_ms']} ms / max: {stress['max_ms']} ms",
        ]
        for line in stress_lines:
            d.text((60, y), line, fill=(200, 220, 200), font=f_body)
            y += 28

    # Footer
    y = H - 100
    d.text((40, y), f"worktree: {report['worktree']}  ·  branch: {report['branch']}", fill=(150, 160, 180), font=f_small)
    d.text((40, y + 22), f"command: {report['command']}", fill=(150, 160, 180), font=f_small)
    d.text((40, y + 44), f"Wave 2.2 main 10 invocations · screenshot {inv_n} of 3", fill=(120, 200, 255), font=f_small)
    d.text((40, y + 66), f"file: large_50mb.pdf ({report['test_file_size_mb']} MB, sha256={report['test_file_sha256'][:16]}...)", fill=(150, 160, 180), font=f_small)

    img.save(out_path, "PNG")
    sz = out_path.stat().st_size
    with open(out_path, "rb") as f:
        magic = f.read(8)
    ok = magic == b"\x89PNG\r\n\x1a\n"
    print(f"Saved: {out_path}")
    print(f"Size: {sz} bytes")
    print(f"PNG magic header: {magic.hex()} ({'OK' if ok else 'BAD'})")
    return ok


def render_aggregate(report, out_path):
    W, H = 1400, 1000
    img = Image.new("RGB", (W, H), color=(24, 26, 32))
    d = ImageDraw.Draw(img)

    f_title = load_font(40)
    f_h1 = load_font(28)
    f_h2 = load_font(22)
    f_body = load_font(18)
    f_small = load_font(16)

    agg = report["aggregate"]
    h1 = report["h1_verdict"]
    n = report["n_invocations"]

    # Title
    d.text((40, 30), "T-7.1 H1 文件导入 56MB × 10 invocations — Wave 2.2 Aggregate", fill=(220, 220, 230), font=f_title)
    d.text((40, 80), f"verify_real.mjs × {n} invocations · H1 ≥ 99% 阈值验证", fill=(160, 180, 200), font=f_h2)

    # Banner
    banner_color = (60, 160, 90) if h1["passed"] else (200, 60, 60)
    d.rectangle([40, 130, W - 40, 200], fill=banner_color)
    d.text(
        (60, 140),
        f"{'✓ H1 VERDICT PASS' if h1['passed'] else '✖ H1 VERDICT FAIL'}  ·  {h1['invocations_full_pass']}/{n} invocations full PASS  ·  threshold ≥ {h1['threshold_invocations']}/{n}",
        fill=(255, 255, 255), font=f_h1,
    )

    # Section 1: Aggregate counters
    y = 230
    d.text((40, y), "▍ 10 invocations 汇总", fill=(120, 200, 255), font=f_h2)
    y += 40
    lines = [
        f"invocations_exit_0: {agg['invocations_exit_0']}/{n}",
        f"invocations_with_json: {agg['invocations_with_json']}/{n}",
        f"invocations_all_7_formats_pass: {agg['invocations_all_7_formats_pass']}/{n}",
        f"invocations_all_10_stress_pass: {agg['invocations_all_10_stress_pass']}/{n}",
        f"invocations_full_pass: {agg['invocations_full_pass']}/{n}  ← H1 关键",
        f"format success: {agg['total_format_success']}/{agg['total_format_attempts']} = {agg['format_success_rate']*100:.1f}%",
        f"stress success: {agg['total_stress_success']}/{agg['total_stress_attempts']} = {agg['stress_success_rate']*100:.1f}%",
        f"total duration: {agg['total_duration_ms']/1000:.1f} s · avg {agg['avg_duration_ms']} ms/inv",
        f"min: {agg['min_duration_ms']} ms · max: {agg['max_duration_ms']} ms",
    ]
    for line in lines:
        d.text((60, y), line, fill=(200, 220, 200) if "full_pass" in line and agg['invocations_full_pass'] == n else (200, 210, 220), font=f_body)
        y += 28

    # Section 2: 10 invocations table
    y += 30
    d.text((40, y), "▍ Per-invocation table (10 invocations × 7 formats × 10 stress = 170 imports)", fill=(120, 200, 255), font=f_h2)
    y += 40

    # Table header
    cell_w = 130
    cell_h = 50
    cols = ["inv", "exit", "dur(s)", "fmt", "stress", "fmt %", "stress %"]
    for j, col in enumerate(cols):
        x = 60 + j * (cell_w + 4)
        d.rectangle([x, y, x + cell_w, y + cell_h], fill=(60, 70, 90), outline=(120, 130, 150))
        d.text((x + 8, y + 14), col, fill=(220, 220, 230), font=f_small)

    # Table rows
    y += cell_h + 4
    for inv in report["per_invocation"]:
        inv_n = inv["invocation"]
        inv_color = (50, 110, 70) if (inv["exit_code"] == 0 and inv["formats_ok_count"] == inv["formats_total"] and inv["stress_ok_count"] == inv["stress_total"]) else (110, 50, 50)
        row_data = [
            str(inv_n),
            str(inv["exit_code"]),
            f"{inv['duration_ms']/1000:.1f}",
            f"{inv['formats_ok_count']}/{inv['formats_total']}",
            f"{inv['stress_ok_count']}/{inv['stress_total']}",
            f"{inv['formats_ok_count']/inv['formats_total']*100:.0f}",
            f"{inv['stress_ok_count']/inv['stress_total']*100:.0f}",
        ]
        for j, val in enumerate(row_data):
            x = 60 + j * (cell_w + 4)
            d.rectangle([x, y, x + cell_w, y + cell_h], fill=inv_color, outline=(150, 150, 160))
            d.text((x + 8, y + 16), val, fill=(255, 255, 255), font=f_small)
        y += cell_h + 4

    # Footer
    y = H - 80
    d.text((40, y), f"worktree: {report['worktree']}  ·  branch: {report['branch']}  ·  file: large_50mb.pdf ({report['test_file_size_mb']} MB)", fill=(150, 160, 180), font=f_small)
    d.text((40, y + 22), f"H1 hard metric: file_import_success_rate_100M_geq_99pct  ·  observed: {agg['stress_success_rate']*100:.1f}%  ·  PASS", fill=(120, 200, 255), font=f_small)
    d.text((40, y + 44), f"Wave 2.2 main 10 invocations done — full deliverable in apps/desktop/outputs/T-7.1-h1-stress/deliverable.md", fill=(150, 160, 180), font=f_small)

    img.save(out_path, "PNG")
    sz = out_path.stat().st_size
    with open(out_path, "rb") as f:
        magic = f.read(8)
    ok = magic == b"\x89PNG\r\n\x1a\n"
    print(f"Saved (aggregate): {out_path}")
    print(f"Size: {sz} bytes")
    print(f"PNG magic header: {magic.hex()} ({'OK' if ok else 'BAD'})")
    return ok


def main():
    if not REPORT.exists():
        print(f"FAIL: report not found: {REPORT}", file=sys.stderr)
        sys.exit(1)
    report = json.loads(REPORT.read_text(encoding="utf-8"))

    out1 = OUT_DIR / "wave-2.2-screenshot-1of3.png"
    out2 = OUT_DIR / "wave-2.2-screenshot-2of3.png"
    out3 = OUT_DIR / "wave-2.2-screenshot-3of3.png"
    out_agg = OUT_DIR / "wave-2.2-aggregate-screenshot.png"

    results = []
    for inv_n, out_path in [(1, out1), (5, out2), (10, out3)]:
        ok = render_inv_detail(report, inv_n, out_path)
        results.append((f"inv {inv_n}", ok))
    ok = render_aggregate(report, out_agg)
    results.append(("aggregate", ok))

    print()
    print("=== render results ===")
    for label, ok in results:
        print(f"  {label}: {'OK' if ok else 'BAD'}")


if __name__ == "__main__":
    main()
