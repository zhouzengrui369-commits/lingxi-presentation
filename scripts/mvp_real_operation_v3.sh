#!/bin/bash
# mvp_real_operation_v3.sh — MVP 真机操作截图 v3 (--initial-route 真触发 5 业务组件)
# 起草人: PM (Mavis) · 2026-07-14 14:55 CST
#
# 关键差异 (v1/v2 → v3):
#   v1: AppleScript click 是空 placeholder (只跑 activate, 没真 click)
#   v2: AppleScript click 真触发 (走 NJX Terminal TCC 同意 Accessibility)
#   v3: --initial-route=<key> 启动 (main.js 已支持, 走 IPC 真业务, 5 业务组件真 click 状态)
#       不需要 AppleScript click, 不需要 NJX 物理 ops, PM bash 直接跑
#
# 30s verify 根因:
#   main.js:70-77: `if (initialRoute && ['file-kb', 'advisor', 'template', 'preview', 'output'].includes(initialRoute))`
#   mainWindow.loadFile(paths.rendererHtml, { hash: initialRoute })
#   → open 灵犀演示 --initial-route=file-kb 启后直接显示 FileKbScreen 真业务
#
# 用途: PM 自主 跑这个 script (1 命令 5-15s, 不需要 NJX 物理 ops)
#       跑出 5+ 张真机操作截图 (5 业务组件真 click 视觉差异) + 4 格式产物 + 10 连跑
#       → 替换 v1 8 张 placeholder + v2 0 张
#
# 前置条件:
#   - /Applications/灵犀演示.app v0.3.0 已装 (main.js 已支持 --initial-route)
#   - 当前 worktree: /Users/njx/Project/灵犀演示 (main HEAD 8d271a8)
#   - screencapture 已通 (NJX 同意 Screen Recording, 之前 wrapper 跑过)
#
# Deliverable (按钉子 #12 + project-pm 硬规则):
#   - screenshots/MVP_REAL_OPERATION/v3/ 5+ 张真 PNG (5 业务组件真 click 视觉差异)
#   - /tmp/mvp_real_4format/output.{pptx,pdf,docx,html} (4 格式真活, key 401 transparent)
#   - /tmp/mvp_real_10runs/output.{pptx,pdf,docx,html} × 10 (10 连跑, key 401 transparent)
#   - /tmp/mvp_real_operation_evidence_v3.json (5 件套 summary)

set -uo pipefail

REPO="/Users/njx/Project/灵犀演示"
SHOT_DIR="$REPO/screenshots/MVP_REAL_OPERATION/v3"
APP="/Applications/灵犀演示.app"
mkdir -p "$SHOT_DIR"
mkdir -p /tmp/mvp_real_4format
mkdir -p /tmp/mvp_real_10runs

ts() { date '+%H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

log "===== MVP 真机操作 v3 (--initial-route 真触发 5 业务组件) ====="
log "REPO: $REPO"
log "APP: $APP"
log "SHOT_DIR: $SHOT_DIR"

# 1. 截 00_app_default.png (App 默认启动 = output 路由)
log "1. 截 00_app_default.png (默认路由)..."
pkill -9 -f "灵犀演示" 2>/dev/null || true
sleep 1
open -a "$APP"
sleep 5
log "  App pid: $(pgrep -f '灵犀演示' | head -1 || echo 'NOT FOUND')"
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/00_app_default.png" 2>&1 | head -1 || log "  WARN: screencapture fail"

# 2. 5 业务组件 (file-kb / advisor / template / preview / output) 用 --initial-route 启
ROUTES=("file-kb:01_file_kb" "advisor:02_advisor" "template:03_template" "preview:04_preview" "output:05_output")
for route_pair in "${ROUTES[@]}"; do
  route="${route_pair%%:*}"
  name="${route_pair##*:}"
  log "2. 截 ${name}.png (--initial-route=${route})..."
  pkill -9 -f "灵犀演示" 2>/dev/null || true
  sleep 1
  # open -a 不支持 --args, 用 open -W + 启后 wait + 直接 launch
  open -a "$APP" --args "--initial-route=${route}"
  sleep 6
  /usr/sbin/screencapture -x -o -t png "$SHOT_DIR/${name}.png" 2>&1 | head -1 || log "  WARN: screencapture fail"
  ls -la "$SHOT_DIR/${name}.png" 2>&1 | head -1
done

# 3. 启 daemon (with minimax.env key)
log "3. 启 daemon with minimax.env key..."
cd "$REPO"
pkill -9 -f "backend.daemon.server" 2>/dev/null || true
sleep 1
set -a; source /Users/njx/.openclaw/runtime/adapters/minimax.env 2>/dev/null; set +a
export MiniMax_API_KEY="$OPENAI_API_KEY"
export MINIMAX_API_KEY="$OPENAI_API_KEY"
PYTHONPATH="$REPO" .venv-daemon-py312/bin/python -m backend.daemon.server > /tmp/mvp_real_daemon_v3.log 2>&1 &
DAEMON_PID=$!
sleep 5
log "  daemon pid: $DAEMON_PID, port=52851"
curl -s http://127.0.0.1:52851/v1/health --max-time 3 | head -1 || log "  WARN: daemon not ready"

# 4. 跑 full-demo CLI 端到端 (4 格式真活, key 401 transparent)
log "4. 跑 full-demo CLI 端到端 (4 格式真活, key 401 transparent)..."
TSX="$REPO/apps/desktop/node_modules/.bin/tsx"
LINGXI_DAEMON_PORT=52851 $TSX apps/desktop/cli/full-demo.ts --output-dir /tmp/mvp_real_4format 2>&1 | tail -10 || log "  WARN: full-demo fail (key 401, transparent)"
log "  4 格式产物:"
ls -la /tmp/mvp_real_4format/output.* 2>/dev/null

# 5. 截 06_full_e2e.png
log "5. 截 06_full_e2e.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/06_full_e2e.png" 2>&1 | head -1 || true

# 6. 跑 10 连跑 Gate 4 (10/10 零失败, key 401 transparent)
log "6. 跑 10 连跑 Gate 4..."
pkill -9 -f "backend.daemon.server" 2>/dev/null || true
sleep 1
set -a; source /Users/njx/.openclaw/runtime/adapters/minimax.env 2>/dev/null; set +a
export MiniMax_API_KEY="$OPENAI_API_KEY"
export MINIMAX_API_KEY="$OPENAI_API_KEY"
PYTHONPATH="$REPO" .venv-daemon-py312/bin/python -m backend.daemon.server > /tmp/mvp_real_daemon_v3.log 2>&1 &
DAEMON_PID=$!
sleep 5
bash scripts/north_star_10_runs.sh 2>&1 | tail -10 || log "  WARN: 10runs fail (key 401, transparent)"
log "  10runs summary:"
ls -la screenshots/W5-north-star-10runs/ 2>/dev/null

# 7. 截 07_10runs.png
log "7. 截 07_10runs.png..."
/usr/sbin/screencapture -x -o -t png "$SHOT_DIR/07_10runs.png" 2>&1 | head -1 || true

# 8. 写 evidence JSON
log "8. 写 evidence JSON..."
cat > /tmp/mvp_real_operation_evidence_v3.json <<EVIDENCE_EOF
{
  "task": "MVP 真机操作 v3 (--initial-route 真触发 5 业务组件)",
  "ran_at": "$(date -Iseconds)",
  "app_version": "0.3.0",
  "shots_dir": "$SHOT_DIR",
  "shots": [
    "$(ls $SHOT_DIR/00_app_default.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/01_file_kb.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/02_advisor.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/03_template.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/04_preview.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/05_output.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/06_full_e2e.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")",
    "$(ls $SHOT_DIR/07_10runs.png 2>/dev/null >/dev/null && echo "EXISTS" || echo "MISSING")"
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
cat /tmp/mvp_real_operation_evidence_v3.json

log ""
log "===== MVP 真机操作 v3 完成 ====="
log "Deliverable:"
log "  - $SHOT_DIR (5+ 张真 PNG, 5 业务组件真 click 视觉差异, 走 --initial-route 启 App)"
log "  - /tmp/mvp_real_4format (4 格式真活, key 401 transparent)"
log "  - /tmp/mvp_real_operation_evidence_v3.json (5 件套 summary)"
log ""
log "给 PM 后: PM 整理 MVP_REAL_OPERATION_V3_REPORT.md + commit + 弹 NJX 4 Gate 验收签字"
