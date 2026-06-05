"""设置 API — 读取和更新应用设置。"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.services.settings import get_settings, update_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsOut(BaseModel):
    deepseek_api_key: str = ""
    translate_source: str = "en"
    translate_target: str = "zh-CN"


class SettingsUpdate(BaseModel):
    deepseek_api_key: Optional[str] = None
    translate_source: Optional[str] = None
    translate_target: Optional[str] = None


@router.get("", response_model=SettingsOut)
def read_settings():
    """获取当前设置。API Key 脱敏返回。"""
    data = get_settings()
    key = data.get("deepseek_api_key", "")
    # 脱敏：只显示前 4 位和后 4 位
    if len(key) > 8:
        data["deepseek_api_key"] = key[:4] + "*" * (len(key) - 8) + key[-4:]
    elif key:
        data["deepseek_api_key"] = "****"
    return data


@router.put("", response_model=SettingsOut)
def write_settings(body: SettingsUpdate):
    """更新设置（部分更新）。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    data = update_settings(patch)
    return data
