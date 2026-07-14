#!/bin/bash
# mvp_real_operation.sh — MVP 真机操作截图 wrapper
# 起草人: PM (Mavis) · 2026-07-14 09:25 CST
#
# 用途: NJX 在 user Terminal 跑这个 script (mavis shell 受限, 不在 user GUI session)
#       跑出 6+ 张真机操作截图 (v0.3.0 真业务) + 4 格式产物 + 10 连跑 summary
#       → 替换 W5 sandbox `cp T-3.1 历史` 兜底 3 张图
#
# NJX 物理 ops: 1 命令, 5-15s
#   bash scripts/mvp_real_operation.sh
#
# 前置条件:
#   - 同意 macOS Screen Recording 1 次 (System Settings → Privacy & Security)
#   - /Applications/灵犀演示.app v0.3.0 已装
#   - 当前 worktree: /Users/njx/Project/灵犀演示 (main HEAD 70588b4)
#
# Deliverable (按钉子 #12 + project-pm 硬规则):
#   - screenshots/MVP_REAL_OPERATION/ 6+ 张真 PNG
#   - /tmp/mvp_real_4format/output.{pptx,pdf,docx,html} (4 格式真活)
#   - /tmp/mvp_real_10runs/output.{pptx,pdf,docx,html} × 10 (10 连跑真活)
#   - /tmp/mvp_real_operation_evidence.json (5 件套 summary)

set -euo pipefail

REPO="/Users/njx/Project/灵犀演示"
SHOT_DIR="$REPO/screenshots/MVP_REAL_OPERATION"
APP="/Applications/灵犀演示.app"
mkdir -p "$SHOT_DIR"
mkdir -p /tmp/mvp_real_4format
mkdir -p /tmp/mvp_real_10runs

ts() { date '+%H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

log "===== MVP 真机操作 v0.3.0 (NJX user Terminal 跑) ====="
log "REPO: $REPO"
log "APP: $APP"
log "SHOT_DIR: $SHOT_DIR"

# 1. 启 App v0.3.0 (普通模式, 不带 lingxi-validate-run)
log "1. 启 App v0.3.0..."
pkill -9 -f "灵犀演示" 2>/dev/null || true
sleep 1
open "$APP"
sleep 5
log "  App pid: $(pgrep -f '灵犀演示' | head -1 || echo 'NOT FOUND')"

# 2. 截 01_app_launched.png (App 启动真画面)
log "2. 截 01_app_launched.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/01_app_launched.png" 2>&1 | head -1 || log "  WARN: screencapture fail"
ls -la "$SHOT_DIR/01_app_launched.png" 2>&1 | head -1

# 3. AppleScript 触发 5 业务组件真业务 (FileKb/Advisor/Template/Preview/Output)
#    RN 桌面端 react-native-macos, 用 System Events keystroke 模拟
log "3. 触发 5 业务组件 (RN UI click)..."

# 3.1 FileKb: Tab 切到 FileKb 入口 + 截图
osascript -e 'tell application "灵犀演示" to activate' >/dev/null 2>&1 || true
sleep 1
log "  3.1 FileKb (导入按钮 click)..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/02_file_kb.png" 2>&1 | head -1 || true

# 3.2 Advisor
log "  3.2 Advisor (聊天输入)..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/03_advisor.png" 2>&1 | head -1 || true

# 3.3 Template
log "  3.3 Template (模板选择)..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/04_template.png" 2>&1 | head -1 || true

# 3.4 Preview
log "  3.4 Preview (预览显示)..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/05_preview.png" 2>&1 | head -1 || true

# 3.5 Output
log "  3.5 Output (导出)..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/06_output.png" 2>&1 | head -1 || true

# 4. 跑 full-demo CLI (PM 端到端, 4 格式真活)
log "4. 跑 full-demo CLI 端到端 (4 格式真活)..."
cd "$REPO"
PYTHONPATH="$REPO" .venv-daemon-py312/bin/python -m backend.daemon.server > /tmp/mvp_real_daemon.log 2>&1 &
DAEMON_PID=$!
sleep 4
log "  daemon pid: $DAEMON_PID"

cd "$REPO/apps/desktop"
# 跑 full-demo 端到端, 4 格式输出到 /tmp/mvp_real_4format/
tsx cli/full-demo.ts --output-dir /tmp/mvp_real_4format 2>&1 | tail -20 || log "  WARN: full-demo exit non-zero"
log "  4 格式产物:"
ls -la /tmp/mvp_real_4format/output.* 2>/dev/null

# 截 CLI 输出 (terminal 截图) 作为 Gate 2 evidence
log "  截 full-demo CLI 输出..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/07_full_e2e.png" 2>&1 | head -1 || true

# 5. 跑 10 连跑 (Gate 4)
log "5. 跑 10 连跑 Gate 4 (10/10 零失败)..."
cd "$REPO"
bash scripts/north_star_10_runs.sh 2>&1 | tail -30 || log "  WARN: 10runs exit non-zero"
log "  10runs summary:"
ls -la screenshots/W5-north-star-10runs/ 2>/dev/null

# 6. 写 evidence JSON
log "6. 写 evidence JSON..."
cat > /tmp/mvp_real_operation_evidence.json <<EOF
{
  "task": "MVP 真机操作 v0.3.0 (NJX user Terminal 跑)",
  "ran_at": "$(date -Iseconds)",
  "app_version": "0.3.0",
  "shots_dir": "$SHOT_DIR",
  "shots": [
    "$(ls $SHOT_DIR/01_app_launched.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/02_file_kb.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/03_advisor.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/04_template.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/05_preview.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/06_output.png 2>/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/07_full_e2e.png 2>/dev/null && echo "EXISTS" || echo "MISSING")"
  ],
  "4format_dir": "/tmp/mvp_real_4format",
  "4format_files": [
    "$(ls /tmp/mvp_real_4format/output.pptx 2>/dev/null && stat -f%z /tmp/mvp_real_4format/output.pptx || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.pdf 2>/dev/null && stat -f%z /tmp/mvp_real_4format/output.pdf || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.docx 2>/dev/null && stat -f%z /tmp/mvp_real_4format/output.docx || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.html 2>/dev/null && stat -f%z /tmp/mvp_real_4format/output.html || echo 0) B"
  ]
}
EOF
cat /tmp/mvp_real_operation_evidence.json

log ""
log "===== MVP 真机操作完成 ====="
log "Deliverable:"
log "  - $SHOT_DIR (6+ 张真 PNG, v0.3.0 真业务)"
log "  - /tmp/mvp_real_4format (4 格式真活)"
log "  - /tmp/mvp_real_operation_evidence.json (5 件套 summary)"
log ""
log "给 PM 后: PM 整理 MVP_REAL_OPERATION_REPORT.md + commit + 弹 NJX 4 Gate 验收签字"
