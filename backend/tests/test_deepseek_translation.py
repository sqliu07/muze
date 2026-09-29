"""DeepSeek requests and line alignment, without network access."""
import json

import httpx
import pytest

from app.services import lyrics_service as lyrics


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    values = {"deepseek_api_key": "sk-private-test-key", "deepseek_model": "deepseek-flash"}
    monkeypatch.setattr(lyrics, "get_setting", values.get)


def completion(lines, finish_reason="stop"):
    return httpx.Response(200, json={"choices": [{
        "finish_reason": finish_reason,
        "message": {"content": json.dumps({"lines": lines})},
    }]})


def test_json_ids_restore_original_order(monkeypatch):
    requests = []

    def post(url, **kwargs):
        requests.append((url, kwargs))
        return completion([{"id": 1, "text": "再见"}, {"id": 0, "text": "你好"}])

    monkeypatch.setattr(lyrics.httpx, "post", post)
    assert lyrics._translate_deepseek(["Hello", "Goodbye"]) == ["你好", "再见"]
    url, request = requests[0]
    assert url == "https://api.deepseek.com/chat/completions"
    assert request["json"]["model"] == "deepseek-flash"
    assert request["json"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("lines", [
    [{"id": 0, "text": "你好"}],
    [{"id": 0, "text": "你好"}, {"id": 0, "text": "重复"}],
    [{"id": 0, "text": "你好"}, {"id": 3, "text": "未知"}],
    [{"id": 0, "text": "你好"}, {"id": 1, "text": ""}],
    [{"id": 0, "text": "你好"}, {"id": 1, "text": "跨\n行"}],
])
def test_invalid_mapping_is_rejected(monkeypatch, lines):
    monkeypatch.setattr(lyrics.httpx, "post", lambda *a, **k: completion(lines))
    assert lyrics._translate_deepseek(["Hello", "Goodbye"]) is None


def test_truncated_response_is_rejected(monkeypatch):
    monkeypatch.setattr(lyrics.httpx, "post", lambda *a, **k: completion(
        [{"id": 0, "text": "你好"}], finish_reason="length"))
    assert lyrics._translate_deepseek(["Hello"]) is None


@pytest.mark.parametrize("status", [429, 500, 503])
def test_transient_errors_retry_with_bounded_backoff(monkeypatch, status):
    responses = iter([
        httpx.Response(status, headers={"Retry-After": "99999"}),
        httpx.Response(status),
        completion([{"id": 0, "text": "你好"}]),
    ])
    waits = []
    monkeypatch.setattr(lyrics.httpx, "post", lambda *a, **k: next(responses))
    monkeypatch.setattr(lyrics.time, "sleep", waits.append)
    assert lyrics._translate_deepseek(["Hello"]) == ["你好"]
    assert len(waits) == 2
    assert all(0 < delay <= 5 for delay in waits)


@pytest.mark.parametrize("status", [401, 402, 400, 404])
def test_permanent_failure_never_retries_or_logs_secret(monkeypatch, caplog, status):
    calls = []
    def post(*args, **kwargs):
        calls.append(1)
        return httpx.Response(status, text="sk-private-test-key upstream secret")
    monkeypatch.setattr(lyrics.httpx, "post", post)
    assert lyrics._translate_deepseek(["Hello"]) is None
    assert len(calls) == 1
    assert "sk-private-test-key" not in caplog.text
    assert "upstream secret" not in caplog.text


def test_no_key_uses_google_and_preserves_timestamps(monkeypatch):
    monkeypatch.setattr(lyrics, "get_setting", lambda key: "")
    monkeypatch.setattr(lyrics.httpx, "post", lambda *a, **k: pytest.fail("unexpected request"))
    monkeypatch.setattr(lyrics, "_translate_google", lambda *a, **k: ["你好", "再见"])
    assert lyrics.translate_lyrics("[00:01.250]Hello\n[00:03.500]Goodbye") == (
        "[00:01.250]你好\n[00:03.500]再见"
    )


def test_network_errors_retry_without_exposing_key(monkeypatch, caplog):
    calls = []
    waits = []

    def fail(*_args, **_kwargs):
        calls.append(1)
        raise httpx.ConnectError("sk-private-test-key")

    monkeypatch.setattr(lyrics.httpx, "post", fail)
    monkeypatch.setattr(lyrics.time, "sleep", waits.append)
    assert lyrics._translate_deepseek(["Hello"]) is None
    assert len(calls) == 3
    assert waits == [1.0, 2.0]
    assert "sk-private-test-key" not in caplog.text


def test_word_timestamps_are_not_sent_as_text():
    assert lyrics._parse_lrc_lines("[00:01.250]<00:01.250>Hello <00:02.000>world") == [
        ("00:01.250", "Hello world")
    ]
