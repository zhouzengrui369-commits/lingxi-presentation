"""MiniMax CLI provider.

调用 MiniMax Code CLI（一个本地命令行工具），路径走：
  - $MiniMax_CLI / $minimax_CLI 显式覆盖（大小写兜底）
  - shutil.which 试 MiniMax / minimax / MINIMAX 三种大小写
  - fallback 到几个常见固定路径（含 minimax 真路径）

注意：mavis 真实 CLI 二进制在 /Users/njx/.mavis/bin/minimax（小写），
不是 MiniMax（大写）。Wave 5a 修大小写兼容问题（钉子 #43 + T-6.9a）。
"""

from __future__ import annotations

import asyncio
import os
import shutil
from typing import Any

from ..ai_provider import AIProvider, ProviderCallError


# fallback 路径（macOS + Linux 常见位置）
# 注：minimax 真路径放最前（Wave 5a 加），MiniMax (大写) 兼容保留
_FALLBACK_PATHS = [
    "/Users/njx/.mavis/bin/minimax",  # mavis 默认安装位置（小写）
    os.path.expanduser("~/.mavis/bin/minimax"),
    "/opt/homebrew/bin/MiniMax",
    "/usr/local/bin/MiniMax",
    os.path.expanduser("~/.local/bin/MiniMax"),
    os.path.expanduser("~/.mavis/bin/MiniMax"),
]


# CLI 二进制名候选（大小写变体）—— shutil.which 逐个试
_CLI_WHICH_NAMES: tuple[str, ...] = ("MiniMax", "minimax", "MINIMAX")


# 环境变量名候选（大小写变体）—— 优先级 MiniMax_CLI > minimax_CLI
_CLI_ENV_NAMES: tuple[str, ...] = ("MiniMax_CLI", "minimax_CLI")


def _resolve_cli_path() -> str | None:
    """按优先级解析 CLI 路径。

    优先级：
      1. $MiniMax_CLI / $minimax_CLI 环境变量（大小写兜底）
      2. shutil.which(MiniMax / minimax / MINIMAX)（大小写兜底）
      3. _FALLBACK_PATHS 中第一个存在的
    """
    # 1. env override（大小写都试）
    for env_name in _CLI_ENV_NAMES:
        env_path = os.environ.get(env_name)
        if env_path and os.path.isfile(env_path) and os.access(env_path, os.X_OK):
            return env_path

    # 2. shutil.which（大小写都试）
    for name in _CLI_WHICH_NAMES:
        which = shutil.which(name)
        if which:
            return which

    # 3. fallback paths
    for p in _FALLBACK_PATHS:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


class MiniMaxCLIProvider(AIProvider):
    """通过 MiniMax Code CLI 调 AI。

    默认调用：`MiniMax chat "<prompt>" --format text`
    可注入 `cli_path` / `cli_args` / `timeout` 供测试覆盖。
    """

    name = "cli"

    DEFAULT_TIMEOUT = 30.0  # 秒

    def __init__(
        self,
        *,
        cli_path: str | None = None,
        cli_args: list[str] | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self._explicit_cli_path = cli_path
        self._cli_args = cli_args or ["chat", "--format", "text"]
        self._timeout = timeout

    @property
    def cli_path(self) -> str | None:
        """获取当前使用的 CLI 路径。

        - 显式注入的 path：必须存在且可执行，否则返回 None
        - 否则走 _resolve_cli_path()（env > which > fallback）
        """
        if self._explicit_cli_path:
            if os.path.isfile(self._explicit_cli_path) and os.access(
                self._explicit_cli_path, os.X_OK
            ):
                return self._explicit_cli_path
            return None
        return _resolve_cli_path()

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        """调用 CLI 执行 chat。

        Args:
            prompt: 用户输入。
            **kwargs: 暂未使用（保留扩展位）。

        Raises:
            ProviderCallError: CLI 未找到 / 退出码非零 / 超时 / 子进程异常。
        """
        path = self.cli_path
        if path is None:
            raise ProviderCallError(
                "MiniMax CLI not found in PATH or fallback paths",
                provider=self.name,
            )

        cmd = [path, *self._cli_args, prompt]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise ProviderCallError(
                f"CLI executable missing: {path}",
                provider=self.name,
                cause=exc,
            ) from exc
        except OSError as exc:
            raise ProviderCallError(
                f"Failed to spawn CLI: {exc}",
                provider=self.name,
                cause=exc,
            ) from exc

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=self._timeout,
            )
        except asyncio.TimeoutError as exc:
            # 尽力 kill 掉子进程，避免僵尸
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            try:
                await proc.wait()
            except Exception:
                pass
            raise ProviderCallError(
                f"CLI timed out after {self._timeout}s",
                provider=self.name,
                cause=exc,
            ) from exc

        if proc.returncode != 0:
            err_msg = stderr_bytes.decode("utf-8", errors="replace").strip() or "<no stderr>"
            raise ProviderCallError(
                f"CLI exited {proc.returncode}: {err_msg}",
                provider=self.name,
            )

        return stdout_bytes.decode("utf-8", errors="replace").rstrip("\n")

    async def health(self) -> bool:
        """CLI 路径存在且可执行 = 健康。

        不实际跑 chat，只做存在性校验。
        """
        return self.cli_path is not None