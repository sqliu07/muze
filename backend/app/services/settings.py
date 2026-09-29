"""应用设置存储 — 基于 JSON 文件。"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.core.config import DATA_DIR

logger = logging.getLogger(__name__)

_SETTINGS_PATH = DATA_DIR / "settings.json"

_DEFAULTS: dict[str, Any] = {
    "deepseek_api_key": "",
    "deepseek_model": "deepseek-flash",
    "translate_source": "en",
    "translate_target": "zh-CN",
}


def _write_settings(data: dict[str, Any]) -> None:
    """Persist credentials atomically with owner-only permissions."""
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = _SETTINGS_PATH.with_suffix(_SETTINGS_PATH.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(_SETTINGS_PATH)


def _ensure_file() -> None:
    if not _SETTINGS_PATH.exists():
        _write_settings(_DEFAULTS)
    else:
        try:
            _SETTINGS_PATH.chmod(0o600)
        except OSError:
            logger.warning("无法收紧设置文件权限: %s", _SETTINGS_PATH)


def get_settings() -> dict[str, Any]:
    """读取设置，缺失字段用默认值填充。"""
    _ensure_file()
    try:
        with open(_SETTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.warning("设置文件读取失败，使用默认值")
        data = {}
    # 填充默认值
    merged = {**_DEFAULTS, **data}
    return merged


def get_setting(key: str) -> Any:
    """读取单个设置项。"""
    return get_settings().get(key, _DEFAULTS.get(key))


def update_settings(patch: dict[str, Any]) -> dict[str, Any]:
    """合并更新设置并写回文件。"""
    current = get_settings()
    current.update({k: v for k, v in patch.items() if k in _DEFAULTS})
    _write_settings(current)
    logger.info("设置已更新: %s", list(patch.keys()))
    return current
