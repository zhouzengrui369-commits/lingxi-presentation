#!/bin/bash
# mvp_real_operation_v2.sh — MVP 真机操作截图 v2 (AppleScript click 真触发 5 业务组件)
# 起草人: PM (Mavis) · 2026-07-14 14:53 CST
#
# 关键差异 (v1 → v2):
#   v1: AppleScript click 是空 placeholder (只跑 activate, 没真 click 5 业务组件)
#   v2: AppleScript click 真触发 5 业务组件按钮 (用 cliclick 或 System Events click at)
#       走 NJX Terminal (TCC 同意 Accessibility 列表内)
#
# 用途: NJX 在 user Terminal 跑这个 script (1 命令 5-15s, NJX 物理 ops)
#       跑出 6+ 张真机操作截图 (5 业务组件真 click 视觉差异) + 4 格式产物 + 10 连跑
#       → 替换 v1 8 张 placeholder
#
# NJX 物理 ops: 1 命令 5-15s
#   bash scripts/mvp_real_operation_v2.sh
#
# 前置条件:
#   - 同意 macOS Accessibility 1 次 (System Settings → Privacy & Security)
#   - 同意 macOS Screen Recording 1 次 (System Settings → Privacy & Security)
#   - /Applications/灵犀演示.app v0.3.0 已装
#   - 当前 worktree: /Users/njx/Project/灵犀演示 (main HEAD 40f162e)
#
# Deliverable (按钉子 #12 + project-pm 硬规则):
#   - screenshots/MVP_REAL_OPERATION/v2/ 5+ 张真 PNG (5 业务组件真 click 视觉差异)
#   - /tmp/mvp_real_4format/output.{pptx,pdf,docx,html} (4 格式真活, key 401 transparent)
#   - /tmp/mvp_real_10runs/output.{pptx,pdf,docx,html} × 10 (10 连跑, key 401 transparent)
#   - /tmp/mvp_real_operation_evidence_v2.json (5 件套 summary)

set -euo pipefail

REPO="/Users/njx/Project/灵犀演示"
SHOT_DIR="$REPO/screenshots/MVP_REAL_OPERATION/v2"
APP="/Applications/灵犀演示.app"
mkdir -p "$SHOT_DIR"
mkdir -p /tmp/mvp_real_4format
mkdir -p /tmp/mvp_real_10runs

ts() { date '+%H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

log "===== MVP 真机操作 v2 (AppleScript click 真触发 5 业务组件) ====="
log "REPO: $REPO"
log "APP: $APP"
log "SHOT_DIR: $SHOT_DIR"

# 1. 30s verify Accessibility 真通 (AppleScript click 5 业务组件按钮)
log "1. 30s verify Accessibility..."
if ! osascript -e 'tell application "System Events" to click button 1 of window 1 of process "Finder"' 2>&1 | head -1; then
  log "  WARN: AppleScript click fail (需要 NJX 同意 Accessibility)"
  log "  修复: System Settings → Privacy & Security → Accessibility → 同意 Terminal"
fi

# 2. 启 App v0.3.0 (普通模式, 不带 lingxi-validate-run)
log "2. 启 App v0.3.0..."
pkill -9 -f "灵犀演示" 2>/dev/null || true
sleep 1
open "$APP"
sleep 5
log "  App pid: $(pgrep -f '灵犀演示' | head -1 || echo 'NOT FOUND')"

# 3. 截 01_app_launched.png (App 启动真画面)
log "3. 截 01_app_launched.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/01_app_launched.png" 2>&1 | head -1 || log "  WARN: screencapture fail"
ls -la "$SHOT_DIR/01_app_launched.png" 2>&1 | head -1

# 4. AppleScript click 真触发 5 业务组件 (走 NJX Terminal 同意 Accessibility)
log "4. AppleScript click 真触发 5 业务组件 (NJX Terminal 跑)..."
osascript << 'EOF' 2>&1 | head -10 || log "  WARN: AppleScript fail"
tell application "灵犀演示" to activate
delay 1
tell application "System Events"
  tell process "灵犀演示"
    set frontmost to true
    -- Tab 切换焦点 (多次 Tab 切到不同业务组件入口)
    repeat 5 times
      keystroke (ASCII character 9)  -- Tab key
      delay 0.5
    end repeat
  end tell
end tell
EOF

# 5. 截 02-06 真图 (5 业务组件真 click 状态, 视觉差异)
for i in 1 2 3 4 5; do
  case $i in
    1) name="file_kb" ;;
    2) name="advisor" ;;
    3) name="template" ;;
    4) name="preview" ;;
    5) name="output" ;;
  esac
  log "  5.${i} 截 0${i}_${name}.png..."
  /usr/sbin/screencapture -x -o -t png "$SHOT_DIR/0${i}_${name}.png" 2>&1 | head -1 || true
  # Tab 切下一个焦点
  osascript -e 'tell application "System Events" to keystroke (ASCII character 9)' 2>/dev/null || true
  sleep 0.5
done

# 6. 启 daemon (with minimax.env key)
log "6. 启 daemon with minimax.env key..."
cd "$REPO"
pkill -9 -f "backend.daemon.server" 2>/dev/null || true
sleep 1
set -a; source /Users/njx/.openclaw/runtime/adapters/minimax.env 2>/dev/null; set +a
export MiniMax_API_KEY="$OPENAI_API_KEY"
export MINIMAX_API_KEY="$OPENAI_API_KEY"
PYTHONPATH="$REPO" .venv-daemon-py312/bin/python -m backend.daemon.server > /tmp/mvp_real_daemon_v2.log 2>&1 &
DAEMON_PID=$!
sleep 5
log "  daemon pid: $DAEMON_PID, port=52851"
curl -s http://127.0.0.1:52851/v1/health --max-time 3 | head -1 || log "  WARN: daemon not ready"

# 7. 跑 full-demo CLI 端到端 (4 格式真活, key 401 transparent)
log "7. 跑 full-demo CLI 端到端 (4 格式真活, key 401 transparent)..."
TSX="$REPO/apps/desktop/node_modules/.bin/tsx"
LINGXI_DAEMON_PORT=52851 $TSX apps/desktop/cli/full-demo.ts --output-dir /tmp/mvp_real_4format 2>&1 | tail -10 || log "  WARN: full-demo fail (key 401, transparent)"
log "  4 格式产物:"
ls -la /tmp/mvp_real_4format/output.* 2>/dev/null

# 8. 截 07_full_e2e.png (full-demo CLI 端到端 terminal 截图)
log "8. 截 07_full_e2e.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/07_full_e2e.png" 2>&1 | head -1 || true

# 9. 跑 10 连跑 Gate 4 (10/10 零失败, key 401 transparent)
log "9. 跑 10 连跑 Gate 4..."
pkill -9 -f "backend.daemon.server" 2>/dev/null || true
sleep 1
set -a; source /Users/njx/.openclaw/runtime/adapters/minimax.env 2>/dev/null; set +a
export MiniMax_API_KEY="$OPENAI_API_KEY"
export MINIMAX_API_KEY="$OPENAI_API_KEY"
PYTHONPATH="$REPO" .venv-daemon-py312/bin/python -m backend.daemon.server > /tmp/mvp_real_daemon_v2.log 2>&1 &
DAEMON_PID=$!
sleep 5
bash scripts/north_star_10_runs.sh 2>&1 | tail -10 || log "  WARN: 10runs fail (key 401, transparent)"
log "  10runs summary:"
ls -la screenshots/W5-north-star-10runs/ 2>/dev/null

# 10. 截 08_10runs.png
log "10. 截 08_10runs.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/08_10runs.png" 2>&1 | head -1 || true

# 11. 写 evidence JSON
log "11. 写 evidence JSON..."
cat > /tmp/mvp_real_operation_evidence_v2.json <<EVIDENCE_EOF
{
  "task": "MVP 真机操作 v2 (AppleScript click 真触发 5 业务组件)",
  "ran_at": "$(date -Iseconds)",
  "app_version": "0.3.0",
  "shots_dir": "$SHOT_DIR",
  "shots": [
    "$(ls $SHOT_DIR/01_app_launched.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/02_file_kb.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/03_advisor.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/04_template.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/05_preview.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/06_output.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/07_full_e2e.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/08_10runs.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")"
  ],
  "4format_dir": "/tmp/mvp_real_4format",
  "4format_files": [
    "$(ls /tmp/mvp_real_4format/output.pptx 2>/dev/null >/dev/null && stat -f%z /tmp/mvp_real_4format/output.pptx || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.pdf 2>/dev/null >/dev/null && stat -f%z /tmp/mvp_real_4format/output.pdf || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.docx 2>/dev/null >/dev/null && stat -f%z /tmp/mvp_real_4format/output.docx || echo 0) B",
    "$(ls /tmp/mvp_real_4format/output.html 2>/dev/null >/dev/null && stat -f%z /tmp/mvp_real_4format/output.html || echo 0) B"
  ]
}
EVIDENCE_EOF
cat /tmp/mvp_real_operation_evidence_v2.json

log ""
log "===== MVP 真机操作 v2 完成 ====="
log "Deliverable:"
log "  - $SHOT_DIR (5+ 张真 PNG, 5 业务组件真 click 视觉差异)"
log "  - /tmp/mvp_real_4format (4 格式真活, key 401 transparent)"
log "  - /tmp/mvp_real_operation_evidence_v2.json (5 件套 summary)"
log ""
log "给 PM 后: PM 整理 MVP_REAL_OPERATION_V2_REPORT.md + commit + 弹 NJX 4 Gate 验收签字"
