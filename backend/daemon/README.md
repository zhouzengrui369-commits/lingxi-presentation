# Lingxi Daemon (T-1.0.a)

> 本地 HTTP daemon + AIProvider 抽象层（CLI 主调用 + API 兜底双路模式）。
> 供灵犀演示 Phase 1 的 5 大模块（T-1.1 ~ T-1.5）调用 AI 能力。

---

## 一句话定位

`backend.daemon` 是**所有 AI 调用的唯一入口**。任何需要 LLM 的代码（T-1.1 wiki / T-1.2 advisor / T-1.3 style / T-1.4 preview / T-1.5 output）都不直接调 MiniMax CLI 或 HTTP API，而是 POST 到这个 daemon 的 `/v1/chat`。

---

## 为什么需要这个抽象层

| 直接调用的痛点 | daemon 抽象后的好处 |
|---|---|
| CLI 在 macOS/Win 路径/编码差异 | daemon 隔离进程，调用方不感知 |
| CLI 失败/超时无 fallback | 自动 fallback 到 API/mock |
| 切换 provider 要改业务代码 | 改 router 配置即可 |
| 调用方需要关心 stderr/exit code | daemon 统一包装成 JSON |
| 多个模块并发调 AI 资源争抢 | daemon 起在后台统一调度 |

---

## 架构

```
   ┌─────────────────────────────────────────────────────────────┐
   │                       灵犀桌面 App                           │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
   │  │ T-1.1 KB │  │T-1.2 Adv │  │T-1.3 Tpl │  │T-1.4 Prv │    │
   │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
   │       │ HTTP POST   /v1/chat      │             │          │
   │       └────────────┬──────────────┴─────────────┘          │
   └─────────────────────┼───────────────────────────────────────┘
                         │ JSON: {"prompt": "..."}
                         ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  backend.daemon (FastAPI + uvicorn, 127.0.0.1:随机端口)     │
   │                                                             │
   │  ┌─────────────────────────────────────────────────────┐   │
   │  │ ProviderRouter (CLI 主 + API 兜底)                  │   │
   │  │                                                     │   │
   │  │   ┌──────────────────┐     ┌──────────────────┐     │   │
   │  │   │ MiniMaxCLIProvider│ ──→ │ MiniMaxAPIProvider│    │   │
   │  │   │  (primary)       │FAIL │  (fallback /mock) │     │   │
   │  │   └──────────────────┘     └──────────────────┘     │   │
   │  └─────────────────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────────────────┘
```

---

## 代码结构

```
backend/daemon/
├── __init__.py                 # package marker, version
├── ai_provider.py              # abstract base + ProviderCallError
├── server.py                   # FastAPI app, 4 endpoints, lifespan
├── requirements.txt            # fastapi / uvicorn / httpx / pydantic / pytest
├── providers/
│   ├── __init__.py             # re-exports
│   ├── cli_provider.py         # MiniMaxCLIProvider (subprocess)
│   ├── api_provider.py         # MiniMaxAPIProvider (httpx) + MockProvider
│   └── provider_router.py      # ProviderRouter (primary + fallback)
└── tests/
    ├── __init__.py
    ├── conftest.py             # pytest 配置
    ├── test_ai_provider_abstract.py  # 4 cases
    ├── test_cli_provider.py          # 11 cases
    ├── test_api_provider.py          # 10 cases
    ├── test_router.py                # 10 cases
    └── test_server.py                # 14 cases（含真子进程启 server）
```

---

## HTTP API (v1)

### `GET /v1/health`

Liveness + provider 列表。

```bash
$ curl -s http://127.0.0.1:<port>/v1/health
{"status":"ok","providers":["cli","api"]}
```

### `POST /v1/chat`

主入口。Body：

```json
{
  "prompt": "hello world",
  "temperature": 0.7,    // optional
  "max_tokens": 100       // optional
}
```

Response：

```json
{
  "content": "hello (mock)",
  "provider": "api",
  "fell_back": true,
  "elapsed_ms": 0.05
}
```

- `fell_back=true` → CLI 失败，自动切换到 API（或 mock）。
- `provider="cli"` / `"api"` / `"mock"`。

### `GET /v1/providers`

查看 router 状态：

```bash
$ curl -s http://127.0.0.1:<port>/v1/providers
{"active":"cli","available":["cli","api"]}
```

### `POST /v1/chat/force?provider=cli|api|primary|fallback`

强制走某一路（用于测 fallback）。

```bash
$ curl -s -X POST "http://127.0.0.1:<port>/v1/chat/force?provider=api" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"forced"}'
```

---

## 启动方式

### 开发/本地

```bash
cd /Users/njx/Project/灵犀演示
pip install -r backend/daemon/requirements.txt
python -m backend.daemon.server
```

启动后 stdout 第一行是 PID，第二行是实际监听的端口：

```
12345
54321
```

### 在测试 / 父进程捕获

父进程读 stdout 前两行拿 PID + port：

```python
import subprocess
proc = subprocess.Popen(["python", "-m", "backend.daemon.server"],
                        cwd="/Users/njx/Project/灵犀演示",
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
pid = int(proc.stdout.readline())
port = int(proc.stdout.readline())
```

### 环境变量

| 变量 | 含义 | 默认 |
|---|---|---|
| `MiniMax_API_KEY` | MiniMax API key；无 key 时降级 mock | (env) |
| `MiniMax_CLI` | CLI 路径覆盖 | `shutil.which("MiniMax")` → fallback 列表 |
| `LINGXI_DAEMON_HOST` | 监听地址 | `127.0.0.1` |
| `LINGXI_DAEMON_PORT` | 监听端口（0=随机） | `0` |

---

## 扩展 provider

新增 provider（e.g. Ollama / vLLM / 自研）只需 3 步：

```python
# backend/daemon/providers/ollama_provider.py
from backend.daemon.ai_provider import AIProvider

class OllamaProvider(AIProvider):
    name = "ollama"
    async def chat(self, prompt, **kwargs): ...
    async def health(self) -> bool: ...
```

然后在 `provider_router.py` 装配：

```python
router = ProviderRouter(
    primary=MiniMaxCLIProvider(),
    fallback=OllamaProvider(base_url="http://localhost:11434"),
)
```

调用方**零改动**。

---

## 测试

```bash
cd /Users/njx/Project/wt-daemon
pytest backend/daemon/tests -v
```

49 个 case（远超 ≥10 要求），覆盖：

- 抽象基类不能实例化 / 子类必须实现两个方法
- CLI: 健康检查 / 正常返回 / exit≠0 / timeout / 找不到 CLI / 自定义 args
- API: 无 key 降级 mock / 注入 httpx mock 跑真实路径 / 5xx / bad JSON / schema 异常
- Router: primary 成功 / fallback / 都失败 / 日志 / available / force primary / force fallback / 未知 provider / 真 provider 端到端
- Server: 4 个 endpoint / Pydantic 校验 / 422 / 真子进程启动 + httpx 打端口

---

## 设计取舍

| 选择 | 为什么 |
|---|---|
| 抽象基类用 ABC | 防止子类忘记实现方法，TypeError 时报错明确 |
| Router 链式 `raise X from Y` | primary 失败原因作为 `__cause__` 保留，方便日志 |
| 用 `asyncio.create_subprocess_exec` | 不阻塞 FastAPI event loop；可并行处理多个 chat 请求 |
| Mock 路径硬编码 "hello (mock)" | 烟测可重复，不依赖外部服务 |
| CLI 默认 timeout 30s | PRD 要求 AI 响应 ≤ 3s（实际会更短），30s 兜底 |
| 端口 0（随机） | 避免 5 模块 sub-agent 同时跑时端口冲突 |
| stdout 两行 PID + port | 父进程用 `readline()` 同步拿，避开 uvicorn log 时间竞争 |

---

## 已知边界（后续 Phase 1+ 解决）

1. **CLI 没真接 MiniMax API**：本地 `/Users/njx/.mavis/bin/MiniMax` 实际是 Mavis daemon manager，不是 chat CLI。CLI provider 正确报告失败 → fallback 跑通；后续 Phase 1 真正接 MiniMax API 时只需 `MiniMaxCLIProvider` 调对真实 chat CLI 即可，router / server 不动。
2. **API provider 默认 endpoint 是 OpenAI 风格**：MiniMax 真接口格式若有差异，`MiniMaxAPIProvider.base_url / endpoint / payload` 3 个 init 参数覆盖即可。
3. **Router 是 primary + fallback 两层**：要扩展到 N 层需重构为 chain-of-responsibility。Phase 1 MVP 2 层够用。
4. **没有 retry**：CLI 失败立刻 fallback，不重试。Phase 1 单次延迟 < 30s 够用；如果要 retry，加在 router chat() 里即可。

---

## Changelog

- **2026-07-09**: initial T-1.0.a 实现（49 tests pass + 4 screenshots + VERDICT: PASS）