#!/usr/bin/env python3
"""验证所有 schema + fixture 全过.

用法::

    python contracts/validate.py

退出码:
    0 - 全部通过（6 个正例 OK + 6 个反例被正确拒绝）
    1 - 至少 1 个 schema 或 fixture 失败

依赖:
    pip install jsonschema
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import jsonschema
from jsonschema import Draft202012Validator, FormatChecker


CONTRACTS = Path(__file__).resolve().parent
SCHEMAS = [
    "file_import",
    "wiki_kb",
    "advisor_question",
    "preview_page",
    "output_request",
    "output_result",
    "template_style",
]


def _validator(schema: dict) -> Draft202012Validator:
    """Draft202012Validator with format checker enabled.

    Draft 2020-12 默认不强制 format（如 uuid / date-time / uri）。
    启用 FormatChecker 让 fixture 的 UUID / 日期格式错误也被拒。
    """
    return Draft202012Validator(schema, format_checker=FormatChecker())


def main() -> int:
    failed = False
    for name in SCHEMAS:
        schema_path = CONTRACTS / f"{name}.schema.json"
        pos_path = CONTRACTS / "fixtures" / f"{name}.positive.json"
        neg_path = CONTRACTS / "fixtures" / f"{name}.negative.json"

        schema = json.loads(schema_path.read_text(encoding="utf-8"))

        # 1. Schema 自身必须是合法的 Draft 2020-12 meta-schema
        try:
            Draft202012Validator.check_schema(schema)
        except jsonschema.SchemaError as e:
            print(f"  [FAIL] {schema_path.name}: schema 不合法 - {e.message}")
            failed = True
            continue

        validator = _validator(schema)

        # 2. 正例必过
        pos = json.loads(pos_path.read_text(encoding="utf-8"))
        try:
            validator.validate(pos)
            print(f"  [OK]   fixtures/{name}.positive.json")
        except jsonschema.ValidationError as e:
            print(f"  [FAIL] fixtures/{name}.positive.json 不该失败却失败了 - {e.message}")
            failed = True
            continue

        # 3. 反例必失败
        neg = json.loads(neg_path.read_text(encoding="utf-8"))
        errors = list(validator.iter_errors(neg))
        if not errors:
            print(f"  [FAIL] fixtures/{name}.negative.json 该失败却通过了")
            failed = True
        else:
            # 打印第一条错误便于调试
            first = errors[0]
            where = "/".join(str(p) for p in first.absolute_path) or "<root>"
            print(
                f"  [OK]   fixtures/{name}.negative.json"
                f" correctly rejected ({len(errors)} errors, first at {where}: {first.message})"
            )

    if failed:
        print("\n[FAIL] 至少 1 个 schema / fixture 校验不通过")
        return 1

    print(f"\n[PASS] All {len(SCHEMAS)} schemas + {len(SCHEMAS) * 2} fixtures validated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())