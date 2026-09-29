"""设置 API — 读取和更新应用设置。"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.services.settings import get_settings, update_settings
from app.services.lyrics_service import DeepSeekError, request_deepseek_translation

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsOut(BaseModel):
    deepseek_api_key: str = ""
    deepseek_configured: bool = False
    deepseek_model: str = "deepseek-flash"
    translate_source: str = "en"
    translate_target: str = "zh-CN"


class SettingsUpdate(BaseModel):
    deepseek_api_key: Optional[str] = Field(default=None, max_length=512)
    deepseek_model: Optional[str] = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._-]+$")
    translate_source: Optional[str] = None
    translate_target: Optional[str] = None

    @field_validator("deepseek_api_key")
    @classmethod
    def validate_api_key(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if value and (not value.isascii() or any(ch.isspace() for ch in value) or "*" in value):
            raise ValueError("请输入有效 API Key，不能保存脱敏值")
        return value


def _public_settings(data: dict) -> dict:
    return {**data, "deepseek_api_key": "********" if data.get("deepseek_api_key") else "",
            "deepseek_configured": bool(data.get("deepseek_api_key"))}


@router.get("", response_model=SettingsOut)
def read_settings():
    """获取当前设置。API Key 脱敏返回。"""
    return _public_settings(get_settings())


@router.put("", response_model=SettingsOut)
def write_settings(body: SettingsUpdate):
    """更新设置（部分更新）。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    data = update_settings(patch)
    return _public_settings(data)


class DeepSeekTestOut(BaseModel):
    ok: bool
    code: str
    message: str


@router.post("/deepseek/test", response_model=DeepSeekTestOut)
def test_deepseek():
    """Run a small translation with the saved credentials and model."""
    data = get_settings()
    if not data.get("deepseek_api_key"):
        return DeepSeekTestOut(ok=False, code="not_configured", message="请先保存 API Key")
    try:
        request_deepseek_translation(["Hello"], data["deepseek_api_key"], data["deepseek_model"])
    except DeepSeekError as exc:
        messages = {
            "authentication": "API Key 无效，请重新配置", "permission": "API Key 无访问权限",
            "balance": "账户余额不足", "configuration": "模型或请求配置无效",
            "model": "模型不可用，请检查模型名称", "rate_limit": "请求限流，请稍后重试",
            "unavailable": "DeepSeek 服务暂不可用", "timeout": "连接超时，请稍后重试",
            "network": "无法连接 DeepSeek，请检查网络", "invalid_response": "模型响应格式不符合翻译要求",
        }
        return DeepSeekTestOut(ok=False, code=exc.code, message=messages.get(exc.code, "DeepSeek 请求失败"))
    return DeepSeekTestOut(ok=True, code="ok", message="连接成功，歌词翻译可用")
