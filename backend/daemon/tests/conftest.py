"""backend.daemon.tests — pytest 配置。"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# 把项目根加进 sys.path，让 `backend.daemon.*` 可导入
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


# pytest-asyncio 配置：默认 mode = auto
import pytest


def pytest_collection_modifyitems(config, items):
    """给所有 async test 自动加 asyncio marker。"""
    for item in items:
        if asyncio.iscoroutinefunction(getattr(item, "function", None)):
            item.add_marker(pytest.mark.asyncio)