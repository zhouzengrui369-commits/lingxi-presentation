"""AIProvider 抽象基类。

所有 provider（CLI / API / mock）必须继承并实现 `chat` 和 `health` 两个方法。
抽象类本身不可直接实例化（没有实现这两个方法）。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AIProvider(ABC):
    """AI 能力 provider 抽象接口。

    所有具体 provider（CLI、API、mock）继承此类，必须实现：
      - async chat(prompt: str, **kwargs) -> str
      - async health() -> bool

    Provider 名字通过 `name` 类属性对外暴露，server 端用其名标识。
    """

    name: str = "abstract"

    @abstractmethod
    async def chat(self, prompt: str, **kwargs: Any) -> str:
        """执行一次 AI 调用，返回模型输出文本。

        Args:
            prompt: 用户输入的提示词。
            **kwargs: provider-specific 选项（temperature / max_tokens 等）。

        Returns:
            模型输出的字符串。

        Raises:
            ProviderCallError: 调用失败（非零退出码 / 异常 / 超时）。
        """

    @abstractmethod
    async def health(self) -> bool:
        """检查 provider 当前是否健康可用。

        简单实现：进程在、依赖通就 True；否则 False。
        """


class ProviderCallError(RuntimeError):
    """Provider 调用失败。

    - 非零 exit code
    - subprocess 抛异常
    - 30s 超时
    - HTTP API 5xx / 4xx

    Router 捕获后会自动 fallback。
    """

    def __init__(self, message: str, *, provider: str = "unknown", cause: Exception | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.cause = cause

    def __str__(self) -> str:  # pragma: no cover - 调试用
        base = super().__str__()
        if self.cause is not None:
            return f"[{self.provider}] {base} (cause: {type(self.cause).__name__}: {self.cause})"
        return f"[{self.provider}] {base}"