"""Settings responses must never expose stored API credentials."""
import pytest

from app.api import settings as api
from app.services import settings as storage


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(storage, "_SETTINGS_PATH", tmp_path / "settings.json")


def test_write_masks_key_and_reports_configuration():
    key = "sk-private-test-key"
    result = api.write_settings(api.SettingsUpdate(deepseek_api_key=key))
    assert key not in str(result)
    assert result["deepseek_configured"] is True
    assert storage.get_setting("deepseek_api_key") == key
    assert result["deepseek_model"] == "deepseek-flash"


def test_clear_key_and_default_model():
    api.write_settings(api.SettingsUpdate(deepseek_api_key="secret"))
    result = api.write_settings(api.SettingsUpdate(deepseek_api_key=""))
    assert result["deepseek_configured"] is False
    assert result["deepseek_api_key"] == ""
    assert result["deepseek_model"] == "deepseek-flash"


def test_read_masks_key():
    storage.update_settings({"deepseek_api_key": "sk-private-test-key"})
    assert "sk-private-test-key" not in str(api.read_settings())


def test_settings_file_is_owner_only():
    storage.update_settings({"deepseek_api_key": "sk-private-test-key"})
    assert storage._SETTINGS_PATH.stat().st_mode & 0o777 == 0o600
