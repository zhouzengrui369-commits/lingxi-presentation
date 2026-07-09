"""CLI provider 测试（subprocess 用真实二进制 path 覆盖，避免外部依赖）。

通过 `cli_path` 注入一个临时脚本路径作为 fake CLI，
让 provider 实际 `asyncio.create_subprocess_exec` 跑它。

测试覆盖：
  - health() 真路径存在 → True
  - health() 假路径 → False
  - chat() 正常返回
  - chat() exit 1 → ProviderCallError
  - chat() 超时 → ProviderCallError
  - chat() 没找到 CLI → ProviderCallError
  - 默认 args 不崩
"""

from __future__ import annotations

import os
import stat
import sys
import textwrap
from pathlib import Path

import pytest

from backend.daemon.ai_provider import ProviderCallError
from backend.daemon.providers.cli_provider import (
    _resolve_cli_path,
    MiniMaxCLIProvider,
)


def _write_fake_cli(tmp_path: Path, body: str, name: str = "MiniMax") -> Path:
    """写一个临时可执行脚本，返回其路径。

    默认文件名为 `MiniMax`，这样 `shutil.which("MiniMax")` 在 PATH 指向 tmp_path 时能找到。
    """
    p = tmp_path / name
    p.write_text(textwrap.dedent(body))
    p.chmod(p.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return p


class TestCliProviderResolve:
    def test_resolve_via_which(self, monkeypatch, tmp_path):
        """shutil.which 命中 → 返回该路径。"""
        cli = _write_fake_cli(tmp_path, "#!/bin/sh\necho hi\n")
        # tmp_path 必须用 absolute，shutil.which 才能正常搜
        monkeypatch.setenv("PATH", f"{tmp_path}:{os.environ.get('PATH', '')}")
        monkeypatch.delenv("MiniMax_CLI", raising=False)
        # patch fallback 列表防止它找到 system 上的真实 MiniMax
        monkeypatch.setattr(
            "backend.daemon.providers.cli_provider._FALLBACK_PATHS",
            [str(tmp_path / "nonexistent_a"), str(tmp_path / "nonexistent_b")],
        )
        path = _resolve_cli_path()
        assert path == str(cli)

    def test_resolve_via_env_override(self, monkeypatch, tmp_path):
        """$MiniMax_CLI 优先于 PATH。"""
        env_cli = _write_fake_cli(tmp_path, "#!/bin/sh\n", name="custom_cli")
        monkeypatch.setenv("MiniMax_CLI", str(env_cli))
        monkeypatch.setenv("PATH", f"{tmp_path}:/usr/bin:/bin")
        path = _resolve_cli_path()
        assert path == str(env_cli)

    def test_resolve_returns_none_if_missing(self, monkeypatch, tmp_path):
        """全部找不到 → None。"""
        # 把 fallback 全部指向不存在的路径
        monkeypatch.setenv("PATH", str(tmp_path))
        monkeypatch.delenv("MiniMax_CLI", raising=False)
        monkeypatch.setattr(
            "backend.daemon.providers.cli_provider._FALLBACK_PATHS",
            [str(tmp_path / "no_a"), str(tmp_path / "no_b")],
        )
        path = _resolve_cli_path()
        assert path is None


class TestCliProviderHealth:
    async def test_health_true_when_cli_exists(self, tmp_path):
        cli = _write_fake_cli(tmp_path, "#!/bin/sh\n")
        p = MiniMaxCLIProvider(cli_path=str(cli))
        assert await p.health() is True

    async def test_health_false_when_cli_missing(self):
        p = MiniMaxCLIProvider(cli_path="/nonexistent/cli_xyz")
        assert await p.health() is False


class TestCliProviderChat:
    async def test_chat_returns_stdout(self, tmp_path):
        body = "#!/bin/sh\necho hello\n"
        cli = _write_fake_cli(tmp_path, body)
        p = MiniMaxCLIProvider(cli_path=str(cli), cli_args=["echo"], timeout=5.0)
        out = await p.chat("ignored")
        assert out == "hello"

    async def test_chat_strips_trailing_newline(self, tmp_path):
        body = "#!/bin/sh\necho \"multi line\"\necho \"second line\"\n"
        cli = _write_fake_cli(tmp_path, body)
        p = MiniMaxCLIProvider(cli_path=str(cli), cli_args=["run"], timeout=5.0)
        out = await p.chat("x")
        assert out == "multi line\nsecond line"

    async def test_chat_no_cli_raises(self):
        p = MiniMaxCLIProvider(cli_path="/nonexistent/cli_xyz", cli_args=["x"])
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("hello")
        assert exc_info.value.provider == "cli"
        assert "not found" in str(exc_info.value).lower()

    async def test_chat_nonzero_exit_raises(self, tmp_path):
        body = "#!/bin/sh\necho bad >&2\nexit 1\n"
        cli = _write_fake_cli(tmp_path, body)
        p = MiniMaxCLIProvider(cli_path=str(cli), cli_args=["run"], timeout=5.0)
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("hello")
        msg = str(exc_info.value)
        assert "exited 1" in msg
        assert "bad" in msg

    async def test_chat_timeout_raises(self, tmp_path):
        # 写一个 sleep 5 秒的脚本（超时设 0.3s）
        body = "#!/bin/sh\nsleep 5\n"
        cli = _write_fake_cli(tmp_path, body)
        p = MiniMaxCLIProvider(cli_path=str(cli), cli_args=["slow"], timeout=0.3)
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("hello")
        msg = str(exc_info.value).lower()
        assert "timed out" in msg or "timeout" in msg
        assert exc_info.value.provider == "cli"

    async def test_chat_with_custom_args(self, tmp_path):
        """验证 cli_args 完整传递给 subprocess（不只是 hardcode ['chat','--format','text']）。"""
        # 写一个脚本：第一个 arg 是 echo, 第二个 arg 要 echo 出来
        body = "#!/bin/sh\necho \"got: $1 $2\"\n"
        cli = _write_fake_cli(tmp_path, body)
        p = MiniMaxCLIProvider(cli_path=str(cli), cli_args=["run", "--mode=fast"], timeout=5.0)
        out = await p.chat("ignored-by-args")
        assert out == "got: run --mode=fast"