"""歌词服务单元测试（不依赖网络）。"""
from pathlib import Path

from app.services.lyrics_service import parse_lrc_from_file


def test_parse_lrc_from_nonexistent_file(tmp_path: Path):
    """不存在的 .lrc 路径应返回 None。"""
    result = parse_lrc_from_file(tmp_path / "nonexistent.lrc")
    assert result is None


def test_parse_lrc_from_existing_file(tmp_path: Path):
    """含时间戳的 .lrc 文件：synced=True 且内容包含歌词文本。"""
    lrc_path = tmp_path / "test.lrc"
    lrc_path.write_text(
        "[00:12.00]第一句歌词\n[00:17.50]第二句歌词\n", encoding="utf-8"
    )
    result = parse_lrc_from_file(lrc_path)
    assert result is not None
    assert result.synced is True
    assert "第一句歌词" in result.content
    assert "第二句歌词" in result.content
    assert result.source == "lrc"


def test_parse_plain_lrc(tmp_path: Path):
    """无时间戳的纯文本 lrc 文件：synced=False。"""
    lrc_path = tmp_path / "plain.lrc"
    lrc_path.write_text("这是一句纯文本歌词\n另一句\n", encoding="utf-8")
    result = parse_lrc_from_file(lrc_path)
    assert result is not None
    assert result.synced is False
    assert "纯文本歌词" in result.content
